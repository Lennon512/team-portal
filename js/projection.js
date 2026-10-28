// ---------- Projection: a what-if planner for one studio's month ----------
const PJ = { E: (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; },
  $m: v => '$' + Math.round(+v || 0).toLocaleString(), $p: v => Math.round((+v || 0) * 1000) / 10 };

function pjCalc(b, s) {
  const L = s.ld * b.rem, S = L * s.l2d, H = S * s.show, N = H * s.close, V = N * (s.eft + s.cash), D = s.canc * b.rem * s.eft;
  return { L, H, N, V, D, P: b.gross + b.due + V - D };
}
function pjHist(sid, n, d, k) { return PF.rows.filter(r => r.studio_id === sid).map(r => n && d ? (+r[d] ? +r[n] / +r[d] : null) : (r[k] == null ? null : +r[k])).filter(v => v != null && isFinite(v)); }
function pjNote(sid, v, n, d, k, p) {
  const h = pjHist(sid, n, d, k); if (!h.length) return 'No prior monthly history yet.';
  const best = Math.max(...h), hit = h.some(x => x >= v * .995), z = p ? PJ.$p(best) + '%' : best.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return (hit ? 'Previously achieved. ' : 'Stretch target. ') + 'Best recorded: ' + z + '.';
}

function pjBase() {
  const sid = PF.studio, r = PF.rows.find(x => x.studio_id === sid && x.month === PF.month) || {}, q = PF.projData || { daily: [], goal: 0, due: 0 };
  const a = q.daily, y = +PF.month.slice(0, 4), m = +PF.month.slice(5, 7), days = new Date(y, m, 0).getDate(), now = todayStr();
  const isCurrentMonth = now.slice(0, 7) === PF.month.slice(0, 7);
  let elapsed = isCurrentMonth ? +now.slice(8, 10) : (now < PF.month ? 0 : days);
  const dataDay = a.map(x => +(x.day || '').slice(8, 10)).filter(Boolean);
  if (!isCurrentMonth && dataDay.length) elapsed = Math.max(...dataDay);
  elapsed = Math.max(1, Math.min(days, elapsed));
  const sum = k => a.reduce((n, x) => n + (+x[k] || 0), 0);
  const last = k => { const z = a.filter(x => x[k] != null).sort((x, y2) => x.day < y2.day ? 1 : -1); return z.length ? +z[0][k] : null; };
  const leads = sum('total_leads') || +r.leads || 0, sch = sum('demos_scheduled') || +r.scheduled || 0, demos = sum('demos_showed') || +r.demos || 0, sales = sum('demo_sales') || +r.agreements || 0;
  let g = last('mtd_gross'); if (g == null) g = +r.gross_revenue || 0;
  const eft = +r.avg_eft || 275, cash = +r.cash_sales || 0;
  return { sid, days, elapsed, isCurrentMonth, hasDaily: !!dataDay.length, rem: Math.max(0, days - elapsed), gross: g, due: +q.due || 0, goal: q.goal || 0,
    ld: leads / elapsed, l2d: leads ? sch / leads : 0, show: sch ? demos / sch : 0, close: demos ? sales / demos : 0, eft, cash: sales ? cash / sales : (cash || 150),
    counts: { leads, sch, demos, sales }, canc: (sum('cancellations') || +r.cancellations || 0) / elapsed };
}

async function loadProjection() {
  const own = ME.role === 'owner';
  if (!own && ME.location_id) PF.studio = ME.location_id;
  const av = locs.filter(l => PF.rows.some(r => r.studio_id === l.id));
  if (!PF.studio || !av.some(l => l.id === PF.studio)) PF.studio = (av[0] || {}).id || '';
  if (!PF.studio) { $('pfBody').innerHTML = '<p class="lead">Add monthly studio data first, on the Austin scorecard tab.</p>'; return; }
  $('pfBody').innerHTML = '<p class="lead">Loading projection...</p>';
  const end = mAdd(PF.month, 1), today = todayStr(), monthStart = PF.month + '-01';
  const [d, g, members] = await Promise.all([
    db.from('dpr_daily').select('*').eq('studio_id', PF.studio).gte('day', PF.month).lt('day', end),
    db.from('dpr_goals').select('*').eq('studio_id', PF.studio).lte('month', PF.month).order('month', { ascending: false }).limit(1),
    db.from('member_snapshot').select('next_due,amount,frozen').eq('studio_id', PF.studio).limit(5000)
  ]);
  const due = (members.data || []).filter(r => !r.frozen && r.next_due && r.next_due >= (today.slice(0, 7) === PF.month ? today : monthStart) && r.next_due < end).reduce((n, r) => n + (+r.amount || 0), 0);
  PF.projData = { daily: d.data || [], goal: (g.data && g.data[0] && +g.data[0].revenue) || 0, due };
  PF.projScenario = null;
  drawProjection();
}

function drawProjection() {
  const b = pjBase();
  if (!b.isCurrentMonth && !b.hasDaily) {
    // A past month with no day-by-day DPR entries has nothing to plan, it's already over.
    // Show what actually happened instead of guessing how much of the month had passed.
    $('pfBody').innerHTML = `<p class="lead">${esc((locs.find(l => l.id === b.sid) || {}).name)} \u2022 ${mLbl(PF.month, 1)} is a closed month with no daily DPR entries on file, so there is nothing to project.</p>
      <div class="sum">${tile(m$(b.gross), 'Recorded gross revenue')}${tile(b.counts.leads, 'Leads')}${tile(b.counts.demos, 'Demos')}${tile(b.counts.sales, 'New agreements')}</div>`;
    return;
  }
  const cur = { ld: b.ld, l2d: b.l2d, show: b.show, close: b.close, eft: b.eft, cash: b.cash, canc: b.canc };
  PF.projScenario = PF.projScenario || cur;
  const { E, $m, $p } = PJ, B = $('pfBody'); B.replaceChildren();
  const reset = E('button', 'quiet', 'Reset to current performance'); reset.id = 'pjReset'; reset.type = 'button'; reset.style.margin = '.5rem 0 1rem';
  B.append(E('h3', 'sub', (locs.find(l => l.id === b.sid) || {}).name + ' \u2022 ' + mLbl(PF.month, 1)),
    E('p', 'lead', 'Planning model based on actual performance. Scenario changes never overwrite real KPIs.' + (b.isCurrentMonth ? '' : ' This month has ended, so the scenario below assumes the month is fully played out.')),
    reset);
  const outWrap = E('div'); B.append(outWrap);
  const controls = E('div', 'pj-controls');
  controls.append(E('h3', 'sub', 'What are we going to change?'), E('p', 'lead', 'The baseline assumes the current sales process continues. Change the levers below to see a different month-end result.'));
  const grid = E('div', 'pj-grid');
  const field = (id, label, val, step, help) => {
    const box = E('div', 'pj-box'), l = E('label', '', label), i = document.createElement('input');
    i.id = id; i.type = 'number'; i.min = 0; i.step = step; i.value = val;
    l.append(i); box.append(l, E('small', '', help)); grid.append(box);
  };
  field('pjLeads', 'Leads per day', cur.ld.toFixed(1), .1, pjNote(b.sid, cur.ld * b.days, null, null, 'leads', false));
  field('pjL2d', 'Lead \u2192 Demo %', $p(cur.l2d), .1, 'Current: ' + b.counts.sch + ' of ' + b.counts.leads + ' leads scheduled. ' + pjNote(b.sid, cur.l2d, 'scheduled', 'leads', null, true));
  field('pjShow', 'Show rate %', $p(cur.show), .1, 'Current: ' + b.counts.demos + ' of ' + b.counts.sch + ' scheduled demos showed. ' + pjNote(b.sid, cur.show, 'demos', 'scheduled', null, true));
  field('pjClose', 'Close rate %', $p(cur.close), .1, 'Current: ' + b.counts.sales + ' of ' + b.counts.demos + ' shows closed. ' + pjNote(b.sid, cur.close, 'agreements', 'demos', null, true));
  field('pjEft', 'Average EFT $', cur.eft.toFixed(0), 1, 'Recurring value per new sale. ' + pjNote(b.sid, cur.eft, null, null, 'avg_eft', false));
  field('pjCash', 'Cash per sale $', cur.cash.toFixed(0), 5, 'Estimated from cash sales divided by agreements.');
  field('pjCanc', 'Cancellations per day', cur.canc.toFixed(2), .1, 'Lower is better. Used to estimate cancellation drag.');
  controls.append(grid, E('p', 'pj-formula', 'Current gross + invoices coming due + modeled future sales \u2212 cancellation drag'));
  const visual = E('div', 'pj-visual');
  const workspace = E('div', 'pj-workspace'); workspace.append(controls, visual); B.append(workspace);
  const impactWrap = E('div'); B.append(impactWrap);
  const pathsHead = E('div'); B.append(pathsHead);
  const pathsWrap = E('div'); B.append(pathsWrap);
  PF.projDom = { outWrap, visual, impactWrap, pathsHead, pathsWrap };
  pjRenderOutputs(b, cur, outWrap, visual, impactWrap, pathsHead, pathsWrap);
}

// Redraws only the read-only panels (numbers, chart-free visual, impact, paths), never the
// <input> elements themselves, so typing in a box does not knock the cursor out of it.
function pjRenderOutputs(b, cur, outWrap, visual, impactWrap, pathsHead, pathsWrap) {
  const { E, $m } = PJ, s = PF.projScenario || cur, x = pjCalc(b, s), cx = pjCalc(b, cur), gap = b.goal ? b.goal - x.P : null;
  outWrap.replaceChildren();
  const top = E('div', 'pj-top pj-top-five');
  [['Current gross', b.gross], ['Invoices coming due', b.due], ['Baseline new sales', cx.V], ['If nothing changes', cx.P], ['Scenario month-end', x.P]].forEach((a, i) => {
    const c = E('div', 'pj-card' + (i === 3 && b.goal && cx.P >= b.goal ? ' hit' : ''));
    c.append(E('small', '', a[0]), E('b', '', a[1] == null ? '-' : $m(a[1])));
    top.append(c);
  });
  outWrap.append(top);
  if (b.goal) { const baseGap = b.goal - cx.P; outWrap.append(E('div', 'pj-baseline', baseGap > 0 ? 'If nothing changes, this studio is projected to finish ' + $m(baseGap) + ' below goal. What are we going to change?' : 'If nothing changes, this studio is projected to finish ' + $m(Math.abs(baseGap)) + ' above goal. Use the scenario below to pressure-test the plan.')); }
  else outWrap.append(E('div', 'cmp-note', 'No DPR revenue goal is set yet. Add one on the DPR tab to enable exact gap-to-goal guidance.'));

  visual.replaceChildren();
  visual.append(E('h3', '', 'Funnel impact \u2192 revenue'));
  [['Future leads', cx.L, x.L, 0], ['Demos scheduled', cx.L * cur.l2d, x.L * s.l2d, 0], ['Shows', cx.H, x.H, 0], ['Sales', cx.N, x.N, 0], ['New sales value', cx.V, x.V, 1], ['Month-end revenue', cx.P, x.P, 1]].forEach(r => {
    const d = r[2] - r[1], fmt = v => r[3] ? $m(v) : (+v).toFixed(1), w = E('div', 'pj-flow-row');
    w.append(E('b', '', r[0]), E('span', 'pj-base', fmt(r[1])), E('span', 'pj-arrow', '\u2192'), E('strong', '', fmt(r[2])), E('span', 'pj-delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat'), (d > 0 ? '+' : '') + fmt(d)));
    visual.append(w);
  });

  impactWrap.replaceChildren();
  const out = E('div', 'pj-impact');
  out.append(E('div', 'pj-impact-title', 'Scenario impact'));
  [['Future leads', Math.round(x.L)], ['Future shows', Math.round(x.H)], ['Future sales', x.N.toFixed(1)], ['Added sales value', $m(x.V)], ['Cancellation drag', $m(x.D)]].forEach(a => {
    const c = E('div', 'pj-impact-card'); c.append(E('small', '', a[0]), E('b', '', a[1])); out.append(c);
  });
  impactWrap.append(out);

  pathsHead.replaceChildren(); pathsHead.append(E('h3', 'sub', 'Paths to work the gap'), E('p', 'lead', 'Use these as operating directions, then test the assumptions above.'));
  pathsWrap.replaceChildren();
  const paths = E('div', 'pj-paths'), need = gap > 0 ? Math.ceil(gap / Math.max(1, s.eft + s.cash)) : 0, conv = s.l2d * s.show * s.close, leadsNeeded = need && conv ? Math.ceil(need / conv) : 0;
  const msg = gap == null ? ['Set a revenue goal to calculate required sales.', 'A goal will translate the gap into required leads.', 'Test a combination of volume and conversion above.']
    : gap <= 0 ? ['This scenario reaches goal with ' + $m(Math.abs(gap)) + ' cushion.', 'Protect lead flow and show rate.', 'Lower assumptions to find a conservative goal-hitting plan.']
    : ['About ' + need + ' additional sales close the ' + $m(gap) + ' gap.', 'At these conversion rates, that is about ' + leadsNeeded + ' additional leads.', 'Improve several levers modestly, history notes show what has been achieved before.'];
  ['1. Sales path', '2. Lead-volume path', '3. Balanced path'].forEach((t, i) => { const z = E('div', 'pj-box'); z.append(E('h4', '', t), E('p', '', msg[i])); paths.append(z); });
  pathsWrap.append(paths);
}

function pjRead(b) {
  const v = (id, fallback) => { const el = $(id); return el == null || el.value === '' ? fallback : +el.value; };
  return { ld: Math.max(0, v('pjLeads', b.ld)), l2d: Math.min(1, Math.max(0, v('pjL2d', PJ.$p(b.l2d)) / 100)), show: Math.min(1, Math.max(0, v('pjShow', PJ.$p(b.show)) / 100)),
    close: Math.min(1, Math.max(0, v('pjClose', PJ.$p(b.close)) / 100)), eft: Math.max(0, v('pjEft', b.eft)), cash: Math.max(0, v('pjCash', b.cash)), canc: Math.max(0, v('pjCanc', b.canc)) };
}
$('pfBody').addEventListener('click', e => { if (e.target && e.target.id === 'pjReset' && PF.tab === 'projection') { PF.projScenario = null; drawProjection(); } });
$('pfBody').addEventListener('input', e => {
  if (PF.tab !== 'projection' || !PF.projDom || !e.target || !['pjLeads', 'pjL2d', 'pjShow', 'pjClose', 'pjEft', 'pjCash', 'pjCanc'].includes(e.target.id)) return;
  const b = pjBase(); PF.projScenario = pjRead(b);
  const { outWrap, visual, impactWrap, pathsHead, pathsWrap } = PF.projDom;
  pjRenderOutputs(b, { ld: b.ld, l2d: b.l2d, show: b.show, close: b.close, eft: b.eft, cash: b.cash, canc: b.canc }, outWrap, visual, impactWrap, pathsHead, pathsWrap);
});

function fmtNet(v, f) {
  return v === null || v === undefined || v === '' || isNaN(v) ? '-' : f === 'usd' ? '$' + Math.round(v).toLocaleString() : f === 'usd2' ? '$' + (+v).toFixed(2) : f === 'pct' ? (+v * 100).toFixed(0) + '%' : f === 'dec' ? (+v).toFixed(1) : Math.round(v).toLocaleString();
}

async function loadMaster() {
  if (ME.role !== 'owner') { $('pfBody').innerHTML = '<p class="lead">Only the owner can see the full Stretch Zone network.</p>'; return; }
  if (!PF.netAll[PF.month]) {
    $('pfBody').innerHTML = '<p class="lead">Loading the network...</p>';
    const { data, error } = await db.from('kpi_network_all').select('*').eq('month', PF.month).limit(1000);
    if (error) { $('pfBody').innerHTML = '<p class="lead">Could not load the network. ' + esc(error.message) + '</p>'; return; }
    PF.netAll[PF.month] = data || [];
  }
  drawMaster();
}

function drawMaster() {
  if (PF.netStore) return drawNetStore();
  const rows = PF.netAll[PF.month] || [];
  if (!rows.length) { $('pfBody').innerHTML = '<p class="lead">No network-wide scorecard loaded for ' + esc(mLbl(PF.month, 1)) + ' yet. Use Update data \u2192 Upload corporate scorecard.</p>'; return; }
  const yours = new Set(locs.map(l => l.club_store_id).filter(Boolean));
  const q = PF.mFind.trim().toLowerCase();
  const filtered = rows.filter(r => !q || (r.name || '').toLowerCase().includes(q) || (r.franchise || '').toLowerCase().includes(q) || (r.tier || '').toLowerCase().includes(q));
  const [sortTab, sortKey] = PF.mSort.split('->');
  const sortVal = r => sortTab === 'kpis' ? r.kpis[sortKey] : r[sortKey];
  filtered.sort((a, b) => { const av = sortVal(a), bv = sortVal(b); const an = av === null || av === undefined, bn = bv === null || bv === undefined; if (an && bn) return 0; if (an) return 1; if (bn) return -1; const cmp = av < bv ? -1 : av > bv ? 1 : 0; return PF.mDir * cmp; });
  const th = (key, label) => `<th data-sort="${key}" class="${PF.mSort === key ? 'on' : ''}" title="Sort by ${label}">${label}${PF.mSort === key ? (PF.mDir < 0 ? ' \u25BE' : ' \u25B4') : ''}</th>`;
  const body = filtered.map(r => `<tr class="${yours.has(r.store) ? 'yours' : ''}" data-store="${esc(r.store)}"><td><b>${esc(r.name || r.store)}</b></td><td>${esc(r.franchise || '')}</td><td>${esc(r.tier || '')}</td>` +
    CORP.map(([k, , f]) => `<td>${fmtNet(r.kpis[k], f)}</td>`).join('') + '</tr>').join('');
  $('pfBody').innerHTML = `<p class="lead" style="margin:0 0 .75rem">Every Stretch Zone location from the corporate scorecard for ${esc(mLbl(PF.month, 1))} \u2014 <b>${filtered.length}</b> of ${rows.length} locations${q ? ' matching your search' : ''}. Your six studios are highlighted. Click a location to see its own scorecard and trends. Click a column heading to sort.</p>
    <div class="netbar"><input type="search" id="mFindBox" placeholder="Search by name, franchise, or tier" value="${esc(PF.mFind)}"></div>
    <div class="table-wrap"><table class="mt"><thead><tr>${th('row->name', 'Location')}${th('row->franchise', 'Franchise')}${th('row->tier', 'Tier')}${CORP.map(([k, n]) => th('kpis->' + k, n)).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}


function pfForm(sid, month) {
  sid = sid || PF.studio || (locs[0] || {}).id; month = month || mAdd(todayStr().slice(0, 7) + '-01', -1);
  const r = PF.rows.find(x => x.studio_id === sid && x.month === month) || {};
  $('dlgBody').innerHTML = `<h2>Add or edit a month</h2><p class="lead" style="margin:.25rem 0 1rem">Pick a studio and month. If numbers already exist they fill in below; saving replaces them.</p>
    <div class="grid2"><label>Studio <select id="pStudio">${locs.filter(l => PF.rows.some(x => x.studio_id === l.id) || l.id === sid).map(l => `<option value="${l.id}" ${l.id === sid ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
    <label>Month <input id="pMonth" type="month" value="${month.slice(0, 7)}"></label>
    ${RAW.map(([k, n]) => `<label>${n} <input id="p_${k}" type="number" step="any" value="${r[k] ?? ''}"></label>`).join('')}</div>
    <div class="err" id="pErr" role="alert"></div><div class="acts"><button data-act="pfSave">Save month</button><button class="quiet" data-act="close">Cancel</button></div>`;
  if (!$('dlg').open) $('dlg').showModal();
}
async function pfSave() {
  const row = { studio_id: $('pStudio').value, month: $('pMonth').value + '-01' };
  if (!$('pMonth').value) { $('pErr').textContent = 'Pick a month.'; return; }
  RAW.forEach(([k]) => { const v = $('p_' + k).value.trim(); row[k] = v === '' ? null : +v; });
  const { error } = await db.from('kpi_monthly').upsert(row, { onConflict: 'studio_id,month' });
  if (error) { $('pErr').textContent = 'Could not save. ' + error.message; return; }
  $('dlg').close(); PF.month = row.month; loadPerf();
}

$('pfStudio').onchange = e => { PF.studio = e.target.value; drawPerf(); };
$('pfMonth').onchange = e => { PF.month = e.target.value; drawPerf(); };
$('pfRange').onchange = e => { PF.range = +e.target.value; if (PF.tab === 'score') drawChart(); };
$('pfData').onclick = () => pfMenu();
$('pfBody').onclick = e => {
  if (e.target.closest('#netBack')) return netBackToList();
  const cmpItem = e.target.closest('.cmpitem');
  if (cmpItem) return selectCmpSlot(cmpItem.dataset.side, cmpItem.dataset.store);
  const cmpClear = e.target.closest('[data-cmpclear]');
  if (cmpClear) { PF.cmp[cmpClear.dataset.cmpclear] = null; return drawCompare(); }
  const cmpRow = e.target.closest('.cmprow');
  if (cmpRow) { PF.cmp.kpi = cmpRow.dataset.k; document.querySelectorAll('.cmprow').forEach(x => x.classList.toggle('on', x === cmpRow)); return drawCmpChart(); }
  const nkt = e.target.closest('.netkt');
  if (nkt) { PF.netStore.kpi = nkt.dataset.k; document.querySelectorAll('.netkt').forEach(x => x.classList.toggle('on', x === nkt)); drawNetChart(); $('netChart').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  const kt = e.target.closest('.kt');
  if (kt) { PF.kpi = kt.dataset.k; document.querySelectorAll('.kt').forEach(x => x.classList.toggle('on', x === kt)); drawChart(); $('pfChart').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  const th = e.target.closest('th[data-sort]');
  if (th) { const key = th.dataset.sort; PF.mDir = PF.mSort === key ? -PF.mDir : -1; PF.mSort = key; drawMaster(); return; }
  const row = e.target.closest('tr[data-store]');
  if (row) { const rows = PF.netAll[PF.month] || [], r = rows.find(x => x.store === row.dataset.store); loadNetStore(row.dataset.store, r); }
};
$('pfBody').oninput = e => { if (e.target.id === 'mFindBox') { PF.mFind = e.target.value; drawMaster(); } else if (e.target.classList.contains('cmpsearch')) { const side = e.target.dataset.side; PF.cmp.find[side] = e.target.value; $('cmpList_' + side).innerHTML = cmpResultsHtml(side); } };
$('dlgBody').addEventListener('click', e => { if (e.target.dataset.act === 'pfSave') pfSave(); });
$('dlgBody').addEventListener('change', e => { if (e.target.id === 'pStudio' || e.target.id === 'pMonth') { const m = $('pMonth').value; if (m) pfForm($('pStudio').value, m + '-01'); } });
