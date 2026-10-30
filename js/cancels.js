// ---------- Members > Cancellations: who cancelled (or is about to, or froze) and how we follow up ----------
// Data: cancel_snapshot (ClubReady "Invoice Changes" report + last visit) and cancel_contacts
// (Contact Log entries for those people). Both are refreshed by the Upload reports window.
const CX = { rows: [], cs: {}, missing: false, view: 'open', sort: 'new', dueOnly: false };

async function loadCx() {
  const [a, b] = await Promise.all([
    db.from('cancel_snapshot').select('*').eq('studio_id', mem.studio).limit(3000),
    db.from('cancel_contacts').select('club_id,contacted_at,staff,kind,made,outcome').eq('studio_id', mem.studio).order('contacted_at', { ascending: false }).limit(10000)]);
  CX.missing = !!(a.error && /relation|does not exist|schema cache/i.test(a.error.message));
  CX.rows = a.data || []; CX.cs = {};
  (b.data || []).forEach(x => (CX.cs[x.club_id] = CX.cs[x.club_id] || []).push(x));
  Object.values(CX.cs).forEach(L => L.sort((x, y) => x.contacted_at < y.contacted_at ? 1 : -1));   // newest first
}

// Follow-up plan after a cancel: exit call right away, a check-in at 30 days, a win-back offer at 60.
// After 90 days they drop off the list.
const CX_STEPS = [[0, 'Exit call', 3], [30, '30-day check-in', 7], [60, 'Win-back offer', 7]];
const cxAdd = (d, n) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + n); return ymd(x); };

function cxCalc(r) {
  const cs = CX.cs[r.club_id] || [], d = daysAgo(r.event_on);
  const since = cs.filter(x => dayOf(x.contacted_at) >= r.event_on);   // contacts since the cancel / freeze
  const last = since[0] || null, dc = last ? daysAgo(dayOf(last.contacted_at)) : null;
  const exit = since.find(x => dayOf(x.contacted_at) <= cxAdd(r.event_on, 3));
  const back = r.next_booking && daysAgo(r.next_booking) <= 0;
  let step, due = false, late = false, next = null;
  if (r.kind === 'frozen') { step = 'Check in while they are frozen'; due = dc === null || dc >= 30; }
  else if (d > 90) step = 'Done: past 90 days';
  else {
    const i = CX_STEPS.reduce((k, s, j) => d >= s[0] ? j : k, 0), [start, name, win] = CX_STEPS[i];
    const done = since.some(x => dayOf(x.contacted_at) >= cxAdd(r.event_on, start));
    const nx = CX_STEPS[i + 1];
    if (done) { step = nx ? `${name} done. ${nx[1]} ${nx[0] - d <= 0 ? 'today' : 'in ' + (nx[0] - d) + ' days'}` : `${name} done`; next = nx ? nx[1] : null; }
    else { step = name; due = true; late = d - start > win; }
  }
  if (back) { step = 'Booked again ' + fmt(r.next_booking); due = false; }
  return { cs: since, n: since.length, made: since.filter(x => x.made).length, last, dc, d, exit: !!exit, step, due, late, back };
}

const CX_VIEWS = [['open', 'Following up', r => r.kind === 'cancelled' && daysAgo(r.event_on) <= 90], ['30', 'Cancelled 0–30 days', r => r.kind === 'cancelled' && daysAgo(r.event_on) <= 30], ['60', '31–60 days', r => r.kind === 'cancelled' && daysAgo(r.event_on) > 30 && daysAgo(r.event_on) <= 60],
  ['90', '61–90 days', r => r.kind === 'cancelled' && daysAgo(r.event_on) > 60 && daysAgo(r.event_on) <= 90], ['old', '90+ days', r => r.kind === 'cancelled' && daysAgo(r.event_on) > 90],
  ['frozen', 'On freeze', r => r.kind === 'frozen'], ['month', 'Cancelled this month', r => r.kind === 'cancelled' && (r.event_on || '').slice(0, 7) === todayStr().slice(0, 7)]];
const CX_SORTS = { new: 'Most recent first', old: 'Oldest first', money: 'Biggest plan first', quiet: 'Longest since last contact' };

function sumCx() {
  if (CX.missing || !CX.rows.length) { $('memSum').innerHTML = ''; return; }
  const all = CX.rows.map(r => ({ r, c: cxCalc(r) })), cx = all.filter(x => x.r.kind === 'cancelled');
  const mo = todayStr().slice(0, 7), lm = (() => { const x = new Date(todayStr() + 'T00:00'); x.setDate(1); x.setMonth(x.getMonth() - 1); return ymd(x).slice(0, 7); })();
  const thisM = cx.filter(x => (x.r.event_on || '').slice(0, 7) === mo), lastM = cx.filter(x => (x.r.event_on || '').slice(0, 7) === lm);
  const money = thisM.reduce((s, x) => s + (+x.r.amount || 0), 0);
  const rec = cx.filter(x => x.c.d >= 3 && x.c.d <= 33), exit = rec.filter(x => x.c.exit).length;
  const fzn = all.filter(x => x.r.kind === 'frozen').length, due = all.filter(x => x.c.due && x.r.kind !== 'frozen').length;
  $('memSum').innerHTML = tile(thisM.length, 'Cancelled this month', `${lastM.length} last month • $${Math.round(money).toLocaleString()}/mo in plans`, 'C|month') +
    tile(rec.length ? Math.round(exit / rec.length * 100) + '%' : '-', 'Exit call within 3 days', `${exit} of ${rec.length} cancels in the last 30 days`, 'C|30') +
    tile(fzn, 'On freeze', 'check in before they come back', 'C|frozen') +
    tile(due, 'Due for follow-up', 'exit call, check-in or win-back', 'C|due');
}
function cxTile(q) {
  Object.assign(CX, { view: 'open', dueOnly: false, sort: 'new' });
  if (q === 'due') CX.dueOnly = true; else if (q) CX.view = q;
}

const cxDate = (r, c) => r.event_on ? `<span class="hchip ${r.kind === 'frozen' ? 'h1' : heat(c.d, [3, 30, 60, 90])}"><b>${fmt(r.event_on)}</b> ${ago(c.d)}</span>` : '-';
const cxKind = r => r.kind === 'frozen' ? '<span class="pill ice">Frozen</span>' : '';

function drawCx() {
  if (CX.missing) { $('memBody').innerHTML = `<div class="pcard"><h3>One-time setup needed</h3><p>${ME.role === 'owner' ? 'Open Supabase → SQL Editor → New query, paste the contents of <a href="https://github.com/Lennon512/team-portal/blob/main/sql/cancels.sql" target="_blank" rel="noopener">sql/cancels.sql</a>, and click Run. Then refresh this page.' : 'Ask the owner to run the setup.'}</p></div>`; return; }
  if (!CX.rows.length) { $('memBody').innerHTML = '<p class="lead">No cancellations yet. Add ClubReady’s <b>Invoice Changes</b> report (with the Contact Log and Booking Events Log) in Upload reports.</p>'; return; }
  const q = mem.find.toLowerCase(), V = (CX_VIEWS.find(x => x[0] === CX.view) || CX_VIEWS[0])[2];
  const base = CX.rows.filter(r => (!q || (r.name || '').toLowerCase().includes(q)) && mineOk(r)).map(r => ({ r, c: cxCalc(r) }));
  const rows = base.filter(x => V(x.r) && (!CX.dueOnly || x.c.due));
  const S = { new: (a, b) => (b.r.event_on || '') < (a.r.event_on || '') ? -1 : 1, old: (a, b) => (a.r.event_on || '') < (b.r.event_on || '') ? -1 : 1,
    money: (a, b) => (+b.r.amount || 0) - (+a.r.amount || 0), quiet: (a, b) => (b.c.dc ?? 1e9) - (a.c.dc ?? 1e9) };
  rows.sort(S[CX.sort] || S.new);
  const cnt = f => base.filter(x => f(x.r) && (!CX.dueOnly || x.c.due)).length;
  const shown = CX_VIEWS.filter(([k, , f]) => k !== 'month' || CX.view === 'month').filter(([k, , f]) => k === 'open' || k === CX.view || cnt(f));
  const money = rows.reduce((s, x) => s + (x.r.kind === 'frozen' ? 0 : +x.r.amount || 0), 0);
  $('memBody').innerHTML = `<div class="ldbar"><span class="tabs ldages">${shown.map(([k, t, f]) => `<button type="button" data-cxv="${k}" class="${CX.view === k ? 'on' : ''}">${t} <small>${cnt(f)}</small></button>`).join('')}</span></div>
    <div class="ldfilters"><select id="cxSort" aria-label="Sort">${Object.entries(CX_SORTS).map(([k, t]) => `<option value="${k}" ${CX.sort === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <label class="mem-mine"><input type="checkbox" id="cxDue" ${CX.dueOnly ? 'checked' : ''}> Due for follow-up only</label></div>
    <p class="lead mem-lead">Showing <b>${rows.length}</b> ${CX.view === 'frozen' ? 'frozen member' + (rows.length === 1 ? '' : 's') : 'member' + (rows.length === 1 ? '' : 's')}${money && CX.view !== 'frozen' ? ` • $${Math.round(money).toLocaleString()}/mo in plans` : ''}${CX.dueOnly ? ', only those due' : ''}.${CX.view !== 'open' || CX.dueOnly ? ' <button class="linkish" data-cxreset="1">Clear filters</button>' : ''} Follow-up: exit call within 3 days, a check-in at 30 days, a win-back offer at 60. Click a name to add the reason or see their history.</p>` +
    (rows.length ? `<div class="table-wrap"><table class="mt ldt"><thead><tr><th>Member</th><th>${CX.view === 'frozen' ? 'Froze' : 'Cancelled'}</th><th>Next step</th><th>Last visit</th><th>Contacts since</th><th>Last contact</th><th>How</th><th>By</th></tr></thead><tbody>` +
      rows.map(({ r, c }) => { const note = (mem.notes[r.club_id] || {}).note;
        return `<tr data-cx="${r.club_id}" class="${c.due ? 'lddue' : ''}"><td><b>${esc(r.name || 'Unknown')}</b>${cxKind(r)}<small class="nm-sub">${esc([r.plan, r.amount ? '$' + Math.round(r.amount) + '/mo' : ''].filter(Boolean).join(' • '))}</small>${note ? `<small class="nm-sub cxwhy">${esc(note)}</small>` : ''}</td>
        <td>${cxDate(r, c)}</td><td>${esc(c.step)}${c.due ? ` <span class="pill ${c.late ? 'warn' : 'due'}">${c.late ? 'Overdue' : 'Due'}</span>` : ''}</td>
        <td>${r.last_visit ? `${fmt(r.last_visit)} <span class="muted">${ago(daysAgo(r.last_visit))}</span>` : '<span class="muted">None on record</span>'}</td>
        <td>${attCell(c)}</td><td>${lastCell(c)}</td>${detailCells(c)}</tr>`; }).join('') + '</tbody></table></div>' : '<p class="lead">Nobody matches these filters.</p>') +
    `<p class="legend nb-legend"><span><i class="hchip h0"></i>0–3 days</span><span><i class="hchip h1"></i>4–30</span><span><i class="hchip h2"></i>31–60</span><span><i class="hchip h3"></i>61–90</span><span><i class="hchip h4"></i>90+</span><span class="muted">(since they cancelled)</span></p>`;
}

function cxCard(id) {
  const r = CX.rows.find(x => x.club_id == id); if (!r) return;
  const c = cxCalc(r), all = CX.cs[r.club_id] || [], h = r.history || [];
  $('dlgBody').innerHTML = `<h2>${esc(r.name || 'Member')}</h2><p class="lead" style="margin:.25rem 0 .8rem">${esc([r.plan, r.amount ? '$' + Math.round(r.amount) + '/mo' : '', (r.kind === 'frozen' ? 'froze ' : 'cancelled ') + fmt(r.event_on), r.staff ? 'by ' + r.staff : '', 'ClubReady status: ' + (r.status || '-')].filter(Boolean).join(' • '))}</p>
    <p style="margin:0 0 1rem"><b>Next step:</b> ${esc(c.step)}${c.due ? ` <span class="pill ${c.late ? 'warn' : 'due'}">${c.late ? 'Overdue' : 'Due'}</span>` : ''}</p>
    <h3 class="sub">Reason and owner</h3>
    <label>Why they ${r.kind === 'frozen' ? 'froze' : 'cancelled'} <textarea id="mNote" maxlength="600" placeholder="Moving, cost, injury, schedule, not seeing results...">${noteOf(r)}</textarea></label>
    <label>Assigned to <select id="mAsg"><option value="">Nobody yet</option>${mem.staff.map(x => `<option value="${x.id}" ${x.id === (mem.notes[r.club_id] || {}).assigned_to ? 'selected' : ''}>${esc(x.full_name)}</option>`).join('')}</select></label>
    <div class="acts"><button class="quiet" data-act="mSave" data-id="${r.club_id}">Save</button><button class="quiet" data-act="close">Close</button></div><div id="mErr" style="color:var(--danger)" role="alert"></div>
    <h3 class="sub" style="margin-top:1.2rem">Contact history <small class="muted">${c.n} since, ${all.length} in all</small></h3>` +
    (all.length ? '<ul class="mhist">' + all.slice(0, 25).map(x => `<li${dayOf(x.contacted_at) < r.event_on ? ' class="muted"' : ''}><b>${new Date(x.contacted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</b> ${esc(howOf(x.kind))}${x.outcome ? ' • ' + esc(x.outcome) : ''}${x.staff ? ' <span class="muted">• ' + esc(x.staff) + '</span>' : ''}</li>`).join('') + '</ul>' : '<p class="lead">No contact on record yet.</p>') +
    (h.length ? '<h3 class="sub" style="margin-top:1.2rem">Billing changes</h3><ul class="mhist">' + h.map(x => `<li><b>${fmt(x.on)}</b> ${esc(x.type)} <span class="muted">• ${esc(x.item)}${x.amt ? ' $' + Math.round(x.amt) : ''}${x.by ? ' • ' + esc(x.by) : ''}</span></li>`).join('') + '</ul>' : '');
  if (!$('dlg').open) $('dlg').showModal();
}

// ----- import: build rows from ClubReady's Invoice Changes report -----
// Each person's rows follow their name, so blank name / status cells carry down from the row above.
function buildCx() {
  const { cancels = [], contacts = [], bookings = [] } = imp.data, P = {};
  // Membership Status belongs to each membership (someone who upgraded has a Cancelled old plan and an Active new one)
  let cur = {};
  cancels.forEach(x => {
    if (x['User Id']) cur = { id: +x['User Id'], name: String(x['Client'] || '').trim(), status: x['Membership Status'] || '' };
    else if (x['Membership Status']) cur = { ...cur, status: x['Membership Status'] };
    const t = toDT(x['Change Date']), type = String(x['Change Type'] || '').replace(/^Invoice /, '').trim(); if (!cur.id || !t || !type) return;
    const p = P[cur.id] = P[cur.id] || { name: cur.name, ev: [] };
    p.ev.push({ t, on: ymd(t), type, st: String(cur.status || ''), item: String(x['Description'] || '').replace(/\s+/g, ' ').trim(), amt: +x['Value'] || 0, by: x['Staff Member'] && x['Staff Member'] !== 'System Admin' ? String(x['Staff Member']).trim() : '' });
  });
  const plan = s => s.replace(/^Recurring\s+/i, '').replace(/\s+T\d$/i, '').replace(/ Membership/i, '');
  const rows = [], today = todayStr();
  Object.entries(P).forEach(([id, p]) => {
    p.ev.sort((a, b) => a.t - b.t);
    const mship = p.ev.filter(e => /membership/i.test(e.item));
    const cx = mship.filter(e => /^cancelled/i.test(e.type) && /cancel/i.test(e.st)), last = cx[cx.length - 1];
    const active = mship.some(e => /active/i.test(e.st)), st = active ? 'Active' : (last ? last.st : (p.ev[p.ev.length - 1] || {}).st);
    const fz = mship.filter(e => /freeze|frozen/i.test(e.type) && /active/i.test(e.st)), lf = fz[fz.length - 1];
    let kind = null, ev = null;
    if (last && !active) { kind = 'cancelled'; ev = last; }   // still has an active membership = changed plans, not a cancel
    else if (lf && /pushed out/i.test(lf.type)) { kind = 'frozen'; ev = lf; }
    if (!kind) return;
    const who = (cx.slice().reverse().find(e => e.by) || ev).by;
    rows.push({ studio_id: mem.studio, club_id: +id, name: p.name, status: st || null, kind, event_on: ev.on, plan: plan(ev.item) || null,
      amount: ev.amt || null, staff: who || null, last_visit: null, next_booking: null,
      history: p.ev.map(e => ({ on: e.on, type: e.type, item: plan(e.item), amt: e.amt, by: e.by })), updated_at: new Date().toISOString() });
  });
  const byId = Object.fromEntries(rows.map(r => [r.club_id, r]));
  bookings.forEach(b => { const r = byId[+b['User ID']]; if (!r) return; const d = toDay(b['Booking Date']), s = String(b['Current Status'] || ''); if (!d) return;
    if (s.startsWith('Completed') && d <= today) { if (!r.last_visit || d > r.last_visit) r.last_visit = d; }
    else if (s.startsWith('Open Booking') && d >= today) { if (!r.next_booking || d < r.next_booking) r.next_booking = d; } });
  const cs = contacts.filter(x => byId[+x['Client User ID']]).map(x => { const t = toDT(x['Contact Date']); return t && { studio_id: mem.studio, club_id: +x['Client User ID'], contacted_at: t.toISOString(),
    staff: `${x['Staff First Name'] || ''} ${x['Staff Last Name'] || ''}`.trim() || null, kind: x['Contact Type'] || null, made: /^y/i.test(String(x['Contact Made'] || '')), outcome: x['Outcome'] || null }; }).filter(Boolean);
  return { rows, cs };
}
async function saveCx() {
  const { rows, cs } = buildCx(), chunk = async (t, L) => { for (let i = 0; i < L.length; i += 500) { const { error } = await db.from(t).insert(L.slice(i, i + 500)); if (error) return error; } };
  let r = await db.from('cancel_snapshot').delete().eq('studio_id', mem.studio); if (r.error) return r.error;
  let e = await chunk('cancel_snapshot', rows); if (e) return e;
  if (!imp.data.contacts) return null;   // keep the contacts we have when the Contact Log wasn't in this upload
  r = await db.from('cancel_contacts').delete().eq('studio_id', mem.studio); if (r.error) return r.error;
  return (await chunk('cancel_contacts', cs)) || null;
}

document.addEventListener('change', e => { const t = e.target;
  if (t.id === 'cxSort') { CX.sort = t.value; drawCx(); } else if (t.id === 'cxDue') { CX.dueOnly = t.checked; drawCx(); } });
document.addEventListener('click', e => { const v = e.target.closest('[data-cxv]'); if (v) { CX.view = v.dataset.cxv; drawCx(); return; }
  if (e.target.closest('[data-cxreset]')) { cxTile(''); drawCx(); } });
