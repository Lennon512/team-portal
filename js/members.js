// ---------- Members (ClubReady reports) ----------
const DAY = 864e5;
let mem = { sec: 'risk', g: 'attn', studio: '', rows: [], nrows: [], nt: {}, staff: [], notes: {}, contacts: {}, meta: null, sort: 'attn', find: '', mine: false, win: 60 };
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
  const attn = r.grp === 'member' && !r.frozen && (label === 'Behind' || (r.credits || 0) >= 4) && !nb && (dc === null || dc > 14);
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
  return { recent, label, nb, attn, why: why.join(' \u2022 ') };
}

const dcell = d => `<td>${d ? fmt(d) : '-'}</td>`;
const nameCell = ({ r, c }) => `<td><b>${esc(r.name)}</b>${r.frozen ? '<span class="pill ice">Frozen</span>' : ''}${c.attn ? '<span class="pill warn">Needs attention</span><div class="why">' + esc(c.why) + '</div>' : ''}</td>`;
const SORTABLE = { 'Unused credits': 'credits', 'Due': 'due', 'Last session': 'last', 'Recent visit': 'last' };
const COLS = {
  member: [['Member', nameCell], ['Unused credits', ({ r }) => `<td>${r.credits ?? 0}</td>`], ['Due', ({ r }) => dcell(r.next_due)],
    ['Amount', ({ r }) => `<td>${r.amount != null ? '$' + Number(r.amount).toFixed(0) : '-'}</td>`], ['Last session', ({ r }) => dcell(r.last_session)],
    ['Recent visit', ({ c }) => `<td class="rvd${c.recent[0]}">${c.recent[1]}</td>`], ['Booked next 7 days', ({ c }) => `<td>${c.nb ? 'Yes' : 'No'}</td>`],
    ['Pace', ({ r, c }) => `<td>${c.label ? c.label + ' (' + (r.sessions_30d || 0) + '/' + r.plan_sessions + ')' : '-'}</td>`],
    ['Last contact', ({ r }) => `<td>${lc(r) ? fmt(lc(r)) : 'None'}</td>`], ['Assigned', ({ r }) => `<td>${asg(r)}</td>`], ['Notes', ({ r }) => `<td class="nt">${noteOf(r)}</td>`]],
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
  $('memAsOf').innerHTML = mem.meta ? `Reports as of ${fmt(mem.meta.as_of)}${old > 7 ? ` <b style="color:var(--danger)">(${old} days old, upload new ones)</b>` : ''}` : 'No reports uploaded yet';
  drawMem();
}

const tile = (n, l, sub) => `<div><b>${n}</b>${l}${sub ? `<br><span>${sub}</span>` : ''}</div>`;
function sumRisk() {
  if (!mem.meta) { $('memSum').innerHTML = ''; return; }
  const m = mem.rows.filter(r => r.grp === 'member' && !r.frozen).map(r => ({ r, c: calc(r) })), fl = m.filter(x => x.c.attn);
  const due7 = fl.filter(x => x.r.next_due && daysAgo(x.r.next_due) <= 0 && daysAgo(x.r.next_due) >= -7).length;
  const money = fl.reduce((n, x) => n + (+x.r.amount || 0), 0);
  const cold = m.filter(x => { const d = daysAgo(x.r.last_session); return d === null || d > 30; }).length;
  $('memSum').innerHTML = tile(m.length, 'Members being charged') + tile(fl.length, 'Need attention', '$' + Math.round(money).toLocaleString() + ' in upcoming invoices') + tile(due7, 'Flagged and billing within 7 days') + tile(cold, 'No visit in 30+ days');
}
function sumNew() {
  if (!mem.nrows.length) { $('memSum').innerHTML = ''; return; }
  const rs = mem.nrows.filter(r => daysAgo(r.signed_on) <= mem.win).map(r => ({ r, c: nmCalc(r) })), act = rs.filter(x => !x.r.cancelled), cx = rs.length - act.length;
  const avg = act.length ? Math.round(act.reduce((n, x) => n + x.c.pct, 0) / act.length) : 0;
  const old = rs.filter(x => !x.r.is_package && daysAgo(x.r.signed_on) >= 30), made = old.filter(x => x.c.m2 === 'Yes').length;
  $('memSum').innerHTML = tile(act.length, 'Active new members', mem.win < 9999 ? 'signed up in the last ' + mem.win + ' days' : 'all signups') + tile(avg + '%', 'Average progress', 'active members') +
    tile(cx, 'Cancelled', rs.length ? Math.round(100 * cx / rs.length) + '% of signups' : '') + tile(old.length ? made + ' of ' + old.length : '-', 'Made it to month 2', 'signed up 30+ days ago');
}
const mineOk = r => !mem.mine || (mem.notes[r.club_id] || {}).assigned_to === ME.id;

function drawMem() {
  document.querySelectorAll('#memTabs button').forEach(b => b.classList.toggle('on', b.dataset.sec === mem.sec));
  $('memSubs').innerHTML = SUBS[mem.sec].map(x => `<button data-g="${x[0]}" class="${mem.g === x[0] ? 'on' : ''}">${x[1]}</button>`).join('');
  mem.sec === 'risk' ? sumRisk() : sumNew();
  $('memWin').hidden = mem.g !== 'list';
  if (mem.g === 'list') { $('memSort').hidden = true; return drawNew(); }
  const g = mem.g === 'attn' ? 'member' : mem.g, q = mem.find.toLowerCase();
  $('memSort').hidden = g !== 'member'; $('memSort').value = mem.sort;
  const all = mem.rows.filter(r => r.grp === g);
  const rows = all.filter(r => (!q || r.name.toLowerCase().includes(q)) && mineOk(r)).map(r => ({ r, c: calc(r) })).filter(x => mem.g !== 'attn' || x.c.attn);
  const by = { attn: (a, b) => (b.c.attn - a.c.attn) || (b.r.credits - a.r.credits), credits: (a, b) => b.r.credits - a.r.credits, due: (a, b) => (a.r.next_due || 'z') < (b.r.next_due || 'z') ? -1 : 1, last: (a, b) => (a.r.last_session || '') < (b.r.last_session || '') ? -1 : 1 };
  rows.sort(g === 'member' ? by[mem.sort] : g === 'package' ? (a, b) => a.r.credits - b.r.credits : (a, b) => (b.r.signed_on || '') < (a.r.signed_on || '') ? -1 : 1);
  const attn = rows.filter(x => x.c.attn).length, fz = all.filter(r => r.frozen).length;
  const blurb = { member: 'Flagged when a member is behind pace or holds 4+ unused credits, has nothing booked in the next 7 days, and has had no contact in 14 days. Click a column heading to sort.' + (fz ? ' ' + fz + ' frozen members are listed but never flagged.' : ''),
    check: `${all.length} recent signups with monthly billing but no invoice coming due. Worth a look in ClubReady.`,
    package: `${all.length} people on packages instead of memberships, fewest credits first. They need a nudge to join.` }[g];
  const cols = COLS[g];
  $('memBody').innerHTML = mem.meta ? `<p class="lead">${blurb}</p>` + (rows.length ? `<div class="table-wrap"><table class="mt"><thead><tr>${cols.map(c => { const k = g === 'member' && SORTABLE[c[0]]; return k ? `<th data-sort=\"${k}\" class=\"${mem.sort === k ? 'on' : ''}\" title=\"Sort by ${c[0].toLowerCase()}\">${c[0]}${mem.sort === k ? ' \u25BE' : ''}</th>` : `<th>${c[0]}</th>`; }).join('')}</tr></thead><tbody>${rows.map(x => `<tr data-m="${x.r.club_id}">${cols.map(c => c[1](x)).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="lead">Nothing here.</p>')
    : '<p class="lead">No reports uploaded for this studio yet.' + (ME.role === 'staff' ? '' : ' Click Upload reports to start.') + '</p>';
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
    <label>Note <textarea id="mNote" maxlength="600">${noteOf(r)}</textarea></label>
    <label>Assigned to <select id="mAsg"><option value="">Nobody yet</option>${mem.staff.map(x => `<option value="${x.id}" ${x.id === (mem.notes[id] || {}).assigned_to ? 'selected' : ''}>${esc(x.full_name)}</option>`).join('')}</select></label>
    <div class="acts"><button data-act="mSave" data-id="${id}">Save note</button></div>
    <h3 class="sub" style="margin-top:1.25rem">Log a contact</h3>
    <label>Date <input id="cDate" type="date" value="${todayStr()}"></label>
    <label>How <select id="cHow"><option>Call</option><option>Text</option><option>In person</option><option>Email</option></select></label>
    <label>What happened <input id="cWhat" maxlength="200" placeholder="Left voicemail, booked for Thursday..."></label>
    <div class="acts"><button data-act="mLog" data-id="${id}">Log contact</button><button class="quiet" data-act="close">Close</button></div>
    <div id="mErr" style="color:var(--danger)" role="alert"></div>` +
    (hist.length ? '<h3 class="sub" style="margin-top:1rem">Contacts logged in the portal</h3>' + hist.map(c => `<p style="margin:.2rem 0">${fmt(c.contacted_on)} \u2022 ${esc(c.method || '')}${c.note ? ' \u2022 ' + esc(c.note) : ''}</p>`).join('') : '');
  if (!$('dlg').open) $('dlg').showModal();
}

// ----- upload and import -----
const KINDS = { members: ['User ID', 'Unused Credits'], invoices: ['Invoice ID', 'Due Date', 'Invoice Type'], bookings: ['Booking Event', 'Booking Date', 'Current Status'], contacts: ['Client User ID', 'Contact Date'], agreements: ['Gross Down', 'Description', 'Customer'] };
const LABEL = { members: 'Members by Session Type', invoices: 'Invoices Coming Due', bookings: 'Booking Events Log', contacts: 'Contact Log', agreements: 'Agreements Log' };

function upForm() {
  imp = { data: {}, store: null, asOf: null };
  $('dlgBody').innerHTML = `<h2>Upload ClubReady reports</h2>
    <p class="lead" style="margin:.25rem 0 1rem">For ${esc(studio(mem.studio))}. Select all the reports at once. Members and Invoices are required. The Agreements Log powers the signup and package reports.</p>
    <label>Files <input id="upFiles" type="file" multiple accept=".xlsx"></label><div id="upList"></div>
    <div id="mErr" style="color:var(--danger)" role="alert"></div>
    <div class="acts"><button data-act="upGo" id="upGo" disabled>Import</button><button class="quiet" data-act="close">Cancel</button></div>`;
  $('upFiles').onchange = readFiles;
  $('dlg').showModal();
}

async function readFiles() {
  imp = { data: {}, store: null, asOf: null };
  const lines = [];
  for (const f of $('upFiles').files) {
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
      const sm = f.name.match(/_(\d{4,6})(?=[_.])/); if (sm) imp.store = sm[1];
      const dm = f.name.match(/_-_\d{4}-\d{2}-\d{2}_-_(\d{4}-\d{2}-\d{2})/);
      if (dm && kind !== 'invoices' && (!imp.asOf || dm[1] > imp.asOf)) imp.asOf = dm[1];
    } catch (e) { lines.push(`\u2717 ${esc(f.name)}: could not be read`); }
  }
  const loc = locs.find(x => x.id === mem.studio);
  let err = '';
  if (!imp.data.members || !imp.data.invoices) err = 'Add the Members by Session Type and Invoices Coming Due reports.';
  else if (loc && loc.club_store_id && imp.store && loc.club_store_id !== imp.store) err = `These files are for ClubReady store ${imp.store}, but ${loc.name} is store ${loc.club_store_id}. Pick the right studio.`;
  $('upList').innerHTML = '<p style="margin:.5rem 0">' + lines.join('<br>') + '</p>' + (imp.asOf ? `<p class="lead" style="margin:0 0 .5rem">Data through ${fmt(imp.asOf)}</p>` : '');
  $('mErr').textContent = err; $('upGo').disabled = !!err;
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
  const nm = (id, f, l) => { if (!names[id] && (f || l)) names[id] = `${f || ''} ${l || ''}`.trim(); };
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
$('memSubs').onclick = e => { const b = e.target.closest('[data-g]'); if (b) { mem.g = b.dataset.g; drawMem(); } };
$('memWin').onchange = e => { mem.win = +e.target.value; drawMem(); };
$('memMine').onchange = e => { mem.mine = e.target.checked; drawMem(); };
$('memBody').onchange = async e => {
  const c = e.target, id = c.dataset.id, f = c.dataset.nt; if (!f) return;
  const { error } = await db.from('new_member_tasks').upsert({ studio_id: mem.studio, club_id: +id, [f]: c.checked, updated_by: ME.id, updated_at: new Date().toISOString() }, { onConflict: 'studio_id,club_id' });
  if (error) { c.checked = !c.checked; alert('Could not save that. ' + error.message); return; }
  (mem.nt[id] = mem.nt[id] || {})[f] = c.checked; drawNew();
};
$('memSort').onchange = e => { mem.sort = e.target.value; drawMem(); };
$('memFind').oninput = e => { mem.find = e.target.value; drawMem(); };
$('memStudio').onchange = e => { mem.studio = e.target.value; loadMem(); };
$('memUp').onclick = upForm;
$('memBody').onclick = e => { const th = e.target.closest('th[data-sort]'); if (th) { mem.sort = th.dataset.sort; drawMem(); return; } if (e.target.closest('input')) return; const tr = e.target.closest('[data-m]'); if (tr) memCard(tr.dataset.m); };

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
