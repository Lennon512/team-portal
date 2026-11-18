// ---------- Projection: what a studio still needs this month to hit its revenue goal ----------
// Month to date from the daily numbers (through yesterday), the studio's monthly revenue goal (Targets),
// and the membership invoices still coming due this month (Invoices Coming Due, from the last members upload).
// Needed from new sales = goal - net revenue so far - invoices still coming due. Then: sales needed, per open day,
// and the demos, bookings and leads that takes at the studio's current rates (which you can change to try ideas).
const GP = { studio: '', data: null, over: {}, loading: false };

const gpStudios = () => locs.filter(l => !(GP.closed && GP.closed.has(l.id)));
const gpMoney = v => (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(+v || 0)).toLocaleString();
const gpPct = v => v === null || v === undefined || !isFinite(v) ? '–' : Math.round(v * 100) + '%';
const gpNum = (v, d = 1) => v === null || v === undefined || !isFinite(v) ? '–' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString();
const gpAdd = (d, n) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + n); return ymd(x); };

async function loadGoalPlan() {
  $('pfBody').innerHTML = '<p class="lead">Loading…</p>';
  if (!GP.closed) { const c = await db.from('studio_info').select('location_id').eq('temp_closed', true); GP.closed = new Set((c.data || []).map(r => r.location_id)); }
  const L = gpStudios(), mine = ME.role !== 'owner' && ME.location_id && L.some(l => l.id === ME.location_id);
  if (mine && !netOk()) GP.studio = ME.location_id;
  if (!GP.studio || !L.some(l => l.id === GP.studio)) GP.studio = (L[0] || {}).id || '';
  if (!GP.studio) { $('pfBody').innerHTML = '<p class="lead">No studios to plan for.</p>'; return; }
  const td = todayStr(), ms = td.slice(0, 8) + '01', me = ymd(new Date(+td.slice(0, 4), +td.slice(5, 7), 0)), y = gpAdd(td, -1);
  const sid = GP.studio;
  const [d, t, m, i] = await Promise.all([
    db.from('daily_log').select('*').eq('studio_id', sid).gte('day', ms).lte('day', y),
    db.from('studio_targets').select('*').eq('studio_id', sid).maybeSingle(),
    db.from('member_snapshot').select('grp,next_due,amount,frozen').eq('studio_id', sid).eq('grp', 'member').gte('next_due', td).lte('next_due', me).limit(5000),
    db.from('studio_info').select('hours').eq('location_id', sid).maybeSingle()]);
  if (sid !== GP.studio) return;   // they clicked another studio while this was loading
  GP.data = { sid, td, ms, me, y, rows: d.data || [], tgt: t.data || {}, inv: (m.data || []).filter(r => !r.frozen), hours: i.data && i.data.hours, err: d.error && d.error.message };
  GP.over = {};
  drawGoalPlan();
}

function gpBase() {
  const D = GP.data, S = k => D.rows.reduce((n, r) => n + (+r[k] || 0), 0);
  const rev = S('revenue'), ref = S('refunds'), leads = S('leads'), booked = S('demos_booked'), held = S('demos_held'), dsales = S('demo_sales'), newS = S('agreements'), back = S('reactivations');
  const sales = newS + back;
  // Open days left, today through the end of the month (days the studio's hours say it's closed don't count)
  const H = typeof parseHours === 'function' ? parseHours(D.hours) : null;
  let left = 0, closedDays = 0; for (let x = D.td; x <= D.me; x = gpAdd(x, 1)) { const h = H && H[SDAYS[new Date(x + 'T00:00').getDay()]]; if (h && h.closed) closedDays++; else left++; }
  return { rev, ref, net: rev - ref, leads, booked, held, dsales, newS, back, sales, days: D.rows.length,
    goal: +D.tgt.revenue_goal || 0, inv: D.inv.reduce((n, r) => n + (+r.amount || 0), 0), invN: D.inv.length, left, closedDays,
    l2d: leads ? booked / leads : null, show: booked ? held / booked : null, close: held ? dsales / held : null, avg: sales ? rev / sales : null };
}

function drawGoalPlan() {
  const D = GP.data, b = gpBase(), O = GP.over, nm = (locs.find(l => l.id === D.sid) || {}).name || '';
  const v = k => O[k] !== undefined ? O[k] : b[k];   // your what-if value, or the real month-to-date number
  const avg = v('avg'), close = v('close'), show = v('show'), l2d = v('l2d');
  const need = b.goal ? b.goal - b.net - b.inv : null, needPos = need !== null ? Math.max(0, need) : null;
  const salesN = needPos !== null && avg ? needPos / avg : null, perDay = b.left ? needPos / b.left : null, salesDay = salesN !== null && b.left ? salesN / b.left : null;
  const heldN = salesN !== null && close ? salesN / close : null, bookN = heldN !== null && show ? heldN / show : null, leadN = bookN !== null && l2d ? bookN / l2d : null;
  const day = x => x !== null && b.left ? x / b.left : null;
  const mLong = new Date(D.td + 'T00:00').toLocaleDateString('en-US', { month: 'long' }), thru = D.y >= D.ms ? new Date(D.y + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
  const pills = gpStudios().map(l => `<button class="${l.id === D.sid ? 'on' : ''}" data-gps="${l.id}">${esc(l.name)}</button>`).join('');
  const kc = (label, val, sub, k) => `<div class="gpk"><span>${label}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}${k && O[k] !== undefined ? '<em>what-if</em>' : ''}</div>`;
  const inp = (k, val, pct) => `<input class="gpin" type="number" inputmode="decimal" step="${pct ? 1 : 5}" min="0" data-gpk="${k}" value="${val === null || val === undefined ? '' : pct ? Math.round(val * 100) : Math.round(val)}" aria-label="${k}">${pct ? '%' : ''}`;
  const ok = need !== null;
  $('pfBody').innerHTML = `<div class="tabs gptabs" role="tablist" aria-label="Studio">${netOk() || ME.role === 'owner' ? pills : `<button class="on">${esc(nm)}</button>`}</div>` +
    (D.err ? `<p class="err">Could not load the daily numbers: ${esc(D.err)}</p>` : '') +
    `<p class="muted gpnote">${esc(nm)} • ${mLong} to date${thru ? ` (through ${thru}, ${b.days} day${b.days === 1 ? '' : 's'} of numbers)` : ' (no days in yet)'} • ${b.left} open day${b.left === 1 ? '' : 's'} left including today${b.closedDays ? ` (${b.closedDays} closed day${b.closedDays === 1 ? '' : 's'} not counted)` : ''}</p>` +
    `<section class="scsec"><h3>Month to date</h3><div class="gpgrid">
      ${kc('Revenue', gpMoney(b.rev), `${gpMoney(b.ref)} refunds • ${gpMoney(b.net)} net`)}
      ${kc('Revenue goal', b.goal ? gpMoney(b.goal) : 'Not set', b.goal ? `${Math.round(b.net / b.goal * 100)}% of goal so far` : 'Set it under Daily → Targets')}
      ${kc('Lead → demo', gpPct(b.l2d), `${b.booked} booked from ${b.leads} leads`)}
      ${kc('Show %', gpPct(b.show), `${b.held} of ${b.booked} booked showed`)}
      ${kc('Close %', gpPct(b.close), `${b.dsales} sold from ${b.held} demos`)}
      ${kc('Average sale', b.avg ? gpMoney(b.avg) : '–', `${gpMoney(b.rev)} ÷ ${b.sales} sale${b.sales === 1 ? '' : 's'} (${b.newS} new, ${b.back} back)`)}
    </div></section>` +
    `<section class="scsec"><h3>What it takes to hit the goal</h3>` + (!ok ? '<p class="lead">Set a monthly revenue goal for this studio (Daily tab → <b>Targets</b>) to see the math.</p>' : `
      <div class="gpmath">
        <div><span>Revenue goal</span><b>${gpMoney(b.goal)}</b></div>
        <div><span>− Net revenue so far</span><b>${gpMoney(b.net)}</b></div>
        <div><span>− Invoices still coming due <small>${b.invN} membership invoice${b.invN === 1 ? '' : 's'}, today – ${new Date(D.me + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small></span><b>${gpMoney(b.inv)}</b></div>
        <div class="gptot"><span>= Still needed from sales</span><b>${need <= 0 ? '✓ On track' : gpMoney(need)}</b></div>
      </div>
      ${need <= 0 ? `<p class="lead gpgood">Revenue so far plus the invoices coming due already covers the goal, ${gpMoney(-need)} over. Every sale from here is extra.</p>` : `
      <div class="gpgrid gpout">
        ${kc('Sales needed this month', salesN !== null ? gpNum(salesN) : '–', avg ? `at ${gpMoney(avg)} average sale` : 'needs an average sale')}
        ${kc('Sales $ needed per day', perDay !== null ? gpMoney(perDay) : '–', `${b.left} open days left`)}
        ${kc('Sales needed per day', gpNum(salesDay), '')}
        ${kc('Demos needed per day', gpNum(day(heldN)), heldN !== null ? `${gpNum(heldN, 0)} total at ${gpPct(close)} close` : 'needs a close %')}
        ${kc('Bookings needed per day', gpNum(day(bookN)), bookN !== null ? `${gpNum(bookN, 0)} total at ${gpPct(show)} show` : 'needs a show %')}
        ${kc('Leads needed per day', gpNum(day(leadN)), leadN !== null ? `${gpNum(leadN, 0)} total at ${gpPct(l2d)} lead → demo` : 'needs a lead → demo %')}
      </div>`}
      <details class="gpwhat"${Object.keys(O).length ? ' open' : ''}><summary>Try different numbers</summary>
        <p class="muted" style="margin:.3rem 0 .6rem;font-size:.85rem">Change the average sale or a rate to see what it would take, for example “what if we closed 50%?”. This doesn’t change any saved numbers.</p>
        <div class="gpins"><label>Average sale $${inp('avg', avg)}</label><label>Close ${inp('close', close, 1)}</label><label>Show ${inp('show', show, 1)}</label><label>Lead → demo ${inp('l2d', l2d, 1)}</label>
          ${Object.keys(O).length ? '<button class="quiet sm" id="gpReset">Back to this month’s real numbers</button>' : ''}</div>
      </details>`) + '</section>' +
    `<p class="muted gpnote">Revenue is ClubReady Gross Sales; average sale is that revenue divided by new agreements plus reactivations. Invoices are from the latest Members &amp; prospects upload (frozen memberships left out).</p>`;
}

$('pfBody').addEventListener('click', e => {
  if (PF.tab !== 'projection') return;
  const s = e.target.closest('[data-gps]'); if (s) { GP.studio = s.dataset.gps; loadGoalPlan(); return; }
  if (e.target.id === 'gpReset') { GP.over = {}; drawGoalPlan(); }
});
$('pfBody').addEventListener('change', e => {
  if (PF.tab !== 'projection' || !e.target.dataset.gpk) return;
  const k = e.target.dataset.gpk, raw = e.target.value.trim(), n = +raw;
  if (raw === '' || !isFinite(n) || n <= 0) delete GP.over[k]; else GP.over[k] = k === 'avg' ? n : n / 100;
  drawGoalPlan();
});
