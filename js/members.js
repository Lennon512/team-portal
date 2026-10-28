// ---------- Members (ClubReady reports) ----------
const DAY = 864e5;
let mem = { sec: 'risk', g: 'attn', studio: '', rows: [], nrows: [], nt: {}, staff: [], notes: {}, contacts: {}, meta: null, sort: 'attn', find: '', mine: false, win: 60, bill: (() => { try { return +localStorage.getItem('memBill') || 60; } catch (_) { return 60; } })(), quick: null, form: null, doneOpen: false };
const SUBS = { risk: [['attn', 'Needs attention'], ['member', 'All upcoming invoices'], ['package', 'Package follow-up']], new: [['list', 'New member checklist'], ['check', 'Billing check']] };
let imp = { data: {}, store: null, asOf: null };
const daysAgo = s => s ? Math.floor((new Date(todayStr() + 'T00:00') - new Date(s + 'T00:00')) / DAY) : null;
const lc = r => { const a = (mem.contacts[r.club_id] || [])[0], x = a ? a.contacted_on : null, y = r.last_contact; return x && y ? (x > y ? x : y) : (x || y); };
const asg = r => { const a = (mem.notes[r.club_id] || {}).assigned_to, x = mem.staff.find(y => y.id === a); return x ? esc(x.full_name.split(' ')[0]) : ''; };
const noteOf = r => esc((mem.notes[r.club_id] || {}).note || '');

function calc(r) {
  const dl = daysAgo(r.last_session), dc = daysAgo(lc(r)), nbd = daysAgo(r.next_booking);
  const recent = dl === null || dl > 90 ? ['none', 'No visit in 90 days'] : dl <= 7 ? ['7', 'Last 7 days'] : dl <= 30 ? ['30', 'Last 30 days'] : ['90', 'Last 90 days'];
  const pace = r.plan_sessions ? (r.sessions_30d || 0) / r.plan_sessions : null;
  const label = pace === null ? '' : pace < .75 ? 'Behind' : pace >= 1.25 ? 'Ahead' : 'On pace';
  const nb = nbd !== null && nbd <= 0 && nbd >= -7;
  const base = r.grp === 'member' && !r.frozen && (label === 'Behind' || (r.credits || 0) >= 4) && !nb;
  const attn = base && (dc === null || dc > 14), reached = base && dc !== null && dc <= 14;
  const why = [];
  if (attn) {
    if (label === 'Behind') why.push(`Behind pace (${r.sessions_30d || 0} of ${r.plan_sessions} sessions in 30 days)`);
    if ((r.credits || 0) >= 4) why.push(`${r.credits} unused credits`);
    why.push('nothing booked in the next 7 days');
    why.push(dc === null ? 'never contacted' : `no contact in ${dc} days`);
    const k = r.next_due ? -daysAgo(r.next_due) : null;
    if (k !== null && k >= 0 && k <= 14) why.push(k === 0 ? 'invoice due today' : `invoice due in ${k} days`);
    why[0] = why[0][0].toUpperCase() + why[0].slice(1);
  }
  return { recent, label, nb, attn, reached, dl, dc, why: why.join(' \u2022 ') };
}

const dcell = d => `<td>${d ? fmt(d) : '-'}</td>`;
// Plain-English time: "today", "3 days ago", "in 5 days"
const ago = n => n === null ? 'never' : n <= 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago';
const dueIn = d => { if (!d) return ''; const k = -daysAgo(d); return k === 0 ? 'today' : k === 1 ? 'tomorrow' : k > 0 ? 'in ' + k + ' days' : Math.abs(k) + ' days ago'; };
const visitDot = c => `<span class="vdot v${c.recent[0]}" title="${c.recent[1]}"></span>`;
const visitCell = ({ c }) => `<td class="vcell">${visitDot(c)}${c.dl === null ? 'None on record' : ago(c.dl)}</td>`;
const invCell = ({ r }) => { const k = r.next_due ? -daysAgo(r.next_due) : null; return `<td class="${k !== null && k >= 0 && k <= 7 ? 'due-soon' : ''}">${r.next_due ? fmt(r.next_due) : '-'}${r.amount != null ? ` <span class="muted">• $${Number(r.amount).toFixed(0)}</span>` : ''}</td>`; };
const slimName = ({ r, c }) => `<td><b>${esc(r.name)}</b>${r.frozen ? '<span class="pill ice">Frozen</span>' : ''}${c.attn ? '<span class="flag" title="' + esc(c.why) + '">Needs attention</span>' : ''}</td>`;
const nameCell = ({ r, c }) => `<td><b>${esc(r.name)}</b>${r.frozen ? '<span class="pill ice">Frozen</span>' : ''}${c.attn ? '<span class="pill warn">Needs attention</span><div class="why">' + esc(c.why) + '</div>' : ''}</td>`;
const SORTABLE = { 'Credits': 'credits', 'Next invoice': 'due', 'Last visit': 'last' };
const COLS = {
  member: [['Member', slimName], ['Credits', ({ r }) => `<td>${r.credits ?? 0}</td>`], ['Next invoice', invCell], ['Last visit', visitCell],
    ['Pace', ({ r, c }) => `<td>${c.label ? `<span class="pace ${c.label === 'Behind' ? 'pace-bad' : c.label === 'Ahead' ? 'pace-good' : ''}">${c.label}</span> <span class="muted">${r.sessions_30d || 0}/${r.plan_sessions}</span>` : '<span class="muted">-</span>'}</td>`],
    ['Last contact', ({ c }) => `<td>${c.dc === null ? '<span class="muted">Never</span>' : ago(c.dc)}</td>`], ['Assigned', ({ r }) => `<td>${asg(r) || '<span class="muted">-</span>'}</td>`]],
  check: [['Member', nameCell], ['Signed up', ({ r }) => dcell(r.signed_on)], ['What we saw', ({ r }) => `<td>${esc(r.detail)}</td>`],
    ['Last session', ({ r }) => dcell(r.last_session)], ['Last contact', ({ r }) => `<td>${lc(r) ? fmt(lc(r)) : 'None'}</td>`], ['Assigned', ({ r }) => `<td>${asg(r)}</td>`], ['Notes', ({ r }) => `<td class="nt">${noteOf(r)}</td>`]],
  package: [['Member', nameCell], ['How they started', ({ r }) => `<td>${esc(r.detail)}</td>`], ['Credits left', ({ r }) => `<td class="${(r.credits || 0) <= 1 ? 'lowc' : ''}">${r.credits ?? 0}</td>`],
    ['Last session', ({ r }) => dcell(r.last_session)], ['Next booked', ({ r }) => dcell(r.next_booking)], ['Last contact', ({ r }) => `<td>${lc(r) ? fmt(lc(r)) : 'None'}</td>`],
    ['Assigned', ({ r }) => `<td>${asg(r)}</td>`], ['Notes', ({ r }) => `<td class="nt">${noteOf(r)}</td>`]]
};

async function loadMem() {
  const own = ME.role === 'owner';
  if (!mem.studio) mem.studio = own ? (locs[0] || {}).id : ME.location_id;
  $('memStudio').hidden = !own; $('memUp').hidden = ME.role === 'staff';
  if (own) $('memStudio').innerHTML = locs.map(x => `<option value="${x.id}" ${x.id === mem.studio ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  if (!mem.studio) { $('memBody').innerHTML = '<p class="lead">You have not been assigned to a studio yet. Ask the owner.</p>'; return; }
  const [s, n, c, mt, nn, nt, st] = await Promise.all([
    db.from('member_snapshot').select('*').eq('studio_id', mem.studio).limit(2000),
    db.from('member_notes').select('*').eq('studio_id', mem.studio),
    db.from('member_contacts').select('club_id,contacted_on,method,note').eq('studio_id', mem.studio).order('contacted_on', { ascending: false }).limit(3000),
    db.from('snapshot_meta').select('*').eq('studio_id', mem.studio).maybeSingle(),
    db.from('new_member_snapshot').select('*').eq('studio_id', mem.studio).limit(1000),
    db.from('new_member_tasks').select('*').eq('studio_id', mem.studio),
    db.from('team_directory').select('id,full_name,location_id').eq('location_id', mem.studio)]);
  mem.rows = s.data || []; mem.meta = mt.data; mem.notes = {}; mem.contacts = {};
  (n.data || []).forEach(x => mem.notes[x.club_id] = x);
  mem.nrows = nn.data || []; mem.nt = {}; (nt.data || []).forEach(x => mem.nt[x.club_id] = x); mem.staff = st.data || [];
  (c.data || []).forEach(x => (mem.contacts[x.club_id] = mem.contacts[x.club_id] || []).push(x));
  const old = mem.meta ? daysAgo(mem.meta.as_of) : null;
  $('memAsOf').innerHTML = mem.meta ? (old > 7 ? `<span class="stale">ClubReady data is ${old} days old (${fmt(mem.meta.as_of)}). ${ME.role === 'staff' ? 'Ask a manager to upload new reports.' : 'Upload new reports for accurate flags.'}</span>` : `ClubReady data as of ${fmt(mem.meta.as_of)}`) : 'No reports uploaded yet';
  drawMem();
}

const tile = (n, l, sub, key) => key ? `<button class="mtile${mem.g + '|' + (mem.quick || '') === key ? ' on' : ''}" data-tile="${key}"><b>${n}</b>${l}${sub ? `<span>${sub}</span>` : ''}</button>` : `<div><b>${n}</b>${l}${sub ? `<br><span>${sub}</span>` : ''}</div>`;
function sumRisk() {
  if (!mem.meta) { $('memSum').innerHTML = ''; return; }
  const m = mem.rows.filter(r => r.grp === 'member' && !r.frozen && billOk(r)).map(r => ({ r, c: calc(r) })), fl = m.filter(x => x.c.attn);
  const due7 = fl.filter(x => x.r.next_due && daysAgo(x.r.next_due) <= 0 && daysAgo(x.r.next_due) >= -7).length;
  const money = fl.reduce((n, x) => n + (+x.r.amount || 0), 0);
  const cold = m.filter(x => { const d = daysAgo(x.r.last_session); return d === null || d > 30; }).length;
  const inv = hasInv(), cred = m.filter(x => (x.r.credits || 0) >= 4).length;
  $('memSum').innerHTML = tile(fl.length, 'Need attention', inv ? '$' + Math.round(money).toLocaleString() + ' in upcoming invoices' : 'reach out this week', 'attn|') +
    (inv ? tile(due7, 'Flagged and billing in 7 days', 'reach out first', 'attn|due7') : tile(cred, 'Holding 4+ unused credits', 'sitting on sessions', 'member|cred')) +
    tile(cold, 'No visit in 30+ days', 'of ' + m.length + ' members', 'member|cold') + tile(m.length, inv ? 'Members being charged' : 'Members', inv && mem.bill < 9999 ? `billing in the next ${mem.bill} days` : 'see everyone', 'member|');
}
function sumNew() {
  if (!mem.nrows.length) { $('memSum').innerHTML = ''; return; }
  const rs = mem.nrows.filter(r => daysAgo(r.signed_on) <= mem.win).map(r => ({ r, c: nmCalc(r) })), act = rs.filter(x => !x.r.cancelled), cx = rs.length - act.length;
  const avg = act.length ? Math.round(act.reduce((n, x) => n + x.c.pct, 0) / act.length) : 0;
  const old = rs.filter(x => !x.r.is_package && daysAgo(x.r.signed_on) >= 30), made = old.filter(x => x.c.m2 === 'Yes').length;
  $('memSum').innerHTML = tile(act.length, 'Active new members', mem.win < 9999 ? 'signed up in the last ' + mem.win + ' days' : 'all signups') + tile(avg + '%', 'Average progress', 'active members') +
    tile(cx, 'Cancelled', rs.length ? Math.round(100 * cx / rs.length) + '% of signups' : '') + tile(old.length ? made + ' of ' + old.length : '-', 'Made it to month 2', 'signed up 30+ days ago');
}
// True when the last upload included Invoices Coming Due (due dates, amounts, pace)
const hasInv = () => mem.rows.some(r => r.grp === 'member' && r.next_due);
// Billing window: only members with an invoice due in the next N days (when invoice data exists)
const billOk = r => r.grp !== 'member' || !hasInv() || mem.bill >= 9999 || (r.next_due && -daysAgo(r.next_due) <= mem.bill);
const mineOk = r => !mem.mine || (mem.notes[r.club_id] || {}).assigned_to === ME.id;

function drawMem() {
  document.querySelectorAll('#memTabs button').forEach(b => b.classList.toggle('on', b.dataset.sec === mem.sec));
  $('memSubs').innerHTML = SUBS[mem.sec].map(x => `<button data-g="${x[0]}" class="${mem.g === x[0] ? 'on' : ''}">${x[0] === 'member' && mem.rows.length && !hasInv() ? 'All members' : x[1]}</button>`).join('');
  mem.sec === 'risk' ? sumRisk() : sumNew();
  $('memWin').hidden = mem.g !== 'list'; $('memBill').hidden = true;
  if (mem.g === 'list') { $('memSort').hidden = true; return drawNew(); }
  const g = mem.g === 'attn' ? 'member' : mem.g, q = mem.find.toLowerCase();
  $('memSort').hidden = g !== 'member'; $('memSort').value = mem.sort;
  const all = mem.rows.filter(r => r.grp === g && billOk(r));
  $('memBill').hidden = !(mem.sec === 'risk' && g === 'member' && hasInv()); $('memBill').value = String(mem.bill);
  const quickOk = x => !mem.quick || (mem.quick === 'due7' ? (x.r.next_due && daysAgo(x.r.next_due) <= 0 && daysAgo(x.r.next_due) >= -7) : mem.quick === 'cold' ? (x.c.dl === null || x.c.dl > 30) : mem.quick === 'cred' ? (x.r.credits || 0) >= 4 : true);
  const pool = all.filter(r => (!q || r.name.toLowerCase().includes(q)) && mineOk(r)).map(r => ({ r, c: calc(r) })).filter(quickOk);
  if (mem.g === 'attn') return drawAttn(pool);
  const rows = pool;
  const by = { attn: (a, b) => (b.c.attn - a.c.attn) || (b.r.credits - a.r.credits), credits: (a, b) => b.r.credits - a.r.credits, due: (a, b) => (a.r.next_due || 'z') < (b.r.next_due || 'z') ? -1 : 1, last: (a, b) => (a.r.last_session || '') < (b.r.last_session || '') ? -1 : 1 };
  rows.sort(g === 'member' ? by[mem.sort] : g === 'package' ? (a, b) => a.r.credits - b.r.credits : (a, b) => (b.r.signed_on || '') < (a.r.signed_on || '') ? -1 : 1);
  const attn = rows.filter(x => x.c.attn).length, fz = all.filter(r => r.frozen).length;
  const blurb = { member: (mem.quick === 'cred' ? `${rows.length} members holding 4+ unused credits. <button class="linkish" data-quick="">Show everyone</button>` : mem.quick === 'cold' ? `${rows.length} members with no visit in 30+ days. <button class="linkish" data-quick="">Show everyone</button>` : `${hasInv() ? (mem.bill < 9999 ? `Members billing in the next ${mem.bill} days` : 'Everyone with an upcoming invoice') : 'Everyone in your latest reports'}. Click a heading to sort, or a member to log a contact.`) + (fz ? ' ' + fz + ' frozen members are listed but never flagged.' : ''),
    check: `${all.length} recent signups with monthly billing but no invoice coming due. Worth a look in ClubReady.`,
    package: `${all.length} people on packages instead of memberships, fewest credits first. They need a nudge to join.` }[g];
  const cols = g === 'member' && !hasInv() ? COLS.member.filter(c => c[0] !== 'Next invoice' && c[0] !== 'Pace') : COLS[g];
  $('memBody').innerHTML = mem.meta ? `<p class="lead">${blurb}</p>` + (rows.length ? `<div class="table-wrap"><table class="mt"><thead><tr>${cols.map(c => { const k = g === 'member' && SORTABLE[c[0]]; return k ? `<th data-sort=\"${k}\" class=\"${mem.sort === k ? 'on' : ''}\" title=\"Sort by ${c[0].toLowerCase()}\">${c[0]}${mem.sort === k ? ' \u25BE' : ''}</th>` : `<th>${c[0]}</th>`; }).join('')}</tr></thead><tbody>${rows.map(x => `<tr data-m="${x.r.club_id}">${cols.map(c => c[1](x)).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="lead">Nothing here.</p>')
    : '<p class="lead">No reports uploaded for this studio yet.' + (ME.role === 'staff' ? '' : ' Click Upload reports to start.') + '</p>';
}

// ----- Needs attention: a work list, like Tasks -----
const OUTCOMES = ['No answer', 'Left voicemail', 'Talked', 'Booked a session', 'Sent a text'];
function drawAttn(pool) {
  const by = { attn: (a, b) => (b.r.credits || 0) - (a.r.credits || 0), credits: (a, b) => (b.r.credits || 0) - (a.r.credits || 0), due: (a, b) => (a.r.next_due || 'z') < (b.r.next_due || 'z') ? -1 : 1, last: (a, b) => (a.r.last_session || '') < (b.r.last_session || '') ? -1 : 1 };
  const todo = pool.filter(x => x.c.attn).sort(by[mem.sort] || by.attn), done = pool.filter(x => x.c.reached).sort((a, b) => (a.c.dc ?? 99) - (b.c.dc ?? 99));
  if (!mem.meta) { $('memBody').innerHTML = '<p class="lead">No reports uploaded for this studio yet.' + (ME.role === 'staff' ? '' : ' Click Upload reports to start.') + '</p>'; return; }
  const card = ({ r, c }, isDone) => {
    const k = r.next_due ? -daysAgo(r.next_due) : null, a = (mem.notes[r.club_id] || {}).assigned_to, who = asg(r), note = noteOf(r), last = (mem.contacts[r.club_id] || [])[0];
    const tags = [];
    if (c.label === 'Behind') tags.push(`<span class="mtag">Behind pace • ${r.sessions_30d || 0} of ${r.plan_sessions}</span>`);
    if ((r.credits || 0) >= 4) tags.push(`<span class="mtag">${r.credits} unused credits</span>`);
    if (k !== null && k >= 0 && k <= 14) tags.push(`<span class="mtag${k <= 7 ? ' hot' : ''}">Invoice ${dueIn(r.next_due)}${r.amount != null ? ' • $' + Number(r.amount).toFixed(0) : ''}</span>`);
    const open = String(mem.form) === String(r.club_id);
    return `<div class="mcard${isDone ? ' done' : ''}" data-m="${r.club_id}">
      <div class="mcard-top">
        ${visitDot(c)}
        <div class="mcard-who"><b>${esc(r.name)}</b>
          <small>Last visit ${c.dl === null ? 'none on record' : ago(c.dl)} • ${isDone && last ? `${esc(last.method || 'Contacted')} ${ago(daysAgo(last.contacted_on))}${last.note ? ': ' + esc(last.note) : ''}` : 'last contact ' + ago(c.dc)}${who ? ' • <span class="mwho">' + who + '</span>' : ''}</small></div>
        <div class="mcard-acts">${!isDone && !a ? `<button class="quiet sm" data-take="${r.club_id}">I'll take it</button>` : ''}<button class="sm${isDone ? ' quiet' : ''}" data-log="${r.club_id}">${open ? 'Cancel' : isDone ? 'Log another' : 'Log contact'}</button></div>
      </div>
      ${tags.length && !isDone ? `<div class="mtags">${tags.join('')}</div>` : ''}
      ${note ? `<p class="mnote">“${note}”</p>` : ''}
      ${open ? quickForm(r.club_id) : ''}
    </div>`;
  };
  $('memBody').innerHTML = (mem.quick === 'due7' ? `<p class="lead mem-lead">Flagged members billing in the next 7 days. <button class="linkish" data-quick="">Show all flagged</button></p>` :
      `<p class="lead mem-lead">${todo.length ? `${todo.length} to reach out to. Most unused credits first.` : 'Everyone flagged has been contacted. Nice work.'} <details class="mem-why"><summary>Why are people flagged?</summary>${hasInv() ? 'Behind pace or 4+ unused credits' : '4+ unused credits'}, nothing booked in the next 7 days, and no contact in 14 days. "None on record" means no visit in the Booking Events Log you uploaded, so pull at least 90 days of it. Logging a contact moves them to “Reached out recently”.</details></p>`) +
    `<div class="mlist">${todo.map(x => card(x, false)).join('')}</div>` +
    (done.length ? `<details class="tk-donebox mem-done" id="memDone"${mem.doneOpen ? ' open' : ''}><summary>Reached out recently <span>${done.length}</span></summary><div class="mlist">${done.map(x => card(x, true)).join('')}</div></details>` : '');
  const d = $('memDone'); if (d) d.ontoggle = () => { mem.doneOpen = d.open; };
  const f = document.querySelector('.mquick textarea, .mquick input[type=text]'); if (f && mem.form) f.focus({ preventScroll: true });
}
const quickForm = id => `<div class="mquick" data-q="${id}">
  <div class="mq-row"><span class="mq-lbl">How</span><span class="tabs mq-seg">${['Call', 'Text', 'Email', 'In person'].map((m, i) => `<button type="button" data-how="${m}" class="${i === 0 ? 'on' : ''}">${m}</button>`).join('')}</span></div>
  <div class="mq-row"><span class="mq-lbl">Result</span><span class="mq-chips">${OUTCOMES.map(o => `<button type="button" class="mq-chip" data-out="${o}">${o}</button>`).join('')}</span></div>
  <input type="text" class="mq-note" maxlength="200" placeholder="Anything to add? e.g. booked for Thursday 5pm" aria-label="Note">
  <div class="mq-bar"><input type="date" class="mq-date" value="${todayStr()}" max="${todayStr()}" aria-label="Date"><button class="sm" data-qsave="${id}">Save contact</button></div>
  <div class="mq-err" role="alert"></div></div>`;

async function saveQuick(id) {
  const q = document.querySelector(`.mquick[data-q="${id}"]`); if (!q) return;
  const how = (q.querySelector('[data-how].on') || {}).dataset?.how || 'Call', out = (q.querySelector('.mq-chip.on') || {}).dataset?.out || '';
  const extra = q.querySelector('.mq-note').value.trim(), note = [out, extra].filter(Boolean).join(': ') || null, day = q.querySelector('.mq-date').value || todayStr();
  const btn = q.querySelector('[data-qsave]'); btn.disabled = true; btn.textContent = 'Saving...';
  const { error } = await db.from('member_contacts').insert({ studio_id: mem.studio, club_id: +id, contacted_on: day, method: how, note });
  if (error) { btn.disabled = false; btn.textContent = 'Save contact'; q.querySelector('.mq-err').textContent = 'Could not save. ' + error.message; return; }
  (mem.contacts[id] = mem.contacts[id] || []).unshift({ club_id: +id, contacted_on: day, method: how, note });
  mem.contacts[id].sort((a, b) => a.contacted_on < b.contacted_on ? 1 : -1);
  const r = mem.rows.find(x => x.club_id == id); mem.form = null;
  const el = document.querySelector(`.mcard[data-m="${id}"]`);
  const go = () => { drawMem(); if (typeof toast === 'function') toast(`Logged ${how.toLowerCase()} with ${r ? r.name.split(' ')[0] : 'member'}`); };
  if (el && !matchMedia('(prefers-reduced-motion: reduce)').matches) { el.classList.add('leaving'); setTimeout(go, 320); } else go();
}

async function takeMember(id) {
  const cur = mem.notes[id] || {};
  const { error } = await db.from('member_notes').upsert({ studio_id: mem.studio, club_id: +id, note: cur.note || null, assigned_to: ME.id, updated_by: ME.id, updated_at: new Date().toISOString() }, { onConflict: 'studio_id,club_id' });
  if (error) { alert('Could not save. ' + error.message); return; }
  mem.notes[id] = { ...cur, club_id: +id, assigned_to: ME.id };
  if (!mem.staff.some(x => x.id === ME.id)) mem.staff.push({ id: ME.id, full_name: ME.full_name || ME.email });
  drawMem(); if (typeof toast === 'function') toast('Assigned to you');
}

const NT = [['welcome', 'Welcome email'], ['app', 'App setup'], ['flex', 'Flex points'], ['feedback', 'Feedback'], ['review', 'Google review'], ['referrals', 'Referrals']];
function nmCalc(r) {
  const t = mem.nt[r.club_id] || {}, d = s => new Date(s + 'T00:00');
  const auto = [r.sessions_booked >= 1, r.plan_sessions ? r.sessions_done >= r.plan_sessions : r.sessions_done >= 1];
  const done = NT.filter(x => t[x[0]]).length + auto.filter(Boolean).length;
  const m2 = r.is_package ? 'N/A' : r.cancelled ? ((r.cancel_date && (d(r.cancel_date) - d(r.signed_on)) / DAY >= 30) ? 'Yes' : 'No') : daysAgo(r.signed_on) >= 30 ? 'Yes' : 'Not yet';
  return { pct: Math.round(100 * done / 8), m2 };
}

function drawNew() {
  const w = document.querySelector('#memBody .table-wrap'), sl = w ? w.scrollLeft : 0, q = mem.find.toLowerCase();
  if (!mem.meta || !mem.nrows.length) { $('memBody').innerHTML = '<p class="lead">No new-member data yet. Upload the Agreements Log along with the other reports.</p>'; return; }
  const rows = mem.nrows.filter(r => daysAgo(r.signed_on) <= mem.win && (!q || r.name.toLowerCase().includes(q)) && mineOk(r)).map(r => ({ r, c: nmCalc(r) })).sort((a, b) => a.r.signed_on < b.r.signed_on ? 1 : -1);
  const act = rows.filter(x => !x.r.cancelled), avg = act.length ? Math.round(act.reduce((n, x) => n + x.c.pct, 0) / act.length) : 0;
  const box = (r, f) => `<td><input type="checkbox" data-nt="${f}" data-id="${r.club_id}" aria-label="${f} for ${esc(r.name)}" ${(mem.nt[r.club_id] || {})[f] ? 'checked' : ''}></td>`;
  const head = ['Member', 'Signed up', 'Membership', 'Cancelled?', 'Cancel date', 'Welcome email', 'App setup', 'Flex points', 'Booked out', 'Completed', 'Feedback', 'Google review', 'Referrals', 'Month 2?', 'Assigned', 'Notes', 'Progress'];
  $('memBody').innerHTML = `<p class="lead">Booked out, completed, and month 2 fill in from your reports. Tick the rest as your team does them.</p>` +
    `<div class="table-wrap"><table class="mt"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>` +
    rows.map(({ r, c }) => `<tr data-m="${r.club_id}" class="${r.cancelled ? 'cx' : ''}"><td><b>${esc(r.name)}</b></td>${dcell(r.signed_on)}<td>${esc(r.membership || '')}</td><td>${r.cancelled ? '<span class="pill warn" style="margin:0">Yes</span>' : 'No'}</td>${dcell(r.cancel_date)}` +
      box(r, 'welcome') + box(r, 'app') + box(r, 'flex') + `<td>${r.sessions_booked || 0}</td><td>${r.sessions_done}${r.plan_sessions ? '/' + r.plan_sessions : ''}</td>` + box(r, 'feedback') + box(r, 'review') + box(r, 'referrals') +
      `<td>${c.m2}</td><td>${asg(r)}</td><td class="nt">${noteOf(r)}</td><td><div style="display:flex;gap:.5rem;align-items:center"><div class="meter" style="width:70px"><i style="width:${c.pct}%"></i></div>${c.pct}%</div></td></tr>`).join('') +
    '</tbody></table></div>';
  const w2 = document.querySelector('#memBody .table-wrap'); if (w2) w2.scrollLeft = sl;
}

function memCard(id) {
  const r = mem.rows.find(x => x.club_id == id) || mem.nrows.find(x => x.club_id == id); if (!r) return;
  const hist = (mem.contacts[id] || []).slice(0, 8);
  $('dlgBody').innerHTML = `<h2>${esc(r.name)}</h2><p class="lead" style="margin:.25rem 0 1rem">${esc(r.detail || (r.frozen ? 'Frozen' : ''))}</p>
    <h3 class="sub">Log a contact</h3>
    <div class="grid2"><label>Date <input id="cDate" type="date" value="${todayStr()}" max="${todayStr()}"></label>
    <label>How <select id="cHow"><option>Call</option><option>Text</option><option>Email</option><option>In person</option></select></label></div>
    <label>What happened <input id="cWhat" maxlength="200" placeholder="Left voicemail, booked for Thursday..."></label>
    <div class="acts"><button data-act="mLog" data-id="${id}">Log contact</button></div>
    <h3 class="sub" style="margin-top:1.4rem">Note and owner</h3>
    <label>Note <textarea id="mNote" maxlength="600" placeholder="Anything the team should know about this member">${noteOf(r)}</textarea></label>
    <label>Assigned to <select id="mAsg"><option value="">Nobody yet</option>${mem.staff.map(x => `<option value="${x.id}" ${x.id === (mem.notes[id] || {}).assigned_to ? 'selected' : ''}>${esc(x.full_name)}</option>`).join('')}</select></label>
    <div class="acts"><button class="quiet" data-act="mSave" data-id="${id}">Save note</button><button class="quiet" data-act="close">Close</button></div>
    <div id="mErr" style="color:var(--danger)" role="alert"></div>` +
    (hist.length ? '<h3 class="sub" style="margin-top:1.4rem">Contact history</h3><ul class="mhist">' + hist.map(c => `<li><b>${fmt(c.contacted_on)}</b> ${esc(c.method || '')}${c.note ? ' \u2022 ' + esc(c.note) : ''}</li>`).join('') + '</ul>' : '<p class="lead" style="margin-top:1rem">No contacts logged in the portal yet.</p>');
  if (!$('dlg').open) $('dlg').showModal();
}

// ----- upload and import -----
const KINDS = { members: ['User ID', 'Unused Credits'], invoices: ['Invoice ID', 'Due Date', 'Invoice Type'], bookings: ['Booking Event', 'Booking Date', 'Current Status'], contacts: ['Client User ID', 'Contact Date'], agreements: ['Gross Down', 'Description', 'Customer'] };
const LABEL = { members: 'Members by Session Type', invoices: 'Invoices Coming Due', bookings: 'Booking Events Log', contacts: 'Contact Log', agreements: 'Agreements Log' };
// What each report adds, shown as a checklist in the upload window
const ADDS = { members: 'unused credits (required)', bookings: 'last visit, sessions in the last 30 days, next booking', contacts: 'last contact', invoices: 'due dates, amounts and pace (optional)', agreements: 'new members and package follow-up (optional)' };

function upForm() {
  imp = { data: {}, store: null, asOf: null, bad: [] };
  $('dlgBody').innerHTML = `<h2>Upload ClubReady reports</h2>
    <p class="lead" style="margin:.25rem 0 1rem">For <b>${esc(studio(mem.studio))}</b>. Add your ClubReady reports, all at once or a few at a time (or drag them onto the box). The portal sorts them out and builds the member success list.</p>
    <label class="updrop" id="upDrop"><input id="upFiles" type="file" multiple accept=".xlsx,.xls,.csv"><b>Choose files</b> or drop them here</label><div id="upList">${upChecklist()}</div>
    <div id="mErr" style="color:var(--danger)" role="alert"></div>
    <div class="acts"><button data-act="upGo" id="upGo" disabled>Import</button><button class="quiet" data-act="close">Cancel</button><button class="quiet" id="upReset" hidden>Start over</button></div>`;
  $('upFiles').onchange = e => { readFiles(e.target.files); e.target.value = ''; };
  $('upReset').onclick = () => { imp = { data: {}, store: null, asOf: null, bad: [] }; $('upList').innerHTML = upChecklist(); $('mErr').textContent = ''; $('upGo').disabled = true; $('upReset').hidden = true; };
  const dz = $('upDrop');
  ['dragenter', 'dragover'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) readFiles(e.dataTransfer.files); });
  $('dlg').showModal();
}

function upChecklist(bad = []) {
  return '<ul class="upcheck">' + ['members', 'bookings', 'contacts', 'invoices', 'agreements'].map(k => {
    const got = imp.data[k];
    return `<li class="${got ? 'ok' : k === 'members' ? 'need' : ''}"><span class="upmark">${got ? '\u2713' : '\u2013'}</span><span><b>${LABEL[k]}</b>${got ? ` <small>${got.length} rows</small>` : ''}<small class="upadds">${got ? 'Adds ' : ''}${ADDS[k]}</small></span></li>`;
  }).join('') + bad.map(b => `<li class="bad"><span class="upmark">\u2717</span><span>${b}</span></li>`).join('') + '</ul>';
}

// Adds files to what's already been picked, so reports can be added in more than one go.
// A newer file of the same report replaces the older one.
async function readFiles(files) {
  const lines = (imp.bad || []).map(b => '\u2717 ' + b);
  for (const f of [...files]) {
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
      let kind = null, rows = null;
      for (const sn of wb.SheetNames) {
        const a = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: true });
        const i = a.findIndex((r, k) => k < 6 && Object.values(KINDS).some(h => h.every(x => r.includes(x))));
        if (i < 0) continue;
        kind = Object.keys(KINDS).find(k => KINDS[k].every(x => a[i].includes(x)));
        rows = a.slice(i + 1).map(r => Object.fromEntries(a[i].map((h, k) => [h, r[k]])));
        break;
      }
      if (!kind) { lines.push(`\u2717 ${esc(f.name)}: not a report I recognize`); continue; }
      imp.data[kind] = rows; lines.push(`\u2713 ${LABEL[kind]} (${rows.length} rows)`);
      if (kind === 'bookings') {   // the Customer Summary tab says who holds a membership
        for (const sn of wb.SheetNames) {
          const a = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: true });
          const i = a.findIndex((r, k) => k < 6 && r.includes('Membership Type') && r.includes('User ID'));
          if (i >= 0) { imp.data.custsum = a.slice(i + 1).map(r => Object.fromEntries(a[i].map((h, k) => [h, r[k]]))); break; }
        }
      }
      const sm = f.name.match(/_(\d{4,6})(?=[_.])/); if (sm) imp.store = sm[1];
      const dm = f.name.match(/_-_\d{4}-\d{2}-\d{2}_-_(\d{4}-\d{2}-\d{2})/);
      if (dm && kind !== 'invoices' && (!imp.asOf || dm[1] > imp.asOf)) imp.asOf = dm[1];
    } catch (e) { lines.push(`\u2717 ${esc(f.name)}: could not be read. If it is a PDF, export it from ClubReady as Excel instead`); }
  }
  const loc = locs.find(x => x.id === mem.studio);
  let err = '';
  if (!imp.data.members) err = 'Add the Members by Session Type report. It is the one the list is built from.';
  else if (loc && loc.club_store_id && imp.store && loc.club_store_id !== imp.store) err = `These files are for ClubReady store ${imp.store}, but ${loc.name} is store ${loc.club_store_id}. Pick the right studio.`;
  imp.bad = lines.filter(x => x.startsWith('\u2717')).map(x => x.slice(2));
  $('upList').innerHTML = upChecklist(imp.bad) + (imp.asOf ? `<p class="lead" style="margin:.4rem 0 .5rem">Data through ${fmt(imp.asOf)}</p>` : '') +
    (!imp.data.invoices && imp.data.members ? '<p class="lead" style="margin:.2rem 0 .5rem">Tip: add Invoices Coming Due to limit the list to members about to be charged.</p>' : '');
  $('mErr').textContent = err; $('upGo').disabled = !!err; $('upReset').hidden = !Object.keys(imp.data).length && !imp.bad.length;
}

const toDT = v => {
  if (!v) return null;
  if (v instanceof Date) return new Date(v.getTime() + 120000);
  const m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M))?/i); if (!m) return null;
  let h = +m[4] || 0; if (m[6]) h = h % 12 + (m[6].toUpperCase() === 'PM' ? 12 : 0);
  return new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], m[1] - 1, m[2], h, +m[5] || 0);
};
const toDay = v => { const d = toDT(v); return d ? ymd(d) : null; };

function buildRows() {
  const { members = [], invoices = [], bookings = [], contacts = [], agreements = [] } = imp.data;
  const asOf = imp.asOf || todayStr(), names = {};
  const nm = (id, f, l) => { if (!names[id] && (f || l)) names[id] = `${f || ''} ${l || ''}`.replace(/\s+/g, ' ').trim(); };
  const charged = {}, freeze = new Set(), credits = {};
  invoices.forEach(r => {
    const id = +r['User ID']; if (!id) return; nm(id, r['First Name'], r['Last Name']);
    if (r['Invoice Type'] === 'Monthly Freeze Fee') { freeze.add(id); return; }
    const d = toDay(r['Due Date']), c = charged[id];
    if (!c || d < c.next_due) charged[id] = { next_due: d, amount: +r['Amount'] || 0, plan: (String(r['Details'] || '').match(/(\d+)\s*sessions?\s*per\s*month/i) || [])[1] };
  });
  // People missing from the Members report have no session credits left, so they count as 0.
  members.forEach(r => { const id = +r['User ID']; if (id) { nm(id, r['First Name'], r['Last Name']); credits[id] = +r['Unused Credits'] || 0; } });
  const bk = {};
  bookings.forEach(r => {
    const id = +r['User ID']; if (!id) return; nm(id, r['First Name'], r['Last Name']);
    const d = toDay(r['Booking Date']), st = String(r['Current Status'] || ''), b = bk[id] = bk[id] || { last: null, n30: 0, next: null, dates: [], open: 0 };
    if (st.startsWith('Completed') && d <= asOf) { b.dates.push(d); if (!b.last || d > b.last) b.last = d; if ((new Date(asOf + 'T00:00') - new Date(d + 'T00:00')) / DAY < 30) b.n30++; }
    else if (st.startsWith('Open Booking') && d >= asOf) { b.open++; if (!b.next || d < b.next) b.next = d; }
  });
  const ct = {};
  contacts.forEach(r => { const id = +r['Client User ID'], d = toDay(r['Contact Date']); if (id && d && (!ct[id] || d > ct[id])) ct[id] = d; });
  const ag = {};
  agreements.forEach(r => {
    const id = +r['User ID']; if (!id) return; nm(id, String(r['Customer'] || '').trim(), '');
    const desc = String(r['Description'] || ''), item = desc.split('\n')[0].trim(), when = toDT(r['Date']);
    const cm = desc.match(/CANCELLED (\d+\/\d+\/\d+ \d+:\d+ [AP]M)/), cd = cm ? toDT(cm[1]) : null;
    (ag[id] = ag[id] || []).push({ item, when, cd, agr: (String(r['Date']).match(/#(\d+)/) || [])[1], cancelled: !!cd, quick: !!(cd && when && cd - when <= DAY), hrs: cd && when ? Math.max(1, Math.round((cd - when) / 36e5)) : 0,
      pkg: /promotion|single session/i.test(item), addon: /add-on/i.test(item), eft: +r['New EFT'] || 0 });
  });
  const rows = [], mk = (id, grp, extra) => { const b = bk[id] || {}; rows.push({ club_id: id, name: names[id] || 'Unknown', grp, credits: credits[id] || 0, last_session: b.last || null, sessions_30d: b.n30 || 0, next_booking: b.next || null, last_contact: ct[id] || null, plan_sessions: null, next_due: null, amount: null, frozen: false, signed_on: null, detail: null, ...extra }); };
  Object.keys(charged).forEach(k => { const c = charged[k]; mk(+k, 'member', { plan_sessions: c.plan ? +c.plan : null, next_due: c.next_due, amount: c.amount }); });
  if (!invoices.length) {
    // No invoice report: members are people ClubReady lists with a membership (Booking Events
    // customer summary) plus anyone in the Members report still holding credits.
    const memberType = new Set((imp.data.custsum || []).filter(r => /member/i.test(String(r['Membership Type'] || ''))).map(r => +r['User ID']).filter(Boolean));
    (imp.data.custsum || []).forEach(r => nm(+r['User ID'], r['First Name'], r['Last Name']));
    const ids = new Set([...memberType, ...Object.keys(credits).map(Number).filter(id => credits[id] > 0)]);
    ids.forEach(id => mk(id, 'member', {}));
  }
  freeze.forEach(id => { if (!charged[id]) mk(id, 'member', { frozen: true }); });
  const have = new Set(rows.map(r => r.club_id));
  Object.keys(ag).forEach(k => {
    const id = +k, L = ag[k]; if (have.has(id)) return;
    const rec = L.find(x => !x.cancelled && !x.pkg && !x.addon && x.eft > 0);
    if (rec) { mk(id, 'check', { signed_on: ymd(rec.when), detail: 'Signed up with monthly billing, but no invoice is coming due' }); return; }
    const q = L.find(x => x.quick), p = L.find(x => x.pkg);
    if (q || p) mk(id, 'package', { signed_on: ymd((q || p).when), detail: q ? 'Cancelled membership ' + (q.hrs <= 1 ? 'within an hour' : 'about ' + q.hrs + ' hrs') + ' after signing up' : p.item.replace(/^1 x /, '').replace(/\s+T2$/, '') });
  });
  imp.newRows = [];
  Object.keys(ag).forEach(k => {
    const id = +k, L = ag[k].filter(x => x.when && !x.addon && !/single session/i.test(x.item)); if (!L.length) return;
    const a = L.sort((x, y) => y.when - x.when)[0], it = a.item, pk = /promotion/i.test(it), day = ymd(a.when), b = bk[id] || { dates: [], open: 0 };
    const n = (it.match(/(\d+)\s*Sessions?\s*per\s*Month/i) || it.match(/Promotion\s*(\d+)\s*x/i) || [])[1];
    imp.newRows.push({ club_id: id, name: names[id] || 'Unknown', agreement_id: a.agr || null, signed_on: day,
      membership: pk ? n + 'x' + ((it.match(/x\s*(\d+)\s*min/i) || [])[1] || '') + 'min package' : n ? n + 'x Membership' : /basic/i.test(it) ? 'Basic Membership' : it.replace(/^1 x /, ''),
      plan_sessions: n ? +n : null, is_package: pk, cancelled: a.cancelled, cancel_date: a.cd ? ymd(a.cd) : null, sessions_booked: b.open, sessions_done: b.dates.filter(d => d >= day).length });
  });
  return rows;
}

$('memTabs').onclick = e => { const b = e.target.closest('[data-sec]'); if (b) { mem.sec = b.dataset.sec; mem.g = SUBS[mem.sec][0][0]; drawMem(); } };
$('memSubs').onclick = e => { const b = e.target.closest('[data-g]'); if (b) { mem.g = b.dataset.g; mem.quick = null; mem.form = null; drawMem(); } };
$('memSum').onclick = e => { const t = e.target.closest('[data-tile]'); if (!t) return; const [g, q] = t.dataset.tile.split('|'); mem.sec = 'risk'; mem.g = g; mem.quick = q || null; mem.form = null; drawMem(); };
$('memWin').onchange = e => { mem.win = +e.target.value; drawMem(); };
$('memMine').onchange = e => { mem.mine = e.target.checked; drawMem(); };
$('memBody').onchange = async e => {
  const c = e.target, id = c.dataset.id, f = c.dataset.nt; if (!f) return;
  const { error } = await db.from('new_member_tasks').upsert({ studio_id: mem.studio, club_id: +id, [f]: c.checked, updated_by: ME.id, updated_at: new Date().toISOString() }, { onConflict: 'studio_id,club_id' });
  if (error) { c.checked = !c.checked; alert('Could not save that. ' + error.message); return; }
  (mem.nt[id] = mem.nt[id] || {})[f] = c.checked; drawNew();
};
$('memSort').onchange = e => { mem.sort = e.target.value; drawMem(); };
$('memBill').onchange = e => { mem.bill = +e.target.value; try { localStorage.setItem('memBill', mem.bill); } catch (_) {} drawMem(); };
$('memFind').oninput = e => { mem.find = e.target.value; drawMem(); };
$('memStudio').onchange = e => { mem.studio = e.target.value; loadMem(); };
$('memUp').onclick = upForm;
$('memBody').onclick = e => {
  const at = s => e.target.closest(s);
  const th = at('th[data-sort]'); if (th) { mem.sort = th.dataset.sort; drawMem(); return; }
  const qk = at('[data-quick]'); if (qk) { mem.quick = qk.dataset.quick || null; drawMem(); return; }
  const lg = at('[data-log]'); if (lg) { mem.form = mem.form === lg.dataset.log ? null : lg.dataset.log; drawMem(); return; }
  const tk_ = at('[data-take]'); if (tk_) { takeMember(tk_.dataset.take); return; }
  const how = at('[data-how]'); if (how) { how.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === how)); return; }
  const out = at('[data-out]'); if (out) { const on = !out.classList.contains('on'); out.parentNode.querySelectorAll('button').forEach(b => b.classList.remove('on')); out.classList.toggle('on', on); return; }
  const sv = at('[data-qsave]'); if (sv) { saveQuick(sv.dataset.qsave); return; }
  if (at('.mquick') || at('summary') || at('details.mem-why') || at('input')) return;
  const tr = at('[data-m]'); if (tr) memCard(tr.dataset.m);
};
$('memBody').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('mq-note')) { e.preventDefault(); saveQuick(e.target.closest('.mquick').dataset.q); } });

$('dlgBody').addEventListener('click', async e => {
  const a = e.target.dataset.act, id = e.target.dataset.id, fail = m => { $('mErr').textContent = m; };
  if (a === 'mSave') {
    const { error } = await db.from('member_notes').upsert({ studio_id: mem.studio, club_id: +id, note: $('mNote').value.trim() || null, assigned_to: $('mAsg').value || null, updated_by: ME.id, updated_at: new Date().toISOString() }, { onConflict: 'studio_id,club_id' });
    if (error) return fail('Could not save. ' + error.message);
    $('dlg').close(); loadMem();
  } else if (a === 'mLog') {
    if (!$('cDate').value) return fail('Pick a date.');
    const { error } = await db.from('member_contacts').insert({ studio_id: mem.studio, club_id: +id, contacted_on: $('cDate').value, method: $('cHow').value, note: $('cWhat').value.trim() || null });
    if (error) return fail('Could not save. ' + error.message);
    $('dlg').close(); loadMem();
  } else if (a === 'upGo') {
    e.target.disabled = true; e.target.textContent = 'Importing...';
    const { error } = await db.rpc('replace_snapshot', { p_studio: mem.studio, p_as_of: imp.asOf || todayStr(), p_store: imp.store, p_rows: buildRows() });
    if (error) { e.target.disabled = false; e.target.textContent = 'Import'; return fail('Import failed. ' + error.message); }
    if (imp.data.agreements) {
      const r2 = await db.rpc('replace_new_members', { p_studio: mem.studio, p_rows: imp.newRows });
      if (r2.error) { e.target.disabled = false; e.target.textContent = 'Import'; return fail('New member import failed. ' + r2.error.message); }
    }
    $('dlg').close(); loadMem();
  }
});
