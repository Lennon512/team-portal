// ---------- Studio page ----------
let sd = { id: null, info: null, photo: null, all: null };
async function loadStudio(idFromHash) {
  sd.id = idFromHash || null;
  if (!sd.id) return loadStudioGrid();
  const [i] = await Promise.all([db.from('studio_info').select('*').eq('location_id', sd.id).maybeSingle(), loadPeople()]);
  sd.info = i.data; sd.photo = null;
  if (sd.info && sd.info.photo_path) { const { data } = await db.storage.from('studio-photos').createSignedUrl(sd.info.photo_path, 3600); sd.photo = data && data.signedUrl; }
  drawStudio();
}

async function loadStudioGrid() {
  if (!sd.all) {
    const [i] = await Promise.all([db.from('studio_info').select('*'), loadPeople()]);
    sd.all = {}; (i.data || []).forEach(x => sd.all[x.location_id] = x);
    const paths = Object.values(sd.all).map(x => x.photo_path).filter(Boolean);
    if (paths.length) { const { data } = await db.storage.from('studio-photos').createSignedUrls(paths, 3600); (data || []).forEach(x => { if (x.signedUrl) urls[x.path] = x.signedUrl; }); }
  }
  drawStudioGrid();
}

function drawStudioGrid() {
  $('studioBody').innerHTML = `<h2 style="margin:0 0 .25rem">Our studios</h2><p class="lead" style="margin:0 0 1rem">Click a studio to see its info, hours, and team.</p>
    <div class="people">${locs.map(l => { const i = sd.all[l.id] || {}, n = people.filter(p => p.location_id === l.id).length;
      return `<a class="person" href="#studio/${l.id}"><div class="ph">${urls[i.photo_path] ? `<img src="${esc(urls[i.photo_path])}" alt="">` : '\ud83c\udfe2'}</div><b>${esc(l.name)}</b><span>${esc(i.address || 'No info yet')}</span><span>${n} team member${n === 1 ? '' : 's'}</span></a>`; }).join('')}</div>`;
}

function drawStudio() {
  const l = locs.find(x => x.id === sd.id) || {}, i = sd.info || {}, can = ME.role === 'owner' || (ME.role === 'manager' && ME.location_id === sd.id);
  const facts = [['Address', i.address && esc(i.address)], ['Phone', i.phone && `<a href="tel:${esc(i.phone)}">${esc(i.phone)}</a>`], ['Email', i.email && `<a href="mailto:${esc(i.email)}">${esc(i.email)}</a>`], ['Hours', i.hours && esc(i.hours).replace(/\n/g, '<br>')]].filter(f => f[1]);
  const team = people.filter(p => p.location_id === sd.id);
  $('studioBody').innerHTML = `<a class="back" href="#studio">\u2190 All studios</a>
    <div class="shero${sd.photo ? '' : ' sm'}">${sd.photo ? `<img src="${esc(sd.photo)}" alt="${esc(l.name)}">` : ''}</div>
    <h2 style="margin:1rem 0 .4rem">${esc(l.name)}</h2>
    <p style="white-space:pre-wrap;max-width:70ch">${esc(i.bio || 'No bio yet.')}</p>
    ${facts.length ? '<dl class="facts">' + facts.map(f => `<dt>${f[0]}</dt><dd>${f[1]}</dd>`).join('') + '</dl>' : ''}
    ${can ? '<button id="stEdit">Edit studio info</button>' : ''}
    <h3 class="sub" style="margin-top:1.75rem">Our team</h3>
    <div class="people" id="stPeople">${team.map(p => `<button class="person" data-id="${p.id}"><div class="ph">${photo(p)}</div><b>${esc(p.full_name)}</b><span>${esc(p.job_title || '')}</span></button>`).join('') || '<p class="lead">No one is listed at this studio yet.</p>'}</div>`;
}

function stForm() {
  const i = sd.info || {};
  $('dlgBody').innerHTML = `<h2>Edit studio info</h2>
    <label>About this studio <textarea id="sBio" maxlength="800">${esc(i.bio)}</textarea></label>
    <label>Address <input id="sAddr" maxlength="200" value="${esc(i.address)}"></label>
    <label>Phone <input id="sPhone" maxlength="40" value="${esc(i.phone)}"></label>
    <label>Email <input id="sEmail" type="email" maxlength="120" value="${esc(i.email)}"></label>
    <label>Hours <textarea id="sHours" rows="3" maxlength="300" placeholder="Mon to Fri 7am to 7pm">${esc(i.hours)}</textarea></label>
    <label>Photo (JPG or PNG) <input id="sPhoto" type="file" accept="image/*"></label>
    <div class="err" id="sErr" role="alert"></div>
    <div class="acts"><button data-act="stSave">Save</button><button class="quiet" data-act="close">Cancel</button></div>`;
  $('dlg').showModal();
}

function crop(file, w, h) {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onerror = () => no(new Error('Could not read that photo. Try a JPG or PNG.'));
    img.onload = () => {
      let sw = img.width, sh = sw * h / w; if (sh > img.height) { sh = img.height; sw = sh * w / h; }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
      URL.revokeObjectURL(img.src); c.toBlob(b => b ? ok(b) : no(new Error('Photo failed')), 'image/jpeg', .85);
    };
    img.src = URL.createObjectURL(file);
  });
}

async function stSave() {
  try {
    const f = $('sPhoto').files[0]; let path = null;
    if (f) { path = `${sd.id}/${Date.now()}.jpg`; const up = await db.storage.from('studio-photos').upload(path, await crop(f, 960, 360), { contentType: 'image/jpeg' }); if (up.error) throw up.error; }
    const v = id => $(id).value.trim() || null, row = { location_id: sd.id, bio: v('sBio'), address: v('sAddr'), phone: v('sPhone'), email: v('sEmail'), hours: v('sHours'), updated_by: ME.id, updated_at: new Date().toISOString() };
    if (path) row.photo_path = path;
    const { error } = await db.from('studio_info').upsert(row, { onConflict: 'location_id' }); if (error) throw error;
  } catch (e) { $('sErr').textContent = 'Could not save. ' + (e.message || ''); return; }
  $('dlg').close(); loadStudio(sd.id);
}

$('studioBody').onclick = e => { const b = e.target.closest('.person'); if (b && b.dataset.id) { e.preventDefault(); openCard(b.dataset.id); } else if (e.target.id === 'stEdit') stForm(); };
$('dlgBody').addEventListener('click', e => { if (e.target.dataset.act === 'stSave') stSave(); });
