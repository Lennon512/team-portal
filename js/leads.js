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
function leadCalc(l) {
  const cs = LD.cs[l.club_id] || [], n = cs.length, made = cs.filter(x => x.made).length;
  const last = cs[0] || null, first = cs[n - 1] || null, age = daysAgo(l.added_on), dc = last ? daysAgo(dayOf(last.contacted_at)) : null;
  const firstGap = first && l.added_on ? Math.max(0, Math.round((new Date(dayOf(first.contacted_at) + 'T00:00') - new Date(l.added_on + 'T00:00')) / DAY)) : null;   // days from added to first contact
  const st = (l.stage || '').toLowerCase(), booked = l.next_booking && daysAgo(l.next_booking) <= 0;
  let every, step;
  if (booked) { every = null; step = 'Demo booked ' + fmt(l.next_booking); }
  else if (!n) { every = 0; step = 'First contact: they have not heard from us'; }
  else if (/no ?show/.test(st) && age <= 30) { every = 1; step = 'Reschedule the no-show'; }
  else if (age <= 7) { every = 1; step = 'Daily touch in their first week'; }
  else if (/cool|dnr/.test(st) || age > 60) { every = 30; step = 'Monthly check-in'; }
  else if (/missed/.test(st) || age > 30) { every = 7; step = /missed/.test(st) ? 'Weekly follow-up after a missed sale' : 'Weekly check-in'; }
  else { every = 3; step = 'Every 3 days through day 30'; }
  const due = every !== null && (dc === null || dc >= every), fresh = age === null || age <= 30 || (!n && age <= 60);
  return { fresh, n, made, last, first, age, dc, firstGap, every, step, due, booked, urgency: !n ? 1e6 - (age || 0) : every ? dc / every : 0 };
}

function sumLeads() {
  if (LD.missing || !LD.rows.length) { $('memSum').innerHTML = ''; return; }
  const all = LD.rows.map(l => ({ l, c: leadCalc(l) })), due = all.filter(x => x.c.due);
  const wk = all.filter(x => x.c.age !== null && x.c.age <= 7), m30 = all.filter(x => x.c.age !== null && x.c.age <= 30 && x.c.age >= 1);
  const fast = m30.filter(x => x.c.firstGap !== null && x.c.firstGap <= 1).length, same = m30.filter(x => x.c.firstGap === 0).length;
  const att = m30.length ? (m30.reduce((s, x) => s + x.c.n, 0) / m30.length) : 0, never = all.filter(x => !x.c.n).length;
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '-';
  const quiet = all.filter(x => x.c.due && !x.c.fresh).length;
  $('memSum').innerHTML = tile(due.filter(x => x.c.fresh).length, 'Due for follow-up today', `${all.filter(x => x.c.due && !x.c.n && x.c.fresh).length} never contacted`, 'due|') +
    tile(wk.length, 'New leads this week', `${wk.filter(x => !x.c.n).length} not contacted yet`, 'all|week') +
    tile(pct(fast, m30.length), 'Contacted within 1 day', `same day: ${pct(same, m30.length)} • last 30 days`, 'all|month') +
    tile(m30.length ? att.toFixed(1) : '-', 'Attempts per lead', `last 30 days • ${never} never contacted`, 'all|never') +
    tile(quiet, 'Older leads gone quiet', 'over 30 days old, due a check-in', 'win|');
}

const leadName = l => `<b>${esc(l.name || 'Unknown')}</b><small class="nm-sub">${esc([l.source, l.stage].filter(Boolean).join(' • ') || 'No source')}</small>`;
const lastCell = c => c.last ? `<span class="hchip ${heat(c.dc, [1, 3, 7, 14])}"><b>${fmt(dayOf(c.last.contacted_at))}</b> ${ago(c.dc)}</span><small class="nm-sub">${esc([c.last.kind && c.last.kind.replace(/^Club |customer$/gi, '').trim(), c.last.outcome, c.last.staff].filter(Boolean).join(' • '))}</small>` : '<span class="hchip h4">Never</span>';
const attCell = c => `<span class="hchip ${c.n >= 5 ? 'h0' : c.n >= 3 ? 'h1' : c.n ? 'h2' : 'h4'}"><b>${c.n}</b></span>${c.n ? `<small class="nm-sub">${c.made} reached</small>` : ''}`;
const speedTxt = c => c.firstGap === null ? '<span class="muted">-</span>' : c.firstGap === 0 ? '<span class="pace pace-good">Same day</span>' : c.firstGap === 1 ? 'Next day' : `<span class="${c.firstGap > 3 ? 'pace pace-bad' : ''}">${c.firstGap} days</span>`;

function drawLeads() {
  if (LD.missing) { $('memBody').innerHTML = `<div class="pcard"><h3>One-time setup needed</h3><p>${ME.role === 'owner' ? 'Open Supabase → SQL Editor → New query, paste the contents of <a href="https://github.com/Lennon512/team-portal/blob/main/sql/leads.sql" target="_blank" rel="noopener">sql/leads.sql</a>, and click Run. Then refresh this page.' : 'Ask the owner to run the setup.'}</p></div>`; return; }
  if (!LD.rows.length) { $('memBody').innerHTML = '<p class="lead">No leads yet. Add ClubReady’s <b>Leads Added</b> report (with the Contact Log) in Upload reports.</p>'; return; }
  const q = mem.find.toLowerCase(), all = LD.rows.filter(l => !q || (l.name || '').toLowerCase().includes(q) || (l.phone || '').includes(q)).filter(l => mineOk({ club_id: l.club_id })).map(l => ({ l, c: leadCalc(l) }));
  if (mem.g === 'staff') return drawLeadStaff();
  if (mem.g === 'due' || mem.g === 'win') {
    const win = mem.g === 'win', list = all.filter(x => x.c.due && x.c.fresh !== win).sort((a, b) => win ? ((a.c.dc ?? 1e9) < (b.c.dc ?? 1e9) ? 1 : -1) : b.c.urgency - a.c.urgency);
    $('memBody').innerHTML = `<p class="lead mem-lead"><b>${list.length}</b> ${win ? 'older lead' + (list.length === 1 ? '' : 's') + ' (over 30 days) due a check-in, longest without contact first. A short \u201cstill interested?\u201d text works well here.' : 'lead' + (list.length === 1 ? '' : 's') + ' from the last 30 days due for a call or text today, never-contacted first.'} Click a lead for their history.</p>` + (list.length ? `<div class="table-wrap"><table class="mt ldt"><thead><tr><th>Lead</th><th>Added</th><th>Next step</th><th>Attempts</th><th>Last contact</th><th>Phone</th><th>Assigned</th></tr></thead><tbody>` +
      list.map(({ l, c }) => `<tr data-lead="${l.club_id}"><td>${leadName(l)}</td><td>${l.added_on ? fmt(l.added_on) : '-'}<small class="nm-sub">${c.age === null ? '' : 'day ' + (c.age + 1)}</small></td><td>${esc(c.step)}</td><td>${attCell(c)}</td><td>${lastCell(c)}</td><td>${l.phone ? `<a href="tel:${esc(l.phone.replace(/[^\d+]/g, ''))}">${esc(l.phone)}</a>` : '-'}</td><td>${asg({ club_id: l.club_id }) || '<span class="muted">-</span>'}</td></tr>`).join('') + '</tbody></table></div>' : '<p class="lead">Everyone is followed up. Nice work.</p>') +
      `<p class="legend nb-legend"><span class="muted">Cadence: first contact the day they come in • daily in week 1 • every 3 days to day 30 • no-shows the next day • weekly to day 60 and after a missed sale • monthly after that and for cooled/DNR • booked demos skip the list</span></p>`;
    return;
  }
  // All leads, with stage/source filters
  const stages = [...new Set(LD.rows.map(l => l.stage).filter(Boolean))].sort(), srcs = [...new Set(LD.rows.map(l => l.source).filter(Boolean))].sort();
  const quick = mem.quick, rows = all.filter(x => (!LD.stage || x.l.stage === LD.stage) && (!LD.src || x.l.source === LD.src) && (quick === 'week' ? x.c.age <= 7 : quick === 'month' ? x.c.age <= 30 : quick === 'never' ? !x.c.n : true))
    .sort((a, b) => (b.l.added_on || '') < (a.l.added_on || '') ? -1 : 1);
  const qt = { week: 'added in the last 7 days', month: 'added in the last 30 days', never: 'never contacted' }[quick];
  $('memBody').innerHTML = `<div class="ldfilters"><select id="ldStage" aria-label="Stage"><option value="">All stages</option>${stages.map(s => `<option ${s === LD.stage ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select><select id="ldSrc" aria-label="Source"><option value="">All sources</option>${srcs.map(s => `<option ${s === LD.src ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
    <p class="lead mem-lead"><b>${rows.length}</b> lead${rows.length === 1 ? '' : 's'}${qt ? ' ' + qt + ' <button class="linkish" data-quick="">Show all</button>' : ''}, newest first.</p>` +
    (rows.length ? `<div class="table-wrap"><table class="mt ldt"><thead><tr><th>Lead</th><th>Added</th><th>First contact</th><th>Attempts</th><th>Last contact</th><th>Booking</th><th>Added by</th></tr></thead><tbody>` +
      rows.map(({ l, c }) => `<tr data-lead="${l.club_id}"><td>${leadName(l)}</td><td>${l.added_on ? fmt(l.added_on) : '-'}</td><td>${speedTxt(c)}</td><td>${attCell(c)}</td><td>${lastCell(c)}</td><td>${l.next_booking && daysAgo(l.next_booking) <= 0 ? `<span class="pace pace-good">Booked ${fmt(l.next_booking)}</span>` : l.booking_status ? esc(l.booking_status) + (l.booking_date ? ' ' + fmt(l.booking_date) : '') : '<span class="muted">-</span>'}</td><td>${esc(l.added_by || '')}</td></tr>`).join('') + '</tbody></table></div>' : '<p class="lead">No leads match.</p>');
}

// Contacts to leads by each staff member, plus how fast new leads hear from us
function drawLeadStaff() {
  const ids = new Set(LD.rows.map(l => l.club_id)), by = {}, now = Date.now();
  Object.entries(LD.cs).forEach(([id, L]) => { if (!ids.has(+id)) return; L.forEach(x => {
    const d = (now - new Date(x.contacted_at)) / DAY, s = by[x.staff || 'Unknown'] = by[x.staff || 'Unknown'] || { w: 0, m: 0, mm: 0, leads: new Set(), calls: 0, texts: 0 };
    if (d <= 30) { s.m++; if (x.made) s.mm++; s.leads.add(id); if (/call/i.test(x.kind)) s.calls++; else if (/text/i.test(x.kind)) s.texts++; }
    if (d <= 7) s.w++; }); });
  const list = Object.entries(by).filter(([, s]) => s.m).sort((a, b) => b[1].m - a[1].m);
  const recent = LD.rows.map(l => ({ l, c: leadCalc(l) })).filter(x => x.c.age !== null && x.c.age >= 1 && x.c.age <= 30);
  const b = k => recent.filter(x => k(x.c.firstGap)).length, pct = n => recent.length ? Math.round(n / recent.length * 100) + '%' : '-';
  const buckets = [['Same day', g => g === 0, 'h0'], ['Next day', g => g === 1, 'h1'], ['2–3 days', g => g >= 2 && g <= 3, 'h2'], ['4+ days', g => g >= 4, 'h3'], ['Never', g => g === null, 'h4']];
  $('memBody').innerHTML = `<h3 class="sub">How fast new leads hear from us <small class="muted">(leads added in the last 30 days)</small></h3>
    <div class="ldspeed">${buckets.map(([t, k, h]) => `<div class="hchip ${h}"><b>${b(k)}</b>${t} <span class="muted">${pct(b(k))}</span></div>`).join('')}</div>
    <h3 class="sub" style="margin-top:1.2rem">Lead follow-up by staff <small class="muted">(last 30 days)</small></h3>` +
    (list.length ? `<div class="table-wrap"><table class="mt"><thead><tr><th>Staff</th><th>This week</th><th>Last 30 days</th><th>Reached</th><th>Leads worked</th><th>Calls</th><th>Texts</th></tr></thead><tbody>` +
      list.map(([n, s]) => `<tr style="cursor:default"><td><b>${esc(n)}</b></td><td>${s.w}</td><td>${s.m}</td><td>${s.mm} <span class="muted">${Math.round(s.mm / s.m * 100)}%</span></td><td>${s.leads.size}</td><td>${s.calls}</td><td>${s.texts}</td></tr>`).join('') + '</tbody></table></div>' : '<p class="lead">No contacts to leads in the last 30 days.</p>');
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

document.addEventListener('change', e => { if (e.target.id === 'ldStage') { LD.stage = e.target.value; drawLeads(); } else if (e.target.id === 'ldSrc') { LD.src = e.target.value; drawLeads(); } });
