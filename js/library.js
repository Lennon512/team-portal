// ---------- Library: training and reference resources ----------
// Everyone can browse; owners add, edit and remove. Files live in the private "library" storage bucket.
const LB = { rows: [], pos: [], myPos: new Set(), missing: false, q: '', cat: '', mine: false, kind: '' };
const LB_KINDS = { file: ['File', '📄'], link: ['Link', '🔗'], video: ['Video', '▶'], page: ['Page', '📝'] };
const LB_CATS = ['Start here', 'Sales', 'Stretch technique', 'Front desk', 'Member success', 'Policies', 'Opening & closing', 'Marketing', 'General'];

async function loadLibrary() {
  const [r, p, pp] = await Promise.all([db.from('library_resources').select('*').order('title'), db.from('positions').select('id,name').order('name'),
    db.from('profile_positions').select('position_id').eq('user_id', ME.id)]);
  LB.missing = !!r.error && /library_resources/.test(r.error.message || '');
  LB.rows = r.data || []; LB.pos = p.data || []; LB.myPos = new Set((pp.data || []).map(x => x.position_id));
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

function drawLibrary() {
  const own = ME.role === 'owner';
  $('lbAdd').hidden = !own || LB.missing;
  if (LB.missing) {
    $('lbBody').innerHTML = `<div class="pcard"><h3>One-time setup needed</h3><p>${own ? 'Open Supabase → SQL Editor → New query, paste the contents of <b>sql/library.sql</b>, and click Run. Then refresh this page.' : 'Ask the owner to finish setting up the Library.'}</p></div>`;
    return;
  }
  const q = LB.q.trim().toLowerCase(), cats = [...new Set([...LB_CATS.filter(c => LB.rows.some(r => r.category === c)), ...LB.rows.map(r => r.category)])];
  const hit = r => !q || [r.title, r.description, r.category, r.body, r.file_name, ...(r.tags || []), ...(r.positions || []).map(lbPosName)].some(x => String(x || '').toLowerCase().includes(q));
  const list = LB.rows.filter(r => hit(r) && (!LB.cat || r.category === LB.cat) && (!LB.mine || lbForMe(r)) && (!LB.kind || r.kind === LB.kind));
  const card = r => { const [kl, ki] = LB_KINDS[r.kind] || LB_KINDS.link, forMe = lbForMe(r) && r.positions && r.positions.length;
    return `<div class="lbcard${r.pinned ? ' pin' : ''}" data-lb="${r.id}" tabindex="0" role="button" aria-label="Open ${esc(r.title)}">
      <div class="lbic" aria-hidden="true">${ki}</div>
      <div class="lbtxt"><b>${esc(r.title)}</b>${r.description ? `<span>${esc(r.description)}</span>` : ''}
        <div class="lbchips"><span class="lbchip k">${kl}${r.kind === 'file' && r.file_name ? ' • ' + esc(r.file_name.split('.').pop().toUpperCase()) : ''}</span>${forMe ? '<span class="lbchip me">For your role</span>' : ''}${(r.positions || []).length && !forMe ? (r.positions || []).map(id => `<span class="lbchip">${esc(lbPosName(id))}</span>`).join('') : ''}${(r.tags || []).map(t => `<span class="lbchip t">#${esc(t)}</span>`).join('')}</div></div>
      ${own ? `<button type="button" class="mg-ic lbedit" data-lbedit="${r.id}" aria-label="Edit ${esc(r.title)}">✎</button>` : ''}</div>`; };
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
  const c = e.target.closest('[data-lb]'); if (c) lbOpen(c.dataset.lb);
});
$('lbBody').addEventListener('keydown', e => { const c = e.target.closest('[data-lb]'); if (c && (e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); lbOpen(c.dataset.lb); } });
$('lbBody').addEventListener('input', e => { if (e.target.id === 'lbFind') { LB.q = e.target.value; LB.focus = true; drawLibrary(); } });
$('lbBody').addEventListener('change', e => { const t = e.target;
  if (t.id === 'lbCat') { LB.cat = t.value; drawLibrary(); } else if (t.id === 'lbKind') { LB.kind = t.value; drawLibrary(); } else if (t.id === 'lbMine') { LB.mine = t.checked; drawLibrary(); } });
document.addEventListener('change', e => { if (e.target.id === 'lbK') lbShowKind(); });
document.addEventListener('click', e => { const b = e.target.closest('[data-act="lbSave"],[data-act="lbDel"]'); if (!b || !$('dlg').contains(b)) return;
  b.dataset.act === 'lbSave' ? lbSave(b.dataset.id || null) : lbDel(b.dataset.id); });
