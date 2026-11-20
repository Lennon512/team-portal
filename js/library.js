// ---------- Library: training and reference resources ----------
// Everyone can browse; owners add, edit and remove. Files live in the private "library" storage bucket.
const LB = { rows: [], pos: [], myPos: new Set(), missing: false, q: '', cat: '', mine: false, kind: '', tab: 'lib', asg: [], all: [], people: [], pp: [], asgMissing: false, af: { loc: '', st: 'open', res: '' } };
const LB_KINDS = { file: ['File', '📄'], link: ['Link', '🔗'], video: ['Video', '▶'], page: ['Page', '📝'] };
const LB_CATS = ['Start here', 'Sales', 'Stretch technique', 'Front desk', 'Member success', 'Policies', 'Opening & closing', 'Marketing', 'General'];

async function loadLibrary() {
  const [r, p, pp] = await Promise.all([db.from('library_resources').select('*').order('title'), db.from('positions').select('id,name').order('name'),
    db.from('profile_positions').select('position_id').eq('user_id', ME.id)]);
  LB.missing = !!r.error && /library_resources/.test(r.error.message || '');
  LB.rows = r.data || []; LB.thumbs = {}; LB.pos = p.data || []; LB.myPos = new Set((pp.data || []).map(x => x.position_id));
  // Assigned trainings: everyone loads their own; owners also load everyone's plus the people to pick from
  const own = ME.role === 'owner', [a, all, pe, ppl] = await Promise.all([db.from('library_assignments').select('*').eq('user_id', ME.id),
    own ? db.from('library_assignments').select('*') : Promise.resolve({ data: [] }),
    own ? db.from('profiles').select('id,full_name,email,location_id,role').order('full_name') : Promise.resolve({ data: [] }),
    own ? db.from('profile_positions').select('user_id,position_id') : Promise.resolve({ data: [] })]);
  LB.asgMissing = !!a.error && /library_assignments/.test(a.error.message || '');
  LB.asg = a.data || []; LB.all = all.data || []; LB.people = (pe.data || []).filter(x => x.full_name || x.email); LB.pp = ppl.data || [];
  drawLibrary();
}

const lbPosName = id => (LB.pos.find(p => p.id === id) || {}).name || '';
const lbForMe = r => !r.positions || !r.positions.length || r.positions.some(id => LB.myPos.has(id));
// YouTube / Loom / Vimeo links play inside the portal
function lbEmbed(url) {
  const u = String(url || ''); let m;
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/))) return 'https://www.youtube.com/embed/' + m[1];
  if ((m = u.match(/loom\.com\/(?:share|embed)\/([\w]+)/))) return 'https://www.loom.com/embed/' + m[1];
  if ((m = u.match(/vimeo\.com\/(\d+)/))) return 'https://player.vimeo.com/video/' + m[1];
  return null;
}
// Written pages: plain text with simple formatting (blank line = new paragraph, "- " = bullet, **bold**, # heading)
function lbFormat(t) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return String(t || '').split(/\n{2,}/).map(block => {
    const lines = block.split('\n');
    if (lines.every(l => /^\s*[-•*]\s+/.test(l))) return '<ul>' + lines.map(l => `<li>${inline(l.replace(/^\s*[-•*]\s+/, ''))}</li>`).join('') + '</ul>';
    if (lines.every(l => /^\s*\d+[.)]\s+/.test(l))) return '<ol>' + lines.map(l => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('') + '</ol>';
    if (/^#{1,3}\s/.test(lines[0]) && lines.length === 1) return `<h3>${inline(lines[0].replace(/^#+\s/, ''))}</h3>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

const lbImg = r => r.kind === 'file' && /\.(png|jpe?g|gif|webp)$/i.test(r.file_name || ''), lbPdf = r => r.kind === 'file' && /\.pdf$/i.test(r.file_name || '');
const lbNew = r => r.created_at && (Date.now() - new Date(r.created_at)) / 864e5 <= 7;
// Thumbnails for images: the files are private, so fetch short-lived links in one go, then redraw
async function lbThumbs() {
  LB.thumbs = LB.thumbs || {};
  const need = LB.rows.filter(r => lbImg(r) && r.file_path && !(r.id in LB.thumbs));
  if (!need.length) return;
  need.forEach(r => LB.thumbs[r.id] = null);
  const { data } = await db.storage.from('library').createSignedUrls(need.map(r => r.file_path), 3600);
  (data || []).forEach((x, i) => { if (x && x.signedUrl) LB.thumbs[need[i].id] = x.signedUrl; });
  drawLibrary();
}

function drawLibrary() {
  const own = ME.role === 'owner';
  $('lbAdd').hidden = !own || LB.missing;
  if (LB.missing) {
    $('lbBody').innerHTML = `<div class="pcard"><h3>One-time setup needed</h3><p>${own ? 'Open Supabase → SQL Editor → New query, paste the contents of <b>sql/library.sql</b>, and click Run. Then refresh this page.' : 'Ask the owner to finish setting up the Library.'}</p></div>`;
    return;
  }
  const openN = LB.asg.filter(x => !x.completed_at && LB.rows.some(r => r.id === x.resource_id)).length;
  $('lbTabs').innerHTML = [['lib', 'Library'], ['mine', 'My trainings' + (openN ? ` <span class="lbcount">${openN}</span>` : '')], ...(own ? [['assign', 'Assigned']] : [])]
    .map(([k, l]) => `<button type="button" data-lbt="${k}" class="${LB.tab === k ? 'on' : ''}">${l}</button>`).join('');
  $('lbAdd').hidden = !own || LB.missing || LB.tab !== 'lib';
  $('lbAssignNew').hidden = !own || LB.tab !== 'assign' || LB.asgMissing;
  if (LB.tab !== 'lib' && LB.asgMissing) {
    $('lbBody').innerHTML = `<div class="pcard"><h3>One-time setup needed</h3><p>${own ? 'Open Supabase → SQL Editor → New query, paste the contents of <b>sql/library_assignments.sql</b>, and click Run. Then refresh this page.' : 'Ask the owner to finish setting up trainings.'}</p></div>`;
    return;
  }
  if (LB.tab === 'mine') return lbDrawMine();
  if (LB.tab === 'assign' && own) return lbDrawAssigned();
  const q = LB.q.trim().toLowerCase(), cats = [...new Set([...LB_CATS.filter(c => LB.rows.some(r => r.category === c)), ...LB.rows.map(r => r.category)])];
  const hit = r => !q || [r.title, r.description, r.category, r.body, r.file_name, ...(r.tags || []), ...(r.positions || []).map(lbPosName)].some(x => String(x || '').toLowerCase().includes(q));
  const list = LB.rows.filter(r => hit(r) && (!LB.cat || r.category === LB.cat) && (!LB.mine || lbForMe(r)) && (!LB.kind || r.kind === LB.kind));
  const card = r => { const [kl, ki] = LB_KINDS[r.kind] || LB_KINDS.link, forMe = lbForMe(r) && r.positions && r.positions.length;
    return `<div class="lbcard${r.pinned ? ' pin' : ''}" data-lb="${r.id}" tabindex="0" role="button" aria-label="Open ${esc(r.title)}">
      ${LB.thumbs && LB.thumbs[r.id] ? `<div class="lbthumb" aria-hidden="true"><img src="${esc(LB.thumbs[r.id])}" alt="" loading="lazy"></div>` : `<div class="lbic" aria-hidden="true">${ki}</div>`}
      <div class="lbtxt"><b>${esc(r.title)}${lbNew(r) ? ' <span class="lbnew">New</span>' : ''}</b>${r.description && r.description.trim().toLowerCase() !== String(r.title || '').trim().toLowerCase() ? `<span>${esc(r.description)}</span>` : ''}
        <div class="lbchips"><span class="lbchip k">${kl}${r.kind === 'file' && r.file_name ? ' • ' + esc(r.file_name.split('.').pop().toUpperCase()) : ''}</span>${forMe ? '<span class="lbchip me">For your role</span>' : ''}${(r.positions || []).length && !forMe ? (r.positions || []).map(id => `<span class="lbchip">${esc(lbPosName(id))}</span>`).join('') : ''}${(r.tags || []).map(t => `<span class="lbchip t">#${esc(t)}</span>`).join('')}</div></div>
      ${own ? `<div class="lbacts"><button type="button" class="quiet lbasgbtn" data-lbasg="${r.id}" aria-label="Assign ${esc(r.title)}" title="Assign to people">Assign</button><button type="button" class="mg-ic" data-lbedit="${r.id}" aria-label="Edit ${esc(r.title)}" title="Edit">✎</button></div>` : ''}</div>`; };
  const pinned = list.filter(r => r.pinned), byCat = cats.map(c => [c, list.filter(r => r.category === c && !r.pinned)]).filter(([, L]) => L.length);
  $('lbBody').innerHTML = `<div class="lbbar">
      <select id="lbCat" aria-label="Category"><option value="">All categories (${LB.rows.length})</option>${cats.map(c => `<option ${LB.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="lbKind" aria-label="Type"><option value="">All types</option>${Object.entries(LB_KINDS).map(([k, [l]]) => `<option value="${k}" ${LB.kind === k ? 'selected' : ''}>${l}s</option>`).join('')}</select>
      ${LB.myPos.size ? `<label class="mem-mine"><input type="checkbox" id="lbMine" ${LB.mine ? 'checked' : ''}> Just for my role</label>` : ''}
      <input id="lbFind" type="search" placeholder="Search the library" aria-label="Search the library" value="${esc(LB.q)}"></div>` +
    (!LB.rows.length ? `<div class="pcard"><h3>Nothing here yet</h3><p>${own ? 'Click <b>Add resource</b> to upload a file, link a video or doc, or write a page (scripts, SOPs, checklists).' : 'Training materials and resources will show up here.'}</p></div>`
      : !list.length ? '<p class="lead">Nothing matches that search.</p>'
      : (pinned.length ? `<section class="lbsec"><h3>📌 Start here</h3><div class="lbgrid">${pinned.map(card).join('')}</div></section>` : '') +
        byCat.map(([c, L]) => `<section class="lbsec"><h3>${esc(c)} <span class="hcount">${L.length}</span></h3><div class="lbgrid">${L.map(card).join('')}</div></section>`).join(''));
  const f = $('lbFind'); if (f && LB.focus) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); LB.focus = false; }
  lbThumbs();
}

async function lbOpen(id) {
  const r = LB.rows.find(x => x.id === id); if (!r) return;
  if (r.kind === 'page') {
    $('dlgBody').innerHTML = `<h2>${esc(r.title)}</h2>${r.description ? `<p class="lead" style="margin:.2rem 0 1rem">${esc(r.description)}</p>` : ''}<div class="lbpage">${lbFormat(r.body)}</div><div class="acts"><button class="quiet" data-act="close">Close</button></div>`;
    $('dlg').classList.add('wide'); if (!$('dlg').open) $('dlg').showModal(); return;
  }
  if (r.kind === 'video' && lbEmbed(r.url)) {
    $('dlgBody').innerHTML = `<h2>${esc(r.title)}</h2>${r.description ? `<p class="lead" style="margin:.2rem 0 .8rem">${esc(r.description)}</p>` : ''}<div class="lbvid"><iframe src="${esc(lbEmbed(r.url))}" title="${esc(r.title)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>
      <div class="acts"><a class="btnlink" href="${esc(r.url)}" target="_blank" rel="noopener">Open in a new tab</a><button class="quiet" data-act="close">Close</button></div>`;
    $('dlg').classList.add('wide'); if (!$('dlg').open) $('dlg').showModal(); return;
  }
  if ((lbImg(r) || lbPdf(r)) && r.file_path) {   // images and PDFs open right here
    const { data, error } = await db.storage.from('library').createSignedUrl(r.file_path, 3600);
    if (error || !data) { alert('Could not open that file. ' + (error ? error.message : '')); return; }
    const u = esc(data.signedUrl), desc = r.description && r.description.trim().toLowerCase() !== String(r.title || '').trim().toLowerCase() ? `<p class="lead" style="margin:.2rem 0 .8rem">${esc(r.description)}</p>` : '';
    $('dlgBody').innerHTML = `<h2>${esc(r.title)}</h2>${desc}${lbImg(r) ? `<div class="lbview"><img src="${u}" alt="${esc(r.title)}"></div>` : `<div class="lbview pdf"><iframe src="${u}" title="${esc(r.title)}"></iframe></div>`}
      <div class="acts"><a class="btnlink" href="${u}" target="_blank" rel="noopener">Open in a new tab</a><a class="btnlink quiet" href="${u}" download="${esc(r.file_name || '')}">Download</a><button class="quiet" data-act="close">Close</button></div>`;
    $('dlg').classList.add('wide'); if (!$('dlg').open) $('dlg').showModal(); return;
  }
  if (r.kind === 'file' && r.file_path) {
    const w = window.open('', '_blank');   // open the tab now so pop-up blockers allow it
    const { data, error } = await db.storage.from('library').createSignedUrl(r.file_path, 3600);
    if (error || !data) { if (w) w.close(); alert('Could not open that file. ' + (error ? error.message : '')); return; }
    if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
    return;
  }
  if (r.url) window.open(r.url, '_blank', 'noopener');
}

function lbForm(id) {
  const r = LB.rows.find(x => x.id === id) || { kind: 'file', category: LB.cat || 'General', positions: [], tags: [] };
  const cats = [...new Set([...LB_CATS, ...LB.rows.map(x => x.category)])];
  $('dlgBody').innerHTML = `<h2>${r.id ? 'Edit resource' : 'Add resource'}</h2>
    <label>Title <input id="lbT" maxlength="120" value="${esc(r.title)}" placeholder="Front desk opening checklist"></label>
    <label>Type <select id="lbK">${[['file', 'Upload a file (PDF, doc, slides, image, short video)'], ['link', 'Link (Google Drive, website...)'], ['video', 'Video link (YouTube, Loom, Vimeo, Drive)'], ['page', 'Write a page (script, SOP, checklist)']].map(([k, l]) => `<option value="${k}" ${r.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div data-lbk="file"><label>File ${r.file_name ? `<small class="muted">(now: ${esc(r.file_name)}; choose a new one to replace it)</small>` : '<small class="muted">(up to 50 MB; for longer videos, use a video link)</small>'}<input id="lbF" type="file"></label></div>
    <div data-lbk="link video"><label>Link <input id="lbU" type="url" maxlength="500" value="${esc(r.url)}" placeholder="https://"></label></div>
    <div data-lbk="page"><label>Page text <small class="muted">(blank line = new paragraph, start lines with "- " for bullets, **bold**)</small><textarea id="lbB" rows="10" maxlength="20000">${esc(r.body)}</textarea></label></div>
    <label>Short description (optional) <input id="lbD" maxlength="200" value="${esc(r.description)}"></label>
    <div class="grid2"><label>Category <input id="lbC" list="lbCats" maxlength="60" value="${esc(r.category)}"><datalist id="lbCats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label>Tags (optional) <input id="lbG" maxlength="200" value="${esc((r.tags || []).join(', '))}" placeholder="new hire, pricing"></label></div>
    <fieldset class="dlgrp"><legend>Who it's for <small class="muted" style="text-transform:none;letter-spacing:0">(leave all unticked for everyone)</small></legend>
      <div class="lbpos">${LB.pos.map(p => `<label class="chkline"><input type="checkbox" data-lbp="${p.id}" ${(r.positions || []).includes(p.id) ? 'checked' : ''}> ${esc(p.name)}</label>`).join('')}</div></fieldset>
    <label class="chkline"><input type="checkbox" id="lbPin" ${r.pinned ? 'checked' : ''}> Pin to the top ("Start here")</label>
    <div class="err" id="lbErr" role="alert"></div>
    <div class="acts"><button data-act="lbSave" data-id="${r.id || ''}">Save</button>${r.id ? `<button class="quiet" data-act="lbDel" data-id="${r.id}">Remove</button>` : ''}<button class="quiet" data-act="close">Cancel</button></div>`;
  lbShowKind();
  $('dlg').classList.remove('wide'); if (!$('dlg').open) $('dlg').showModal();
}
const lbShowKind = () => { const k = $('lbK').value; document.querySelectorAll('[data-lbk]').forEach(el => el.hidden = !el.dataset.lbk.split(' ').includes(k)); };

async function lbSave(id) {
  const old = LB.rows.find(x => x.id === id), k = $('lbK').value, title = $('lbT').value.trim(), err = m => { $('lbErr').textContent = m; };
  if (!title) return err('Add a title.');
  const row = { title, kind: k, description: $('lbD').value.trim() || null, category: $('lbC').value.trim() || 'General',
    tags: $('lbG').value.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean), positions: [...document.querySelectorAll('[data-lbp]:checked')].map(x => x.dataset.lbp),
    pinned: $('lbPin').checked, url: null, body: null, updated_at: new Date().toISOString() };
  if (k === 'link' || k === 'video') { row.url = $('lbU').value.trim(); if (!/^https?:\/\//i.test(row.url)) return err('Add a link that starts with https://'); }
  if (k === 'page') { row.body = $('lbB').value.trim(); if (!row.body) return err('Write something on the page.'); }
  const btn = document.querySelector('[data-act="lbSave"]'); btn.disabled = true; btn.textContent = 'Saving...';
  try {
    if (k === 'file') {
      const f = $('lbF').files[0];
      if (f) {
        if (f.size > 52428800) throw new Error('That file is over 50 MB. Upload it to Google Drive or YouTube and add it as a link instead.');
        const path = `${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
        const up = await db.storage.from('library').upload(path, f, { contentType: f.type || undefined }); if (up.error) throw up.error;
        if (old && old.file_path) db.storage.from('library').remove([old.file_path]);
        row.file_path = path; row.file_name = f.name;
      } else if (!old || !old.file_path) throw new Error('Choose a file to upload.');
    } else if (old && old.file_path) { db.storage.from('library').remove([old.file_path]); row.file_path = null; row.file_name = null; }
    const res = id ? await db.from('library_resources').update(row).eq('id', id) : await db.from('library_resources').insert({ ...row, created_by: ME.id });
    if (res.error) throw res.error;
  } catch (e) { btn.disabled = false; btn.textContent = 'Save'; return err('Could not save. ' + (e.message || '')); }
  $('dlg').close(); toast(id ? 'Saved' : 'Added to the library'); loadLibrary();
}

async function lbDel(id) {
  const r = LB.rows.find(x => x.id === id); if (!r || !confirm(`Remove "${r.title}" from the library?`)) return;
  const { error } = await db.from('library_resources').delete().eq('id', id);
  if (error) { alert('Could not remove it. ' + error.message); return; }
  if (r.file_path) db.storage.from('library').remove([r.file_path]);
  $('dlg').close(); toast('Removed'); loadLibrary();
}

$('lbAdd').onclick = () => lbForm(null);
$('lbBody').addEventListener('click', e => {
  const ed = e.target.closest('[data-lbedit]'); if (ed) { e.stopPropagation(); lbForm(ed.dataset.lbedit); return; }
  const as = e.target.closest('[data-lbasg]'); if (as) { e.stopPropagation(); lbAssignForm(as.dataset.lbasg); return; }
  const dn = e.target.closest('[data-lbdone]'); if (dn) { e.stopPropagation(); lbDone(dn.dataset.lbdone, dn.dataset.undo === '1'); return; }
  const rm = e.target.closest('[data-lbunasg]'); if (rm) { e.stopPropagation(); lbUnassign(rm.dataset.lbunasg); return; }
  const c = e.target.closest('[data-lb]'); if (c) { e.preventDefault(); lbOpen(c.dataset.lb); }
});
$('lbBody').addEventListener('keydown', e => { const c = e.target.closest('[data-lb]'); if (c && (e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); lbOpen(c.dataset.lb); } });
$('lbBody').addEventListener('input', e => { if (e.target.id === 'lbFind') { LB.q = e.target.value; LB.focus = true; drawLibrary(); } });
$('lbBody').addEventListener('change', e => { const t = e.target;
  if (t.id === 'lbAfLoc') { LB.af.loc = t.value; drawLibrary(); return; } if (t.id === 'lbAfSt') { LB.af.st = t.value; drawLibrary(); return; } if (t.id === 'lbAfRes') { LB.af.res = t.value; drawLibrary(); return; }
  if (t.id === 'lbCat') { LB.cat = t.value; drawLibrary(); } else if (t.id === 'lbKind') { LB.kind = t.value; drawLibrary(); } else if (t.id === 'lbMine') { LB.mine = t.checked; drawLibrary(); } });
document.addEventListener('change', e => { if (e.target.id === 'lbK') lbShowKind(); });
document.addEventListener('click', e => { const b = e.target.closest('[data-act="lbSave"],[data-act="lbDel"]'); if (!b || !$('dlg').contains(b)) return;
  b.dataset.act === 'lbSave' ? lbSave(b.dataset.id || null) : lbDel(b.dataset.id); });


// ---------- Trainings: My trainings, and owners assigning ----------
const lbToday = () => todayStr();
const lbDue = d => d ? new Date(d + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
const lbName = id => { const p = LB.people.find(x => x.id === id); return p ? (p.full_name || p.email) : (id === ME.id ? (ME.full_name || ME.email) : 'Someone'); };
const lbLoc = id => (locs.find(l => l.id === id) || {}).name || '';
const lbStatus = a => a.completed_at ? ['done', 'Done ' + lbDue(String(a.completed_at).slice(0, 10))] : a.due_date && a.due_date < lbToday() ? ['late', 'Overdue'] : ['open', a.due_date ? 'Due ' + lbDue(a.due_date) : 'To do'];

function lbDrawMine() {
  const L = LB.asg.map(a => ({ a, r: LB.rows.find(r => r.id === a.resource_id) })).filter(x => x.r)
    .sort((x, y) => !!x.a.completed_at - !!y.a.completed_at || String(x.a.due_date || '9999').localeCompare(String(y.a.due_date || '9999')) || x.r.title.localeCompare(y.r.title));
  if (!L.length) { $('lbBody').innerHTML = `<div class="pcard"><h3>No trainings assigned yet</h3><p>When ${ME.role === 'owner' ? 'a training is assigned to you' : 'an owner assigns you a training'}, it shows up here with its due date.</p></div>`; return; }
  const done = L.filter(x => x.a.completed_at).length;
  $('lbBody').innerHTML = `<p class="lead" style="margin:0 0 1rem">${done} of ${L.length} done${done < L.length ? ` • ${L.length - done} to go` : ' 🎉'}</p><div class="lbmine">` + L.map(({ a, r }) => {
    const [st, sl] = lbStatus(a), [, ki] = LB_KINDS[r.kind] || LB_KINDS.link;
    return `<div class="lbtr ${st}" data-lb="${r.id}" tabindex="0" role="button" aria-label="Open ${esc(r.title)}">
      <div class="lbic" aria-hidden="true">${ki}</div>
      <div class="lbtxt"><b>${esc(r.title)}</b>${a.note ? `<span>${esc(a.note)}</span>` : r.description ? `<span>${esc(r.description)}</span>` : ''}
        <div class="lbchips"><span class="lbchip st-${st}">${sl}</span><span class="lbchip">${esc(r.category)}</span>${a.assigned_by && a.assigned_by !== ME.id && LB.people.some(x => x.id === a.assigned_by) ? `<span class="lbchip">From ${esc(lbName(a.assigned_by))}</span>` : ''}</div></div>
      <button type="button" class="${a.completed_at ? 'quiet' : ''} lbdonebtn" data-lbdone="${a.id}" data-undo="${a.completed_at ? 1 : 0}">${a.completed_at ? 'Undo' : 'Mark done'}</button></div>`;
  }).join('') + '</div>';
}

function lbDrawAssigned() {
  const f = LB.af, byU = id => LB.people.find(p => p.id === id) || {};
  const L = LB.all.map(a => ({ a, r: LB.rows.find(r => r.id === a.resource_id), p: byU(a.user_id) })).filter(x => x.r)
    .filter(({ a, r, p }) => (!f.loc || String(p.location_id) === f.loc) && (!f.res || r.id === f.res) && (f.st === 'all' || (f.st === 'open' ? !a.completed_at : f.st === 'late' ? lbStatus(a)[0] === 'late' : !!a.completed_at)))
    .sort((x, y) => x.r.title.localeCompare(y.r.title) || String(x.p.full_name || '').localeCompare(String(y.p.full_name || '')));
  const res = [...new Set(LB.all.map(a => a.resource_id))].map(id => LB.rows.find(r => r.id === id)).filter(Boolean).sort((a, b) => a.title.localeCompare(b.title));
  const tot = LB.all.filter(a => LB.rows.some(r => r.id === a.resource_id)), dn = tot.filter(a => a.completed_at).length, late = tot.filter(a => lbStatus(a)[0] === 'late').length;
  $('lbBody').innerHTML = `<p class="lead" style="margin:0 0 1rem">${tot.length ? `${dn} of ${tot.length} assigned trainings done${late ? ` • <b>${late} overdue</b>` : ''}` : 'Nothing assigned yet. Click <b>Assign training</b>, or the <b>Assign</b> button on any resource in the Library.'}</p>` +
    (tot.length ? `<div class="lbbar">
      <select id="lbAfSt" aria-label="Status">${[['open', 'Not done'], ['late', 'Overdue'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => `<option value="${k}" ${f.st === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select id="lbAfLoc" aria-label="Studio"><option value="">All studios</option>${locs.map(l => `<option value="${l.id}" ${f.loc === String(l.id) ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
      <select id="lbAfRes" aria-label="Training"><option value="">All trainings</option>${res.map(r => `<option value="${r.id}" ${f.res === r.id ? 'selected' : ''}>${esc(r.title)}</option>`).join('')}</select></div>` +
      (!L.length ? '<p class="lead">Nothing matches.</p>' : `<div class="table-wrap"><table class="mt"><thead><tr><th>Training</th><th>Person</th><th>Studio</th><th>Status</th><th>Assigned</th><th></th></tr></thead><tbody>${L.map(({ a, r, p }) => { const [st, sl] = lbStatus(a);
        return `<tr><td><a href="#" data-lb="${r.id}">${esc(r.title)}</a>${a.note ? `<div class="muted" style="font-size:.8rem">${esc(a.note)}</div>` : ''}</td><td>${esc(p.full_name || p.email || 'Unknown')}</td><td>${esc(lbLoc(p.location_id))}</td>
          <td><span class="lbchip st-${st}">${sl}</span></td><td class="muted">${lbDue(String(a.created_at).slice(0, 10))}</td><td><button type="button" class="mg-ic" data-lbunasg="${a.id}" aria-label="Remove this assignment" title="Remove">✕</button></td></tr>`; }).join('')}</tbody></table></div>`) : '');
}

function lbAssignForm(resId) {
  const ppl = LB.people, posOf = id => LB.pp.filter(x => x.user_id === id).map(x => x.position_id);
  const usedPos = LB.pos.filter(p => LB.pp.some(x => x.position_id === p.id)), usedLoc = locs.filter(l => ppl.some(p => p.location_id === l.id));
  const res = resId ? LB.rows.filter(r => r.id === resId) : LB.rows;
  if (!res.length) { alert('Add something to the Library first, then assign it.'); return; }
  $('dlgBody').innerHTML = `<h2>Assign training</h2>
    <label>Training <select id="laR">${res.map(r => `<option value="${r.id}">${esc(r.title)}</option>`).join('')}</select></label>
    <fieldset class="dlgrp"><legend>Who</legend>
      <div class="lbquick">Select: <button type="button" class="quiet sm" data-laq="all">Everyone</button>${usedLoc.map(l => `<button type="button" class="quiet sm" data-laq="loc:${l.id}">${esc(l.name)}</button>`).join('')}${usedPos.map(p => `<button type="button" class="quiet sm" data-laq="pos:${p.id}">${esc(p.name)}</button>`).join('')}<button type="button" class="quiet sm" data-laq="none">Clear</button></div>
      <div class="lbpeople">${ppl.map(p => `<label class="chkline"><input type="checkbox" data-lau="${p.id}" data-loc="${p.location_id || ''}" data-pos="${posOf(p.id).join(' ')}"> ${esc(p.full_name || p.email)} <small class="muted">${esc(lbLoc(p.location_id))}</small><small class="muted lbhas" data-has="${p.id}"></small></label>`).join('')}</div></fieldset>
    <div class="grid2"><label>Due date (optional) <input id="laD" type="date"></label><label>Note (optional) <input id="laN" maxlength="200" placeholder="Finish before your first solo shift"></label></div>
    <div class="err" id="laErr" role="alert"></div>
    <div class="acts"><button data-act="laSave">Assign</button><button class="quiet" data-act="close">Cancel</button></div>`;
  $('dlg').classList.remove('wide'); if (!$('dlg').open) $('dlg').showModal();
  lbMarkHas();
}
// Show who already has the chosen training
function lbMarkHas() {
  const rid = $('laR') && $('laR').value; if (!rid) return;
  document.querySelectorAll('[data-has]').forEach(el => { const a = LB.all.find(x => x.resource_id === rid && x.user_id === el.dataset.has); el.textContent = a ? (a.completed_at ? ' • already done' : ' • already assigned') : ''; });
}
document.addEventListener('change', e => { if (e.target.id === 'laR') lbMarkHas(); });
document.addEventListener('click', e => {
  const q = e.target.closest('[data-laq]'); if (q && $('dlg').contains(q)) {
    const [k, v] = q.dataset.laq.split(':');
    document.querySelectorAll('[data-lau]').forEach(c => { if (k === 'none') c.checked = false; else if (k === 'all' || (k === 'loc' && c.dataset.loc === v) || (k === 'pos' && c.dataset.pos.split(' ').includes(v))) c.checked = true; });
    return;
  }
  const b = e.target.closest('[data-act="laSave"]'); if (b && $('dlg').contains(b)) lbAssignSave(b);
});

async function lbAssignSave(btn) {
  const rid = $('laR').value, ids = [...document.querySelectorAll('[data-lau]:checked')].map(c => c.dataset.lau);
  if (!ids.length) { $('laErr').textContent = 'Pick at least one person.'; return; }
  const fresh = ids.filter(id => !LB.all.some(a => a.resource_id === rid && a.user_id === id)), skipped = ids.length - fresh.length;
  if (!fresh.length) { $('laErr').textContent = 'Everyone you picked already has this training.'; return; }
  btn.disabled = true; btn.textContent = 'Assigning...';
  const due = $('laD').value || null, note = $('laN').value.trim() || null;
  const { error } = await db.from('library_assignments').insert(fresh.map(user_id => ({ resource_id: rid, user_id, assigned_by: ME.id, due_date: due, note })));
  if (error) { btn.disabled = false; btn.textContent = 'Assign'; $('laErr').textContent = 'Could not assign. ' + error.message; return; }
  $('dlg').close(); toast(`Assigned to ${fresh.length} ${fresh.length === 1 ? 'person' : 'people'}${skipped ? ` (${skipped} already had it)` : ''}`); loadLibrary();
}

async function lbDone(id, undo) {
  const { error } = await db.from('library_assignments').update({ completed_at: undo ? null : new Date().toISOString() }).eq('id', id);
  if (error) { alert('Could not save. ' + error.message); return; }
  toast(undo ? 'Marked not done' : 'Nice work! Marked done'); loadLibrary();
}
async function lbUnassign(id) {
  const a = LB.all.find(x => x.id === id), r = a && LB.rows.find(x => x.id === a.resource_id);
  if (!a || !confirm(`Remove "${r ? r.title : 'this training'}" from ${lbName(a.user_id)}?`)) return;
  const { error } = await db.from('library_assignments').delete().eq('id', id);
  if (error) { alert('Could not remove it. ' + error.message); return; }
  toast('Removed'); loadLibrary();
}
$('lbAssignNew').onclick = () => lbAssignForm(null);
$('lbTabs').onclick = e => { const t = e.target.closest('[data-lbt]'); if (t) { LB.tab = t.dataset.lbt; drawLibrary(); } };
