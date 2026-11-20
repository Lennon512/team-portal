// ---------- Library: training and reference resources ----------
// Everyone can browse; owners add, edit and remove. Files live in the private "library" storage bucket.
const LB = { rows: [], pos: [], myPos: new Set(), missing: false, q: '', cat: '', mine: false, kind: '', tab: 'lib', asg: [], all: [], people: [], pp: [], asgMissing: false, paths: [], af: { loc: '', st: 'open', res: '' } };
const LB_KINDS = { file: ['File', '📄'], link: ['Link', '🔗'], video: ['Video', '▶'], page: ['Page', '📝'] };
const LB_CATS = ['Start here', 'Sales', 'Stretch technique', 'Front desk', 'Member success', 'Policies', 'Opening & closing', 'Marketing', 'General'];

async function loadLibrary() {
  const [r, p, pp] = await Promise.all([db.from('library_resources').select('*').order('title'), db.from('positions').select('id,name').order('name'),
    db.from('profile_positions').select('position_id').eq('user_id', ME.id)]);
  LB.missing = !!r.error && /library_resources/.test(r.error.message || '');
  LB.rows = r.data || []; LB.thumbs = {}; LB.pos = p.data || []; LB.myPos = new Set((pp.data || []).map(x => x.position_id));
  // Assigned trainings: everyone loads their own; owners load everyone's, studio leads their studio's (the database limits it)
  const own = ME.role === 'owner', wide = own || lbLead(), [a, all, pe, ppl, pa] = await Promise.all([db.from('library_assignments').select('*').eq('user_id', ME.id),
    wide ? db.from('library_assignments').select('*') : Promise.resolve({ data: [] }),
    wide ? db.from('profiles').select('id,full_name,email,location_id,role').order('full_name') : Promise.resolve({ data: [] }),
    own ? db.from('profile_positions').select('user_id,position_id') : Promise.resolve({ data: [] }),
    db.from('library_paths').select('*').order('title')]);
  LB.asgMissing = !!a.error && /library_assignments/.test(a.error.message || '');
  LB.asg = a.data || []; LB.all = all.data || []; LB.people = (pe.data || []).filter(x => x.full_name || x.email); LB.pp = ppl.data || [];
  LB.pathsMissing = !!pa.error; LB.paths = pa.data || [];
  drawLibrary();
}

const lbLead = () => ME.role === 'manager' && !!ME.location_id;   // studio lead: a manager at their studio (same as time off)
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

// Library forms open in a wide two-column pop-up; the class comes off when it closes so other pages' pop-ups stay normal
const lbWide = () => { const d = $('dlg'); d.classList.remove('wide'); d.classList.add('lbwide'); if (!d.open) d.showModal(); const f = d.querySelector('#lbT, #lpT'); if (f && !f.value) f.focus(); };
$('dlg').addEventListener('close', () => $('dlg').classList.remove('lbwide'));
const lbImg = r => !!r.file_path && /\.(png|jpe?g|gif|webp)$/i.test(r.file_name || ''), lbPdf = r => !!r.file_path && /\.pdf$/i.test(r.file_name || '');
// A resource can hold any mix of a file, a link / video and written page text
const lbParts = r => [...(r.url && lbEmbed(r.url) ? ['video'] : r.url ? ['link'] : []), ...(r.file_path ? ['file'] : []), ...(r.body && String(r.body).trim() ? ['page'] : [])];
const lbKindOf = (url, file, body) => url && lbEmbed(url) ? 'video' : file ? 'file' : url ? 'link' : 'page';
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
  const waitN = LB.all.filter(x => lbStatus(x)[0] === 'wait' && lbCanSign(x)).length;
  $('lbTabs').innerHTML = [['lib', 'Library'], ['mine', 'My trainings' + (openN ? ` <span class="lbcount">${openN}</span>` : '')],
    ...(own ? [['assign', 'Assigned' + (waitN ? ` <span class="lbcount">${waitN}</span>` : '')]] : lbLead() ? [['assign', 'My studio' + (waitN ? ` <span class="lbcount">${waitN}</span>` : '')]] : [])]
    .map(([k, l]) => `<button type="button" data-lbt="${k}" class="${LB.tab === k ? 'on' : ''}">${l}</button>`).join('');
  $('lbAdd').hidden = !own || LB.missing || LB.tab !== 'lib';
  $('lbAssignNew').hidden = !own || LB.tab !== 'assign' || LB.asgMissing;
  if (LB.tab !== 'lib' && LB.asgMissing) {
    $('lbBody').innerHTML = `<div class="pcard"><h3>One-time setup needed</h3><p>${own ? 'Open Supabase → SQL Editor → New query, paste the contents of <b>sql/library_assignments.sql</b>, and click Run. Then refresh this page.' : 'Ask the owner to finish setting up trainings.'}</p></div>`;
    return;
  }
  if (LB.tab === 'mine') return lbDrawMine();
  if (LB.tab === 'assign' && (own || lbLead())) return lbDrawAssigned();
  const q = LB.q.trim().toLowerCase(), cats = [...new Set([...LB_CATS.filter(c => LB.rows.some(r => r.category === c)), ...LB.rows.map(r => r.category)])];
  const hit = r => !q || [r.title, r.description, r.category, r.body, r.file_name, ...(r.tags || []), ...(r.positions || []).map(lbPosName)].some(x => String(x || '').toLowerCase().includes(q));
  const list = LB.rows.filter(r => hit(r) && (!LB.cat || r.category === LB.cat) && (!LB.mine || lbForMe(r)) && (!LB.kind || r.kind === LB.kind || lbParts(r).includes(LB.kind)));
  const card = r => { const [kl, ki] = LB_KINDS[r.kind] || LB_KINDS.link, forMe = lbForMe(r) && r.positions && r.positions.length;
    return `<div class="lbcard${r.pinned ? ' pin' : ''}" data-lb="${r.id}" tabindex="0" role="button" aria-label="Open ${esc(r.title)}">
      ${LB.thumbs && LB.thumbs[r.id] ? `<div class="lbthumb" aria-hidden="true"><img src="${esc(LB.thumbs[r.id])}" alt="" loading="lazy"></div>` : `<div class="lbic" aria-hidden="true">${ki}</div>`}
      <div class="lbtxt"><b>${esc(r.title)}${lbNew(r) ? ' <span class="lbnew">New</span>' : ''}</b>${r.description && r.description.trim().toLowerCase() !== String(r.title || '').trim().toLowerCase() ? `<span class="lbdesc">${esc(r.description)}</span>` : ''}
        <div class="lbchips">${(lbParts(r).length ? lbParts(r) : [r.kind]).map(k => `<span class="lbchip k">${(LB_KINDS[k] || LB_KINDS.link)[0]}${k === 'file' && r.file_name ? ' • ' + esc(r.file_name.split('.').pop().toUpperCase()) : ''}</span>`).join('')}${forMe ? '<span class="lbchip me">For your role</span>' : ''}${(r.positions || []).length && !forMe ? (r.positions || []).map(id => `<span class="lbchip">${esc(lbPosName(id))}</span>`).join('') : ''}${r.needs_signoff ? '<span class="lbchip">Needs sign-off</span>' : ''}${(r.tags || []).map(t => `<span class="lbchip t">#${esc(t)}</span>`).join('')}</div>
        ${own ? `<div class="lbacts"><span class="lbmeta">${lbAsgLine(r.id)}</span><button type="button" class="quiet lbasgbtn" data-lbasg="${r.id}" aria-label="Assign ${esc(r.title)}" title="Assign to people">Assign</button><button type="button" class="mg-ic" data-lbedit="${r.id}" aria-label="Edit ${esc(r.title)}" title="Edit">✎</button></div>` : ''}</div></div>`; };
  const pinned = list.filter(r => r.pinned), byCat = cats.map(c => [c, list.filter(r => r.category === c && !r.pinned)]).filter(([, L]) => L.length);
  $('lbBody').innerHTML = `<div class="lbbar">
      <select id="lbCat" aria-label="Category"><option value="">All categories (${LB.rows.length})</option>${cats.map(c => `<option ${LB.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="lbKind" aria-label="Type"><option value="">All types</option>${Object.entries(LB_KINDS).map(([k, [l]]) => `<option value="${k}" ${LB.kind === k ? 'selected' : ''}>${l}s</option>`).join('')}</select>
      ${LB.myPos.size ? `<label class="mem-mine"><input type="checkbox" id="lbMine" ${LB.mine ? 'checked' : ''}> Just for my role</label>` : ''}
      <input id="lbFind" type="search" placeholder="Search the library" aria-label="Search the library" value="${esc(LB.q)}"></div>` +
    (!LB.rows.length ? `<div class="pcard"><h3>Nothing here yet</h3><p>${own ? 'Click <b>Add resource</b> to upload a file, link a video or doc, or write a page (scripts, SOPs, checklists).' : 'Training materials and resources will show up here.'}</p></div>`
      : !list.length ? '<p class="lead">Nothing matches that search.</p>'
      : lbPathsSection(q) + (pinned.length ? `<section class="lbsec"><h3>📌 Start here</h3><div class="lbgrid">${pinned.map(card).join('')}</div></section>` : '') +
        byCat.map(([c, L]) => `<section class="lbsec"><h3>${esc(c)} <span class="hcount">${L.length}</span></h3><div class="lbgrid">${L.map(card).join('')}</div></section>`).join(''));
  const f = $('lbFind'); if (f && LB.focus) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); LB.focus = false; }
  lbThumbs();
}

async function lbOpen(id) {
  const r = LB.rows.find(x => x.id === id); if (!r) return;
  const parts = lbParts(r);
  if (parts.length === 1 && parts[0] === 'link') { window.open(r.url, '_blank', 'noopener'); return; }   // just a website link: open it
  if (!parts.length) return;
  // Build one panel per part; with more than one, show them as tabs
  const panels = [], acts = [];
  if (parts.includes('video')) { panels.push(['Video', `<div class="lbvid"><iframe src="${esc(lbEmbed(r.url))}" title="${esc(r.title)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`]); acts.push(`<a class="btnlink quiet" href="${esc(r.url)}" target="_blank" rel="noopener">Open video in a new tab</a>`); }
  if (parts.includes('page')) panels.push([parts.length > 1 ? 'Page' : 'Page', `<div class="lbpage">${lbFormat(r.body)}</div>`]);
  if (parts.includes('file')) {
    const { data, error } = await db.storage.from('library').createSignedUrl(r.file_path, 3600);
    if (error || !data) { alert('Could not open that file. ' + (error ? error.message : '')); return; }
    const dl = await db.storage.from('library').createSignedUrl(r.file_path, 3600, { download: r.file_name || true }).catch(() => ({}));
    const url = data.signedUrl, u = esc(url), du = esc((dl && dl.data && dl.data.signedUrl) || url), ext = String(r.file_name || r.file_path).split('.').pop().toLowerCase();
    let view = '';
    if (lbImg(r)) view = `<div class="lbview"><img src="${u}" alt="${esc(r.title)}"></div>`;
    else if (lbPdf(r)) view = `<div class="lbview pdf"><iframe src="${u}" title="${esc(r.title)}"></iframe></div>`;
    else if (['doc', 'docx', 'ppt', 'pptx', 'pps', 'ppsx', 'xls', 'xlsx'].includes(ext))   // Word / PowerPoint / Excel: Microsoft's free online viewer
      view = `<div class="lbview pdf"><iframe src="https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}" title="${esc(r.title)}"></iframe></div><p class="muted" style="font-size:.78rem;margin:-.4rem 0 .6rem">If it doesn't show after a few seconds, use Open file in a new tab or Download.</p>`;
    else if (['mp4', 'mov', 'm4v', 'webm', 'ogv'].includes(ext)) view = `<div class="lbview"><video src="${u}" controls playsinline preload="metadata"></video></div>`;
    else if (['mp3', 'm4a', 'wav', 'aac', 'ogg'].includes(ext)) view = `<div class="lbview lbaud"><audio src="${u}" controls preload="metadata"></audio></div>`;
    else if (['txt', 'csv', 'md'].includes(ext)) { const t = await fetch(url).then(x => x.text()).catch(() => null); if (t !== null) view = `<div class="lbview lbtext"><pre>${esc(t.slice(0, 200000))}</pre></div>`; }
    if (!view) view = `<div class="pcard" style="margin:0 0 .8rem"><p style="margin:0">This kind of file (<b>.${esc(ext)}</b>) can't be shown inside the portal. Open it in a new tab or download it.</p></div>`;
    panels.push([esc(r.file_name || 'File'), view]);
    acts.push(`<a class="btnlink quiet" href="${u}" target="_blank" rel="noopener">Open file in a new tab</a><a class="btnlink quiet" href="${du}" download="${esc(r.file_name || '')}">Download</a>`);
  }
  if (parts.includes('link')) panels.push(['Link', `<div class="pcard lblinkcard"><p style="margin:0 0 .6rem">${esc(r.url)}</p><a class="btnlink" href="${esc(r.url)}" target="_blank" rel="noopener">Open link ↗</a></div>`]);
  const desc = r.description && r.description.trim().toLowerCase() !== String(r.title || '').trim().toLowerCase() ? `<p class="lead" style="margin:.2rem 0 .8rem">${esc(r.description)}</p>` : '';
  $('dlgBody').innerHTML = `<h2>${esc(r.title)}</h2>${desc}` +
    (panels.length > 1 ? `<div class="tabs lbdtabs" role="tablist">${panels.map(([l], k) => `<button type="button" role="tab" data-lbpanel="${k}" class="${k ? '' : 'on'}" aria-selected="${!k}">${l}</button>`).join('')}</div>` : '') +
    panels.map(([, h], k) => `<div class="lbpanel" data-panel="${k}" ${k ? 'hidden' : ''}>${h}</div>`).join('') +
    `<div class="acts">${acts.join('')}<button class="quiet" data-act="close">Close</button></div>`;
  $('dlg').classList.remove('lbwide'); $('dlg').classList.add('wide'); if (!$('dlg').open) $('dlg').showModal();
}
document.addEventListener('click', e => { const b = e.target.closest('[data-lbpanel]'); if (!b || !$('dlg').contains(b)) return;
  document.querySelectorAll('[data-lbpanel]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
  document.querySelectorAll('.lbpanel').forEach(x => x.hidden = x.dataset.panel !== b.dataset.lbpanel);
  document.querySelectorAll('.lbpanel[hidden] video, .lbpanel[hidden] audio').forEach(v => v.pause());
});

function lbForm(id) {
  const r = LB.rows.find(x => x.id === id) || { kind: 'file', category: LB.cat || 'General', positions: [], tags: [] };
  const cats = [...new Set([...LB_CATS, ...LB.rows.map(x => x.category)])];
  $('dlgBody').innerHTML = `<div class="lbform lbtwo"><h2>${r.id ? 'Edit resource' : 'Add resource'}</h2><div class="lbcols"><div>
    <label>Title <input id="lbT" maxlength="120" value="${esc(r.title)}" placeholder="Front desk opening checklist"></label>
    <p class="muted lbhint2">Add any mix of these, like a script file and a video link.</p>
    <div class="lbpart"><label>📄 File ${r.file_name ? `<small class="muted">now: ${esc(r.file_name)}</small>` : '<small class="muted">up to 50 MB</small>'}<input id="lbF" type="file"></label>
      ${r.file_name ? '<label class="chkline lbrmf"><input type="checkbox" id="lbFx"> Remove this file</label>' : ''}</div>
    <div class="lbpart"><label>🔗 Link or video <input id="lbU" type="url" maxlength="500" value="${esc(r.url)}" placeholder="YouTube, Loom, Google Drive, website... https://"></label></div>
    <div class="lbpart"><label>📝 Written page <small class="muted" title="Blank line = new paragraph, start a line with - for bullets, **bold**">blank line = paragraph, "- " = bullet, **bold**</small><textarea id="lbB" class="${r.body ? 'big' : ''}" maxlength="20000" placeholder="Type a script, SOP or checklist (optional)">${esc(r.body)}</textarea></label></div>
    </div><div>
    <label>Short description <small class="muted">(optional)</small> <input id="lbD" maxlength="200" value="${esc(r.description)}"></label>
    <div class="grid2"><label>Category <input id="lbC" list="lbCats" maxlength="60" value="${esc(r.category)}"><datalist id="lbCats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label>Tags <small class="muted">(optional)</small> <input id="lbG" maxlength="200" value="${esc((r.tags || []).join(', '))}" placeholder="new hire, pricing"></label></div>
    <fieldset class="dlgrp"><legend>Who it's for <small class="muted lbhint">none picked = everyone</small></legend>
      <div class="lbtogs">${LB.pos.map(p => `<label class="lbtog"><input type="checkbox" data-lbp="${p.id}" ${(r.positions || []).includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label>`).join('')}</div></fieldset>
    <fieldset class="dlgrp"><legend>Options</legend>
      <label class="chkline"><input type="checkbox" id="lbPin" ${r.pinned ? 'checked' : ''}> Pin to the top ("Start here")</label>
      <label class="chkline"><input type="checkbox" id="lbSign" ${r.needs_signoff ? 'checked' : ''}> Needs sign-off from their studio lead</label></fieldset>
    </div></div>
    <div class="err" id="lbErr" role="alert"></div>
    <div class="acts"><button data-act="lbSave" data-id="${r.id || ''}">Save</button>${r.id ? `<button class="quiet" data-act="lbDel" data-id="${r.id}">Remove</button>` : ''}<button class="quiet" data-act="close">Cancel</button></div></div>`;
  lbWide();
}

async function lbSave(id) {
  const old = LB.rows.find(x => x.id === id), title = $('lbT').value.trim(), err = m => { $('lbErr').textContent = m; };
  if (!title) return err('Add a title.');
  const url = $('lbU').value.trim(), body = $('lbB').value.trim(), f = $('lbF').files[0], dropFile = !!($('lbFx') && $('lbFx').checked);
  if (url && !/^https?:\/\//i.test(url)) return err('The link needs to start with https://');
  const keepFile = old && old.file_path && !dropFile && !f;
  if (!url && !body && !f && !keepFile) return err('Add at least one: a file, a link or video, or page text.');
  if (f && f.size > 52428800) return err('That file is over 50 MB. Upload it to Google Drive or YouTube and add it as a link instead.');
  const row = { title, description: $('lbD').value.trim() || null, category: $('lbC').value.trim() || 'General',
    tags: $('lbG').value.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean), positions: [...document.querySelectorAll('[data-lbp]:checked')].map(x => x.dataset.lbp),
    pinned: $('lbPin').checked, needs_signoff: $('lbSign').checked, url: url || null, body: body || null, updated_at: new Date().toISOString() };
  const btn = document.querySelector('[data-act="lbSave"]'); btn.disabled = true; btn.textContent = f ? 'Uploading...' : 'Saving...';
  try {
    if (f) {
      const path = `${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
      const up = await db.storage.from('library').upload(path, f, { contentType: f.type || undefined }); if (up.error) throw up.error;
      if (old && old.file_path) db.storage.from('library').remove([old.file_path]);
      row.file_path = path; row.file_name = f.name;
    } else if (old && old.file_path && dropFile) { db.storage.from('library').remove([old.file_path]); row.file_path = null; row.file_name = null; }
    row.kind = lbKindOf(row.url, f || keepFile, row.body);
    const put = x => id ? db.from('library_resources').update(x).eq('id', id) : db.from('library_resources').insert({ ...x, created_by: ME.id });
    let res = await put(row);
    if (res.error && /needs_signoff/.test(res.error.message || '')) { const { needs_signoff, ...rest } = row; res = await put(rest); }   // sql/library_paths_signoff.sql not run yet
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
  const so = e.target.closest('[data-lbsign]'); if (so) { e.stopPropagation(); lbSignoff(so.dataset.lbsign, so.dataset.undo === '1'); return; }
  const pn = e.target.closest('[data-lbpathnew]'); if (pn) { lbPathForm(null); return; }
  const pe = e.target.closest('[data-lbpathedit]'); if (pe) { e.stopPropagation(); lbPathForm(pe.dataset.lbpathedit); return; }
  const pas = e.target.closest('[data-lbpathasg]'); if (pas) { e.stopPropagation(); lbAssignForm('path:' + pas.dataset.lbpathasg); return; }
  const po = e.target.closest('[data-lbpath]'); if (po) { lbPathOpen(po.dataset.lbpath); return; }
  const c = e.target.closest('[data-lb]'); if (c) { e.preventDefault(); lbOpen(c.dataset.lb); }
});
$('lbBody').addEventListener('keydown', e => { const pc = e.target.closest('[data-lbpath]'); if (pc && (e.key === 'Enter' || e.key === ' ') && e.target === pc) { e.preventDefault(); lbPathOpen(pc.dataset.lbpath); return; } const c = e.target.closest('[data-lb]'); if (c && (e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); lbOpen(c.dataset.lb); } });
$('lbBody').addEventListener('input', e => { if (e.target.id === 'lbFind') { LB.q = e.target.value; LB.focus = true; drawLibrary(); } });
$('lbBody').addEventListener('change', e => { const t = e.target;
  if (t.id === 'lbAfLoc') { LB.af.loc = t.value; drawLibrary(); return; } if (t.id === 'lbAfSt') { LB.af.st = t.value; drawLibrary(); return; } if (t.id === 'lbAfRes') { LB.af.res = t.value; drawLibrary(); return; }
  if (t.id === 'lbCat') { LB.cat = t.value; drawLibrary(); } else if (t.id === 'lbKind') { LB.kind = t.value; drawLibrary(); } else if (t.id === 'lbMine') { LB.mine = t.checked; drawLibrary(); } });
document.addEventListener('click', e => { const b = e.target.closest('[data-act="lbSave"],[data-act="lbDel"]'); if (!b || !$('dlg').contains(b)) return;
  b.dataset.act === 'lbSave' ? lbSave(b.dataset.id || null) : lbDel(b.dataset.id); });


// ---------- Trainings: My trainings, paths, assigning and studio-lead sign-off ----------
const lbToday = () => todayStr();
const lbDue = d => d ? new Date(String(d).slice(0, 10) + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
const lbName = id => { const p = LB.people.find(x => x.id === id); return p ? (p.full_name || p.email) : (id === ME.id ? (ME.full_name || ME.email) : 'Someone'); };
const lbLoc = id => (locs.find(l => l.id === id) || {}).name || '';
const lbRes = id => LB.rows.find(r => r.id === id);
const lbNeeds = a => !!(lbRes(a.resource_id) || {}).needs_signoff;
const lbIsDone = a => !!a.completed_at && (!lbNeeds(a) || !!a.signed_off_at);
// A training needing sign-off counts as done only once their studio lead (or an owner) signs it off
const lbStatus = a => lbIsDone(a) ? ['done', (a.signed_off_at ? 'Signed off ' : 'Done ') + lbDue(a.signed_off_at || a.completed_at)]
  : a.completed_at ? ['wait', 'Waiting for sign-off'] : a.due_date && a.due_date < lbToday() ? ['late', 'Overdue'] : ['open', a.due_date ? 'Due ' + lbDue(a.due_date) : 'To do'];
const lbCanSign = a => { if (a.user_id === ME.id && ME.role !== 'owner') return false; if (ME.role === 'owner') return true; const p = LB.people.find(x => x.id === a.user_id); return lbLead() && p && p.location_id === ME.location_id; };
const lbAsgLine = rid => { const L = LB.all.filter(a => a.resource_id === rid); if (!L.length) return ''; const d = L.filter(lbIsDone).length; return `${L.length} assigned • ${d} done`; };
const lbBar = (d, n) => `<span class="lbbar2" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${d}"><i style="width:${n ? Math.round(d / n * 100) : 0}%"></i></span><span class="lbbarn">${d}/${n}</span>`;
const lbPathItems = pa => (pa.items || []).map(lbRes).filter(Boolean);

// Paths on the Library tab
function lbPathsSection(q) {
  const own = ME.role === 'owner';
  if (LB.pathsMissing) return own ? `<div class="pcard" style="margin-bottom:1.2rem"><h3>Training paths: one-time setup</h3><p>Paste <b>sql/library_paths_signoff.sql</b> into Supabase → SQL Editor and click Run, then refresh, to group trainings into paths and use studio-lead sign-off.</p></div>` : '';
  const L = LB.paths.filter(pa => !q || [pa.title, pa.description].some(x => String(x || '').toLowerCase().includes(q)));
  if (!L.length && !own) return '';
  if (!L.length && q) return '';
  return `<section class="lbsec"><h3>🧭 Training paths ${L.length ? `<span class="hcount">${L.length}</span>` : ''}${own ? ' <button type="button" class="quiet lbasgbtn" data-lbpathnew="1">New path</button>' : ''}</h3>` +
    (!L.length ? '<p class="lead" style="margin:0">Group trainings into a path (like "New Flexologist onboarding") and assign the whole set at once.</p>'
      : `<div class="lbgrid">${L.map(pa => { const it = lbPathItems(pa), asg = LB.all.filter(a => a.path_id === pa.id), ppl = new Set(asg.map(a => a.user_id));
        return `<div class="lbcard lbpathcard" data-lbpath="${pa.id}" tabindex="0" role="button" aria-label="Open path ${esc(pa.title)}"><div class="lbic" aria-hidden="true">🧭</div>
          <div class="lbtxt"><b>${esc(pa.title)}</b>${pa.description ? `<span class="lbdesc">${esc(pa.description)}</span>` : ''}<div class="lbchips"><span class="lbchip k">${it.length} training${it.length === 1 ? '' : 's'}</span></div>
          ${own ? `<div class="lbacts"><span class="lbmeta">${ppl.size ? `Assigned to ${ppl.size}` : ''}</span><button type="button" class="quiet lbasgbtn" data-lbpathasg="${pa.id}">Assign</button><button type="button" class="mg-ic" data-lbpathedit="${pa.id}" aria-label="Edit ${esc(pa.title)}" title="Edit">✎</button></div>` : ''}</div></div>`; }).join('')}</div>`) + '</section>';
}
function lbPathOpen(id) {
  const pa = LB.paths.find(x => x.id === id); if (!pa) return;
  const it = lbPathItems(pa);
  $('dlgBody').innerHTML = `<h2>🧭 ${esc(pa.title)}</h2>${pa.description ? `<p class="lead" style="margin:.2rem 0 1rem">${esc(pa.description)}</p>` : ''}
    <ol class="lbpathlist">${it.map(r => { const a = LB.asg.find(x => x.resource_id === r.id); const st = a ? lbStatus(a) : null;
      return `<li><button type="button" class="linkish" data-lbpi="${r.id}">${(LB_KINDS[r.kind] || LB_KINDS.link)[1]} ${esc(r.title)}</button>${st ? ` <span class="lbchip st-${st[0]}">${st[1]}</span>` : ''}${r.needs_signoff ? ' <span class="lbchip">Needs sign-off</span>' : ''}</li>`; }).join('') || '<li class="muted">No trainings in this path yet.</li>'}</ol>
    <div class="acts">${ME.role === 'owner' ? `<button data-act="lbPathAsg" data-id="${pa.id}">Assign this path</button>` : ''}<button class="quiet" data-act="close">Close</button></div>`;
  $('dlg').classList.remove('wide'); if (!$('dlg').open) $('dlg').showModal();
}
function lbPathForm(id) {
  const pa = LB.paths.find(x => x.id === id) || { items: [] }, sel = (pa.items || []).filter(lbRes), rest = LB.rows.filter(r => !sel.includes(r.id));
  $('dlgBody').innerHTML = `<div class="lbform lbtwo"><h2>${pa.id ? 'Edit path' : 'New training path'}</h2><div class="lbcols lbcols-asg"><div>
    <label>Name <input id="lpT" maxlength="120" value="${esc(pa.title)}" placeholder="New Flexologist onboarding"></label>
    <label>Description <small class="muted">(optional)</small> <textarea id="lpD" class="sm" maxlength="200" placeholder="Everything to finish in your first two weeks">${esc(pa.description)}</textarea></label>
    </div><div>
    <fieldset class="dlgrp"><legend>Trainings, in order <small class="muted" style="text-transform:none;letter-spacing:0">(tick to include; use ↑ ↓ to reorder)</small></legend>
      <div class="lbpathpick" id="lpList">${[...sel.map(lbRes), ...rest].map(r => `<div class="lbpp" data-rid="${r.id}"><label class="chkline"><input type="checkbox" ${sel.includes(r.id) ? 'checked' : ''}> ${esc(r.title)} <small class="muted">${esc(r.category)}</small></label><span><button type="button" class="mg-ic" data-lpmv="-1" aria-label="Move up">↑</button><button type="button" class="mg-ic" data-lpmv="1" aria-label="Move down">↓</button></span></div>`).join('')}</div></fieldset>
    </div></div>
    <div class="err" id="lpErr" role="alert"></div>
    <div class="acts"><button data-act="lpSave" data-id="${pa.id || ''}">Save</button>${pa.id ? `<button class="quiet" data-act="lpDel" data-id="${pa.id}">Delete path</button>` : ''}<button class="quiet" data-act="close">Cancel</button></div></div>`;
  lbWide();
}
async function lbPathSave(btn) {
  const id = btn.dataset.id || null, title = $('lpT').value.trim(), items = [...document.querySelectorAll('#lpList .lbpp')].filter(d => d.querySelector('input').checked).map(d => d.dataset.rid);
  if (!title) { $('lpErr').textContent = 'Give the path a name.'; return; }
  if (!items.length) { $('lpErr').textContent = 'Tick at least one training.'; return; }
  btn.disabled = true; btn.textContent = 'Saving...';
  const row = { title, description: $('lpD').value.trim() || null, items };
  const { error } = id ? await db.from('library_paths').update(row).eq('id', id) : await db.from('library_paths').insert({ ...row, created_by: ME.id });
  if (error) { btn.disabled = false; btn.textContent = 'Save'; $('lpErr').textContent = 'Could not save. ' + error.message; return; }
  $('dlg').close(); toast(id ? 'Path saved' : 'Path added'); loadLibrary();
}
async function lbPathDel(id) {
  const pa = LB.paths.find(x => x.id === id); if (!pa || !confirm(`Delete the path "${pa.title}"? Trainings already assigned stay assigned.`)) return;
  const { error } = await db.from('library_paths').delete().eq('id', id);
  if (error) { alert('Could not delete it. ' + error.message); return; }
  $('dlg').close(); toast('Path deleted'); loadLibrary();
}

function lbTrRow(a, r) {
  const [st, sl] = lbStatus(a), [, ki] = LB_KINDS[r.kind] || LB_KINDS.link;
  const btn = a.signed_off_at ? '' : `<button type="button" class="${a.completed_at ? 'quiet' : ''} lbdonebtn" data-lbdone="${a.id}" data-undo="${a.completed_at ? 1 : 0}">${a.completed_at ? 'Undo' : r.needs_signoff ? 'Mark done (lead signs off)' : 'Mark done'}</button>`;
  return `<div class="lbtr ${st}" data-lb="${r.id}" tabindex="0" role="button" aria-label="Open ${esc(r.title)}">
    <div class="lbic" aria-hidden="true">${ki}</div>
    <div class="lbtxt"><b>${esc(r.title)}</b>${a.note ? `<span class="lbdesc">${esc(a.note)}</span>` : r.description ? `<span class="lbdesc">${esc(r.description)}</span>` : ''}
      <div class="lbchips"><span class="lbchip st-${st}">${sl}</span><span class="lbchip">${esc(r.category)}</span>${a.signed_off_by ? `<span class="lbchip">By ${esc(lbName(a.signed_off_by))}</span>` : ''}${a.assigned_by && a.assigned_by !== ME.id && LB.people.some(x => x.id === a.assigned_by) ? `<span class="lbchip">From ${esc(lbName(a.assigned_by))}</span>` : ''}</div></div>
    ${btn}</div>`;
}
function lbDrawMine() {
  const L = LB.asg.map(a => ({ a, r: lbRes(a.resource_id) })).filter(x => x.r);
  if (!L.length) { $('lbBody').innerHTML = `<div class="pcard"><h3>No trainings assigned yet</h3><p>When ${ME.role === 'owner' ? 'a training is assigned to you' : 'an owner assigns you a training'}, it shows up here with its due date.</p></div>`; return; }
  const sortIt = (x, y) => lbIsDone(x.a) - lbIsDone(y.a) || String(x.a.due_date || '9999').localeCompare(String(y.a.due_date || '9999')) || x.r.title.localeCompare(y.r.title);
  const done = L.filter(x => lbIsDone(x.a)).length, wait = L.filter(x => lbStatus(x.a)[0] === 'wait').length;
  // Group by path (in the path's order), then everything else
  const groups = LB.paths.map(pa => [pa, L.filter(x => x.a.path_id === pa.id).sort((x, y) => (pa.items || []).indexOf(x.r.id) - (pa.items || []).indexOf(y.r.id))]).filter(([, G]) => G.length);
  const other = L.filter(x => !groups.some(([pa]) => pa.id === x.a.path_id)).sort(sortIt);
  $('lbBody').innerHTML = `<p class="lead" style="margin:0 0 1rem">${done} of ${L.length} done${done < L.length ? ` • ${L.length - done} to go` : ' 🎉'}${wait ? ` • ${wait} waiting for sign-off` : ''}</p>` +
    groups.map(([pa, G]) => { const d = G.filter(x => lbIsDone(x.a)).length;
      return `<section class="lbsec"><h3>🧭 ${esc(pa.title)} <span class="lbprog">${lbBar(d, G.length)}</span></h3><div class="lbmine">${G.map(x => lbTrRow(x.a, x.r)).join('')}</div></section>`; }).join('') +
    (other.length ? `<section class="lbsec">${groups.length ? '<h3>Other trainings</h3>' : ''}<div class="lbmine">${other.map(x => lbTrRow(x.a, x.r)).join('')}</div></section>` : '');
}

function lbDrawAssigned() {
  const f = LB.af, own = ME.role === 'owner', byU = id => LB.people.find(p => p.id === id) || {};
  const base = LB.all.map(a => ({ a, r: lbRes(a.resource_id), p: byU(a.user_id) })).filter(x => x.r && (own || x.a.user_id !== ME.id));
  const L = base.filter(({ a, r, p }) => (!f.loc || String(p.location_id) === f.loc) && (!f.res || r.id === f.res) &&
      (f.st === 'all' || (f.st === 'open' ? !lbIsDone(a) : f.st === 'done' ? lbIsDone(a) : lbStatus(a)[0] === f.st)))
    .sort((x, y) => x.r.title.localeCompare(y.r.title) || String(x.p.full_name || '').localeCompare(String(y.p.full_name || '')));
  const res = [...new Set(base.map(x => x.r.id))].map(lbRes).sort((a, b) => a.title.localeCompare(b.title));
  const dn = base.filter(x => lbIsDone(x.a)).length, late = base.filter(x => lbStatus(x.a)[0] === 'late').length, wait = base.filter(x => lbStatus(x.a)[0] === 'wait' && lbCanSign(x.a)).length;
  // Path progress: each person's done / total for each path assigned to them
  const pathRows = LB.paths.map(pa => { const A = base.filter(x => x.a.path_id === pa.id && (!f.loc || String(x.p.location_id) === f.loc)); const ppl = [...new Set(A.map(x => x.a.user_id))];
    return [pa, ppl.map(u => { const mine = A.filter(x => x.a.user_id === u); return { u, p: byU(u), d: mine.filter(x => lbIsDone(x.a)).length, n: mine.length }; }).sort((x, y) => String(x.p.full_name || '').localeCompare(String(y.p.full_name || '')))]; }).filter(([, P]) => P.length);
  $('lbBody').innerHTML = `<p class="lead" style="margin:0 0 1rem">${base.length ? `${dn} of ${base.length} assigned trainings done${late ? ` • <b>${late} overdue</b>` : ''}${wait ? ` • <b>${wait} waiting for your sign-off</b>` : ''}`
      : own ? 'Nothing assigned yet. Click <b>Assign training</b>, or the <b>Assign</b> button on any resource or path in the Library.' : 'Nobody at your studio has trainings assigned yet.'}</p>` +
    (base.length ? `<div class="lbbar">
      <select id="lbAfSt" aria-label="Status">${[['open', 'Not done'], ['wait', 'Waiting for sign-off'], ['late', 'Overdue'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => `<option value="${k}" ${f.st === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${own ? `<select id="lbAfLoc" aria-label="Studio"><option value="">All studios</option>${locs.map(l => `<option value="${l.id}" ${f.loc === String(l.id) ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>` : ''}
      <select id="lbAfRes" aria-label="Training"><option value="">All trainings</option>${res.map(r => `<option value="${r.id}" ${f.res === r.id ? 'selected' : ''}>${esc(r.title)}</option>`).join('')}</select></div>` +
      (pathRows.length && !f.res ? `<div class="lbpathprog">${pathRows.map(([pa, P]) => `<div class="pcard lbpp2"><h3>🧭 ${esc(pa.title)}</h3>${P.map(x => `<div class="lbpprow"><span>${esc(x.p.full_name || x.p.email || 'Unknown')}${own ? ` <small class="muted">${esc(lbLoc(x.p.location_id))}</small>` : ''}</span><span class="lbprog">${lbBar(x.d, x.n)}</span></div>`).join('')}</div>`).join('')}</div>` : '') +
      (!L.length ? '<p class="lead">Nothing matches.</p>' : `<div class="table-wrap"><table class="mt"><thead><tr><th>Training</th><th>Person</th>${own ? '<th>Studio</th>' : ''}<th>Status</th><th>Assigned</th><th></th></tr></thead><tbody>${L.map(({ a, r, p }) => { const [st, sl] = lbStatus(a), pa = a.path_id && LB.paths.find(x => x.id === a.path_id);
        const act = (st === 'wait' && lbCanSign(a) ? `<button type="button" class="lbasgbtn" data-lbsign="${a.id}">Sign off</button>` : '') + (a.signed_off_at && lbCanSign(a) ? `<button type="button" class="quiet lbasgbtn" data-lbsign="${a.id}" data-undo="1">Undo sign-off</button>` : '') +
          (own ? `<button type="button" class="mg-ic" data-lbunasg="${a.id}" aria-label="Remove this assignment" title="Remove">✕</button>` : '');
        return `<tr><td><a href="#" data-lb="${r.id}">${esc(r.title)}</a>${pa ? `<div class="muted" style="font-size:.78rem">🧭 ${esc(pa.title)}</div>` : ''}${a.note ? `<div class="muted" style="font-size:.8rem">${esc(a.note)}</div>` : ''}</td><td>${esc(p.full_name || p.email || 'Unknown')}</td>${own ? `<td>${esc(lbLoc(p.location_id))}</td>` : ''}
          <td><span class="lbchip st-${st}">${sl}</span>${a.signed_off_by ? `<div class="muted" style="font-size:.75rem">by ${esc(lbName(a.signed_off_by))}</div>` : ''}</td><td class="muted">${lbDue(a.created_at)}</td><td><div class="lbrowacts">${act}</div></td></tr>`; }).join('')}</tbody></table></div>`) : '');
}

function lbAssignForm(pick) {
  const ppl = LB.people.filter(p => !/\bbot\b|clubready-bot/i.test(p.full_name || p.email || '')), posOf = id => LB.pp.filter(x => x.user_id === id).map(x => x.position_id);
  const usedPos = LB.pos.filter(p => LB.pp.some(x => x.position_id === p.id)), usedLoc = locs.filter(l => ppl.some(p => p.location_id === l.id));
  const only = pick && !String(pick).startsWith('path:') ? LB.rows.filter(r => r.id === pick) : null;
  if (!LB.rows.length) { alert('Add something to the Library first, then assign it.'); return; }
  const opts = only ? only.map(r => `<option value="${r.id}">${esc(r.title)}</option>`).join('')
    : (LB.paths.length ? `<optgroup label="Paths (assigns every training in it)">${LB.paths.map(pa => `<option value="path:${pa.id}" ${pick === 'path:' + pa.id ? 'selected' : ''}>🧭 ${esc(pa.title)} (${lbPathItems(pa).length})</option>`).join('')}</optgroup><optgroup label="Single trainings">` : '') +
      LB.rows.map(r => `<option value="${r.id}">${esc(r.title)}</option>`).join('') + (LB.paths.length ? '</optgroup>' : '');
  $('dlgBody').innerHTML = `<div class="lbform lbtwo"><h2>Assign training</h2><div class="lbcols lbcols-asg"><div>
    <label>Training or path <select id="laR">${opts}</select></label>
    <label>Due date <small class="muted">(optional)</small> <input id="laD" type="date"></label>
    <label>Note <small class="muted">(optional)</small> <textarea id="laN" class="sm" maxlength="200" placeholder="Finish before your first solo shift"></textarea></label>
    </div><div>
    <fieldset class="dlgrp"><legend>Who <span class="lbsel" id="laCount">0 selected</span></legend>
      <div class="lbquick">
        <select id="laAddLoc" aria-label="Add everyone at a studio"><option value="">+ Add a studio</option>${usedLoc.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select>
        <select id="laAddPos" aria-label="Add everyone with a role"><option value="">+ Add a role</option>${usedPos.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
        <button type="button" class="linkish" data-laq="all">Everyone</button><button type="button" class="linkish" data-laq="none">Clear</button>
        <input id="laFind" type="search" placeholder="Find a person" aria-label="Find a person"></div>
      <div class="lbpeople">${ppl.map(p => `<label class="chkline" data-name="${esc(String(p.full_name || p.email).toLowerCase())}"><input type="checkbox" data-lau="${p.id}" data-loc="${p.location_id || ''}" data-pos="${posOf(p.id).join(' ')}"><span>${esc(p.full_name || p.email)} <small class="muted">${esc(lbLoc(p.location_id))}</small><small class="muted lbhas" data-has="${p.id}"></small></span></label>`).join('')}</div></fieldset>
    </div></div>
    <div class="err" id="laErr" role="alert"></div>
    <div class="acts"><button data-act="laSave">Assign</button><button class="quiet" data-act="close">Cancel</button></div></div>`;
  lbWide();
  lbMarkHas();
}
const lbPicked = () => { const v = $('laR').value; if (v.startsWith('path:')) { const pa = LB.paths.find(x => x.id === v.slice(5)); return { pa, rids: pa ? lbPathItems(pa).map(r => r.id) : [] }; } return { pa: null, rids: [v] }; };
// Show who already has the chosen training (or how much of the path)
function lbMarkHas() {
  if (!$('laR')) return; const { pa, rids } = lbPicked();
  document.querySelectorAll('[data-has]').forEach(el => { const A = LB.all.filter(x => rids.includes(x.resource_id) && x.user_id === el.dataset.has);
    el.textContent = !A.length ? '' : pa ? ` • has ${A.length} of ${rids.length}` : lbIsDone(A[0]) ? ' • already done' : ' • already assigned'; });
}
const lbCountSel = () => { const n = document.querySelectorAll('[data-lau]:checked').length; if ($('laCount')) $('laCount').textContent = n + ' selected'; };
document.addEventListener('change', e => { const t = e.target;
  if (t.id === 'laR') lbMarkHas();
  else if (t.id === 'laAddLoc' || t.id === 'laAddPos') { const v = t.value; if (!v) return; document.querySelectorAll('[data-lau]').forEach(c => { if (t.id === 'laAddLoc' ? c.dataset.loc === v : c.dataset.pos.split(' ').includes(v)) c.checked = true; }); t.value = ''; lbCountSel(); }
  else if (t.dataset && t.dataset.lau) lbCountSel(); });
document.addEventListener('input', e => { if (e.target.id !== 'laFind') return; const q = e.target.value.trim().toLowerCase(); document.querySelectorAll('.lbpeople [data-name]').forEach(l => l.hidden = !!q && !l.dataset.name.includes(q)); });
document.addEventListener('click', e => {
  if (!$('dlg').contains(e.target)) return;
  const q = e.target.closest('[data-laq]'); if (q) {
    const [k, v] = q.dataset.laq.split(':');
    document.querySelectorAll('[data-lau]').forEach(c => { if (k === 'none') c.checked = false; else if (k === 'all' || (k === 'loc' && c.dataset.loc === v) || (k === 'pos' && c.dataset.pos.split(' ').includes(v))) c.checked = true; });
    lbCountSel(); return;
  }
  const mv = e.target.closest('[data-lpmv]'); if (mv) { const row = mv.closest('.lbpp'), d = +mv.dataset.lpmv; if (d < 0 && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling); else if (d > 0 && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row); return; }
  const pi = e.target.closest('[data-lbpi]'); if (pi) { lbOpen(pi.dataset.lbpi); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'laSave') lbAssignSave(b);
  else if (b.dataset.act === 'lpSave') lbPathSave(b);
  else if (b.dataset.act === 'lpDel') lbPathDel(b.dataset.id);
  else if (b.dataset.act === 'lbPathAsg') lbAssignForm('path:' + b.dataset.id);
});

async function lbAssignSave(btn) {
  const { pa, rids } = lbPicked(), ids = [...document.querySelectorAll('[data-lau]:checked')].map(c => c.dataset.lau);
  if (!rids.length) { $('laErr').textContent = 'That path has no trainings yet. Edit it to add some.'; return; }
  if (!ids.length) { $('laErr').textContent = 'Pick at least one person.'; return; }
  const due = $('laD').value || null, note = $('laN').value.trim() || null, rows = [];
  ids.forEach(user_id => rids.forEach(resource_id => { if (!LB.all.some(a => a.resource_id === resource_id && a.user_id === user_id)) rows.push({ resource_id, user_id, assigned_by: ME.id, due_date: due, note, ...(pa ? { path_id: pa.id } : {}) }); }));
  if (!rows.length) { $('laErr').textContent = pa ? 'Everyone you picked already has every training in this path.' : 'Everyone you picked already has this training.'; return; }
  btn.disabled = true; btn.textContent = 'Assigning...';
  const { error } = await db.from('library_assignments').insert(rows);
  if (error) { btn.disabled = false; btn.textContent = 'Assign'; $('laErr').textContent = 'Could not assign. ' + error.message; return; }
  const ppl = new Set(rows.map(r => r.user_id)).size;
  $('dlg').close(); toast(pa ? `Assigned "${pa.title}" to ${ppl} ${ppl === 1 ? 'person' : 'people'}` : `Assigned to ${ppl} ${ppl === 1 ? 'person' : 'people'}${ids.length > ppl ? ` (${ids.length - ppl} already had it)` : ''}`); loadLibrary();
}

async function lbDone(id, undo) {
  const a = LB.asg.find(x => x.id === id);
  const { error } = await db.from('library_assignments').update({ completed_at: undo ? null : new Date().toISOString() }).eq('id', id);
  if (error) { alert('Could not save. ' + error.message); return; }
  toast(undo ? 'Marked not done' : a && lbNeeds(a) ? 'Marked done. Your studio lead will sign it off.' : 'Nice work! Marked done'); loadLibrary();
}
async function lbSignoff(id, undo) {
  const { error } = await db.from('library_assignments').update(undo ? { signed_off_at: null, signed_off_by: null } : { signed_off_at: new Date().toISOString(), signed_off_by: ME.id }).eq('id', id);
  if (error) { alert('Could not save. ' + error.message); return; }
  toast(undo ? 'Sign-off removed' : 'Signed off'); loadLibrary();
}
async function lbUnassign(id) {
  const a = LB.all.find(x => x.id === id), r = a && lbRes(a.resource_id);
  if (!a || !confirm(`Remove "${r ? r.title : 'this training'}" from ${lbName(a.user_id)}?`)) return;
  const { error } = await db.from('library_assignments').delete().eq('id', id);
  if (error) { alert('Could not remove it. ' + error.message); return; }
  toast('Removed'); loadLibrary();
}
$('lbAssignNew').onclick = () => lbAssignForm(null);
$('lbTabs').onclick = e => { const t = e.target.closest('[data-lbt]'); if (t) { LB.tab = t.dataset.lbt; drawLibrary(); } };
