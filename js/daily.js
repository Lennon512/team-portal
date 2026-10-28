// ---------- Daily & Weekly (replaces the DPR) ----------
// Mirrors the team's V4 Regional Report: a Daily Log filled once per studio per day, a morning
// review with one focus per studio, and weekly / month-to-date / last-30-day reviews.
const numOrNull = v => { v = String(v).trim(); return v === '' || isNaN(+v) ? null : +v; };
const DL = { day: '', studio: '', rows: [], pay: [], tgt: {}, from: '', to: '', missing: false, period: 'week', anchor: '', err: '' };
// Inputs in the order of the spreadsheet's Daily Log
const DLF = [
  ['Money', [['revenue', 'Revenue / collections', '$'], ['new_eft', 'New EFT added', '$'], ['refunds', 'Refunds / chargebacks', '$'], ['payroll', 'Payroll', '$']]],
  ['Sales funnel', [['leads', 'Leads'], ['contacts', 'Contacts'], ['demos_booked', 'Demos booked'], ['demos_held', 'Demos held'], ['agreements', 'New agreements']]],
  ['Members', [['cancellations', 'Cancellations'], ['freezes', 'Freezes'], ['reactivations', 'Reactivations'], ['active_members', 'Active members', '', 'invoices in the next 30 days']]],
  ['Schedule', [['slots_available', 'Available stretch slots'], ['stretches_completed', 'Completed stretches']]]];
const DL_NUM = DLF.flatMap(g => g[1].map(f => f[0])).filter(k => k !== 'payroll');
const DEF_T = { revenue_goal: null, labor_max: .4, l2d_target: .5, show_target: .8, close_target: .4, attrition_max: .1, contacts_target: 50, util_target: .65, nmg_target: 6 };
const FOCUSES = ["Complete yesterday's data", 'Lead follow-up & booking', 'Confirmations & show rate', 'Consult execution & closing', 'Member retention', 'Outbound activity', 'Schedule fill & rebooking', 'Protect momentum'];

const dAdd = (d, n) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + n); return ymd(x); };
const dLong = d => new Date(d + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const money = v => v === null || v === undefined || isNaN(v) ? '–' : '$' + Math.round(v).toLocaleString();
const pctf = v => v === null || v === undefined || !isFinite(v) ? '–' : Math.round(v * 100) + '%';
const numf = (v, d = 0) => v === null || v === undefined || !isFinite(v) ? '–' : (+v).toFixed(d).replace(/\.0+$/, '');
const tgtOf = sid => ({ ...DEF_T, ...(DL.tgt[sid] || {}) });
const canWrite = sid => ME.role === 'owner' || (ME.role === 'manager' && ME.location_id === sid);
const payOk = sid => ME.role === 'owner' || (ME.role === 'manager' && ME.location_id === sid);
const dlStudios = () => locs;
const monday = d => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };

// ----- data -----
async function dlFetch(from, to) {
  if (DL.from && from >= DL.from && to <= DL.to) return;
  const f = DL.from && DL.from < from ? DL.from : from, t = DL.to && DL.to > to ? DL.to : to;
  const [a, b, c] = await Promise.all([db.from('daily_log').select('*').gte('day', f).lte('day', t).limit(5000), db.from('daily_payroll').select('*').gte('day', f).lte('day', t).limit(5000), db.from('studio_targets').select('*')]);
  if (a.error) { DL.missing = /does not exist|relation|schema cache/i.test(a.error.message); DL.err = a.error.message; DL.rows = []; return; }
  DL.missing = false; DL.err = ''; DL.rows = a.data || []; DL.pay = b.error ? [] : (b.data || []); DL.from = f; DL.to = t;
  DL.tgt = {}; (c.data || []).forEach(x => DL.tgt[x.studio_id] = x);
}
const rowOf = (sid, d) => DL.rows.find(r => r.studio_id === sid && r.day === d);
const payOf = (sid, d) => { const p = DL.pay.find(r => r.studio_id === sid && r.day === d); return p ? p.payroll : null; };

// Totals and rates for one studio over a date range (same formulas as the workbook)
function agg(sid, from, to) {
  const rs = DL.rows.filter(r => (!sid || r.studio_id === sid) && r.day >= from && r.day <= to), S = k => rs.reduce((n, r) => n + (+r[k] || 0), 0);
  const ps = DL.pay.filter(r => (!sid || r.studio_id === sid) && r.day >= from && r.day <= to), payroll = ps.length ? ps.reduce((n, r) => n + (+r.payroll || 0), 0) : null;
  const o = Object.fromEntries(DL_NUM.map(k => [k, S(k)]));
  const act = rs.filter(r => +r.active_members > 0), days = Math.round((new Date(to + 'T00:00') - new Date(from + 'T00:00')) / DAY) + 1;
  o.entries = rs.length; o.payroll = payroll; o.open = rs.filter(r => r.open_day !== false && (r.contacts || r.leads || r.revenue || r.demos_held)).length;
  o.l2d = o.leads ? o.demos_booked / o.leads : null; o.show = o.demos_booked ? o.demos_held / o.demos_booked : null; o.close = o.demos_held ? o.agreements / o.demos_held : null;
  o.nmg = o.agreements + o.reactivations - o.cancellations;
  o.avgActive = act.length ? act.reduce((n, r) => n + +r.active_members, 0) / act.length : null;
  o.attrition = o.avgActive ? o.cancellations / o.avgActive : null; o.util = o.slots_available ? o.stretches_completed / o.slots_available : null;
  o.labor = payroll !== null && o.revenue ? payroll / o.revenue : null; o.cpd = o.open ? o.contacts / o.open : null; o.rpm = o.avgActive ? o.revenue / o.avgActive : null;
  const goals = sid ? [tgtOf(sid)] : dlStudios().map(l => tgtOf(l.id));
  const g = goals.reduce((n, t) => n + (+t.revenue_goal || 0), 0); o.goal = g ? g * 12 / 365 * days : null; o.gap = o.goal !== null ? o.revenue - o.goal : null; o.days = days;
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
  const weekly = REP.sub === 'weekly', r = weekly ? dlRange() : null;
  await dlFetch(weekly ? dAdd(r.pFrom, 0) : dAdd(DL.day, -1), weekly ? r.to : DL.day);
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
function drawDaily() {
  const d = DL.day, yest = dAdd(todayStr(), -1), sid = DL.studio, wr = canWrite(sid), r = rowOf(sid, d) || {}, t = tgtOf(sid);
  const editable = dlStudios().filter(l => canWrite(l.id));
  const prevActive = (() => { const p = DL.rows.filter(x => x.studio_id === sid && x.day < d && x.active_members).sort((a, b) => a.day < b.day ? 1 : -1)[0]; return p ? p.active_members : null; })();
  const inp = ([k, label, unit, hint]) => {
    if (k === 'payroll' && !payOk(sid)) return '';
    const v = k === 'payroll' ? payOf(sid, d) : r[k];
    return `<label class="dlin">${label}${hint ? ` <small class="muted">${hint}</small>` : ''}<span class="dlbox${unit === '$' ? ' usd' : ''}"><input type="number" inputmode="decimal" min="0" step="any" data-dl="${k}" value="${v ?? ''}" ${wr ? '' : 'disabled'} placeholder="${k === 'active_members' && prevActive !== null ? prevActive : ''}"></span></label>`;
  };
  const chips = editable.length > 1 ? `<div class="dlchips">${editable.map(l => `<button class="dlchip${l.id === sid ? ' on' : ''}${rowOf(l.id, d) ? ' done' : ''}" data-dlstudio="${l.id}">${rowOf(l.id, d) ? '✓ ' : ''}${esc(l.name)}</button>`).join('')}</div>` : '';
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
  const cls = (v, target, lower) => v === null || target === null || target === undefined ? '' : (lower ? v > target : v < target) ? 'bad' : 'good';
  const table = `<div class="table-wrap"><table class="mt ovt dlt"><thead><tr><th>Studio</th><th>Revenue</th><th>Leads</th><th>Contacts</th><th>Booked</th><th>Held</th><th>Sales</th><th>Cancels</th><th>React.</th><th>NMG</th><th>Active</th><th>Lead→demo</th><th>Show</th><th>Close</th><th>Util.</th>${showLabor ? '<th>Labor %</th>' : ''}<th>#1 focus</th></tr></thead><tbody>` +
    rv.map(({ l, row, a, tt, focus }) => row ? `<tr><td><b>${esc(l.name)}</b>${row.open_day === false ? '<small class="nm-sub">Closed</small>' : ''}</td><td>${money(a.revenue)}</td><td>${a.leads}</td><td class="${cls(a.contacts, tt.contacts_target)}">${a.contacts}</td><td>${a.demos_booked}</td><td>${a.demos_held}</td><td>${a.agreements}</td><td>${a.cancellations}</td><td>${a.reactivations}</td><td class="${a.nmg < 0 ? 'bad' : a.nmg > 0 ? 'good' : ''}">${a.nmg > 0 ? '+' : ''}${a.nmg}</td><td>${a.avgActive ? numf(a.avgActive) : '–'}</td>
      <td class="${a.leads >= 5 ? cls(a.l2d, tt.l2d_target) : ''}">${pctf(a.l2d)}</td><td class="${a.demos_booked >= 2 ? cls(a.show, tt.show_target) : ''}">${pctf(a.show)}</td><td class="${a.demos_held >= 2 ? cls(a.close, tt.close_target) : ''}">${pctf(a.close)}</td><td class="${a.util ? cls(a.util, tt.util_target) : ''}">${pctf(a.util)}</td>${showLabor ? `<td class="${payOk(l.id) ? cls(a.labor, tt.labor_max, true) : ''}">${payOk(l.id) ? pctf(a.labor) : '<span class="muted">–</span>'}</td>` : ''}<td><span class="dlfocus">${esc(focus)}</span></td></tr>`
      : `<tr class="dlmiss"><td><b>${esc(l.name)}</b></td><td colspan="${showLabor ? 15 : 14}"><span class="muted">Not entered yet</span>${canWrite(l.id) ? ` <button class="linkish" data-dlstudio="${l.id}">Enter now</button>` : ''}</td><td><span class="dlfocus miss">${esc(FOCUSES[0])}</span></td></tr>`).join('') + '</tbody></table></div>';
  const done = rv.filter(x => x.row).length;
  $('dlBody').innerHTML = `<div class="dlnav"><button class="quiet" data-dlday="-1" aria-label="Previous day">‹</button><label class="tk-daylbl"><b>${d === yest ? 'Yesterday' : d === todayStr() ? 'Today' : ''} <small>${dLong(d)}</small></b><input type="date" id="dlDate" value="${d}" max="${todayStr()}"></label><button class="quiet" data-dlday="1" aria-label="Next day" ${d >= todayStr() ? 'disabled' : ''}>›</button>${d !== yest ? '<button class="quiet sm" data-dlday="y">Back to yesterday</button>' : ''}
      ${ME.role === 'owner' && REP.sub === 'enter' ? '<span class="dltools"><button class="quiet sm" id="dlTargets">Targets</button><button class="quiet sm" id="dlImport">Import from spreadsheet</button></span>' : ''}</div>` +
    (REP.sub === 'enter' ? (form || '<div class="pcard"><p>Only managers and the owner can enter numbers.</p></div>') + (form ? `<p class="dlgo"><button class="quiet" data-dlgo="dpr">See the daily review →</button></p>` : '') : (editable.length ? `<div class="dlcta"><span>${done} of ${rv.length} studios entered for ${dLong(d)}</span><button data-dlgo="enter">Enter numbers</button></div>` : '') + `<section class="scsec"><h3>Morning review • ${dLong(d)} <span class="hcount">${done} of ${rv.length} entered</span></h3>${table}</section>`);
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
  const a = DL.anchor || dAdd(todayStr(), -1);
  if (DL.period === 'week') { const from = monday(a), to = dAdd(from, 6); return { from, to, pFrom: dAdd(from, -7), pTo: dAdd(from, -1), label: `Week of ${fmt(from)} – ${fmt(to)}`, plabel: 'prior week' }; }
  if (DL.period === 'mtd') {
    const from = a.slice(0, 8) + '01', last = ymd(new Date(+a.slice(0, 4), +a.slice(5, 7), 0)), yest = dAdd(todayStr(), -1), to = last < yest ? last : (yest < from ? from : yest);
    const n = Math.round((new Date(to + 'T00:00') - new Date(from + 'T00:00')) / DAY), pFrom = mAdd(from, -1), pEndMax = dAdd(from, -1), pTo = dAdd(pFrom, n) > pEndMax ? pEndMax : dAdd(pFrom, n);
    return { from, to, pFrom, pTo, last, label: new Date(from + 'T00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + (to < last ? ` to date (through ${fmt(to)})` : ''), plabel: `same days of ${new Date(pFrom + 'T00:00').toLocaleDateString('en-US', { month: 'short' })}` };
  }
  const to = a, from = dAdd(to, -29); return { from, to, pFrom: dAdd(from, -30), pTo: dAdd(from, -1), label: `Last 30 days • ${fmt(from)} – ${fmt(to)}`, plabel: 'prior 30 days' };
}

function drawWeekly() {
  const R = dlRange(), st = dlStudios(), allPay = st.every(l => payOk(l.id)), anyPay = st.some(l => payOk(l.id));
  const cur = Object.fromEntries(st.map(l => [l.id, agg(l.id, R.from, R.to)])), prv = Object.fromEntries(st.map(l => [l.id, agg(l.id, R.pFrom, R.pTo)]));
  const reg = agg('', R.from, R.to), rp = agg('', R.pFrom, R.pTo);
  if (!allPay) { reg.payroll = null; reg.labor = null; rp.labor = null; }
  const T = { ...DEF_T }; // region targets: workbook uses the same defaults for every studio
  const ch = (a, b, f, lower) => { if (a === null || b === null || a === undefined || b === undefined) return ''; if (f === 'pct') { const d = (a - b) * 100; return Math.abs(d) < .5 ? '' : `<span class="${(d > 0) !== !!lower ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(0)} pts</span>`; } if (!b) return ''; const d = (a - b) / Math.abs(b) * 100; return Math.abs(d) < .5 ? '' : `<span class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(0)}%</span>`; };
  const card = (label, v, f, prev, target, lower, sub) => { const s = target === null || target === undefined || v === null ? '' : (lower ? v <= target : v >= target) ? '<span class="rkb top">On target</span>' : `<span class="rkb low">${lower ? 'Over target' : 'Below target'}</span>`;
    const fv2 = f === 'usd' ? money(v) : f === 'pct' ? pctf(v) : (f === 'signed' && v > 0 ? '+' : '') + numf(v);
    return `<div class="kt dlk"><span class="kn">${label}</span><b>${fv2}</b><span class="kdl">${ch(v, prev, f === 'pct' ? 'pct' : '', lower)}${prev !== null && prev !== undefined ? ` <span class="muted">vs ${f === 'usd' ? money(prev) : f === 'pct' ? pctf(prev) : numf(prev)} ${R.plabel}</span>` : ''}</span>${sub || ''}${s}</div>`; };
  const goalSub = reg.goal ? `<span class="kdl">Goal ${money(reg.goal)} • <span class="${reg.gap >= 0 ? 'up' : 'dn'}">${reg.gap >= 0 ? '+' : '−'}${money(Math.abs(reg.gap))}</span></span>` : '';
  const pace = DL.period === 'mtd' && R.to < R.last ? (() => { const el = Math.round((new Date(R.to + 'T00:00') - new Date(R.from + 'T00:00')) / DAY) + 1, all = +R.last.slice(8, 10); return v => v / el * all; })() : null;
  const paceSub = pace && reg.revenue ? (() => { const mg = st.reduce((n, l) => n + (+tgtOf(l.id).revenue_goal || 0), 0), p = pace(reg.revenue); return `<span class="kdl">On pace for <b>${money(p)}</b>${mg ? ` vs ${money(mg)} goal` : ''}</span>`; })() : '';
  const snap = `<div class="kgrid kg4">${card('Revenue', reg.revenue, 'usd', rp.revenue, null, false, goalSub + paceSub)}${allPay ? card('Labor %', reg.labor, 'pct', rp.labor, T.labor_max, true, reg.payroll !== null ? `<span class="kdl">Payroll ${money(reg.payroll)}</span>` : '') : ''}${card('Net member growth', reg.nmg, 'signed', rp.nmg, null, false, `<span class="kdl">${reg.agreements} new • ${reg.reactivations} back • ${reg.cancellations} cancelled</span>`)}${card('Leads', reg.leads, '', rp.leads)}${card('Lead → demo', reg.l2d, 'pct', rp.l2d, T.l2d_target)}${card('Show rate', reg.show, 'pct', rp.show, T.show_target)}${card('Close rate', reg.close, 'pct', rp.close, T.close_target)}${card('Utilization', reg.util, 'pct', rp.util, T.util_target)}</div>`;
  // Studio scorecard
  const tone = (v, t, lower) => v === null || t === null || t === undefined ? '' : (lower ? v > t : v < t) ? 'bad' : 'good';
  const flag = (a, t, sid) => a.gap !== null && a.gap < 0 ? 'REVENUE' : payOk(sid) && a.labor !== null && a.labor > t.labor_max ? 'LABOR' : a.l2d !== null && a.l2d < t.l2d_target ? 'BOOKING' : a.attrition !== null && a.attrition > t.attrition_max ? 'RETENTION' : 'MONITOR';
  const has = st.filter(l => cur[l.id].entries);
  const row = (name, a, p, t, sid, total) => `<tr${total ? ' class="dltot"' : ''}><td><b>${esc(name)}</b>${!total && p.revenue && ch(a.revenue, p.revenue) ? `<small class="nm-sub">${ch(a.revenue, p.revenue)} revenue</small>` : ''}</td><td>${money(a.revenue)}</td>${pace ? `<td>${money(pace(a.revenue))}</td>` : ''}<td>${money(a.goal)}</td><td class="${a.gap === null ? '' : a.gap >= 0 ? 'good' : 'bad'}">${a.gap === null ? '–' : (a.gap >= 0 ? '+' : '−') + money(Math.abs(a.gap))}</td>` +
    (anyPay ? `<td>${(total ? allPay : payOk(sid)) ? money(a.payroll) : '<span class="muted">–</span>'}</td><td class="${(total ? allPay : payOk(sid)) ? tone(a.labor, t.labor_max, true) : ''}">${(total ? allPay : payOk(sid)) ? pctf(a.labor) : '<span class="muted">–</span>'}</td>` : '') +
    `<td>${a.leads}</td><td>${a.contacts}</td><td class="${tone(a.cpd, t.contacts_target)}">${numf(a.cpd)}</td><td>${a.demos_booked}</td><td class="${tone(a.l2d, t.l2d_target)}">${pctf(a.l2d)}</td><td>${a.demos_held}</td><td class="${tone(a.show, t.show_target)}">${pctf(a.show)}</td><td>${a.agreements}</td><td class="${tone(a.close, t.close_target)}">${pctf(a.close)}</td><td>${a.cancellations}</td><td>${a.reactivations}</td><td class="${a.nmg < 0 ? 'bad' : a.nmg > 0 ? 'good' : ''}">${a.nmg > 0 ? '+' : ''}${a.nmg}</td><td>${total ? '' : `<span class="dlflag ${flag(a, t, sid).toLowerCase()}">${flag(a, t, sid)}</span>`}</td></tr>`;
  const score = `<div class="table-wrap"><table class="mt ovt dlt"><thead><tr><th>Studio</th><th>Revenue</th>${pace ? '<th>Month-end pace</th>' : ''}<th>Goal</th><th>Gap</th>${anyPay ? '<th>Payroll</th><th>Labor %</th>' : ''}<th>Leads</th><th>Contacts</th><th>Contacts / day</th><th>Booked</th><th>Lead→demo</th><th>Held</th><th>Show</th><th>Sales</th><th>Close</th><th>Cancels</th><th>React.</th><th>NMG</th><th>Priority</th></tr></thead><tbody>` +
    st.map(l => cur[l.id].entries ? row(l.name, cur[l.id], prv[l.id], tgtOf(l.id), l.id) : `<tr class="dlmiss"><td><b>${esc(l.name)}</b></td><td colspan="${17 + (anyPay ? 2 : 0) + (pace ? 1 : 0)}"><span class="muted">No entries for this period</span></td></tr>`).join('') +
    `</tbody><tfoot>${row('Region', reg, rp, T, '', true)}</tfoot></table></div>`;
  // Capacity & retention
  const cap = `<div class="table-wrap"><table class="mt ovt dlt"><thead><tr><th>Studio</th><th>Open days</th><th>Avg active members</th><th>Attrition</th><th>Freezes</th><th>Stretches</th><th>Available slots</th><th>Utilization</th><th>Revenue / member</th></tr></thead><tbody>` +
    has.map(l => { const a = cur[l.id], t = tgtOf(l.id); return `<tr><td><b>${esc(l.name)}</b></td><td>${a.open}</td><td>${numf(a.avgActive)}</td><td class="${tone(a.attrition, t.attrition_max, true)}">${pctf(a.attrition)}</td><td>${a.freezes}</td><td>${a.stretches_completed}</td><td>${numf(a.slots_available)}</td><td class="${tone(a.util, t.util_target)}">${pctf(a.util)}</td><td>${money(a.rpm)}</td></tr>`; }).join('') + '</tbody></table></div>';
  // Notes and actions logged during the period
  const notes = DL.rows.filter(r => r.day >= R.from && r.day <= R.to && (r.notes || r.action)).sort((a, b) => a.day < b.day ? 1 : -1);
  const nlist = notes.length ? `<ul class="dlnotes">${notes.map(r => `<li><b>${esc(studio(r.studio_id))}</b> <span class="muted">${fmt(r.day)}</span>${r.notes ? `<div>${esc(r.notes)}</div>` : ''}${r.action ? `<div class="dlact">Action: ${esc(r.action)}</div>` : ''}</li>`).join('')}</ul>` : '<p class="muted" style="margin:0">No notes or manager actions logged in this period.</p>';
  const seg = (k, l) => `<button type="button" data-dlper="${k}" class="${DL.period === k ? 'on' : ''}">${l}</button>`;
  $('dlBody').innerHTML = `<div class="dlnav"><span class="tabs toseg">${seg('week', 'Week')}${seg('mtd', 'Month to date')}${seg('30', 'Last 30 days')}</span>
      <button class="quiet" data-dlstep="-1" aria-label="Earlier">‹</button><b class="dlrange">${R.label}</b><button class="quiet" data-dlstep="1" aria-label="Later" ${R.to >= dAdd(todayStr(), -1) ? 'disabled' : ''}>›</button>
      ${ME.role === 'owner' ? '<span class="dltools"><button class="quiet sm" id="dlTargets">Targets</button></span>' : ''}</div>` +
    `<section class="scsec"><h3>Region snapshot <span class="muted" style="font-weight:400;font-size:.85rem">vs ${R.plabel}</span></h3>${snap}</section>` +
    `<section class="scsec"><h3>Studio scorecard</h3><p class="lead" style="margin:-.3rem 0 .7rem;font-size:.88rem">Goals are each studio’s monthly revenue goal spread over the days in this period. Green and red compare against each studio’s targets. Priority follows the spreadsheet: revenue gap first, then labor, booking, retention.</p>${score}</section>` +
    `<section class="scsec"><h3>Capacity & retention</h3>${has.length ? cap : '<p class="muted">No entries for this period.</p>'}</section>` +
    `<section class="scsec"><h3>Notes & manager actions</h3>${nlist}</section>`;
}

// ----- targets (owner) -----
function dlTargetsForm() {
  const f = (sid, k, pct) => { const v = tgtOf(sid)[k]; return `<input type="number" step="any" min="0" data-tg="${k}" data-sid="${sid}" value="${v === null || v === undefined ? '' : pct ? Math.round(v * 100) : v}">`; };
  $('dlgBody').innerHTML = `<h2>Studio targets</h2><p class="lead" style="margin:.25rem 0 1rem">Used for goals, colors, focus picks and priority flags. Percentages are whole numbers (40 = 40%).</p>
    <div class="table-wrap"><table class="mt dltg"><thead><tr><th>Studio</th><th>Monthly revenue goal $</th><th>Labor max %</th><th>Lead→demo %</th><th>Show %</th><th>Close %</th><th>Attrition max %</th><th>Contacts / day</th><th>Utilization %</th><th>Monthly NMG</th></tr></thead><tbody>` +
    dlStudios().map(l => `<tr><td><b>${esc(l.name)}</b></td><td>${f(l.id, 'revenue_goal')}</td><td>${f(l.id, 'labor_max', 1)}</td><td>${f(l.id, 'l2d_target', 1)}</td><td>${f(l.id, 'show_target', 1)}</td><td>${f(l.id, 'close_target', 1)}</td><td>${f(l.id, 'attrition_max', 1)}</td><td>${f(l.id, 'contacts_target')}</td><td>${f(l.id, 'util_target', 1)}</td><td>${f(l.id, 'nmg_target')}</td></tr>`).join('') +
    `</tbody></table></div><div id="tgErr" class="err" role="alert"></div><div class="acts"><button data-act="tgSave">Save targets</button><button class="quiet" data-act="close">Cancel</button></div>`;
  $('dlg').classList.add('dlwide'); $('dlg').showModal();
}
async function dlTargetsSave() {
  const P = new Set(['labor_max', 'l2d_target', 'show_target', 'close_target', 'attrition_max', 'util_target']), by = {};
  document.querySelectorAll('[data-tg]').forEach(el => { const s = el.dataset.sid, k = el.dataset.tg, v = numOrNull(el.value); (by[s] = by[s] || { studio_id: s, updated_at: new Date().toISOString() })[k] = v === null ? null : P.has(k) ? v / 100 : v; });
  const { error } = await db.from('studio_targets').upsert(Object.values(by), { onConflict: 'studio_id' });
  if (error) { $('tgErr').textContent = 'Could not save. ' + error.message; return; }
  Object.values(by).forEach(x => DL.tgt[x.studio_id] = { ...(DL.tgt[x.studio_id] || {}), ...x });
  $('dlg').close(); toast('Targets saved'); REP.sub === 'weekly' ? drawWeekly() : drawDaily();
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
  const pr = at('[data-dlper]'); if (pr) { DL.period = pr.dataset.dlper; loadDpr(); return; }
  const sp = at('[data-dlstep]'); if (sp) { const s = +sp.dataset.dlstep, a = DL.anchor || dAdd(todayStr(), -1);
    DL.anchor = DL.period === 'week' ? dAdd(a, 7 * s) : DL.period === 'mtd' ? (s < 0 ? ymd(new Date(+a.slice(0, 4), +a.slice(5, 7) - 1, 0)) : ymd(new Date(+a.slice(0, 4), +a.slice(5, 7), 1 + 0)).slice(0, 8) + '28') : dAdd(a, 30 * s);
    if (DL.anchor > dAdd(todayStr(), -1)) DL.anchor = dAdd(todayStr(), -1); loadDpr(); return; }
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
