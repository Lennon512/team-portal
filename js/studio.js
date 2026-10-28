// ---------- Studio page ----------
let sd = { id: null, info: null, photo: null, all: null, hasNotes: null, wk: null };
const SDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ----- hours: stored as text lines like "Mon: 7:00 AM - 7:00 PM" / "Sun: Closed" -----
function parseHours(text) {
  if (!text) return null;
  const out = {}, D = '(sun|mon|tue|wed|thu|fri|sat)[a-z]*\\.?', T = '(\\d{1,2})(?::(\\d{2}))?\\s*([ap])\\.?\\s*m?\\.?';
  const re = new RegExp(`^\\s*${D}(?:\\s*(?:-|\\u2013|to|through)\\s*${D})?\\s*:?\\s*(?:(closed)|${T}\\s*(?:-|\\u2013|to)\\s*${T})`, 'i');
  const t24 = (h, m, ap) => { h = +h % 12 + (ap.toLowerCase() === 'p' ? 12 : 0); return String(h).padStart(2, '0') + ':' + (m || '00'); };
  String(text).split(/\n|;/).forEach(line => {
    const m = line.match(re); if (!m) return;
    const i1 = SDAYS.findIndex(d => d.toLowerCase() === m[1].slice(0, 3).toLowerCase()), i2 = m[2] ? SDAYS.findIndex(d => d.toLowerCase() === m[2].slice(0, 3).toLowerCase()) : i1;
    const v = m[3] ? { closed: true } : { o: t24(m[4], m[5], m[6]), c: t24(m[7], m[8], m[9]) };
    for (let i = i1; ; i = (i + 1) % 7) { out[SDAYS[i]] = v; if (i === i2) break; }
  });
  return Object.keys(out).length ? out : null;
}
const t12 = t => { let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`; };
const fmtHoursText = H => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].filter(d => H[d]).map(d => `${d}: ${H[d].closed ? 'Closed' : t12(H[d].o) + ' - ' + t12(H[d].c)}`).join('\n');
function openStatus(H, now = new Date()) {
  if (!H) return null;
  const d = H[SDAYS[now.getDay()]], hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const next = () => { for (let k = 1; k <= 7; k++) { const x = H[SDAYS[(now.getDay() + k) % 7]]; if (x && !x.closed) return (k === 1 ? 'tomorrow ' : SDAYS[(now.getDay() + k) % 7] + ' ') + t12(x.o); } return ''; };
  if (!d) return null;
  if (d.closed) return { open: false, t: 'Closed today' + (next() ? ' • opens ' + next() : '') };
  if (hm < d.o) return { open: false, t: 'Opens ' + t12(d.o) };
  if (hm < d.c) return { open: true, t: 'Open now • closes ' + t12(d.c) };
  return { open: false, t: 'Closed • opens ' + next() };
}
const mapsUrl = a => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Stretch Zone ' + a);

async function loadStudio(idFromHash) {
  sd.id = idFromHash || null;
  if (sd.hasNotes === null) { const t = await db.from('studio_info').select('staff_notes').limit(1); sd.hasNotes = !t.error; }
  if (!sd.id) return loadStudioGrid();
  const td = todayStr(), wk = ymd(new Date(Date.now() + 7 * DAY)), lead = ME.role !== 'staff' && canPage('members');
  const [i, , ev, req, its, cnt, thr, ms, ns, meta] = await Promise.all([db.from('studio_info').select('*').eq('location_id', sd.id).maybeSingle(), loadPeople(),
    db.from('events').select('*').or(`ends_on.gte.${td},event_date.gte.${td}`).lte('event_date', wk).order('event_date'),
    db.from('supply_requests').select('*').eq('studio_id', sd.id), db.from('supply_items').select('*').eq('active', true), db.from('supply_counts').select('*').eq('studio_id', sd.id), db.from('supply_thresholds').select('*').eq('studio_id', sd.id),
    lead ? db.from('member_snapshot').select('club_id,grp,frozen,next_due,next_booking,last_session').eq('studio_id', sd.id).eq('grp', 'member').limit(5000) : null,
    lead ? db.from('new_member_snapshot').select('*').eq('studio_id', sd.id).limit(2000) : null,
    lead ? db.from('snapshot_meta').select('*').eq('studio_id', sd.id).maybeSingle() : null]);
  sd.info = i.data; sd.photo = null;
  sd.wk = { ev: (ev.data || []).filter(e => !e.location_id || e.location_id === sd.id), req: req.data || [], items: its.data || [], counts: cnt.data || [], thr: thr.data || [], ms: ms && ms.data, ns: ns && ns.data, meta: meta && meta.data };
  if (sd.info && sd.info.photo_path) { const { data } = await db.storage.from('studio-photos').createSignedUrl(sd.info.photo_path, 3600); sd.photo = data && data.signedUrl; }
  drawStudio();
}

async function loadStudioGrid() {
  const [i, , req] = await Promise.all([db.from('studio_info').select('*'), loadPeople(), db.from('supply_requests').select('studio_id,status')]);
  sd.all = {}; (i.data || []).forEach(x => sd.all[x.location_id] = x); sd.allReq = req.data || [];
  const paths = Object.values(sd.all).map(x => x.photo_path).filter(Boolean);
  if (paths.length) { const { data } = await db.storage.from('studio-photos').createSignedUrls(paths, 3600); (data || []).forEach(x => { if (x.signedUrl) urls[x.path] = x.signedUrl; }); }
  drawStudioGrid();
}

function drawStudioGrid() {
  const td = todayStr(), empty = locs.filter(l => { const i = sd.all[l.id]; return !i || (!i.address && !i.hours && !i.phone); });
  const can = l => ME.role === 'owner' || (ME.role === 'manager' && ME.location_id === l.id);
  $('studioBody').innerHTML = `<h2 style="margin:0 0 .25rem">Our studios</h2><p class="lead" style="margin:0 0 1rem">Tap a studio for its hours, contact info, team and what’s happening this week.</p>` +
    (empty.length && locs.some(can) ? `<div class="tnudge"><span><b>${empty.length} studio${empty.length === 1 ? ' has' : 's have'} no info yet.</b> Add the address, phone and hours so the team can find them.</span></div>` : '') +
    `<div class="sgrid">${locs.map(l => { const i = sd.all[l.id] || {}, n = people.filter(p => p.location_id === l.id).length, st = openStatus(parseHours(i.hours));
      const out = teamX.offs.filter(o => o.location_id === l.id && o.start_date <= td && o.end_date >= td).length, need = sd.allReq.filter(r => r.studio_id === l.id).length;
      return `<a class="scard" href="#studio/${l.id}"><div class="scard-ph">${urls[i.photo_path] ? `<img src="${esc(urls[i.photo_path])}" alt="">` : `<span>${esc(l.name[0])}</span>`}</div>
        <div class="scard-b"><b>${esc(l.name)}</b>${st ? `<span class="sopen ${st.open ? 'yes' : ''}">${esc(st.t)}</span>` : ''}<small>${esc(i.address || 'No info yet')}</small>
        <div class="sstats"><span>${n} on the team</span>${out ? `<span class="tbadge out">${out} out today</span>` : ''}${need ? `<span class="tbadge tsoon">${need} supply request${need === 1 ? '' : 's'}</span>` : ''}</div></div></a>`; }).join('')}</div>`;
}

function drawStudio() {
  const l = locs.find(x => x.id === sd.id) || {}, i = sd.info || {}, W = sd.wk, td = todayStr(), can = ME.role === 'owner' || (ME.role === 'manager' && ME.location_id === sd.id);
  const H = parseHours(i.hours), st = openStatus(H), today = SDAYS[new Date().getDay()];
  const team = people.filter(p => p.location_id === sd.id);
  const hours = H ? `<table class="shours">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<tr class="${d === today ? 'today' : ''}"><td>${d}</td><td>${!H[d] ? '<span class="muted">–</span>' : H[d].closed ? 'Closed' : t12(H[d].o) + ' – ' + t12(H[d].c)}</td></tr>`).join('')}</table>` : (i.hours ? `<p style="white-space:pre-wrap;margin:0">${esc(i.hours)}</p>` : '<p class="muted" style="margin:0">No hours yet.</p>');
  // This week
  const wkEnd = ymd(new Date(Date.now() + 6 * DAY)), outs = teamX.offs.filter(o => o.location_id === sd.id && o.start_date <= wkEnd);
  const low = W.items.filter(it => spState(sd.id, it, { thr: W.thr, counts: W.counts }).low && !W.req.some(r => r.item_id === it.id)).length;
  const rq = W.req.filter(r => r.status === 'needed').length, ordered = W.req.filter(r => r.status === 'ordered').length;
  let mc = null;
  if (W.ms) {
    const inv = W.ms.some(r => r.next_due), last = {}; W.ms.forEach(r => last[r.club_id] = r.last_session);
    const call = W.ms.filter(r => !r.frozen && !r.next_booking && (inv ? r.next_due && -daysAgo(r.next_due) <= 7 : true)).length;
    const risk = (W.ns || []).filter(r => { const day = Math.max(1, daysAgo(r.signed_on) + 1); if (day > 30) return false; const dl = last[r.club_id] ? daysAgo(last[r.club_id]) : null, ex = r.plan_sessions ? r.plan_sessions * day / 30 : null; return nmHealth(r, day, dl, ex ? r.sessions_done / Math.max(ex, 1) : null).health === 'risk'; }).length;
    mc = { call, inv, risk, age: W.meta ? daysAgo(W.meta.as_of) : null };
  }
  const wkRows = [
    ...outs.map(o => `<li><i class="up-dot" style="background:${o.status === 'pending' ? '#f6e2b0' : '#e8b84a'}"></i><span><b>${esc(o.full_name.split(' ')[0])}</b> out ${o.start_date <= td ? 'until ' + fmt(o.end_date) : fmt(o.start_date) + (o.end_date !== o.start_date ? '–' + fmt(o.end_date) : '')}${o.status === 'pending' ? ' <em class="muted">pending</em>' : ''}</span></li>`),
    ...W.ev.map(e => `<li><i class="up-dot" style="background:${isClosed(e) ? '#6b5e50' : e.location_id ? '#4a86c5' : '#2f5f8f'}"></i><span><b>${fmt(e.event_date)}</b> ${esc(e.title)}${e.time_label ? ' • ' + esc(e.time_label) : ''}</span></li>`)];
  const stat = (n, label, go, cls) => `<button class="sstat ${cls || ''}" data-go="${go}"><b>${n}</b>${label}</button>`;
  const stats = [rq || low ? stat(rq + low, 'supplies low or requested', 'sup', 'warm') : '', ordered ? stat(ordered, 'supplies on the way', 'sup') : '',
    mc && mc.call ? stat(mc.call, mc.inv ? 'members to call' : 'members not booked', 'mem', 'warm') : '', mc && mc.risk ? stat(mc.risk, 'new members at risk', 'new', 'warm') : '',
    mc && mc.age > 7 ? stat(mc.age + 'd', 'since ClubReady upload', 'mem', 'hot') : ''].join('');
  const notes = sd.hasNotes && i.staff_notes ? `<section class="spanel"><h3>Studio info for staff</h3><p class="snotes">${esc(i.staff_notes)}</p></section>` : (sd.hasNotes && can ? `<section class="spanel"><h3>Studio info for staff</h3><p class="muted" style="margin:0">Add door codes, Wi-Fi, alarm steps, vendor contacts or opening and closing steps with Edit studio info.</p></section>` : '');
  $('studioBody').innerHTML = `<a class="back" href="#studio">← All studios</a>
    <div class="shero2${sd.photo ? '' : ' nophoto'}">${sd.photo ? `<img src="${esc(sd.photo)}" alt="">` : ''}<div class="shero2-t"><h2>${esc(l.name)}</h2>${st ? `<span class="sopen ${st.open ? 'yes' : ''}">${esc(st.t)}</span>` : ''}</div></div>
    <div class="sbtns">${i.phone ? `<a class="tbtn" href="tel:${esc(telOf(i.phone))}">☎ ${esc(fmtPhone(i.phone))}</a>` : ''}${i.address ? `<a class="tbtn" href="${mapsUrl(i.address)}" target="_blank" rel="noopener">📍 Directions</a>` : ''}${i.email ? `<a class="tbtn" href="mailto:${esc(i.email)}">✉ Email</a>` : ''}${can ? '<button class="sm" id="stEdit">Edit studio info</button>' : ''}</div>
    <div class="slayout">
      <div class="scol">
        <section class="spanel"><h3>This week at ${esc(l.name)}</h3>${stats ? `<div class="sstats2">${stats}</div>` : ''}
          ${wkRows.length ? `<ul class="swk">${wkRows.join('')}</ul>` : '<p class="muted" style="margin:0">No one out and no events in the next 7 days.</p>'}</section>
        <section class="spanel"><h3>Our team <span class="hcount">${team.length}</span></h3>${team.length ? `<div class="tgrid" id="stPeople">${team.map(p => `<div class="tcard" data-id="${p.id}" tabindex="0" role="button">${avatar(p)}<div class="tinfo"><b>${esc(p.full_name)}</b><span>${esc(p.job_title || '')}</span>${teamBadges(p) ? `<div class="tbadges">${teamBadges(p)}</div>` : ''}<div class="tacts">${p.phone ? `<a class="tic" href="tel:${esc(telOf(p.phone))}" aria-label="Call">☎</a><a class="tic" href="sms:${esc(telOf(p.phone))}" aria-label="Text">💬</a>` : ''}${p.email ? `<a class="tic" href="mailto:${esc(p.email)}" aria-label="Email">✉</a>` : ''}</div></div></div>`).join('')}</div>` : `<p class="muted" style="margin:0">No one is listed at this studio yet.${ME.role === 'owner' ? ' <a href="#people">Assign people in People →</a>' : ''}</p>`}</section>
      </div>
      <div class="scol">
        <section class="spanel"><h3>Hours</h3>${hours}</section>
        <section class="spanel"><h3>Contact</h3><dl class="tfacts" style="margin:0">${[['Address', i.address ? `<a href="${mapsUrl(i.address)}" target="_blank" rel="noopener">${esc(i.address)}</a>` : ''], ['Phone', i.phone ? `<a href="tel:${esc(telOf(i.phone))}">${esc(fmtPhone(i.phone))}</a>` : ''], ['Email', i.email ? `<a href="mailto:${esc(i.email)}">${esc(i.email)}</a>` : '']].filter(f => f[1]).map(f => `<dt>${f[0]}</dt><dd>${f[1]}</dd>`).join('') || '<dd class="muted">No contact info yet.</dd>'}</dl></section>
        ${i.bio ? `<section class="spanel"><h3>About</h3><p style="white-space:pre-wrap;margin:0">${esc(i.bio)}</p></section>` : ''}
        ${notes}
      </div>
    </div>`;
}

function stForm() {
  const i = sd.info || {}, H = parseHours(i.hours) || {}, legacy = i.hours && !parseHours(i.hours);
  const row = d => { const v = H[d] || {}; return `<tr><td>${d}</td><td><input type="time" data-ho="${d}" value="${v.o || ''}" ${v.closed ? 'disabled' : ''}></td><td><input type="time" data-hc="${d}" value="${v.c || ''}" ${v.closed ? 'disabled' : ''}></td><td><label class="chkline" style="margin:0"><input type="checkbox" data-hx="${d}" ${v.closed ? 'checked' : ''}> Closed</label></td></tr>`; };
  $('dlgBody').innerHTML = `<h2>Edit studio info</h2>
    <div class="grid2"><label>Phone <input id="sPhone" maxlength="40" value="${esc(i.phone)}"></label>
    <label>Email <input id="sEmail" type="email" maxlength="120" value="${esc(i.email)}"></label></div>
    <label>Address <input id="sAddr" maxlength="200" value="${esc(i.address)}" placeholder="2009 Main St Ste 300, Lakeway, TX 78734"></label>
    <div class="hedit"><b>Hours</b>${legacy ? `<p class="muted" style="margin:.2rem 0 .4rem;font-size:.85rem">Current hours text: “${esc(i.hours)}”. Fill in the times below to replace it.</p>` : ''}
      <table class="shours-edit"><tbody>${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(row).join('')}</tbody></table>
      <button type="button" class="quiet sm" data-act="hCopy">Copy Monday to weekdays</button></div>
    <label>About this studio <textarea id="sBio" maxlength="800">${esc(i.bio)}</textarea></label>
    ${sd.hasNotes ? `<label>Studio info for staff <small class="muted">(door codes, Wi-Fi, alarm, vendors, opening/closing steps; only signed-in team members see it)</small><textarea id="sNotes" rows="5" maxlength="3000">${esc(i.staff_notes)}</textarea></label>` : ''}
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
    const H = {}; let bad = '';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(d => {
      const x = document.querySelector(`[data-hx="${d}"]`).checked, o = document.querySelector(`[data-ho="${d}"]`).value, c = document.querySelector(`[data-hc="${d}"]`).value;
      if (x) H[d] = { closed: true }; else if (o && c) { if (c <= o) bad = d; H[d] = { o, c }; } else if (o || c) bad = d;
    });
    if (bad) { $('sErr').textContent = `Check ${bad}: add both an opening and closing time (closing after opening), or tick Closed.`; return; }
    const hrs = Object.keys(H).length ? fmtHoursText(H) : (sd.info && sd.info.hours) || null;
    const v = id => $(id).value.trim() || null, row = { location_id: sd.id, bio: v('sBio'), address: v('sAddr'), phone: v('sPhone'), email: v('sEmail'), hours: hrs, updated_by: ME.id, updated_at: new Date().toISOString() };
    if (sd.hasNotes) row.staff_notes = v('sNotes');
    if (path) row.photo_path = path;
    const { error } = await db.from('studio_info').upsert(row, { onConflict: 'location_id' }); if (error) throw error;
  } catch (e) { $('sErr').textContent = 'Could not save. ' + (e.message || ''); return; }
  $('dlg').close(); loadStudio(sd.id);
}

$('studioBody').onclick = e => {
  if (e.target.closest('.tic')) return;
  const b = e.target.closest('.tcard'); if (b && b.dataset.id) { openCard(b.dataset.id); return; }
  if (e.target.id === 'stEdit') { stForm(); return; }
  const g = e.target.closest('[data-go]'); if (!g) return;
  // Jump to the page with this studio already picked
  if (g.dataset.go === 'sup') { sp.studio = sd.id; sp.tab = ME.role === 'owner' ? 'count' : 'count'; location.hash = '#supplies'; }
  else { mem.studio = sd.id; mem.sec = g.dataset.go === 'new' ? 'new' : 'risk'; mem.g = g.dataset.go === 'new' ? 'list' : 'attn'; mem.quick = null; location.hash = '#members'; }
};
$('studioBody').onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('tcard')) { e.preventDefault(); openCard(e.target.dataset.id); } };
$('dlgBody').addEventListener('click', e => {
  const a = e.target.dataset.act;
  if (a === 'stSave') stSave();
  else if (a === 'hCopy') { const o = document.querySelector('[data-ho="Mon"]').value, c = document.querySelector('[data-hc="Mon"]').value, x = document.querySelector('[data-hx="Mon"]').checked;
    ['Tue', 'Wed', 'Thu', 'Fri'].forEach(d => { document.querySelector(`[data-ho="${d}"]`).value = o; document.querySelector(`[data-hc="${d}"]`).value = c; const k = document.querySelector(`[data-hx="${d}"]`); k.checked = x; k.dispatchEvent(new Event('change', { bubbles: true })); }); }
});
$('dlgBody').addEventListener('change', e => { const d = e.target.dataset.hx; if (!d) return; document.querySelector(`[data-ho="${d}"]`).disabled = e.target.checked; document.querySelector(`[data-hc="${d}"]`).disabled = e.target.checked; });
