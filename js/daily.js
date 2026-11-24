// ---------- Daily & Weekly (replaces the DPR) ----------
// Mirrors the team's V4 Regional Report: a Daily Log filled once per studio per day, a morning
// review with one focus per studio, and weekly / month-to-date / last-30-day reviews.
const numOrNull = v => { v = String(v).trim(); return v === '' || isNaN(+v) ? null : +v; };
const DL = { day: '', studio: '', rows: [], pay: [], tgt: {}, from: '', to: '', missing: false, period: 'week', anchor: '', mAnchor: '', err: '' };
// The Monthly tab is the same review as Weekly, locked to whole calendar months (this month: to date); Weekly has no month-to-date option
const dlMonthly = () => REP.sub === 'monthly', dlPer = () => dlMonthly() ? 'mtd' : DL.period === 'mtd' ? 'week' : DL.period, dlAnc = () => (dlMonthly() ? DL.mAnchor : DL.anchor) || dAdd(todayStr(), -1);
// Inputs in the order of the spreadsheet's Daily Log
const DLF = [
  ['Money', [['revenue', 'Revenue / collections', '$'], ['new_eft', 'New EFT added', '$'], ['refunds', 'Refunds / chargebacks', '$'], ['payroll', 'Payroll', '$']]],
  ['Sales funnel', [['leads', 'Leads'], ['contacts', 'Contacts'], ['demos_booked', 'Demos booked'], ['demos_held', 'Demos held'], ['agreements', 'New sales', '', 'no previous agreements']]],
  ['Members', [['reactivations', 'Reactivations', '', 'had an agreement before'], ['cancellations', 'Cancellations'], ['freezes', 'Freezes'], ['active_members', 'Active members', '', 'invoices in the next 30 days']]],
  ['Schedule', [['slots_available', 'Available stretch slots'], ['stretches_completed', 'Completed stretches'], ['staff_util', 'Staff utilization', '', '1 = 100%']]]];
const DL_NUM = DLF.flatMap(g => g[1].map(f => f[0])).filter(k => k !== 'payroll' && k !== 'staff_util');
const DEF_T = { revenue_goal: null, labor_max: .4, l2d_target: .5, show_target: .8, close_target: .4, attrition_max: .1, contacts_target: 50, util_target: .65, nmg_target: 6,
  leads_target: null, booked_target: null, held_target: null, sales_target: null, cancels_max: null, react_target: null };   // daily goals (set in Targets)
const FOCUSES = ["Complete yesterday's data", 'Lead follow-up & booking', 'Confirmations & show rate', 'Consult execution & closing', 'Member retention', 'Outbound activity', 'Schedule fill & rebooking', 'Protect momentum'];

const dAdd = (d, n) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + n); return ymd(x); };
const dLong = d => new Date(d + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const money = v => v === null || v === undefined || isNaN(v) ? '–' : '$' + Math.round(v).toLocaleString();
const pctf = v => v === null || v === undefined || !isFinite(v) ? '–' : Math.round(v * 100) + '%';
const numf = (v, d = 0) => v === null || v === undefined || !isFinite(v) ? '–' : (+v).toFixed(d).replace(/\.0+$/, '');
const tgtOf = sid => ({ ...DEF_T, ...(DL.tgt[sid] || {}) });
const canWrite = sid => ME.role === 'owner' || (ME.role === 'manager' && ME.location_id === sid);
const payOk = sid => ME.role === 'owner' || (ME.role === 'manager' && ME.location_id === sid);
const dlStudios = () => locs.filter(l => !(DL.tclosed && DL.tclosed.has(l.id)));   // temporarily closed studios are left out
const monday = d => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };

// ----- data -----
async function dlFetch(from, to) {
  if (DL.from && from >= DL.from && to <= DL.to) return;
  const f = DL.from && DL.from < from ? DL.from : from, t = DL.to && DL.to > to ? DL.to : to;
  const [a, b, c, si] = await Promise.all([db.from('daily_log').select('*').gte('day', f).lte('day', t).limit(5000), db.from('daily_payroll').select('*').gte('day', f).lte('day', t).limit(5000), db.from('studio_targets').select('*'),
    db.from('studio_info').select('location_id,temp_closed').eq('temp_closed', true)]);
  DL.tclosed = new Set(si.error ? [] : (si.data || []).map(x => x.location_id));
  if (a.error) { DL.missing = /does not exist|relation|schema cache/i.test(a.error.message); DL.err = a.error.message; DL.rows = []; return; }
  DL.missing = false; DL.err = ''; DL.rows = a.data || []; DL.pay = b.error ? [] : (b.data || []); DL.from = f; DL.to = t;
  DL.tgt = {}; (c.data || []).forEach(x => DL.tgt[x.studio_id] = x);
}
const rowOf = (sid, d) => DL.rows.find(r => r.studio_id === sid && r.day === d);
// A day counts as entered once a manager has added revenue (or marked it closed). The rest fills in from ClubReady.
const entered = r => !!r && (r.open_day === false || (r.revenue !== null && r.revenue !== undefined));
const payOf = (sid, d) => { const p = DL.pay.find(r => r.studio_id === sid && r.day === d); return p ? p.payroll : null; };

// Totals and rates for one studio over a date range (same formulas as the workbook)
function agg(sid, from, to) {
  const ids = Array.isArray(sid) ? new Set(sid) : null, inS = id => ids ? ids.has(id) : (!sid || id === sid);   // sid can be one studio, a list, or none (all)
  const rs = DL.rows.filter(r => inS(r.studio_id) && r.day >= from && r.day <= to), S = k => rs.reduce((n, r) => n + (+r[k] || 0), 0);
  const ps = DL.pay.filter(r => inS(r.studio_id) && r.day >= from && r.day <= to), payroll = ps.length ? ps.reduce((n, r) => n + (+r.payroll || 0), 0) : null;
  const o = Object.fromEntries(DL_NUM.map(k => [k, S(k)]));
  const act = rs.filter(r => +r.active_members > 0), days = Math.round((new Date(to + 'T00:00') - new Date(from + 'T00:00')) / DAY) + 1;
  o.entries = rs.length; o.payroll = payroll; o.open = rs.filter(r => r.open_day !== false && (r.contacts || r.leads || r.revenue || r.demos_held)).length;
  // Close % = new sales that day from people who've had a Stretching Assessment (any time before) ÷ assessments held that day.
  // Days from before that was tracked (demo_sales empty) fall back to all new sales that day.
  o.demo_sales = rs.reduce((n, r) => n + (r.demo_sales !== null && r.demo_sales !== undefined ? +r.demo_sales : +r.agreements || 0), 0);
  o.l2d = o.leads ? o.demos_booked / o.leads : null; o.show = o.demos_booked ? o.demos_held / o.demos_booked : null; o.close = o.demos_held ? o.demo_sales / o.demos_held : null;
  o.nmg = o.agreements + o.reactivations - o.cancellations;
  o.avgActive = act.length ? act.reduce((n, r) => n + +r.active_members, 0) / act.length : null;
  o.attrition = o.avgActive ? o.cancellations / o.avgActive : null; const su = rs.map(r => r.staff_util).filter(v => v !== null && v !== undefined && v !== '').map(Number);
  o.staff_util = su.length ? su.reduce((n, v) => n + v, 0) / su.length : null;   // ClubReady's Staff Utilization, averaged over the days
  o.util = o.staff_util !== null ? o.staff_util : o.slots_available ? o.stretches_completed / o.slots_available : null;
  o.labor = payroll !== null && o.revenue ? payroll / o.revenue : null; o.cpd = o.open ? o.contacts / o.open : null; o.rpm = o.avgActive ? o.revenue / o.avgActive : null;
  const goals = ids ? [...ids].map(tgtOf) : sid ? [tgtOf(sid)] : dlStudios().map(l => tgtOf(l.id));
  const g = goals.reduce((n, t) => n + (+t.revenue_goal || 0), 0); const fullMonth = from.slice(8) === '01' && to.slice(0, 7) === from.slice(0, 7) && dAdd(to, 1).slice(8) === '01';
  o.goal = g ? (fullMonth ? g : g * 12 / 365 * days) : null;   // a whole calendar month uses the monthly goal as is
  o.gap = o.goal !== null ? o.revenue - o.goal : null; o.days = days;
  return o;
}

// The workbook's "Today's #1 focus" rules, in the same order
function autoFocus(r, t) {
  if (!r) return FOCUSES[0];
  const n = k => +r[k] || 0, l2d = n('leads') ? n('demos_booked') / n('leads') : 0, show = n('demos_booked') ? n('demos_held') / n('demos_booked') : 0, close = n('demos_held') ? n('agreements') / n('demos_held') : 0;
  const nmg = n('agreements') + n('reactivations') - n('cancellations'), util = n('slots_available') ? n('stretches_completed') / n('slots_available') : 0;
  if (!['revenue', 'leads', 'contacts', 'demos_booked', 'demos_held', 'agreements', 'cancellations', 'reactivations'].some(k => n(k))) return FOCUSES[0];
  if (n('leads') >= 5 && l2d < t.l2d_target) return FOCUSES[1];
  if (n('demos_booked') >= 2 && show < t.show_target) return FOCUSES[2];
  if (n('demos_held') >= 2 && close < t.close_target) return FOCUSES[3];
  if (nmg < 0) return FOCUSES[4];
  if (n('contacts') < t.contacts_target) return FOCUSES[5];
  if (util > 0 && util < t.util_target) return FOCUSES[6];
  return FOCUSES[7];
}
function morningMsg(l, d, r, focus, t) {
  const n = k => +(r || {})[k] || 0, a = r ? agg(l.id, d, d) : null, nm = n('agreements') + n('reactivations') - n('cancellations');
  const why = {
    [FOCUSES[0]]: "Yesterday's Daily Log is not complete yet. Please update it first so today's focus is based on real data.",
    [FOCUSES[1]]: `We booked ${pctf(a && a.l2d || 0)} of yesterday's leads vs ${pctf(t.l2d_target)} target. Work every fresh lead quickly and clear the backlog; goal is ${pctf(t.l2d_target)}+ lead-to-demo.`,
    [FOCUSES[2]]: `Our show rate was ${pctf(a && a.show || 0)} vs ${pctf(t.show_target)}. Confirm every demo, send reminders, and immediately rework any no-shows.`,
    [FOCUSES[3]]: `We closed ${pctf(a && a.close || 0)} of held demos vs ${pctf(t.close_target)}. Follow the full consult, connect the recommendation to the client's goals, and ask for the sale.`,
    [FOCUSES[4]]: `NMG was ${nm > 0 ? '+' : ''}${nm} with ${n('cancellations')} cancellation(s). Today, work at-risk members, members with no future appointment, and rebooking before they leave.`,
    [FOCUSES[5]]: `We made ${n('contacts')} contacts vs ${t.contacts_target} target. Get to ${t.contacts_target}+ meaningful contacts today and make sure fresh leads are touched first.`,
    [FOCUSES[6]]: `Utilization was ${pctf(a && a.util || 0)} vs ${pctf(t.util_target)}. Rebook members before they leave and fill today's / next-day white space.`,
    [FOCUSES[7]]: 'The core funnel was on target yesterday. Keep the process tight, rebook every member, and protect today’s pipeline and member experience.' }[focus] || 'Make this the team’s #1 priority today and report progress by end of day.';
  return `Good morning ${l.name}! Quick review from ${d === dAdd(todayStr(), -1) ? 'yesterday (' + fmt(d) + ')' : dLong(d)}:\nRevenue/collections: ${money(n('revenue'))} | Leads: ${n('leads')} | Contacts: ${n('contacts')} | Demos: ${n('demos_booked')} booked / ${n('demos_held')} held | Sales: ${n('agreements')} | NMG: ${nm > 0 ? '+' : ''}${nm}\nToday's #1 focus: ${focus}.\n${why}`;
}

// ----- entry point from the Performance tabs -----
async function loadDpr() {
  const host = $('dlBody'); if (!host) return;
  if (!DL.day) DL.day = dAdd(todayStr(), -1);
  if (!DL.studio) DL.studio = ME.role === 'owner' ? ((locs[0] || {}).id || '') : (ME.location_id || '');
  if (!DL.anchor) DL.anchor = DL.day;
  const weekly = REP.sub === 'weekly' || dlMonthly(), r = weekly ? dlRange() : null;
  const endDay = weekly ? r.to : DL.day, startDay = weekly ? r.pFrom : dAdd(DL.day, -1), mStart = endDay.slice(0, 8) + '01';
  await dlFetch(mStart < startDay ? mStart : startDay, endDay);   // from the 1st of the month too, for the month pace in Analysis & next steps
  if (DL.missing) { host.innerHTML = dlSetupCard(); return; }
  if (DL.err) { host.innerHTML = `<p class="err">Could not load the daily log: ${esc(DL.err)}</p>`; return; }
  weekly ? drawWeekly() : drawDaily();
}
function dlSetupCard() {
  return `<div class="pcard"><h3>One-time setup needed</h3><p>The Daily and Weekly reviews need three new tables in Supabase. ${ME.role === 'owner'
    ? 'Open Supabase → SQL Editor → New query, paste the contents of <a href="https://github.com/Lennon512/team-portal/blob/main/sql/daily_log.sql" target="_blank" rel="noopener">sql/daily_log.sql</a>, and click Run. Then refresh this page.'
    : 'Ask the owner to run the setup, then refresh this page.'}</p></div>`;
}

// ----- DAILY -----
// ----- Review table (Daily and Weekly share it) -----
// Funnel order, every number green when it hits its goal and red when it misses (hover for the goal),
// a Goal row on top and an Austin total at the bottom. "–" means no data; a real zero shows 0 or 0%.
// Per-day goals are multiplied by the days each studio has entries for (1 on the Daily tab).
function dlReview(items, from, to, period) {
  const showLabor = items.some(x => payOk(x.l.id)), per = (k, x) => { const g = x.tt[k]; return g === null || g === undefined || g === '' || isNaN(g) ? null : +g * x.days; };
  const dayGoal = mo => mo ? mo * 12 / 365 : null;
  const fullMonth = from.slice(8) === '01' && to.slice(0, 7) === from.slice(0, 7) && dAdd(to, 1).slice(8) === '01';
  const nmgG = x => { const g = x.tt.nmg_target; return g === null || g === undefined || g === '' || isNaN(g) ? null : fullMonth ? +g : +g * 12 / 365 * x.days; };
  // [key, header, value, format, goal for a studio (x), goal shown in the Goal row (per day), lower is better, is a %]
  const C = (k, h, v, f, g, gd, lower, pct) => ({ k, h, v, f, g, gd, lower, pct });
  const COLS = [
    C('revenue', 'Revenue', x => x.revKnown ? x.a.revenue : null, money, x => x.a.goal, t => dayGoal(+t.revenue_goal)),
    { ...C('contacts', 'Contacts/day', x => x.a.cpd, v => numf(v, v < 10 && v % 1 ? 1 : 0), x => x.tt.contacts_target, t => t.contacts_target), avg: 1 },   // average per open day, not a total
    C('leads', 'Leads', x => x.a.leads, numf, x => per('leads_target', x), t => t.leads_target),
    C('l2d', 'Lead→demo', x => x.a.l2d, pctf, x => x.tt.l2d_target, t => t.l2d_target, false, 1),
    C('booked', 'Booked', x => x.a.demos_booked, numf, x => per('booked_target', x), t => t.booked_target),
    C('show', 'Show %', x => x.a.show, pctf, x => x.tt.show_target, t => t.show_target, false, 1),
    C('held', 'Held', x => x.a.demos_held, numf, x => per('held_target', x), t => t.held_target),
    C('close', 'Close %', x => x.a.close, pctf, x => x.tt.close_target, t => t.close_target, false, 1),
    C('sales', 'Sales', x => x.a.agreements, numf, x => per('sales_target', x), t => t.sales_target),
    C('react', 'React.', x => x.a.reactivations, numf, x => per('react_target', x), t => t.react_target),
    C('cancels', 'Cancels', x => x.a.cancellations, numf, x => per('cancels_max', x), t => t.cancels_max, true),
    { ...C('nmg', 'NMG', x => x.a.nmg, v => (v > 0 ? '+' : '') + v, nmgG, t => dayGoal(+t.nmg_target)), signed: 1 },
    C('active', 'Active', x => x.a.avgActive || null, numf, null, null),
    C('util', 'Util.', x => x.a.util, pctf, x => x.tt.util_target, t => t.util_target, false, 1)];
  if (showLabor) COLS.push(C('labor', 'Labor %', x => payOk(x.l.id) ? x.a.labor : null, pctf, x => payOk(x.l.id) ? x.tt.labor_max : null, t => t.labor_max, true, 1));
  const ok = g => g !== null && g !== undefined && g !== '' && !isNaN(g);
  const tone = (v, g, lower) => v === null || v === undefined || !ok(g) ? '' : (lower ? v <= +g : v >= +g) ? 'good' : 'bad';
  const gfmt = (c, g) => !ok(g) ? '' : c.signed ? (+g > 0 ? '+' : '') + numf(+g, Math.abs(+g) < 10 && +g % 1 ? 1 : 0) : c.pct ? pctf(+g) : c.k === 'revenue' ? money(Math.round(g)) : numf(+g, +g % 1 ? 1 : 0);
  const tip = (c, g) => ok(g) ? ` title="Goal ${c.lower ? 'at most ' : ''}${gfmt(c, g)}"` : '';
  const cell = (c, x) => { const v = c.v(x), g = c.g ? c.g(x) : null;
    if (c.k === 'revenue' && v === null) return `<td>${period === 'day' && canWrite(x.l.id) && !x.closed ? `<button class="linkish" data-dlstudio="${x.l.id}">Add</button>` : '–'}</td>`;
    const k = x.closed ? '' : tone(v, g, c.lower);
    return `<td class="${k}"${x.closed ? '' : tip(c, g)}>${v === null || v === undefined ? '–' : c.f(v)}</td>`; };
  const st = items.map(x => x.l);
  // The Goal row matches the period on screen: per day on Daily, the week on Weekly, the month (or month to date) on Monthly.
  // Counts and revenue are the daily goal times the days in the period; percentages stay the same.
  const nDays = period === 'day' ? 1 : Math.round((new Date(to + 'T00:00') - new Date(from + 'T00:00')) / DAY) + 1;
  const pLbl = period === 'day' ? 'per day' : dlMonthly() ? (dlRange().to < dlRange().last ? 'month to date' : 'for the month') : dlPer() === 'week' ? 'for the week' : 'for 30 days';
  const scaleG = (c, g) => !ok(g) || c.pct || c.avg ? g : (c.k === 'revenue' || c.k === 'nmg') && fullMonth ? +g * 365 / 12 : +g * nDays;
  const goalRow = `<tr class="dlgoal"><td><b>Goal</b><small class="nm-sub">per studio, ${pLbl}</small></td>` + COLS.map(c => {
    if (!c.gd) return '<td>–</td>';
    const gs = st.map(l => [l.name, scaleG(c, c.gd(tgtOf(l.id)))]).filter(([, g]) => ok(g)), uniq = [...new Set(gs.map(([, g]) => gfmt(c, g)))];
    return `<td${uniq.length > 1 ? ` title="${esc(gs.map(([n, g]) => n + ': ' + gfmt(c, g)).join(', '))}"` : ''}>${!gs.length ? '–' : uniq.length === 1 ? (c.lower ? '≤ ' : '') + uniq[0] : 'varies'}</td>`; }).join('') + '</tr>';
  const inn = items.filter(x => !x.miss), T = inn.length ? agg(inn.map(x => x.l.id), from, to) : null;
  const totRow = !T ? '' : `<tr class="dltot"><td><b>Austin total</b><small class="nm-sub">${inn.length} studio${inn.length === 1 ? '' : 's'}</small></td>` + COLS.map(c => {
    const has = c.k === 'revenue' ? inn.filter(x => x.revKnown) : c.k === 'labor' ? inn.filter(x => payOk(x.l.id)) : inn;
    const tx = { a: T, l: { id: '' }, revKnown: has.length > 0 };
    const v = c.k === 'active' ? inn.reduce((n, x) => n + (x.a.avgActive || 0), 0) || null : c.k === 'labor' ? (has.length ? T.labor : null) : c.v(tx);
    // Goals: added up for counts, averaged for percentages, only over studios that have the number
    const gl = c.g ? has.map(x => c.g(x)) : [], all = gl.length && gl.every(ok);
    const g = !all ? null : c.pct || c.avg ? gl.reduce((n, x) => n + +x, 0) / gl.length : gl.reduce((n, x) => n + +x, 0);
    return `<td class="${tone(v, g, c.lower)}"${tip(c, g)}>${v === null || v === undefined ? '–' : c.f(v)}${c.k === 'revenue' && ok(g) && v !== null ? `<small class="nm-sub">of ${money(Math.round(g))}</small>` : ''}</td>`; }).join('') + '</tr>';
  return `<div class="table-wrap dlwrap"><table class="mt ovt dlt"><thead><tr><th>Studio</th>${COLS.map(c => `<th>${c.h}</th>`).join('')}</tr></thead><tbody>` + goalRow +
    items.map(x => !x.miss ? `<tr><td>${period === 'day' ? `<b>${esc(x.l.name)}</b>` : `<button class="linkish dlname" data-dldays="${x.l.id}" title="See ${esc(x.l.name)} day by day"><b>${esc(x.l.name)}</b> <span aria-hidden="true">›</span></button>`}${x.closed ? '<small class="nm-sub">Closed</small>' : ''}${x.sub ? `<small class="nm-sub">${x.sub}</small>` : ''}${x.tag ? `<div class="dlfocusline"><span class="dlfocus${x.tagCls ? ' ' + x.tagCls : ''}" title="${esc(x.tagTitle || '')}">${esc(x.tag)}</span></div>` : ''}</td>${COLS.map(c => cell(c, x)).join('')}</tr>`
      : `<tr class="dlmiss"><td><b>${esc(x.l.name)}</b>${period === 'day' ? `<div class="dlfocusline"><span class="dlfocus miss">${esc(FOCUSES[0])}</span></div>` : ''}</td><td colspan="${COLS.length}"><span class="muted">${period === 'day' ? 'Not entered yet' : 'No entries for this period'}</span>${period === 'day' && canWrite(x.l.id) ? ` <button class="linkish" data-dlstudio="${x.l.id}">Enter now</button>` : ''}</td></tr>`).join('') +
    `</tbody><tfoot>${totRow}</tfoot></table></div>`;
}

// ----- Analysis & next steps: for each studio, from the same numbers as the review -----
// Month pace vs the revenue goal, what missed its target (and by how many), and what it takes to reach the goal this month.
const okGoal = g => g !== null && g !== undefined && g !== '' && !isNaN(g) && +g > 0;
const ceilPos = x => Math.max(0, Math.ceil(x - 1e-9));
function dlPlan(sid, from, to) {
  const t = tgtOf(sid), a = agg(sid, from, to);
  if (!a.entries) return null;
  const yest = dAdd(todayStr(), -1), mTo = to > yest ? yest : to;   // a week that isn't over yet counts only the days so far
  const mFrom = mTo.slice(0, 8) + '01', last = ymd(new Date(+mTo.slice(0, 4), +mTo.slice(5, 7), 0)), m = agg(sid, mFrom, mTo);
  const total = +last.slice(8, 10), elapsed = Math.round((new Date(mTo + 'T00:00') - new Date(mFrom + 'T00:00')) / DAY) + 1, left = total - elapsed;
  const P = { pace: '', steps: [], wins: [], plan: '' };
  // Month pace
  const goal = okGoal(t.revenue_goal) ? +t.revenue_goal : 0;
  if (goal && m.revenue) {
    const proj = m.revenue / elapsed * total, need = left > 0 ? (goal - m.revenue) / left : 0;
    P.pace = `Month to date: <b>${money(m.revenue)}</b> of ${money(goal)} (${pctf(m.revenue / goal)}). At this pace the month ends near <b>${money(proj)}</b>` +
      (proj >= goal ? `, <span class="up">on track</span>.` : `, <span class="dn">${money(goal - proj)} short</span>.`) +
      (left > 0 && m.revenue < goal && proj < goal ? ` It takes about <b>${money(need)} a day</b> for the last ${left} day${left === 1 ? '' : 's'} to hit the goal.` : '');
  }
  // What missed (funnel order), with the shortfall and what to do
  const miss = (n, txt) => P.steps.push(txt), win = n => P.wins.push(n);
  if (a.open && okGoal(t.contacts_target)) (a.cpd < t.contacts_target ? miss : () => win('Contacts'))('contacts',
    `<b>Contacts ${numf(a.cpd, 1)}/day</b> vs ${t.contacts_target}. Use the white space between sessions for calls and texts: fresh leads first, then no-shows and leads who never booked.`);
  if (a.leads >= 3) (a.l2d < t.l2d_target ? miss : () => win('Lead→demo'))('l2d',
    `<b>Booked ${a.demos_booked} of ${a.leads} leads</b> (${pctf(a.l2d)} vs ${pctf(t.l2d_target)}): <b>${ceilPos(t.l2d_target * a.leads - a.demos_booked)} more booking${ceilPos(t.l2d_target * a.leads - a.demos_booked) === 1 ? '' : 's'}</b> would have hit it. Reach new leads within minutes and offer two set times instead of asking when works.`);
  if (a.demos_booked >= 2) (a.show < t.show_target ? miss : () => win('Show %'))('show',
    `<b>${a.demos_held} of ${a.demos_booked} booked demos showed</b> (${pctf(a.show)} vs ${pctf(t.show_target)}): <b>${ceilPos(t.show_target * a.demos_booked - a.demos_held)} more</b> needed to show. Confirm by text the day before, call the morning of, and rebook every no-show the same day.`);
  if (a.demos_held >= 2) (a.close < t.close_target ? miss : () => win('Close %'))('close',
    `<b>Closed ${a.demo_sales} of ${a.demos_held} demos</b> (${pctf(a.close)} vs ${pctf(t.close_target)}): <b>${ceilPos(t.close_target * a.demos_held - a.demo_sales)} more sale${ceilPos(t.close_target * a.demos_held - a.demo_sales) === 1 ? '' : 's'}</b> would have hit it. Run the full consult, tie the package to their goal, ask for the sale, and follow up every didn't-buy within a day.`);
  if (a.cancellations && (a.nmg < 0 || (a.attrition !== null && a.attrition > t.attrition_max))) miss('retention',
    `<b>${a.cancellations} cancellation${a.cancellations === 1 ? '' : 's'}</b> vs ${a.agreements + a.reactivations} new or returning (NMG ${a.nmg > 0 ? '+' : ''}${a.nmg}). Call at-risk members and anyone with no next booking; offer a freeze before a cancel.`);
  else if (a.agreements + a.reactivations) win('Net members');
  if (a.util !== null && okGoal(t.util_target)) (a.util < t.util_target ? miss : () => win('Utilization'))('util',
    `<b>Utilization ${pctf(a.util)}</b> vs ${pctf(t.util_target)}. Rebook every member before they leave and fill the next day's open slots from the at-risk and no-next-booking lists.`);
  if (payOk(sid) && a.labor !== null && okGoal(t.labor_max) && a.labor > t.labor_max) miss('labor',
    `<b>Labor ${pctf(a.labor)}</b> of revenue vs ${pctf(t.labor_max)} max. Match staffing to booked hours and trim open shifts with no bookings.`);
  // Rest of the month: sales needed, then the funnel per day at this month's own rates
  if (left > 0) {
    const salesGoal = okGoal(t.sales_target) ? Math.round(t.sales_target * total) : null;
    const need = salesGoal !== null ? salesGoal - m.agreements : okGoal(t.nmg_target) ? +t.nmg_target - m.nmg : null;
    if (need !== null && need > 0) {
      const rate = (v, g) => v && v > 0 ? v : +g, close = rate(m.close, t.close_target), show = rate(m.show, t.show_target), l2d = rate(m.l2d, t.l2d_target);
      const held = need / close, booked = held / show, leads = booked / l2d, pd = v => numf(v / left, v / left < 10 ? 1 : 0);
      P.plan = `To reach ${salesGoal !== null ? `<b>${salesGoal} sales</b>` : `<b>+${t.nmg_target} net members</b>`} this month: <b>${need} more</b> in ${left} day${left === 1 ? '' : 's'} ≈ <b>${pd(need)} a day</b>. ` +
        `At this month's rates (close ${pctf(close)}, show ${pctf(show)}, booking ${pctf(l2d)}) that's about <b>${pd(held)} demos held → ${pd(booked)} booked → ${pd(leads)} leads a day</b>.`;
    } else if (need !== null) P.plan = `Already at the month's ${salesGoal !== null ? 'sales' : 'net member'} goal. Keep the pace and protect retention.`;
  }
  P.head = P.steps.length ? `${P.steps.length} to work on` : 'On track';
  return P;
}
function dlAnalysis(from, to, title) {
  const st = dlStudios().map(l => ({ l, p: dlPlan(l.id, from, to) })).filter(x => x.p);
  if (!st.length) return '';
  const openOne = st.some(x => x.l.id === ME.location_id) ? ME.location_id : (st.length === 1 ? st[0].l.id : null);
  return `<section class="scsec dlai"><h3>${title} <details class="dlinfo"><summary aria-label="How this is worked out">ⓘ</summary><div>Worked out from the same numbers as the review above and each studio's Targets: what fell short of its target and by how many, the revenue pace for the month, and the leads, bookings, demos and sales a day it takes to reach the goal at the studio's own rates this month.</div></details></h3>` +
    st.map(({ l, p }) => `<details class="pcard dlplan"${l.id === openOne ? ' open' : ''}><summary><b>${esc(l.name)}</b> <span class="rkb ${p.steps.length ? 'low' : 'top'}">${p.head}</span></summary>
      ${p.pace ? `<p class="dlpace">${p.pace}</p>` : ''}
      ${p.steps.length ? `<ol>${p.steps.slice(0, 4).map(x => `<li>${x}</li>`).join('')}</ol>` : '<p>Every funnel number hit its target. Keep the process tight and rebook every member.</p>'}
      ${p.plan ? `<p class="dlgoal">${p.plan}</p>` : ''}
      ${p.wins.length ? `<p class="dlwins">✓ On target: ${p.wins.join(', ')}</p>` : ''}</details>`).join('') + '</section>';
}

function drawDaily() {
  const d = DL.day, yest = dAdd(todayStr(), -1), sid = DL.studio, wr = canWrite(sid), r = rowOf(sid, d) || {}, t = tgtOf(sid);
  const editable = dlStudios().filter(l => canWrite(l.id));
  const prevActive = (() => { const p = DL.rows.filter(x => x.studio_id === sid && x.day < d && x.active_members).sort((a, b) => a.day < b.day ? 1 : -1)[0]; return p ? p.active_members : null; })();
  const inp = ([k, label, unit, hint]) => {
    if (k === 'payroll' && !payOk(sid)) return '';
    const v = k === 'payroll' ? payOf(sid, d) : r[k];
    return `<label class="dlin">${label}${hint ? ` <small class="muted">${hint}</small>` : ''}${typeof AUTO_DL !== 'undefined' && AUTO_DL.has(k) ? ' <small class="muted" title="Filled in each morning from ClubReady. You can still change it.">auto</small>' : ''}<span class="dlbox${unit === '$' ? ' usd' : ''}"><input type="number" inputmode="decimal" min="0" step="any" data-dl="${k}" value="${v ?? ''}" ${wr ? '' : 'disabled'} placeholder="${k === 'active_members' && prevActive !== null ? prevActive : ''}"></span></label>`;
  };
  const chips = editable.length > 1 ? `<div class="dlchips">${editable.map(l => `<button class="dlchip${l.id === sid ? ' on' : ''}${entered(rowOf(l.id, d)) ? ' done' : ''}" data-dlstudio="${l.id}">${entered(rowOf(l.id, d)) ? '✓ ' : ''}${esc(l.name)}</button>`).join('')}</div>` : '';
  const form = editable.length ? `<section class="scsec"><h3>Enter ${d === yest ? 'yesterday’s' : 'the'} numbers${editable.length === 1 ? ' for ' + esc(studio(sid)) : ''}</h3>${chips}
    <div class="pcard dlform">${rowOf(sid, d) ? `<p class="dlsaved">✓ Saved${r.updated_at ? ' ' + new Date(r.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}. Change anything and save again.</p>` : ''}
      <div class="dlopen"><span class="tolbl">Open day?</span><span class="tabs toseg" data-dlopen><button type="button" data-v="1" class="${r.open_day !== false ? 'on' : ''}">Yes</button><button type="button" data-v="0" class="${r.open_day === false ? 'on' : ''}">Closed</button></span></div>
      ${DLF.map(([g, fs]) => `<fieldset class="dlgrp"><legend>${g}</legend><div class="dlgrid">${fs.map(inp).join('')}</div></fieldset>`).join('')}
      <div class="grid2"><label>Notes <textarea data-dl="notes" rows="2" maxlength="600" ${wr ? '' : 'disabled'}>${esc(r.notes || '')}</textarea></label><label>Manager action <textarea data-dl="action" rows="2" maxlength="600" ${wr ? '' : 'disabled'}>${esc(r.action || '')}</textarea></label></div>
      <div id="dlErr" class="err" role="alert"></div>${wr ? `<button id="dlSave">Save ${esc(studio(sid))}</button>` : ''}</div></section>` : '';
  // Morning review table
  const st = dlStudios(), showLabor = st.some(l => payOk(l.id));
  const rv = st.map(l => { const row = rowOf(l.id, d), a = row ? agg(l.id, d, d) : null, tt = tgtOf(l.id), auto = autoFocus(row, tt), focus = (row && row.focus_override) || auto;
    return { l, row, a, tt, auto, focus }; });
  const table = dlReview(rv.map(x => ({ ...x, days: 1, revKnown: !!x.row && x.row.revenue !== null && x.row.revenue !== undefined, closed: !!x.row && x.row.open_day === false,
    tag: x.focus, tagTitle: "Today's #1 focus", miss: !x.row })), d, d, 'day');
  const done = rv.filter(x => entered(x.row)).length;
  $('dlBody').innerHTML = `<div class="dlnav"><button class="quiet" data-dlday="-1" aria-label="Previous day">‹</button><label class="tk-daylbl"><b>${d === yest ? 'Yesterday' : d === todayStr() ? 'Today' : ''} <small>${dLong(d)}</small></b><input type="date" id="dlDate" value="${d}" max="${todayStr()}"></label><button class="quiet" data-dlday="1" aria-label="Next day" ${d >= todayStr() ? 'disabled' : ''}>›</button>${d !== yest ? '<button class="quiet sm" data-dlday="y">Back to yesterday</button>' : ''}
      ${ME.role === 'owner' && REP.sub === 'enter' ? '<span class="dltools"><button class="quiet sm" id="dlTargets">Targets</button><button class="quiet sm" id="dlImport">Import from spreadsheet</button></span>' : ''}</div>` +
    (REP.sub === 'enter' ? (form || '<div class="pcard"><p>Only managers and the owner can enter numbers.</p></div>') + (form ? `<p class="dlgo"><button class="quiet" data-dlgo="dpr">See the daily review →</button></p>` : '') : (editable.length ? `<div class="dlcta"><span>${done} of ${rv.length} studios entered for ${dLong(d)}</span><button data-dlgo="enter">Enter numbers</button></div>` : '') + `<section class="scsec"><h3>Morning review • ${dLong(d)} <span class="hcount">${done} of ${rv.length} entered</span></h3>${table}</section>` + dlAnalysis(d, d, `Analysis & next steps • ${dLong(d)}`));
}

async function dlSave() {
  const sid = DL.studio, d = DL.day, row = { studio_id: sid, day: d, updated_by: ME.id, updated_at: new Date().toISOString() };
  document.querySelectorAll('#dlBody [data-dl]').forEach(el => { const k = el.dataset.dl; if (k === 'payroll') return; row[k] = k === 'notes' || k === 'action' ? (el.value.trim() || null) : numOrNull(el.value); });
  const op = document.querySelector('[data-dlopen] .on'); row.open_day = !op || op.dataset.v === '1';
  const keep = rowOf(sid, d); if (keep && keep.focus_override) row.focus_override = keep.focus_override;
  const pe = document.querySelector('#dlBody [data-dl="payroll"]'), ops = [db.from('daily_log').upsert(row, { onConflict: 'studio_id,day' })];
  if (pe && payOk(sid)) { const v = numOrNull(pe.value); ops.push(v === null ? db.from('daily_payroll').delete().eq('studio_id', sid).eq('day', d) : db.from('daily_payroll').upsert({ studio_id: sid, day: d, payroll: v, updated_by: ME.id, updated_at: row.updated_at }, { onConflict: 'studio_id,day' })); }
  $('dlSave').disabled = true;
  const err = (await Promise.all(ops)).map(x => x.error).find(Boolean);
  if (err) { $('dlSave').disabled = false; $('dlErr').textContent = 'Could not save. ' + err.message; return; }
  DL.rows = DL.rows.filter(x => !(x.studio_id === sid && x.day === d)).concat([row]);
  if (pe && payOk(sid)) { DL.pay = DL.pay.filter(x => !(x.studio_id === sid && x.day === d)); const v = numOrNull(pe.value); if (v !== null) DL.pay.push({ studio_id: sid, day: d, payroll: v }); }
  toast(`Saved ${studio(sid)}`);
  // Jump to the next studio that still needs numbers
  const next = dlStudios().find(l => canWrite(l.id) && !rowOf(l.id, d)); if (next) DL.studio = next.id;
  drawDaily(); if (typeof dlHomeRefresh === 'function') dlHomeRefresh();
}

// ----- WEEKLY / MONTH TO DATE / LAST 30 DAYS -----
function dlRange() {
  const a = dlAnc();
  if (dlPer() === 'week') { const from = monday(a), to = dAdd(from, 6); return { from, to, pFrom: dAdd(from, -7), pTo: dAdd(from, -1), label: `Week of ${fmt(from)} – ${fmt(to)}`, plabel: 'prior week' }; }
  if (dlPer() === 'mtd') {
    const from = a.slice(0, 8) + '01', last = ymd(new Date(+a.slice(0, 4), +a.slice(5, 7), 0)), yest = dAdd(todayStr(), -1), to = last < yest ? last : (yest < from ? from : yest);
    const n = Math.round((new Date(to + 'T00:00') - new Date(from + 'T00:00')) / DAY), pFrom = mAdd(from, -1), pEndMax = dAdd(from, -1), pTo = dAdd(pFrom, n) > pEndMax ? pEndMax : dAdd(pFrom, n);
    return { from, to, pFrom, pTo, last, label: new Date(from + 'T00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + (to < last ? ` to date (through ${fmt(to)})` : ''), plabel: to === last ? new Date(pFrom + 'T00:00').toLocaleDateString('en-US', { month: 'long' }) : `same days of ${new Date(pFrom + 'T00:00').toLocaleDateString('en-US', { month: 'short' })}` };
  }
  const to = a, from = dAdd(to, -29); return { from, to, pFrom: dAdd(from, -30), pTo: dAdd(from, -1), label: `Last 30 days • ${fmt(from)} – ${fmt(to)}`, plabel: 'prior 30 days' };
}

function drawWeekly() {
  const R = dlRange(), st = dlStudios(), allPay = st.every(l => payOk(l.id)), anyPay = st.some(l => payOk(l.id));
  const cur = Object.fromEntries(st.map(l => [l.id, agg(l.id, R.from, R.to)])), prv = Object.fromEntries(st.map(l => [l.id, agg(l.id, R.pFrom, R.pTo)]));
  const ids = st.map(l => l.id), reg = agg(ids, R.from, R.to), rp = agg(ids, R.pFrom, R.pTo);   // same studios as the table (temporarily closed ones left out)
  if (!allPay) { reg.payroll = null; reg.labor = null; rp.labor = null; }
  const T = { ...DEF_T }; // region targets: workbook uses the same defaults for every studio
  const ch = (a, b, f, lower) => { if (a === null || b === null || a === undefined || b === undefined) return ''; if (f === 'pct') { const d = (a - b) * 100; return Math.abs(d) < .5 ? '' : `<span class="${(d > 0) !== !!lower ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(0)} pts</span>`; } if (!b) return ''; const d = (a - b) / Math.abs(b) * 100; return Math.abs(d) < .5 ? '' : `<span class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(0)}%</span>`; };
  const card = (label, v, f, prev, target, lower, sub) => { const s = target === null || target === undefined || v === null ? '' : (lower ? v <= target : v >= target) ? '<span class="rkb top">On target</span>' : `<span class="rkb low">${lower ? 'Over target' : 'Below target'}</span>`;
    const fv2 = f === 'usd' ? money(v) : f === 'pct' ? pctf(v) : (f === 'signed' && v > 0 ? '+' : '') + numf(v);
    return `<div class="kt dlk"><span class="kn">${label}</span><b>${fv2}</b><span class="kdl">${ch(v, prev, f === 'pct' ? 'pct' : '', lower)}${prev !== null && prev !== undefined ? ` <span class="muted">vs ${f === 'usd' ? money(prev) : f === 'pct' ? pctf(prev) : numf(prev)} ${R.plabel}</span>` : ''}</span>${sub || ''}${s}</div>`; };
  const goalSub = reg.goal ? `<span class="kdl">Goal ${money(reg.goal)} • <span class="${reg.gap >= 0 ? 'up' : 'dn'}">${reg.gap >= 0 ? '+' : '−'}${money(Math.abs(reg.gap))}</span></span>` : '';
  const pace = dlPer() === 'mtd' && R.to < R.last ? (() => { const el = Math.round((new Date(R.to + 'T00:00') - new Date(R.from + 'T00:00')) / DAY) + 1, all = +R.last.slice(8, 10); return v => v / el * all; })() : null;
  const paceSub = pace && reg.revenue ? (() => { const mg = st.reduce((n, l) => n + (+tgtOf(l.id).revenue_goal || 0), 0), p = pace(reg.revenue); return `<span class="kdl">On pace for <b>${money(p)}</b>${mg ? ` vs ${money(mg)} goal` : ''}</span>`; })() : '';
  const snap = `<div class="kgrid kg4">${card('Revenue', reg.revenue, 'usd', rp.revenue, null, false, goalSub + paceSub)}${card('Net member growth', reg.nmg, 'signed', rp.nmg, null, false, `<span class="kdl">${reg.agreements} new • ${reg.reactivations} back • ${reg.cancellations} cancelled</span>`)}${card('Leads', reg.leads, '', rp.leads)}${card('Close rate', reg.close, 'pct', rp.close, T.close_target)}</div>`;
  // Studio scorecard
  const tone = (v, t, lower) => v === null || t === null || t === undefined ? '' : (lower ? v > t : v < t) ? 'bad' : 'good';
  const flag = (a, t, sid) => a.gap !== null && a.gap < 0 ? 'REVENUE' : payOk(sid) && a.labor !== null && a.labor > t.labor_max ? 'LABOR' : a.l2d !== null && a.l2d < t.l2d_target ? 'BOOKING' : a.attrition !== null && a.attrition > t.attrition_max ? 'RETENTION' : 'MONITOR';
  const has = st.filter(l => cur[l.id].entries);
  const prio = (a, t, sid) => ({ REVENUE: 'Revenue gap', LABOR: 'Labor', BOOKING: 'Booking', RETENTION: 'Retention', MONITOR: 'Monitor' })[flag(a, t, sid)];
  // Each studio's biggest miss: the number furthest below (or above, for labor) its goal
  const okG = g => g !== null && g !== undefined && g !== '' && !isNaN(g) && +g > 0;
  const bigMiss = (a, t, sid, rk) => {
    const L = [['Revenue', rk ? a.revenue : null, a.goal, money], ['Contacts/day', a.cpd, t.contacts_target, v => numf(v, v < 10 && v % 1 ? 1 : 0)], ['Leads', a.leads, okG(t.leads_target) ? t.leads_target * a.entries : null, v => numf(v, v % 1 ? 1 : 0)],
      ['Lead→demo', a.l2d, t.l2d_target, pctf], ['Show %', a.show, t.show_target, pctf], ['Close %', a.close, t.close_target, pctf], ['Sales', a.agreements, okG(t.sales_target) ? t.sales_target * a.entries : null, v => numf(v, v % 1 ? 1 : 0)],
      ['Util.', a.util, t.util_target, pctf], ...(payOk(sid) ? [['Labor %', a.labor, t.labor_max, pctf, 1]] : [])];
    const m = L.filter(([, v, g]) => v !== null && v !== undefined && okG(g)).map(([n, v, g, f, lower]) => ({ n, v, g, f, gap: lower ? (v - g) / g : (g - v) / g })).filter(x => x.gap > .02).sort((a, b) => b.gap - a.gap)[0];
    return m ? { tag: `${m.n} ${m.f(m.v)} vs ${m.f(+m.g)}`, cls: 'miss' } : { tag: '✓ On track', cls: 'ok' };
  };
  const score = dlReview(st.map(l => { const a = cur[l.id], p = prv[l.id], rk = DL.rows.some(r => r.studio_id === l.id && r.day >= R.from && r.day <= R.to && r.revenue !== null && r.revenue !== undefined), bm = a.entries ? bigMiss(a, tgtOf(l.id), l.id, rk) : null;
    return { l, a, tt: tgtOf(l.id), days: a.entries, revKnown: rk, miss: !a.entries, tag: bm ? bm.tag : '', tagTitle: 'Biggest miss vs goal', tagCls: bm ? bm.cls : '',
      sub: p.revenue && ch(a.revenue, p.revenue) ? ch(a.revenue, p.revenue) + ' revenue' : '' }; }), R.from, R.to, 'period');
  // Notes and actions logged during the period
  const notes = DL.rows.filter(r => r.day >= R.from && r.day <= R.to && (r.notes || r.action)).sort((a, b) => a.day < b.day ? 1 : -1);
  const nlist = notes.length ? `<ul class="dlnotes">${notes.map(r => `<li><b>${esc(studio(r.studio_id))}</b> <span class="muted">${fmt(r.day)}</span>${r.notes ? `<div>${esc(r.notes)}</div>` : ''}${r.action ? `<div class="dlact">Action: ${esc(r.action)}</div>` : ''}</li>`).join('')}</ul>` : '<p class="muted" style="margin:0">No notes or manager actions logged in this period.</p>';
  const seg = (k, l) => `<button type="button" data-dlper="${k}" class="${DL.period === k ? 'on' : ''}">${l}</button>`;
  $('dlBody').innerHTML = `<div class="dlnav">${dlMonthly() ? '' : `<span class="tabs toseg">${seg('week', 'Week')}${seg('30', 'Last 30 days')}</span>`}
      <button class="quiet" data-dlstep="-1" aria-label="Earlier">‹</button><b class="dlrange">${R.label}</b><button class="quiet" data-dlstep="1" aria-label="Later" ${R.to >= dAdd(todayStr(), -1) ? 'disabled' : ''}>›</button>
      <span class="dltools">${dlMonthly() && canPage('performance') ? '<button class="quiet sm" data-dlsheet title="Your uploaded monthly sheets, corporate scorecard numbers and network ranks">Monthly sheet view</button>' : ''}${ME.role === 'owner' ? '<button class="quiet sm" id="dlTargets">Targets</button>' : ''}</span></div>` +
    `<section class="scsec"><h3>Region snapshot <span class="muted" style="font-weight:400;font-size:.85rem">vs ${R.plabel}</span></h3>${snap}</section>` +
    `<section class="scsec"><h3>Studio scorecard <details class="dlinfo"><summary aria-label="How this table works">ⓘ</summary><div>Green hit the goal, red missed it; hover a number to see its goal. Count goals are the daily goal times the days each studio has numbers for; revenue and NMG goals are the monthly goal spread over the days (a whole month uses it as is). Contacts/day, Lead→demo, Show %, Close % and Util. are compared to the goal as is. The tag under each studio is its biggest miss vs goal. Click a studio to see it day by day.</div></details></h3>${score}</section>` +
    dlAnalysis(R.from, R.to, `Analysis & next steps • ${dlMonthly() ? 'this month' : dlPer() === 'week' ? 'this week' : 'last 30 days'}`) +
    `<section class="scsec"><h3>Notes & manager actions</h3>${nlist}</section>`;
}

// Click a studio on Weekly/Monthly: its numbers day by day for the period on screen
function dlDays(sid) {
  const R = dlRange(), days = []; for (let d = R.from; d <= R.to; d = dAdd(d, 1)) days.push(d);
  const C = [['revenue', 'Revenue', money], ['contacts', 'Contacts', numf], ['leads', 'Leads', numf], ['demos_booked', 'Booked', numf], ['demos_held', 'Held', numf], ['agreements', 'Sales', numf], ['reactivations', 'React.', numf], ['cancellations', 'Cancels', numf], ['staff_util', 'Util.', pctf]];
  const v = (r, k) => !r || r[k] === null || r[k] === undefined || r[k] === '' ? null : +r[k];
  const a = agg(sid, R.from, R.to), tot = { revenue: a.revenue, contacts: a.contacts, leads: a.leads, demos_booked: a.demos_booked, demos_held: a.demos_held, agreements: a.agreements, reactivations: a.reactivations, cancellations: a.cancellations, staff_util: a.staff_util };
  $('dlgBody').innerHTML = `<h2>${esc(studio(sid))}</h2><p class="lead" style="margin:.2rem 0 .8rem">${esc(R.label)} \u2022 day by day</p>
    <div class="table-wrap dldays"><table class="mt"><thead><tr><th>Day</th>${C.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>` +
    days.slice().reverse().map(d => { const r = rowOf(sid, d), closed = r && r.open_day === false;
      return `<tr class="${closed ? 'muted' : ''}"><td>${dLong(d)}${closed ? ' <small>closed</small>' : ''}</td>${C.map(([k, , f]) => { const x = v(r, k); return `<td>${x === null ? '–' : f(x)}</td>`; }).join('')}</tr>`; }).join('') +
    `</tbody><tfoot><tr class="dltot"><td><b>Total</b></td>${C.map(([k, , f]) => `<td><b>${tot[k] === null || tot[k] === undefined ? '–' : f(tot[k])}</b></td>`).join('')}</tr></tfoot></table></div>
    <div class="acts"><button class="quiet" data-act="close">Close</button></div>`;
  $('dlg').classList.add('wide'); if (!$('dlg').open) $('dlg').showModal();
}

// ----- targets (owner) -----
function dlTargetsForm() {
  const f = (sid, k, pct) => { const v = tgtOf(sid)[k]; return `<input type="number" step="any" min="0" data-tg="${k}" data-sid="${sid}" value="${v === null || v === undefined ? '' : pct ? Math.round(v * 100) : v}">`; };
  $('dlgBody').innerHTML = `<h2>Studio targets</h2><p class="lead" style="margin:.25rem 0 1rem">Used for goals, colors, focus picks and priority flags. Percentages are whole numbers (40 = 40%).</p>
    <div class="table-wrap"><table class="mt dltg"><thead><tr><th>Studio</th><th>Monthly revenue goal $</th><th>Labor max %</th><th>Lead→demo %</th><th>Show %</th><th>Close %</th><th>Attrition max %</th><th>Contacts / day</th><th>Utilization %</th><th>Monthly NMG</th><th>Leads / day</th><th>Booked / day</th><th>Held / day</th><th>Sales / day</th><th>Cancels max / day</th><th>React. / day</th></tr></thead><tbody>` +
    dlStudios().map(l => `<tr><td><b>${esc(l.name)}</b></td><td>${f(l.id, 'revenue_goal')}</td><td>${f(l.id, 'labor_max', 1)}</td><td>${f(l.id, 'l2d_target', 1)}</td><td>${f(l.id, 'show_target', 1)}</td><td>${f(l.id, 'close_target', 1)}</td><td>${f(l.id, 'attrition_max', 1)}</td><td>${f(l.id, 'contacts_target')}</td><td>${f(l.id, 'util_target', 1)}</td><td>${f(l.id, 'nmg_target')}</td>${['leads_target', 'booked_target', 'held_target', 'sales_target', 'cancels_max', 'react_target'].map(k => `<td>${f(l.id, k)}</td>`).join('')}</tr>`).join('') +
    `</tbody></table></div><div id="tgErr" class="err" role="alert"></div><div class="acts"><button data-act="tgSave">Save targets</button><button class="quiet" data-act="close">Cancel</button></div>`;
  $('dlg').classList.add('dlwide'); $('dlg').showModal();
}
async function dlTargetsSave() {
  const P = new Set(['labor_max', 'l2d_target', 'show_target', 'close_target', 'attrition_max', 'util_target']), by = {};
  document.querySelectorAll('[data-tg]').forEach(el => { const s = el.dataset.sid, k = el.dataset.tg, v = numOrNull(el.value); (by[s] = by[s] || { studio_id: s, updated_at: new Date().toISOString() })[k] = v === null ? null : P.has(k) ? v / 100 : v; });
  const { error } = await db.from('studio_targets').upsert(Object.values(by), { onConflict: 'studio_id' });
  if (error) { $('tgErr').textContent = /leads_target|booked_target|held_target|sales_target|cancels_max|react_target/.test(error.message) ? 'The new daily goals need a one-time database update first: run sql/daily_goals.sql in Supabase.' : 'Could not save. ' + error.message; return; }
  Object.values(by).forEach(x => DL.tgt[x.studio_id] = { ...(DL.tgt[x.studio_id] || {}), ...x });
  $('dlg').close(); toast('Targets saved'); REP.sub === 'weekly' || dlMonthly() ? drawWeekly() : drawDaily();
}

// ----- import the V4 Regional Report (owner) -----
const DL_CODES = { GT: 'georgetown', WC: 'william cannon', LW: 'lakeway', RR: 'round rock', WL: 'westlake', FP: 'fourpoints' };
const dlLoc = code => { const c = String(code || '').trim(), key = (DL_CODES[c.toUpperCase()] || c).toLowerCase(); return locs.find(l => l.name.toLowerCase() === key) || locs.find(l => l.name.toLowerCase().includes(key)); };
function dlImportForm() {
  $('dlgBody').innerHTML = `<h2>Import from spreadsheet</h2><p class="lead" style="margin:.25rem 0 1rem">Pick your Regional Report workbook (.xlsx). Every filled row of its <b>Daily Log</b> sheet is copied in (existing days are updated), plus the <b>Targets & Lists</b> sheet.</p>
    <label class="updrop"><input id="dlFile" type="file" accept=".xlsx,.xls"><b>Choose the workbook</b></label><div id="dlImpInfo"></div><div id="dlImpErr" class="err" role="alert"></div>
    <div class="acts"><button data-act="dlImpGo" id="dlImpGo" disabled>Import</button><button class="quiet" data-act="close">Cancel</button></div>`;
  $('dlFile').onchange = dlImportRead; $('dlg').showModal();
}
async function dlImportRead() {
  const f = $('dlFile').files[0]; if (!f) return;
  try {
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true }), sh = wb.Sheets['Daily Log'];
    if (!sh) throw new Error('There is no "Daily Log" sheet in that file.');
    const a = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null, raw: true }), hi = a.findIndex(r => r && r.includes('Date') && r.includes('Studio'));
    if (hi < 0) throw new Error('Could not find the Daily Log header row.');
    const H = a[hi], col = n => H.findIndex(h => h && String(h).toLowerCase().startsWith(n.toLowerCase()));
    const C = { date: col('Date'), studio: col('Studio'), revenue: col('Revenue'), payroll: col('Payroll'), leads: col('Leads'), contacts: col('Contacts'), open: col('Open Day'), demos_booked: col('Demos Booked'), demos_held: col('Demos Held'), agreements: col('New Agreements'), cancellations: col('Cancellations'), freezes: col('Freezes'), reactivations: col('Reactivations'), active_members: col('Active Members'), slots_available: col('Available Stretch'), stretches_completed: col('Completed Stretches'), new_eft: col('New EFT'), refunds: col('Refunds'), notes: col('Notes'), action: col('Manager Action') };
    const day = v => v instanceof Date ? ymd(new Date(v.getTime() + 12 * 36e5)) : (/^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
    const rows = [], pay = [], unknown = new Set();
    a.slice(hi + 1).forEach(r => {
      if (!r) return; const d = day(r[C.date]), l = dlLoc(r[C.studio]); if (!d || !r[C.studio]) return;
      const vals = Object.keys(C).filter(k => !['date', 'studio', 'open', 'notes', 'action', 'payroll'].includes(k)).map(k => r[C[k]]);
      const any = vals.some(v => v !== null && v !== '' && +v !== 0) || (C.payroll >= 0 && +r[C.payroll]) || (C.notes >= 0 && r[C.notes]) || (C.open >= 0 && r[C.open]);
      if (!any) return; if (!l) { unknown.add(r[C.studio]); return; }
      const o = { studio_id: l.id, day: d, updated_by: ME.id, updated_at: new Date().toISOString(), open_day: C.open >= 0 ? !/^n/i.test(String(r[C.open] || 'yes')) : true };
      DL_NUM.forEach(k => { const v = C[k] >= 0 ? r[C[k]] : null; o[k] = v === null || v === '' || isNaN(+v) ? null : +v; });
      o.notes = C.notes >= 0 && r[C.notes] ? String(r[C.notes]) : null; o.action = C.action >= 0 && r[C.action] ? String(r[C.action]) : null;
      rows.push(o); if (C.payroll >= 0 && r[C.payroll] !== null && r[C.payroll] !== '' && !isNaN(+r[C.payroll])) pay.push({ studio_id: l.id, day: d, payroll: +r[C.payroll], updated_by: ME.id, updated_at: o.updated_at });
    });
    const tg = [], ts = wb.Sheets['Targets & Lists'];
    if (ts) { const t = XLSX.utils.sheet_to_json(ts, { header: 1, defval: null, raw: true }), th = t.findIndex(r => r && r[0] === 'Studio' && String(r[1] || '').includes('Revenue'));
      if (th >= 0) t.slice(th + 1).forEach(r => { const l = r && dlLoc(r[0]); if (!l || typeof r[1] !== 'number') return; tg.push({ studio_id: l.id, revenue_goal: r[1], labor_max: r[2], l2d_target: r[3], show_target: r[4], close_target: r[5], attrition_max: r[6], contacts_target: r[7], util_target: r[8], nmg_target: r[9], objective: r[10] || null, updated_at: new Date().toISOString() }); }); }
    DL.imp = { rows, pay, tg };
    const span = rows.length ? `${fmt(rows.map(r => r.day).sort()[0])} – ${fmt(rows.map(r => r.day).sort().slice(-1)[0])}` : '';
    $('dlImpInfo').innerHTML = `<ul class="upcheck"><li class="ok"><span class="upmark">✓</span><span><b>${rows.length} daily rows</b> <small>${span}</small><small class="upadds">${pay.length} with payroll</small></span></li><li class="${tg.length ? 'ok' : ''}"><span class="upmark">${tg.length ? '✓' : '–'}</span><span><b>${tg.length} studio targets</b></span></li>${unknown.size ? `<li class="bad"><span class="upmark">✗</span><span>Unknown studio codes skipped: ${esc([...unknown].join(', '))}</span></li>` : ''}</ul>`;
    $('dlImpGo').disabled = !rows.length;
  } catch (e) { $('dlImpErr').textContent = e.message || 'Could not read that file.'; }
}
async function dlImportGo() {
  const I = DL.imp; if (!I) return; $('dlImpGo').disabled = true; $('dlImpGo').textContent = 'Importing...';
  const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n)), ops = [];
  chunk(I.rows, 200).forEach(c => ops.push(db.from('daily_log').upsert(c, { onConflict: 'studio_id,day' })));
  chunk(I.pay, 200).forEach(c => ops.push(db.from('daily_payroll').upsert(c, { onConflict: 'studio_id,day' })));
  if (I.tg.length) ops.push(db.from('studio_targets').upsert(I.tg, { onConflict: 'studio_id' }));
  const err = (await Promise.all(ops)).map(x => x.error).find(Boolean);
  if (err) { $('dlImpGo').disabled = false; $('dlImpGo').textContent = 'Import'; $('dlImpErr').textContent = 'Import failed. ' + err.message; return; }
  $('dlg').close(); toast(`Imported ${I.rows.length} days`); DL.from = ''; DL.to = ''; DL.imp = null; loadDpr();
}

// ----- events -----
document.addEventListener('click', e => {
  if (!e.target.closest('#dlBody')) return;
  const t = e.target, at = s => t.closest(s);
  if (t.id === 'dlSave') return dlSave();
  if (t.id === 'dlTargets') return dlTargetsForm();
  if (t.id === 'dlImport') return dlImportForm();
  const go = at('[data-dlgo]'); if (go) { REP.sub = go.dataset.dlgo; history.replaceState(null, '', REP.sub === 'enter' ? '#enter' : '#dpr'); updateRepTabs(); drawDaily(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const st = at('[data-dlstudio]'); if (st) { DL.studio = st.dataset.dlstudio; if (REP.sub !== 'enter') { REP.sub = 'enter'; history.replaceState(null, '', '#enter'); updateRepTabs(); } drawDaily(); document.querySelector('.dlform') && document.querySelector('.dlform').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const dd = at('[data-dlday]'); if (dd) { DL.day = dd.dataset.dlday === 'y' ? dAdd(todayStr(), -1) : dAdd(DL.day, +dd.dataset.dlday); if (DL.day > todayStr()) DL.day = todayStr(); loadDpr(); return; }
  if (at('.tk-daylbl') && $('dlDate')) { try { $('dlDate').showPicker(); } catch (_) {} }
  const op = at('[data-dlopen] [data-v]'); if (op) { op.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === op)); return; }
  const cp = at('[data-dlcopy]'); if (cp) { const txt = $('dlmsg-' + cp.dataset.dlcopy).textContent; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Message copied'), () => { const r = document.createRange(); r.selectNodeContents($('dlmsg-' + cp.dataset.dlcopy)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Selected. Press Ctrl+C to copy'); }); return; }
  if (at('[data-dlsheet]')) { REP.sub = 'score'; REP.sheet = true; PF.tab = 'score'; history.replaceState(null, '', '#performance'); $('repDpr').hidden = true; $('repPerf').hidden = false; updateRepTabs(); loadPerf(); return; }
  const dys = at('[data-dldays]'); if (dys) { dlDays(dys.dataset.dldays); return; }
  const pr = at('[data-dlper]'); if (pr) { DL.period = pr.dataset.dlper; loadDpr(); return; }
  const sp = at('[data-dlstep]'); if (sp) { const s = +sp.dataset.dlstep, a = dlAnc(), P = dlPer();
    const nx = P === 'week' ? dAdd(a, 7 * s) : P === 'mtd' ? (s < 0 ? ymd(new Date(+a.slice(0, 4), +a.slice(5, 7) - 1, 0)) : ymd(new Date(+a.slice(0, 4), +a.slice(5, 7), 1 + 0)).slice(0, 8) + '28') : dAdd(a, 30 * s);
    const v = nx > dAdd(todayStr(), -1) ? dAdd(todayStr(), -1) : nx; if (dlMonthly()) DL.mAnchor = v; else DL.anchor = v; loadDpr(); return; }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'dlDate' && t.value) { DL.day = t.value > todayStr() ? todayStr() : t.value; loadDpr(); return; }
  if (t.dataset && t.dataset.dlfocus) {
    const sid = t.dataset.dlfocus, r = rowOf(sid, DL.day); if (!r) return;
    const auto = autoFocus(r, tgtOf(sid)), v = t.value === auto ? null : t.value;
    const { error } = await db.from('daily_log').update({ focus_override: v }).eq('studio_id', sid).eq('day', DL.day);
    if (error) { alert('Could not save the focus. ' + error.message); return; }
    r.focus_override = v; $('dlmsg-' + sid).textContent = morningMsg(locs.find(l => l.id === sid), DL.day, r, v || auto, tgtOf(sid)); toast('Focus updated');
  }
});
$('dlgBody').addEventListener('click', e => { const a = e.target.dataset.act; if (a === 'tgSave') dlTargetsSave(); else if (a === 'dlImpGo') dlImportGo(); });
$('dlg').addEventListener('close', () => $('dlg').classList.remove('dlwide'));
