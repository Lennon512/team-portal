// ---------- Tasks ----------
let tk = { tab: 'mine', month: new Date(), mode: 'day', day: ymd(new Date()), uid: null, who: '', studio: '', rows: [], done: new Set(), doneOpen: false, open: new Set(), ovFilter: 'all', ov: null, mg: null, openPos: new Set(), edit: null };
tk.month.setDate(1);
let positions = [], templates = [];
const todayStr = () => ymd(new Date());
const dim = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const isCur = () => ymd(tk.month).slice(0, 7) === todayStr().slice(0, 7);
const elapsed = () => isCur() ? new Date().getDate() : (ymd(tk.month) < todayStr() ? dim(tk.month) : 0);
const addDays = (d, n) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + n); return ymd(x); };
const fmtDay = d => new Date(d + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
// "today" / "yesterday" / "on Mon, Oct 26": used in sentences about the selected day
const dayWord = d => d === todayStr() ? 'today' : d === addDays(todayStr(), -1) ? 'yesterday' : 'on ' + fmtDay(d);
// Keep the selected day inside the month being shown (today if it's this month, else that month's last day)
function fitDay() { if (tk.day.slice(0, 7) !== ymd(tk.month).slice(0, 7)) tk.day = isCur() ? todayStr() : ymd(new Date(tk.month.getFullYear(), tk.month.getMonth() + 1, 0)); }

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
  const td = todayStr(), monthNav = `<button class="quiet" data-nav="-1" aria-label="Previous month">&lsaquo;</button><b>${tk.month.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</b><button class="quiet" data-nav="1" aria-label="Next month" ${tk.tab === 'mine' && isCur() ? 'disabled' : ''}>&rsaquo;</button>`;
  const lbl = tk.day === td ? `Today <small>${fmtDay(tk.day)}</small>` : tk.day === addDays(td, -1) ? `Yesterday <small>${fmtDay(tk.day)}</small>` : fmtDay(tk.day);
  const dayNav = `<button class="quiet" data-day="-1" aria-label="Previous day">&lsaquo;</button><label class="tk-daylbl" title="Pick a day"><b>${lbl}</b><input type="date" id="tkDayPick" value="${tk.day}" max="${td}" aria-label="Pick a day"></label><button class="quiet" data-day="1" aria-label="Next day" ${tk.day >= td ? 'disabled' : ''}>&rsaquo;</button>` +
    (tk.day !== td ? `<button class="quiet tk-jump" data-day="0">Back to today</button>` : '');
  $('taskBar').innerHTML = tk.tab === 'manage' ? '' :
    ((tk.tab === 'mine' && tk.mode === 'day') || tk.tab === 'team' ? dayNav : monthNav) +
    (tk.tab === 'mine' ? `<span class="tabs" style="margin:0 0 0 .5rem"><button data-mode="day" class="${tk.mode === 'day' ? 'on' : ''}">Day</button><button data-mode="month" class="${tk.mode === 'month' ? 'on' : ''}">Full month</button></span>` : '') +
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
  if (tk.mode === 'day') {
    const day = tk.day, isDone = r => tk.done.has(r.id + '|' + day);
    const item = r => {
      const [head, more] = splitTitle(r.title), open = tk.open.has(r.id);
      return `<div class="tk${isDone(r) ? ' done' : ''}${ro ? ' ro' : ''}" data-row-t="${r.id}"><label class="tk-main">${box(r, day)}<span class="tk-title">${esc(head)}</span></label>` +
        (more ? `<button type="button" class="tk-more" data-more="${r.id}" aria-expanded="${open}">${open ? 'Hide' : 'Details'}</button><div class="tk-detail"${open ? '' : ' hidden'}>${esc(more)}</div>` : '') + '</div>';
    };
    const doneRows = tk.rows.filter(isDone);
    h += groups.map(g => {
      const rows = tk.rows.filter(r => r.position_id === g.id), left = rows.filter(r => !isDone(r));
      return `<h3 class="sub tk-group">${esc(g.name)} <span>${rows.length - left.length} of ${rows.length} done</span></h3>` +
        (left.length ? left.map(item).join('') : '<p class="tk-clear">All clear here ✓</p>');
    }).join('');
    if (doneRows.length) h += `<details class="tk-donebox" id="tkDoneBox"${tk.doneOpen ? ' open' : ''}><summary>Done ${day === td ? 'today' : dayWord(day)} <span>${doneRows.length}</span></summary>${doneRows.map(item).join('')}</details>`;
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
  tk.ro = tk.uid !== ME.id;
  const who = tk.uid !== ME.id ? `<h3 style="margin:0 0 .6rem">${esc(tk.who)}</h3>` : '';
  if (tk.mode === 'day') {
    let dn = 0; tk.done.forEach(k => { const [id, d] = k.split('|'); if (ids.has(id) && d === tk.day) dn++; });
    const all = n && dn >= n, dp = n ? Math.round(100 * dn / n) : 0, w = dayWord(tk.day), isToday = tk.day === td;
    el.innerHTML = who + (all ? `<div class="tk-party" role="status"><span class="tk-party-emoji" aria-hidden="true">\uD83C\uDF89</span><div><b>All done ${w}!</b><small>${n} of ${n} tasks checked off. Nice work.</small></div></div>` : '') +
      `<div class="tk-progress"><div class="tk-today"><b>${dn} of ${n}</b> done ${w}</div><div class="meter tk-meter"><i style="width:${Math.min(dp, 100)}%"></i></div></div><p class="tk-month">${monthLine}</p>` +
      (!isToday && !tk.ro ? '<p class="tk-month">You are looking at a past day. Anything you check here is saved for that day.</p>' : '');
    return;
  }
  if (cur) {
    const all = n && t >= n;
    el.innerHTML = who + (all ? `<div class="tk-party" role="status"><span class="tk-party-emoji" aria-hidden="true">🎉</span><div><b>All done for today!</b><small>${n} of ${n} tasks checked off. Nice work.</small></div></div>` : '') +
      `<div class="tk-progress"><div class="tk-today"><b>${t} of ${n}</b> done today</div><div class="meter tk-meter"><i style="width:${Math.min(tp, 100)}%"></i></div></div><p class="tk-month">${monthLine}</p>`;
  } else {
    el.innerHTML = who + `<div class="tk-progress"><div class="tk-today">${monthLine}</div><div class="meter tk-meter"><i style="width:${Math.min(mp || 0, 100)}%"></i></div></div>`;
  }
}

// ---------- Team overview ----------
async function loadOverview() {
  const td = todayStr(), day = tk.day, mon = ymd(tk.month);
  const calls = [db.from('profiles').select('id,full_name,email,location_id').order('full_name'), db.from('profile_positions').select('*'), db.rpc('task_overview', { p_month: mon, p_today: td })];
  if (day !== td) calls.push(db.rpc('task_overview', { p_month: mon, p_today: day }));   // counts for the picked day
  const [pe, pp, ov, ovDay] = await Promise.all(calls);
  const stat = {}, dstat = {}, pos = {};
  (ov.data || []).forEach(x => stat[x.user_id] = x);
  ((ovDay || ov).data || []).forEach(x => dstat[x.user_id] = x);
  (pp.data || []).forEach(x => (pos[x.user_id] = pos[x.user_id] || []).push((positions.find(p => p.id === x.position_id) || {}).name));
  const people = (pe.data || []).filter(u => !tk.studio || u.location_id === tk.studio).map(u => {
    const s = stat[u.id], n = s && s.assigned ? s.assigned : 0, dn = n ? Math.min((dstat[u.id] || {}).done_today || 0, n) : 0;
    return { u, sets: pos[u.id] || [], n, dn, pct: n ? mtd(s.done_month, s.done_today, n) : null, st: !n ? 'none' : dn >= n ? 'done' : dn > 0 ? 'prog' : 'zero' };
  });
  tk.ov = people; renderOverview();
}

function renderOverview() {
  const day = tk.day, past = day !== todayStr(), w = dayWord(day), people = tk.ov || [];
  const ORDER = { zero: 0, prog: 1, done: 2 }, LBL = { zero: past ? 'Not done' : 'Not started', prog: past ? 'Partly done' : 'In progress', done: 'All done' };
  const active = people.filter(r => r.st !== 'none').sort((a, b) => ORDER[a.st] - ORDER[b.st] || a.dn / a.n - b.dn / b.n || (a.pct ?? 999) - (b.pct ?? 999) || String(a.u.full_name).localeCompare(b.u.full_name));
  const none = people.filter(r => r.st === 'none');
  const cnt = k => active.filter(r => r.st === k).length;
  const wp = active.filter(r => r.pct !== null), avg = wp.length ? Math.round(wp.reduce((n, r) => n + r.pct, 0) / wp.length) : null;
  if (!active.some(r => tk.ovFilter === 'all' || r.st === tk.ovFilter)) tk.ovFilter = 'all';
  const shown = active.filter(r => tk.ovFilter === 'all' || r.st === tk.ovFilter);
  const chip = (k, label, n) => `<button class="ov-chip ${k}${tk.ovFilter === k ? ' on' : ''}" data-ovf="${k}"><b>${n}</b> ${label}</button>`;
  const ini = u => esc((u.full_name || u.email || '?').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase());
  let h = !active.length ? '<p class="lead">No one has tasks assigned yet.' + (ME.role === 'owner' ? ' Set them up in <button class="linkish" data-gotab="manage">Manage task sets</button>.' : '') + '</p>' :
    `<div class="ov-chips">${chip('all', 'everyone', active.length)}${chip('zero', LBL.zero.toLowerCase(), cnt('zero'))}${chip('prog', LBL.prog.toLowerCase(), cnt('prog'))}${chip('done', 'all done', cnt('done'))}` +
    (avg !== null ? `<span class="ov-avg">Team average this month: <b>${avg}%</b></span>` : '') + `</div>
    <p class="lead ov-lead">Who still has tasks left ${w}. Tap a person to open their checklist${past ? ' for that day' : ''}.</p>
    <div class="ov-list">` + shown.map(r => `<button class="ov-row" data-row="${r.u.id}">
      <span class="ov-ava">${ini(r.u)}</span>
      <span class="ov-who"><b>${esc(r.u.full_name || r.u.email)}</b><small>${esc(studio(r.u.location_id))} • ${esc(r.sets.join(', '))}</small></span>
      <span class="ov-day"><span class="ov-pill ${r.st}">${LBL[r.st]}</span><span class="ov-count">${r.dn} of ${r.n}</span><span class="meter ov-bar"><i style="width:${Math.round(100 * r.dn / r.n)}%"></i></span></span>
      <span class="ov-month"><small>This month</small><b>${r.pct === null ? '–' : r.pct + '%'}</b></span>
    </button>`).join('') + '</div>';
  if (none.length) h += `<div class="ov-none"><b>No tasks assigned:</b> ${none.map(r => esc(r.u.full_name || r.u.email)).join(', ')}.` +
    (ME.role === 'owner' ? ` <button class="quiet sm" data-gotab="manage">Assign in Manage task sets</button>` : ' Ask the owner to assign a task set.') + '</div>';
  $('taskBody').innerHTML = h;
}

// ---------- Manage task sets ----------
const normTitle = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const fixSpacing = t => String(t).replace(/([a-z][.!?])([A-Z])/g, '$1 $2');
const posList = pid => templates.filter(x => x.position_id === pid).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.id).localeCompare(String(b.id)));

async function loadManage() {
  const [pe, pp] = await Promise.all([db.from('profiles').select('id,full_name,email').order('full_name'), db.from('profile_positions').select('*')]);
  tk.mg = { pe: pe.data || [], pp: pp.data || [] };
  renderManage();
}

function renderManage() {
  const { pe, pp } = tk.mg || { pe: [], pp: [] };
  const has = new Set(pp.map(x => x.user_id + '|' + x.position_id));
  const card = p => {
    const list = posList(p.id), seen = {}, ppl = pp.filter(x => x.position_id === p.id).length;
    list.forEach(t => { const k = normTitle(t.title); seen[k] = (seen[k] || 0) + 1; });
    const dups = list.filter(t => seen[normTitle(t.title)] > 1).length;
    const row = (t, i) => {
      if (tk.edit === t.id) return `<li class="mg-row editing"><textarea id="mgEdit" rows="3" aria-label="Edit task">${esc(t.title)}</textarea><div class="mg-editbar"><small>Enter to save • Esc to cancel • Tip: "Short title: details" keeps long tasks tidy</small><button class="quiet sm" data-cancel="1">Cancel</button><button class="sm" data-save="${t.id}">Save</button></div></li>`;
      const [head, more] = splitTitle(t.title), dup = seen[normTitle(t.title)] > 1, typo = fixSpacing(t.title) !== t.title;
      return `<li class="mg-row${dup ? ' dup' : ''}"><span class="mg-num">${i + 1}</span>
        <span class="mg-text" data-edit="${t.id}" title="Click to edit"><span class="mg-head">${esc(head)}</span>${more ? `<span class="mg-more">${esc(more)}</span>` : ''}
          ${dup ? '<span class="mg-badge">Duplicate</span>' : ''}${typo ? `<button class="mg-badge soft" data-fix="${t.id}" title="Add the missing space after the period">Fix spacing</button>` : ''}</span>
        <span class="mg-acts"><button class="mg-ic" data-move="-1" data-id="${t.id}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button><button class="mg-ic" data-move="1" data-id="${t.id}" aria-label="Move down" ${i === list.length - 1 ? 'disabled' : ''}>↓</button><button class="mg-ic" data-edit="${t.id}" aria-label="Edit">✎</button><button class="mg-ic del" data-rm="${t.id}" aria-label="Remove">✕</button></span></li>`;
    };
    return `<details class="mg-pos" data-pos="${p.id}"${tk.openPos.has(p.id) ? ' open' : ''}><summary><span class="mg-name">${esc(p.name)}</span><span class="mg-meta">${list.length} task${list.length === 1 ? '' : 's'} • ${ppl} ${ppl === 1 ? 'person' : 'people'}</span>${dups ? `<span class="mg-badge">${dups} duplicates</span>` : ''}</summary>
      ${list.length ? `<ol class="mg-list">${list.map(row).join('')}</ol>` : '<p class="lead" style="margin:.5rem 0 1rem">No tasks yet. Add some below.</p>'}
      <div class="mg-add"><textarea data-add="${p.id}" rows="3" placeholder="Add tasks, one per line"></textarea><div class="mg-addbar"><small data-hint="${p.id}"></small><button class="sm" data-addbtn="${p.id}">Add tasks</button></div></div></details>`;
  };
  $('taskBody').innerHTML = '<p class="lead">Tap a position to open it. Click any task to edit it, use the arrows to reorder. Removing a task keeps its past check-offs, and you can undo it.</p>' +
    `<div class="mg-tools"><button class="quiet sm" data-expand="1">Open all</button><button class="quiet sm" data-expand="0">Close all</button></div>` +
    positions.map(card).join('') +
    '<div class="mg-newpos"><input id="newPos" placeholder="New position, e.g. Sales" aria-label="New position name"><button class="sm" id="addPos">Add position</button></div>' +
    `<h3 class="sub" style="margin-top:2rem">Who gets which set</h3><p class="lead" style="margin-bottom:.8rem">Tick a box to give someone that position’s checklist.</p><div class="cal-wrap"><table class="tg mg-who"><thead><tr><th class="tt">Person</th>${positions.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>` +
    pe.map(u => `<tr><td class="tt">${esc(u.full_name || u.email)}</td>${positions.map(p => `<td><input type="checkbox" data-u="${u.id}" data-p="${p.id}" aria-label="${esc(p.name)} for ${esc(u.full_name || u.email)}" ${has.has(u.id + '|' + p.id) ? 'checked' : ''}></td>`).join('')}</tr>`).join('') + '</tbody></table></div>';
  const ed = $('mgEdit'); if (ed) { ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length); }
}

async function saveTitle(id, title) {
  title = title.trim(); if (!title) return;
  const { error } = await db.from('task_templates').update({ title }).eq('id', id);
  if (error) { alert('Could not save that. ' + error.message); return; }
  const t = templates.find(x => x.id === id); if (t) t.title = title;
  tk.edit = null; renderManage(); toast('Saved');
}

async function moveTask(id, dir) {
  const t = templates.find(x => x.id === id); if (!t) return;
  const list = posList(t.position_id), i = list.indexOf(t), j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const changed = list.map((x, k) => ({ x, o: k + 1 })).filter(({ x, o }) => x.sort_order !== o);
  changed.forEach(({ x, o }) => x.sort_order = o);
  renderManage();
  const res = await Promise.all(changed.map(({ x, o }) => db.from('task_templates').update({ sort_order: o }).eq('id', x.id)));
  const bad = res.find(r => r.error); if (bad) { alert('Could not save the new order. ' + bad.error.message); loadTasks(); }
}

async function removeTask(id) {
  const t = templates.find(x => x.id === id); if (!t) return;
  const { error } = await db.from('task_templates').update({ active: false }).eq('id', id);
  if (error) { alert('Could not remove that. ' + error.message); return; }
  templates = templates.filter(x => x !== t); renderManage();
  toast(`Removed “${splitTitle(t.title)[0]}”`, async () => {
    const r = await db.from('task_templates').update({ active: true }).eq('id', id);
    if (r.error) { alert('Could not undo. ' + r.error.message); return; }
    templates.push(t); if (tk.tab === 'manage') renderManage();
  });
}

// Small message above the tab bar, with an optional Undo
function toast(msg, undo) {
  let el = $('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  clearTimeout(el._t);
  el.innerHTML = `<span>${esc(msg)}</span>` + (undo ? '<button type="button">Undo</button>' : '');
  if (undo) el.querySelector('button').onclick = () => { el.classList.remove('show'); undo(); };
  el.classList.add('show');
  el._t = setTimeout(() => el.classList.remove('show'), undo ? 6000 : 2200);
}

$('taskTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { tk.tab = b.dataset.tab; loadTasks(); } };
$('taskBar').onclick = e => {
  const n = e.target.closest('[data-nav]'), m = e.target.closest('[data-mode]'), dy = e.target.closest('[data-day]');
  if (n) { tk.month.setMonth(tk.month.getMonth() + +n.dataset.nav); fitDay(); loadTasks(); }
  if (m) { tk.mode = m.dataset.mode; fitDay(); drawTaskBar(); renderMine(); }
  const pick = e.target.closest('.tk-daylbl');
  if (pick) { const i = $('tkDayPick'); try { i.showPicker(); } catch (_) { i.focus(); } }
  if (dy) goDay(+dy.dataset.day === 0 ? todayStr() : addDays(tk.day, +dy.dataset.day));
};
$('taskBar').onchange = e => {
  if (e.target.id === 'tkStudio') { tk.studio = e.target.value; loadTasks(); }
  if (e.target.id === 'tkDayPick' && e.target.value) goDay(e.target.value > todayStr() ? todayStr() : e.target.value);
};
// Move the Day view to another date; reloads check-offs only when the month changes
function goDay(d) {
  if (d > todayStr()) return;
  const sameMonth = d.slice(0, 7) === ymd(tk.month).slice(0, 7);
  tk.day = d;
  if (tk.tab === 'team') { tk.month = new Date(d.slice(0, 7) + '-01T00:00'); loadTasks(); }
  else if (sameMonth) { drawTaskBar(); renderMine(); }
  else { tk.month = new Date(d.slice(0, 7) + '-01T00:00'); loadTasks(); }
}
$('taskBody').onclick = async e => {
  const t = e.target, at = sel => t.closest(sel), row = at('[data-row]'), more = at('[data-more]');
  if (more) {
    const id = more.dataset.more, open = !tk.open.has(id), d = more.nextElementSibling;
    open ? tk.open.add(id) : tk.open.delete(id);
    d.hidden = !open; more.textContent = open ? 'Hide' : 'Details'; more.setAttribute('aria-expanded', String(open));
    return;
  }
  const ovf = at('[data-ovf]'); if (ovf) { tk.ovFilter = ovf.dataset.ovf; renderOverview(); return; }
  const go = at('[data-gotab]'); if (go) { tk.tab = go.dataset.gotab; loadTasks(); return; }
  const fix = at('[data-fix]'); if (fix) { const x = templates.find(y => y.id === fix.dataset.fix); if (x) saveTitle(x.id, fixSpacing(x.title)); return; }
  const mv = at('[data-move]'); if (mv) { if (!mv.disabled) moveTask(mv.dataset.id, +mv.dataset.move); return; }
  const rm = at('[data-rm]'); if (rm) { removeTask(rm.dataset.rm); return; }
  const sv = at('[data-save]'); if (sv) { saveTitle(sv.dataset.save, $('mgEdit').value); return; }
  if (at('[data-cancel]')) { tk.edit = null; renderManage(); return; }
  const ed = at('[data-edit]'); if (ed) { tk.edit = ed.dataset.edit; renderManage(); return; }
  const ex = at('[data-expand]'); if (ex) { tk.openPos = ex.dataset.expand === '1' ? new Set(positions.map(p => p.id)) : new Set(); renderManage(); return; }
  const add = at('[data-addbtn]');
  if (add) {
    const pid = add.dataset.addbtn, have = new Set(posList(pid).map(x => normTitle(x.title))), seen = new Set();
    const all = document.querySelector(`[data-add="${pid}"]`).value.split('\n').map(x => x.trim()).filter(Boolean);
    const lines = all.filter(x => { const k = normTitle(x); if (have.has(k) || seen.has(k)) return false; seen.add(k); return true; });
    if (!lines.length) { if (all.length) toast('Those tasks are already on the list'); return; }
    const base = Math.max(0, ...posList(pid).map(x => x.sort_order || 0)) + 1;
    const { error } = await db.from('task_templates').insert(lines.map((title, i) => ({ position_id: pid, title, sort_order: base + i })));
    if (error) { alert(error.message); return; }
    tk.openPos.add(pid);
    toast(`Added ${lines.length} task${lines.length === 1 ? '' : 's'}` + (all.length > lines.length ? ` (skipped ${all.length - lines.length} already on the list)` : ''));
    loadTasks();
  } else if (t.id === 'addPos') {
    const name = $('newPos').value.trim(); if (!name) return;
    const { error } = await db.from('positions').insert({ name }); if (error) { alert(error.message); return; }
    toast('Position added'); loadTasks();
  } else if (row) { tk.mode = 'day'; tk.tab = 'mine'; location.hash = '#tasks/' + row.dataset.row; }
};
// Remember which position cards are open; live count in the add boxes; keyboard shortcuts while editing
$('taskBody').addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.pos) d.open ? tk.openPos.add(d.dataset.pos) : tk.openPos.delete(d.dataset.pos); }, true);
$('taskBody').addEventListener('input', e => {
  const pid = e.target.dataset.add; if (!pid) return;
  const n = e.target.value.split('\n').map(x => x.trim()).filter(Boolean).length, h = document.querySelector(`[data-hint="${pid}"]`);
  if (h) h.textContent = n ? `${n} task${n === 1 ? '' : 's'} ready to add` : '';
});
$('taskBody').addEventListener('keydown', e => {
  if (e.target.id !== 'mgEdit') return;
  if (e.key === 'Escape') { tk.edit = null; renderManage(); }
  else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTitle(tk.edit, e.target.value); }
});
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
    if (error) { c.checked = !c.checked; alert(error.message); return; }
    if (tk.mg) { tk.mg.pp = tk.mg.pp.filter(x => !(x.user_id === k.user_id && x.position_id === k.position_id)); if (c.checked) tk.mg.pp.push(k); }
    const meta = document.querySelector(`[data-pos="${k.position_id}"] .mg-meta`);
    if (meta && tk.mg) { const n = tk.mg.pp.filter(x => x.position_id === k.position_id).length, tc = posList(k.position_id).length; meta.textContent = `${tc} task${tc === 1 ? '' : 's'} \u2022 ${n} ${n === 1 ? 'person' : 'people'}`; }
  }
};
$('dlgBody').addEventListener('click', e => { const t = e.target.dataset.tasks; if (t) { $('dlg').close(); location.hash = '#tasks/' + t; } });
