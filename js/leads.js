// ---------- Members > Leads: prospects and how well we follow up ----------
// Data: lead_snapshot (ClubReady "Leads Added" + their latest booking) and lead_contacts (every
// Contact Log entry for those leads). Both are refreshed by the same Upload reports window.
const LD = { rows: [], cs: {}, missing: false, stage: '', src: '' };

async function loadLeads() {
  const [a, b] = await Promise.all([
    db.from('lead_snapshot').select('*').eq('studio_id', mem.studio).limit(3000),
    db.from('lead_contacts').select('club_id,contacted_at,staff,kind,made,outcome').eq('studio_id', mem.studio).order('contacted_at', { ascending: false }).limit(10000)]);
  LD.missing = !!(a.error && /relation|does not exist|schema cache/i.test(a.error.message));
  LD.rows = a.data || []; LD.cs = {};
  (b.data || []).forEach(x => (LD.cs[x.club_id] = LD.cs[x.club_id] || []).push(x));
  Object.values(LD.cs).forEach(L => L.sort((x, y) => x.contacted_at < y.contacted_at ? 1 : -1));   // newest first
}

const dayOf = t => t ? ymd(new Date(t)) : null;
// How often a lead should hear from us, based on how new they are and where they stand
// Stage groups. Cooled is the same as Unscheduled; DNR means do not contact.
const LD_GRPS = [['all', 'All stages'], ['unsched', 'Unscheduled / cooled'], ['noshow', 'No show'], ['missed', 'Missed sale'], ['sched', 'Scheduled'], ['other', 'Other']];
const leadGrp = s => { s = (s || '').toLowerCase(); return /dnr|do not/.test(s) ? 'dnr' : /missed/.test(s) ? 'missed' : /no ?show/.test(s) ? 'noshow' : /^sched/.test(s) ? 'sched' : (!s || /cool|unsched/.test(s)) ? 'unsched' : 'other'; };
const isDnr = l => leadGrp(l.stage) === 'dnr';
LD.grp = 'all';

function leadCalc(l) {
  const cs = LD.cs[l.club_id] || [], n = cs.length, made = cs.filter(x => x.made).length;
  const last = cs[0] || null, first = cs[n - 1] || null, age = daysAgo(l.added_on), dc = last ? daysAgo(dayOf(last.contacted_at)) : null;
  const firstGap = first && l.added_on ? Math.max(0, Math.round((new Date(dayOf(first.contacted_at) + 'T00:00') - new Date(l.added_on + 'T00:00')) / DAY)) : null;   // days from added to first contact
  const st = (l.stage || '').toLowerCase(), booked = l.next_booking && daysAgo(l.next_booking) <= 0;
  let every, step;
  if (isDnr(l)) { every = null; step = 'Do not contact (DNR)'; }
  else if (booked) { every = null; step = 'Demo booked ' + fmt(l.next_booking); }
  else if (!n) { every = 0; step = 'First contact: they have not heard from us'; }
  else if (/no ?show/.test(st) && age <= 30) { every = 1; step = 'Reschedule the no-show'; }
  else if (age <= 7) { every = 1; step = 'Daily touch in their first week'; }
  else if (age > 60) { every = 30; step = 'Monthly check-in'; }
  else if (/missed/.test(st) || age > 30) { every = 7; step = /missed/.test(st) ? 'Weekly follow-up after a missed sale' : 'Weekly check-in'; }
  else { every = 3; step = 'Every 3 days through day 30'; }
  const due = every !== null && (dc === null || dc >= every), fresh = age === null || age <= 30;
  return { fresh, n, made, last, first, age, dc, firstGap, every, step, due, booked, urgency: !n ? 1e6 - (age || 0) : every ? dc / every : 0 };
}

// Lead age groups shown as filter chips
const LD_AGES = [['all', 'All', () => true], ['1', 'New (0–1 day)', a => a <= 1], ['7', '2–7 days', a => a >= 2 && a <= 7], ['30', '8–30 days', a => a >= 8 && a <= 30], ['60', '31–60 days', a => a >= 31 && a <= 60], ['old', '60+ days', a => a > 60]];
const LD_SORTS = { new: 'Newest first', old: 'Oldest first', quiet: 'Longest since last contact', most: 'Most contacts', least: 'Fewest contacts' };
Object.assign(LD, { age: 'all', sort: 'new', dueOnly: false, never: false });

function sumLeads() {
  if (LD.missing || !LD.rows.length) { $('memSum').innerHTML = ''; return; }
  const all = LD.rows.filter(l => !isDnr(l)).map(l => ({ l, c: leadCalc(l) }));
  const wk = all.filter(x => x.c.age !== null && x.c.age <= 7), m30 = all.filter(x => x.c.age !== null && x.c.age <= 30 && x.c.age >= 1);
  const fast = m30.filter(x => x.c.firstGap !== null && x.c.firstGap <= 1).length, same = m30.filter(x => x.c.firstGap === 0).length;
  const att = m30.length ? (m30.reduce((s, x) => s + x.c.n, 0) / m30.length) : 0;
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '-';
  const dueNew = all.filter(x => x.c.due && x.c.fresh), quiet = all.filter(x => x.c.due && !x.c.fresh).length;
  $('memSum').innerHTML = tile(wk.length, 'New leads this week', `${wk.filter(x => !x.c.n).length} not contacted yet`, 'L|week') +
    tile(pct(fast, m30.length), 'Speed to lead: within 1 day', `same day ${pct(same, m30.length)} • last 30 days`, 'L|speed') +
    tile(m30.length ? att.toFixed(1) : '-', 'Contacts per lead', `average • leads from the last 30 days`, 'L|month') +
    tile(quiet, 'Older leads gone quiet', 'over 30 days old, due a check-in', 'L|quiet');
}
// Clicking a tile sets the filters below it
function leadTile(q) {
  Object.assign(LD, { age: 'all', dueOnly: false, never: false, sort: 'new', grp: 'all', src: '' });
  if (q === 'due') Object.assign(LD, { dueOnly: true, sort: 'quiet', age: '30w' });
  if (q === 'week') LD.age = '7w';
  if (q === 'speed' || q === 'month') LD.age = '30w';
  if (q === 'quiet') Object.assign(LD, { dueOnly: true, sort: 'quiet', age: 'gt30' });
  LD.fresh = null;
}
LD.fresh = null;

const leadName = (l, c) => `<b>${esc(l.name || 'Unknown')}</b>${c ? `<span class="ldn ${c.n >= 5 ? 'h0' : c.n >= 3 ? 'h1' : c.n ? 'h2' : 'h4'}" title="${c.n} contact${c.n === 1 ? '' : 's'}, ${c.made} reached">${c.n} contact${c.n === 1 ? '' : 's'}</span>` : ''}<small class="nm-sub">${esc([l.source, l.stage].filter(Boolean).join(' • ') || 'No source')}</small>`;
// Color by how long it's been: green (recent) to red (long ago / never)
const lastCell = c => c.last ? `<span class="hchip ${heat(c.dc, [1, 3, 7, 14])}"><b>${fmt(dayOf(c.last.contacted_at))}</b> ${ago(c.dc)}</span>` : '<span class="hchip h4"><b>Never</b></span>';
// The last contact's method (Call / Text / Email / In person), result and who made it, in their own columns
const howOf = k => { k = (k || '').toLowerCase(); return /text|sms/.test(k) ? 'Text' : /call/.test(k) ? 'Call' : /email/.test(k) ? 'Email' : /face|person|visit/.test(k) ? 'In person' : (k ? k.replace(/^club |customer$/g, '').trim() : ''); };
const detailCells = c => c.last ? `<td>${esc(howOf(c.last.kind)) || '<span class="muted">-</span>'}</td><td>${esc(c.last.staff || '') || '<span class="muted">-</span>'}</td>` : '<td><span class="muted">-</span></td><td><span class="muted">-</span></td>';
const ageCell = (l, c) => l.added_on ? `<span class="hchip ${heat(c.age, [1, 7, 30, 60])}"><b>${fmt(l.added_on)}</b> ${c.age <= 0 ? 'today' : c.age === 1 ? '1 day' : c.age + ' days'}</span>` : '-';
const attCell = c => `<span class="hchip ${c.n >= 5 ? 'h0' : c.n >= 3 ? 'h1' : c.n ? 'h2' : 'h4'}"><b>${c.n}</b>${c.n ? c.made + ' reached' : ''}</span>`;
const speedCell = c => c.firstGap === null ? '<span class="hchip h4"><b>Not yet</b></span>' : `<span class="hchip ${c.firstGap === 0 ? 'h0' : c.firstGap === 1 ? 'h1' : c.firstGap <= 3 ? 'h2' : 'h3'}"><b>${c.firstGap === 0 ? 'Same day' : c.firstGap === 1 ? 'Next day' : c.firstGap + ' days'}</b></span>`;

// Averages for the leads currently shown: speed to first contact and contacts per lead
function speedStrip(rows) {
  const got = rows.filter(x => x.c.firstGap !== null), n = rows.length, pct = k => n ? Math.round(k / n * 100) + '%' : '-';
  const avgDays = got.length ? got.reduce((s, x) => s + x.c.firstGap, 0) / got.length : null;
  const same = rows.filter(x => x.c.firstGap === 0).length, day1 = rows.filter(x => x.c.firstGap !== null && x.c.firstGap <= 1).length, never = rows.filter(x => !x.c.n).length;
  const per = n ? rows.reduce((s, x) => s + x.c.n, 0) / n : 0, reached = rows.reduce((s, x) => s + x.c.made, 0), tot = rows.reduce((s, x) => s + x.c.n, 0);
  return `<div class="ldstats"><div><small>Average speed to lead</small><b>${avgDays === null ? '-' : avgDays < .5 ? 'Same day' : avgDays.toFixed(1) + ' days'}</b></div>
    <div><small>Same day</small><b>${pct(same)}</b></div><div><small>Within 1 day</small><b>${pct(day1)}</b></div>
    <div><small>Contacts per lead</small><b>${per.toFixed(1)}</b></div><div><small>Reached</small><b>${tot ? Math.round(reached / tot * 100) + '%' : '-'}</b></div>
    <div><small>Never contacted</small><b class="${never ? 'bad' : ''}">${never}</b></div></div>`;
}

function drawLeads() {
  if (LD.missing) { $('memBody').innerHTML = `<div class="pcard"><h3>One-time setup needed</h3><p>${ME.role === 'owner' ? 'Open Supabase → SQL Editor → New query, paste the contents of <a href="https://github.com/Lennon512/team-portal/blob/main/sql/leads.sql" target="_blank" rel="noopener">sql/leads.sql</a>, and click Run. Then refresh this page.' : 'Ask the owner to run the setup.'}</p></div>`; return; }
  if (!LD.rows.length) { $('memBody').innerHTML = '<p class="lead">No leads yet. Add ClubReady’s <b>Leads Added</b> report (with the Contact Log) in Upload reports.</p>'; return; }
  const q = mem.find.toLowerCase(), ageOk = a => LD.age === '7w' ? a <= 7 : LD.age === '30w' ? a <= 30 : LD.age === 'gt30' ? a > 30 : (LD_AGES.find(x => x[0] === LD.age) || LD_AGES[0])[2](a);
  const base = LD.rows.filter(l => (!q || (l.name || '').toLowerCase().includes(q) || (l.phone || '').includes(q)) && mineOk({ club_id: l.club_id }) && !isDnr(l) && (!LD.src || l.source === LD.src)).map(l => ({ l, c: leadCalc(l) }));
  const grpOk = x => LD.grp === 'all' || leadGrp(x.l.stage) === LD.grp;
  const rows = base.filter(x => grpOk(x) && ageOk(x.c.age ?? 0) && (!LD.dueOnly || x.c.due) && (!LD.never || !x.c.n));
  const S = { new: (a, b) => (b.l.added_on || '') < (a.l.added_on || '') ? -1 : 1, old: (a, b) => (a.l.added_on || '') < (b.l.added_on || '') ? -1 : 1,
    quiet: (a, b) => (b.c.dc ?? 1e9) - (a.c.dc ?? 1e9) || ((b.l.added_on || '') < (a.l.added_on || '') ? -1 : 1), most: (a, b) => b.c.n - a.c.n, least: (a, b) => a.c.n - b.c.n };
  rows.sort(S[LD.sort] || S.new);
  const gcnt = g => base.filter(x => (g === 'all' || leadGrp(x.l.stage) === g) && ageOk(x.c.age ?? 0) && (!LD.dueOnly || x.c.due) && (!LD.never || !x.c.n)).length;
  const cnt = k => base.filter(x => grpOk(x) && (k === '7w' ? x.c.age <= 7 : k === '30w' ? x.c.age <= 30 : k === 'gt30' ? x.c.age > 30 : (LD_AGES.find(y => y[0] === k) || LD_AGES[0])[2](x.c.age ?? 0)) && (!LD.dueOnly || x.c.due)).length;
  const srcs = [...new Set(LD.rows.map(l => l.source).filter(Boolean))].sort();
  const ds = base.map(x => x.l.added_on).filter(Boolean).sort(), span = ds.length ? fmt(ds[0]) + ' \u2013 ' + fmt(ds[ds.length - 1]) : '';
  const filtered = LD.age !== 'all' || LD.grp !== 'all' || LD.dueOnly || LD.never || LD.src;
  const ageLbl = LD.age === '7w' ? 'Last 7 days' : LD.age === '30w' ? 'Last 30 days' : LD.age === 'gt30' ? 'Over 30 days' : null;
  $('memBody').innerHTML = `<div class="ldbar"><span class="tabs ldages">${LD_AGES.map(([k, t]) => `<button type="button" data-ldage="${k}" class="${LD.age === k ? 'on' : ''}">${t} <small>${cnt(k)}</small></button>`).join('')}${ageLbl ? `<button type="button" class="on">${ageLbl} <small>${cnt(LD.age)}</small></button>` : ''}</span></div>
    <div class="ldbar"><span class="tabs ldages ldgrps">${LD_GRPS.filter(([g]) => g === 'all' || g === LD.grp || gcnt(g)).map(([g, t]) => `<button type="button" data-ldgrp="${g}" class="${LD.grp === g ? 'on' : ''}">${t} <small>${gcnt(g)}</small></button>`).join('')}</span></div>
    <div class="ldfilters"><select id="ldSort" aria-label="Sort">${Object.entries(LD_SORTS).map(([k, t]) => `<option value="${k}" ${LD.sort === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select id="ldSrc" aria-label="Source"><option value="">All sources</option>${srcs.map(s => `<option ${s === LD.src ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <label class="mem-mine"><input type="checkbox" id="ldDue" ${LD.dueOnly ? 'checked' : ''}> Due for follow-up only</label>
      <label class="mem-mine"><input type="checkbox" id="ldNever" ${LD.never ? 'checked' : ''}> Never contacted</label></div>
    <p class="lead mem-lead">Showing <b>${rows.length}</b> of <b>${base.length}</b> leads${span ? ' added ' + span : ''}${LD.dueOnly ? ', only those due for a call or text' : ''}${LD.never ? ', only never contacted' : ''}, ${LD_SORTS[LD.sort].toLowerCase()}.${filtered ? ' <button class="linkish" data-ldreset="1">Clear filters</button>' : ''} Click a lead for their full history.</p>` +
    (rows.length ? speedStrip(rows) : '') +
    (rows.length ? `<div class="table-wrap"><table class="mt ldt"><thead><tr><th>Lead</th><th>Contacts</th><th>Added</th><th>Last contact</th><th>How</th><th>By</th></tr></thead><tbody>` +
      rows.map(({ l, c }) => `<tr data-lead="${l.club_id}" class="${c.due ? 'lddue' : ''}"><td>${leadName(l)}</td><td>${attCell(c)}</td><td>${ageCell(l, c)}</td><td>${lastCell(c)}</td>${detailCells(c)}</tr>`).join('') + '</tbody></table></div>' : '<p class="lead">No leads match these filters.</p>') +
    `<p class="legend nb-legend"><span><i class="hchip h0"></i>Today / 1 day</span><span><i class="hchip h1"></i>2–3 days</span><span><i class="hchip h2"></i>4–7</span><span><i class="hchip h3"></i>8–14</span><span><i class="hchip h4"></i>15+ or never</span><span class="muted">(last contact). Added: 1 / 7 / 30 / 60 days..</span></p>`;
}

function leadCard(id) {
  const l = LD.rows.find(x => x.club_id == id); if (!l) return;
  const c = leadCalc(l), cs = LD.cs[l.club_id] || [];
  $('dlgBody').innerHTML = `<h2>${esc(l.name || 'Lead')}</h2><p class="lead" style="margin:.25rem 0 .8rem">${esc([l.source, l.stage, l.added_on ? 'added ' + fmt(l.added_on) : '', l.added_by ? 'by ' + l.added_by : ''].filter(Boolean).join(' • '))}</p>
    <p style="margin:0 0 .8rem">${l.phone ? `<a href="tel:${esc(l.phone.replace(/[^\d+]/g, ''))}">${esc(l.phone)}</a>` : ''}${l.phone && l.email ? ' • ' : ''}${l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : ''}</p>
    <p style="margin:0 0 1rem"><b>Next step:</b> ${esc(c.step)}${c.due ? ' <span class="pill warn">Due today</span>' : ''}</p>
    <h3 class="sub">Note and owner</h3>
    <label>Note <textarea id="mNote" maxlength="600" placeholder="What they want, best time to reach them">${noteOf({ club_id: l.club_id })}</textarea></label>
    <label>Assigned to <select id="mAsg"><option value="">Nobody yet</option>${mem.staff.map(x => `<option value="${x.id}" ${x.id === (mem.notes[l.club_id] || {}).assigned_to ? 'selected' : ''}>${esc(x.full_name)}</option>`).join('')}</select></label>
    <div class="acts"><button class="quiet" data-act="mSave" data-id="${l.club_id}">Save note</button><button class="quiet" data-act="close">Close</button></div><div id="mErr" style="color:var(--danger)" role="alert"></div>
    <h3 class="sub" style="margin-top:1.2rem">Contact history <small class="muted">${cs.length} attempt${cs.length === 1 ? '' : 's'}, ${c.made} reached</small></h3>` +
    (cs.length ? '<ul class="mhist">' + cs.slice(0, 25).map(x => `<li><b>${new Date(x.contacted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</b> ${esc((x.kind || '').replace(/^Club |customer$/gi, '').trim())}${x.outcome ? ' • ' + esc(x.outcome) : ''}${x.staff ? ' <span class="muted">• ' + esc(x.staff) + '</span>' : ''}</li>`).join('') + '</ul>' : '<p class="lead">No contact on record yet.</p>');
  if (!$('dlg').open) $('dlg').showModal();
}

// ----- import: build lead rows and their contacts from the uploaded reports -----
function buildLeads() {
  const { leads = [], contacts = [], bookings = [] } = imp.data, ids = new Set(), rows = [];
  leads.forEach(r => { const id = +r['User ID']; if (!id || ids.has(id)) return; ids.add(id);
    rows.push({ studio_id: mem.studio, club_id: id, name: `${r['First Name'] || ''} ${r['Last Name'] || ''}`.replace(/\s+/g, ' ').trim(), added_on: toDay(r['Date Added']),
      source: r['Referral Type'] || null, stage: r['Prospect Type'] || null, added_by: r['Added By'] || null, phone: String(r['Cell Phone'] || r['Phone'] || '').trim() || null, email: r['Email'] || null,
      booking_status: null, booking_date: null, next_booking: null, updated_at: new Date().toISOString() }); });
  const today = todayStr(), byId = Object.fromEntries(rows.map(r => [r.club_id, r]));
  bookings.forEach(b => { const r = byId[+b['User ID']]; if (!r) return; const d = toDay(b['Booking Date']), st = String(b['Current Status'] || '').trim(); if (!d) return;
    if (/^open/i.test(st) && d >= today) { if (!r.next_booking || d < r.next_booking) r.next_booking = d; }
    else if (!r.booking_date || d > r.booking_date) { r.booking_date = d; r.booking_status = st.replace(/\s*\(.*\)$/, '') || null; } });
  const cs = contacts.filter(x => ids.has(+x['Client User ID'])).map(x => { const t = toDT(x['Contact Date']); return t && { studio_id: mem.studio, club_id: +x['Client User ID'], contacted_at: t.toISOString(),
    staff: `${x['Staff First Name'] || ''} ${x['Staff Last Name'] || ''}`.trim() || null, kind: x['Contact Type'] || null, made: /^y/i.test(String(x['Contact Made'] || '')), outcome: x['Outcome'] || null }; }).filter(Boolean);
  return { rows, cs };
}
async function saveLeads() {
  const { rows, cs } = buildLeads(), chunk = async (t, L) => { for (let i = 0; i < L.length; i += 500) { const { error } = await db.from(t).insert(L.slice(i, i + 500)); if (error) return error; } };
  let r = await db.from('lead_snapshot').delete().eq('studio_id', mem.studio); if (r.error) return r.error;
  r = await db.from('lead_contacts').delete().eq('studio_id', mem.studio); if (r.error) return r.error;
  return (await chunk('lead_snapshot', rows)) || (await chunk('lead_contacts', cs)) || null;
}

document.addEventListener('change', e => { const t = e.target, m = { ldSrc: 'src', ldSort: 'sort' }[t.id];
  if (m) { LD[m] = t.value; drawLeads(); } else if (t.id === 'ldDue') { LD.dueOnly = t.checked; drawLeads(); } else if (t.id === 'ldNever') { LD.never = t.checked; drawLeads(); } });
document.addEventListener('click', e => { const a = e.target.closest('[data-ldage]'); if (a) { LD.age = a.dataset.ldage; drawLeads(); return; }
  const g = e.target.closest('[data-ldgrp]'); if (g) { LD.grp = g.dataset.ldgrp; drawLeads(); return; }
  if (e.target.closest('[data-ldreset]')) { leadTile(''); drawLeads(); } });
