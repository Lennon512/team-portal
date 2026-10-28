// ---------- Tasks ----------
let tk = { tab: 'mine', month: new Date(), mode: 'today', uid: null, who: '', studio: '', rows: [], done: new Set(), doneOpen: false, open: new Set() };
tk.month.setDate(1);
let positions = [], templates = [];
const todayStr = () => ymd(new Date());
const dim = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const isCur = () => ymd(tk.month).slice(0, 7) === todayStr().slice(0, 7);
const elapsed = () => isCur() ? new Date().getDate() : (ymd(tk.month) < todayStr() ? dim(tk.month) : 0);

async function loadTasks() {
  const [p, t] = await Promise.all([db.from('positions').select('*').order('name'), db.from('task_templates').select('*').eq('active', true).order('sort_order')]);
  positions = p.data || []; templates = t.data || [];
  if (tk.tab === 'manage' && ME.role !== 'owner') tk.tab = 'mine';
  if (tk.tab === 'team' && ME.role === 'staff') tk.tab = 'mine';
  drawTaskBar();
  if (tk.tab === 'mine') await loadMine(); else if (tk.tab === 'team') await loadOverview(); else await loadManage();
}

function drawTaskBar() {
  const tabs = [['mine', tk.uid === ME.id ? 'My tasks' : 'Their tasks', true], ['team', 'Team overview', ME.role !== 'staff'], ['manage', 'Manage task sets', ME.role === 'owner']];
  $('taskTabs').innerHTML = tabs.filter(x => x[2]).map(x => `<button data-tab="${x[0]}" class="${tk.tab === x[0] ? 'on' : ''}">${x[1]}</button>`).join('');
  $('taskBar').innerHTML = tk.tab === 'manage' ? '' :
    `<button class="quiet" data-nav="-1" aria-label="Previous month">&lsaquo;</button><b>${tk.month.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</b><button class="quiet" data-nav="1" aria-label="Next month">&rsaquo;</button>` +
    (tk.tab === 'mine' && isCur() ? `<span class="tabs" style="margin:0 0 0 .5rem"><button data-mode="today" class="${tk.mode === 'today' ? 'on' : ''}">Today</button><button data-mode="month" class="${tk.mode === 'month' ? 'on' : ''}">Full month</button></span>` : '') +
    (tk.tab === 'team' && ME.role === 'owner' ? `<select id="tkStudio" aria-label="Studio"><option value="">All studios</option>${locs.map(x => `<option value="${x.id}" ${x.id === tk.studio ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : '');
}

async function loadMine() {
  const uid = tk.uid, s = ymd(tk.month), e = ymd(new Date(tk.month.getFullYear(), tk.month.getMonth() + 1, 0));
  const [pp, who] = await Promise.all([db.from('profile_positions').select('position_id').eq('user_id', uid),
    uid === ME.id ? Promise.resolve({ data: ME }) : db.from('profiles').select('full_name,email').eq('id', uid).maybeSingle()]);
  const mine = new Set((pp.data || []).map(x => x.position_id));
  tk.rows = templates.filter(x => mine.has(x.position_id));
  tk.who = (who.data && (who.data.full_name || who.data.email)) || 'Tasks';
  let checks = [], from = 0;
  for (;;) {
    const { data } = await db.from('task_checks').select('id,template_id,check_date').eq('user_id', uid).gte('check_date', s).lte('check_date', e).order('id').range(from, from + 999);
    checks = checks.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  tk.done = new Set(checks.map(c => c.template_id + '|' + c.check_date));
  renderMine();
}

// Long task text gets a short headline; the rest is tucked behind "Details".
// Splits at a leading "Title: details" colon, else after the first sentence.
function splitTitle(t) {
  t = String(t || '').trim();
  if (t.length <= 110) return [t, ''];
  const c = t.indexOf(':');
  if (c > 8 && c < 90) return [t.slice(0, c).trim(), t.slice(c + 1).trim()];
  const m = t.match(/^([\s\S]{20,110}?[.!?])\s+([\s\S]+)$/);
  if (m) return [m[1].replace(/\.$/, ''), m[2]];
  const cut = t.lastIndexOf(' ', 90);
  return [t.slice(0, cut > 40 ? cut : 90) + '…', t];
}

function renderMine() {
  const td = todayStr(), n = dim(tk.month), ro = tk.uid !== ME.id, ym = ymd(tk.month).slice(0, 8);
  if (!tk.rows.length) { $('taskBody').innerHTML = `${ro ? `<h3>${esc(tk.who)}</h3>` : ''}<p class="lead">No tasks assigned yet.${ro ? '' : ' The owner assigns task sets by position.'}</p>`; return; }
  const groups = positions.filter(p => tk.rows.some(r => r.position_id === p.id));
  const box = (r, d) => `<input type="checkbox" data-t="${r.id}" data-d="${d}" aria-label="${esc(splitTitle(r.title)[0])} ${d}" ${tk.done.has(r.id + '|' + d) ? 'checked' : ''} ${ro || d > td ? 'disabled' : ''}>`;
  let h = '<div class="stats" id="tkStats"></div>';
  if (tk.mode === 'today' && isCur()) {
    const isDone = r => tk.done.has(r.id + '|' + td);
    const item = r => {
      const [head, more] = splitTitle(r.title), open = tk.open.has(r.id);
      return `<div class="tk${isDone(r) ? ' done' : ''}${ro ? ' ro' : ''}" data-row-t="${r.id}"><label class="tk-main">${box(r, td)}<span class="tk-title">${esc(head)}</span></label>` +
        (more ? `<button type="button" class="tk-more" data-more="${r.id}" aria-expanded="${open}">${open ? 'Hide' : 'Details'}</button><div class="tk-detail"${open ? '' : ' hidden'}>${esc(more)}</div>` : '') + '</div>';
    };
    const doneRows = tk.rows.filter(isDone);
    h += groups.map(g => {
      const rows = tk.rows.filter(r => r.position_id === g.id), left = rows.filter(r => !isDone(r));
      return `<h3 class="sub tk-group">${esc(g.name)} <span>${rows.length - left.length} of ${rows.length} done</span></h3>` +
        (left.length ? left.map(item).join('') : '<p class="tk-clear">All clear here ✓</p>');
    }).join('');
    if (doneRows.length) h += `<details class="tk-donebox" id="tkDoneBox"${tk.doneOpen ? ' open' : ''}><summary>Done today <span>${doneRows.length}</span></summary>${doneRows.map(item).join('')}</details>`;
  } else {
    const days = Array.from({ length: n }, (_, i) => i + 1), ds = d => ym + String(d).padStart(2, '0');
    h += `<div class="cal-wrap"><table class="tg"><thead><tr><th class="tt">Task</th>${days.map(d => `<th class="${ds(d) === td ? 'td' : ''}">${d}</th>`).join('')}</tr></thead><tbody>` +
      groups.map(g => `<tr class="grp"><td colspan="${n + 1}"><span>${esc(g.name)}</span></td></tr>` + tk.rows.filter(r => r.position_id === g.id).map(r => `<tr><td class="tt" title="${esc(r.title)}">${esc(splitTitle(r.title)[0])}</td>${days.map(d => `<td class="${ds(d) === td ? 'td' : ''}">${box(r, ds(d))}</td>`).join('')}</tr>`).join('')).join('') + '</tbody></table></div>';
  }
  $('taskBody').innerHTML = h; paintStats();
  const db_ = $('tkDoneBox'); if (db_) db_.ontoggle = () => { tk.doneOpen = db_.open; };
}

function mtd(done, today, n, cur = isCur(), el = elapsed()) {
  const days = cur ? el - 1 : el, dn = cur ? done - today : done;
  return days > 0 && n ? Math.round(100 * dn / (n * days)) : null;
}

function paintStats() {
  const ids = new Set(tk.rows.map(r => r.id)), td = todayStr(), perDay = {}; let m = 0, t = 0;
  tk.done.forEach(k => { const [id, d] = k.split('|'); if (ids.has(id)) { m++; perDay[d] = (perDay[d] || 0) + 1; if (d === td) t++; } });
  const n = tk.rows.length, tp = n ? Math.round(100 * t / n) : 0, mp = mtd(m, t, n), el = $('tkStats');
  if (!el) return;
  const cur = isCur(), past = cur ? elapsed() - 1 : elapsed(), full = Object.entries(perDay).filter(([d, c]) => c >= n && (!cur || d < td)).length;
  const mon = tk.month.toLocaleString('en-US', { month: 'short' });
  const range = past > 0 ? (past === 1 ? `${mon} 1` : `${mon} 1–${past}`) : '';
  const monthLine = past > 0
    ? `${cur ? 'Earlier this month' : 'This month'} (${range}): <b>${mp}%</b> of tasks done • <b>${full} of ${past}</b> days fully done`
    : 'Your monthly score starts tomorrow.';
  const who = tk.uid !== ME.id ? `<h3 style="margin:0 0 .6rem">${esc(tk.who)}</h3>` : '';
  if (cur) {
    const all = n && t >= n;
    el.innerHTML = who + (all ? `<div class="tk-party" role="status"><span class="tk-party-emoji" aria-hidden="true">🎉</span><div><b>All done for today!</b><small>${n} of ${n} tasks checked off. Nice work.</small></div></div>` : '') +
      `<div class="tk-progress"><div class="tk-today"><b>${t} of ${n}</b> done today</div><div class="meter tk-meter"><i style="width:${Math.min(tp, 100)}%"></i></div></div><p class="tk-month">${monthLine}</p>`;
  } else {
    el.innerHTML = who + `<div class="tk-progress"><div class="tk-today">${monthLine}</div><div class="meter tk-meter"><i style="width:${Math.min(mp || 0, 100)}%"></i></div></div>`;
  }
}

async function loadOverview() {
  const [pe, pp, ov] = await Promise.all([db.from('profiles').select('id,full_name,email,location_id').order('full_name'), db.from('profile_positions').select('*'), db.rpc('task_overview', { p_month: ymd(tk.month), p_today: todayStr() })]);
  const stat = {}, pos = {}, el = elapsed();
  (ov.data || []).forEach(x => stat[x.user_id] = x);
  (pp.data || []).forEach(x => (pos[x.user_id] = pos[x.user_id] || []).push((positions.find(p => p.id === x.position_id) || {}).name));
  const rows = (pe.data || []).filter(u => !tk.studio || u.location_id === tk.studio).map(u => { const s = stat[u.id]; return { u, s, pct: s && s.assigned ? mtd(s.done_month, s.done_today, s.assigned) : null, tp: s && s.assigned ? Math.round(100 * s.done_today / s.assigned) : null }; })
    .sort((a, b) => (a.pct ?? a.tp ?? 999) - (b.pct ?? b.tp ?? 999));
  const wp = rows.filter(r => r.pct !== null), avg = wp.length ? Math.round(wp.reduce((n, r) => n + r.pct, 0) / wp.length) : null;
  const wt = rows.filter(r => r.tp !== null), avgT = wt.length ? Math.round(wt.reduce((n, r) => n + r.tp, 0) / wt.length) : null;
  $('taskBody').innerHTML = `<p class="lead">${avg === null ? (avgT === null ? 'No one has tasks assigned yet.' : `Average today: <b>${avgT}%</b>. The month so far starts tomorrow.`) : `Average so far: <b>${avg}%</b>. Lowest first, so you can see who needs a nudge.`} Click a name to see their checklist.</p>
    <div class="table-wrap"><table class="ov"><thead><tr><th>Name</th><th>Studio</th><th>Task sets</th><th>Today</th><th>Month so far (complete days)</th></tr></thead><tbody>` +
    rows.map(({ u, s, pct, tp }) => `<tr data-row="${u.id}"><td>${esc(u.full_name || u.email)}</td><td>${esc(studio(u.location_id))}</td><td>${esc((pos[u.id] || []).join(', ') || 'None')}</td><td>${s && s.assigned ? tp + '% (' + s.done_today + '/' + s.assigned + ')' : '-'}</td><td>${pct === null ? '-' : `<div style="display:flex;gap:.6rem;align-items:center"><div class="meter" style="flex:1"><i style="width:${Math.min(pct, 100)}%"></i></div>${pct}%</div>`}</td></tr>`).join('') + '</tbody></table></div>';
}

async function loadManage() {
  const [pe, pp] = await Promise.all([db.from('profiles').select('id,full_name,email').order('full_name'), db.from('profile_positions').select('*')]);
  const has = new Set((pp.data || []).map(x => x.user_id + '|' + x.position_id));
  $('taskBody').innerHTML = '<h3 class="sub">Task sets by position</h3><p class="lead">Paste tasks one per line. Removing a task keeps its past check-offs.</p>' +
    positions.map(p => `<div class="pcard"><h3>${esc(p.name)}</h3><ol>${templates.filter(t => t.position_id === p.id).map(t => `<li>${esc(t.title)} <button class="quiet sm" data-rm="${t.id}">Remove</button></li>`).join('') || '<li>No tasks yet</li>'}</ol>
      <textarea data-add="${p.id}" rows="3" placeholder="Add tasks, one per line"></textarea><button data-addbtn="${p.id}">Add tasks</button></div>`).join('') +
    '<div class="pcard"><h3>New position</h3><input id="newPos" placeholder="e.g. Sales" style="margin-bottom:.5rem"><button id="addPos">Add position</button></div>' +
    `<h3 class="sub">Who gets which set</h3><div class="cal-wrap"><table class="tg"><thead><tr><th class="tt">Person</th>${positions.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>` +
    (pe.data || []).map(u => `<tr><td class="tt">${esc(u.full_name || u.email)}</td>${positions.map(p => `<td><input type="checkbox" data-u="${u.id}" data-p="${p.id}" aria-label="${esc(p.name)}" ${has.has(u.id + '|' + p.id) ? 'checked' : ''}></td>`).join('')}</tr>`).join('') + '</tbody></table></div>';
}

$('taskTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { tk.tab = b.dataset.tab; loadTasks(); } };
$('taskBar').onclick = e => {
  const n = e.target.closest('[data-nav]'), m = e.target.closest('[data-mode]');
  if (n) { tk.month.setMonth(tk.month.getMonth() + +n.dataset.nav); loadTasks(); }
  if (m) { tk.mode = m.dataset.mode; loadTasks(); }
};
$('taskBar').onchange = e => { if (e.target.id === 'tkStudio') { tk.studio = e.target.value; loadTasks(); } };
$('taskBody').onclick = async e => {
  const t = e.target, row = t.closest('[data-row]'), more = t.closest('[data-more]');
  if (more) {
    const id = more.dataset.more, open = !tk.open.has(id), d = more.nextElementSibling;
    open ? tk.open.add(id) : tk.open.delete(id);
    d.hidden = !open; more.textContent = open ? 'Hide' : 'Details'; more.setAttribute('aria-expanded', String(open));
    return;
  }
  if (t.dataset.rm) { await db.from('task_templates').update({ active: false }).eq('id', t.dataset.rm); loadTasks(); }
  else if (t.dataset.addbtn) {
    const pid = t.dataset.addbtn, lines = document.querySelector(`[data-add="${pid}"]`).value.split('\n').map(x => x.trim()).filter(Boolean);
    if (!lines.length) return;
    const base = Math.max(0, ...templates.filter(x => x.position_id === pid).map(x => x.sort_order)) + 1;
    const { error } = await db.from('task_templates').insert(lines.map((title, i) => ({ position_id: pid, title, sort_order: base + i })));
    if (error) alert(error.message);
    loadTasks();
  } else if (t.id === 'addPos') {
    const name = $('newPos').value.trim(); if (!name) return;
    const { error } = await db.from('positions').insert({ name }); if (error) alert(error.message);
    loadTasks();
  } else if (row) location.hash = '#tasks/' + row.dataset.row;
};
$('taskBody').onchange = async e => {
  const c = e.target;
  if (c.dataset.t) {
    const k = { user_id: ME.id, template_id: c.dataset.t, check_date: c.dataset.d };
    c.disabled = true;
    const { error } = c.checked ? await db.from('task_checks').insert(k) : await db.from('task_checks').delete().match(k);
    c.disabled = false;
    if (error) { c.checked = !c.checked; alert('Could not save that. ' + error.message); return; }
    const key = k.template_id + '|' + k.check_date; c.checked ? tk.done.add(key) : tk.done.delete(key);
    const card = c.closest('.tk');
    if (card) {   // Today view: let the check animate, then move the task to (or out of) the Done list
      card.classList.add(c.checked ? 'just-done' : 'just-undone');
      const still = c.checked;
      setTimeout(() => { if (tk.done.has(key) === still) renderMine(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420);
    } else paintStats();
  } else if (c.dataset.u) {
    const k = { user_id: c.dataset.u, position_id: c.dataset.p };
    const { error } = c.checked ? await db.from('profile_positions').insert(k) : await db.from('profile_positions').delete().match(k);
    if (error) { c.checked = !c.checked; alert(error.message); }
  }
};
$('dlgBody').addEventListener('click', e => { const t = e.target.dataset.tasks; if (t) { $('dlg').close(); location.hash = '#tasks/' + t; } });
