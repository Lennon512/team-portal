// ---------- Performance ----------
const KPI = [
  { k: 'gross_revenue', n: 'Gross revenue', f: 'usd', a: 'sum', corp: 'revenue' },
  { k: 'draft', n: 'Draft (EFT collected)', f: 'usd', a: 'sum', corp: 'eft' },
  { k: 'refunds', n: 'Refunds', f: 'usd', a: 'sum', dir: -1 },
  { k: 'leads', n: 'Leads', f: 'num', a: 'sum', corp: 'leads' },
  { k: 'scheduled', n: 'Demos scheduled', f: 'num', a: 'sum' },
  { k: 'demos', n: 'Demos completed', f: 'num', a: 'sum', corp: 'demos' },
  { k: 'book', n: 'Demo booking rate', s: 'Scheduled \u00F7 leads (your definition)', f: 'pct', num: 'scheduled', den: 'leads' },
  { k: 'l2d', n: 'Lead to demo', s: 'Completed \u00F7 leads (corporate definition)', f: 'pct', num: 'demos', den: 'leads', corp: 'l2d' },
  { k: 'show', n: 'Show rate', s: 'Completed \u00F7 scheduled', f: 'pct', num: 'demos', den: 'scheduled', corp: 'show' },
  { k: 'agreements', n: 'Agreements', f: 'num', a: 'sum' },
  { k: 'close', n: 'Close rate', s: 'All agreements \u00F7 demos (your definition)', f: 'pct', num: 'agreements', den: 'demos' },
  { k: 'cash_sales', n: 'Cash sales', f: 'usd', a: 'sum' },
  { k: 'eft_sales', n: 'EFT sales', f: 'usd', a: 'sum' },
  { k: 'avg_eft', n: 'Average EFT', f: 'usd', a: 'avg' },
  { k: 'staff_util', n: 'Staff utilization', f: 'dec', a: 'avg' },
  { k: 'calls_per_day', n: 'Calls per day', f: 'dec', a: 'avg' },
  { k: 'cancellations', n: 'Cancellations', f: 'num', a: 'sum', dir: -1 },
  { k: 'active_members', n: 'Active members', f: 'num', a: 'sum', corp: 'members' }
];
const CORP = [['revenue', 'Revenue', 'usd'], ['eft', 'EFT collected', 'usd'], ['eft_rev', 'EFT / revenue', 'pct'], ['leads', 'Leads', 'num'], ['demos', 'Demos', 'num'], ['l2d', 'Lead to demo', 'pct'], ['show', 'Show %', 'pct'],
  ['fv_close', 'First visit closing %', 'pct'], ['members', 'Total active members', 'num'], ['nmg', 'Net member gain / loss', 'dec'], ['attrition', 'Attrition %', 'pct'], ['at_risk', 'At risk %', 'pct'],
  ['basic', '% of basic members', 'pct'], ['pps', 'Price per session', 'usd2'], ['adj_pps', 'Adj. price per session', 'usd2'], ['contacts', 'Contacts per day', 'dec']];
const RAW = [['gross_revenue', 'Gross revenue ($)'], ['draft', 'Draft ($)'], ['refunds', 'Refunds ($)'], ['leads', 'Leads'], ['scheduled', 'Demos scheduled'], ['demos', 'Demos completed'], ['agreements', 'Agreements'],
  ['cash_sales', 'Cash sales ($)'], ['eft_sales', 'EFT sales ($)'], ['avg_eft', 'Average EFT ($)'], ['staff_util', 'Staff utilization'], ['calls_per_day', 'Calls per day'], ['cancellations', 'Cancellations'], ['active_members', 'Active members']];
const COLORS = ['#d9573f', '#8ec9f0', '#f28b82', '#81c995', '#c58af9', '#ff8bcb'];
const PF = { rows: [], net: {}, corp: {}, netAll: {}, netStore: null, netChart: null, cmpIndex: null, cmp: { a: null, b: null, kpi: 'revenue', find: { a: '', b: '' } }, cmpChart: null, tab: 'score', studio: '', month: '', range: 12, kpi: 'gross_revenue', chart: null, mSort: 'kpis->revenue', mDir: -1, mFind: '', projData: null, projScenario: null, projDom: null };

const fv = (x, f) => x === null || x === undefined || isNaN(x) ? '-' : f === 'usd' ? '$' + Math.round(x).toLocaleString() : f === 'usd2' ? '$' + x.toFixed(2) : f === 'pct' ? (x * 100).toFixed(0) + '%' : f === 'dec' ? x.toFixed(1) : Math.round(x).toLocaleString();
const mAdd = (m, n) => { const d = new Date(m + 'T00:00'); d.setMonth(d.getMonth() + n); return ymd(d); };
const mLbl = (m, long) => new Date(m + 'T00:00').toLocaleDateString('en-US', long ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' });
const pfRows = (m, sid) => PF.rows.filter(r => r.month === m && (!sid || r.studio_id === sid));
const pfMonths = () => [...new Set(PF.rows.map(r => r.month))].sort();
function pfVal(rows, K, per) {
  if (!rows.length) return null;
  if (K.den) { let n = 0, d = 0; rows.forEach(r => { n += r[K.num] || 0; d += r[K.den] || 0; }); return d ? n / d : null; }
  const v = rows.map(r => r[K.k]).filter(x => x !== null && x !== undefined);
  if (!v.length) return null;
  const s = v.reduce((a, b) => a + b, 0);
  return K.a === 'sum' ? (per ? s / v.length : s) : s / v.length;
}

async function loadPerf() {
  const [a, b, c] = await Promise.all([db.from('kpi_monthly').select('*').order('month').limit(2000), db.from('kpi_network').select('*').limit(2000), db.from('kpi_corp_studio').select('*').limit(2000)]);
  PF.rows = a.data || []; PF.net = {}; PF.corp = {};
  (b.data || []).forEach(x => (PF.net[x.month] = PF.net[x.month] || {})[x.kpi] = +x.value);
  (c.data || []).forEach(x => { const s = PF.corp[x.studio_id] = PF.corp[x.studio_id] || {}; (s[x.month] = s[x.month] || {})[x.kpi] = x; });
  const own = ME.role === 'owner', sids = [...new Set(PF.rows.map(r => r.studio_id))], mine = pfMonths().reverse(), ms = [...new Set([...mine, ...Object.keys(PF.net), ...Object.values(PF.corp).flatMap(o => Object.keys(o))])].sort().reverse();
  $('pfData').hidden = !own; document.querySelector('#repTabs [data-t="master"]').hidden = !own;
  if (!own) { PF.studio = sids[0] || ''; PF.tab = 'score'; }
  $('pfStudio').innerHTML = (own ? '<option value="">All six studios</option>' : '') + locs.filter(l => sids.includes(l.id)).map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
  $('pfStudio').value = PF.studio;
  $('pfMonth').innerHTML = ms.map(m => `<option value="${m}">${mLbl(m, 1)}</option>`).join('');
  if (!ms.includes(PF.month)) PF.month = mine[0] || ms[0] || '';
  $('pfMonth').value = PF.month;
  if (!ms.length) { $('pfBody').innerHTML = '<p class="lead">No performance data yet.</p>'; return; }
  drawPerf();
}

function drawPerf() {
  updateRepTabs();
  $('pfStudio').hidden = (PF.tab !== 'score' && PF.tab !== 'projection') || ME.role !== 'owner'; $('pfMonth').hidden = PF.tab === 'compare'; $('pfRange').hidden = PF.tab !== 'score';
  if (PF.tab === 'score') drawScore(); else if (PF.tab === 'master') loadMaster(); else if (PF.tab === 'projection') loadProjection(); else drawCompare();
}

// One combined tab strip in front of both DPR and Performance. REP.sub decides which of the
// two sections (#repDpr / #repPerf) is visible; within #repPerf, PF.tab still separately
// decides Austin scorecard vs the network Mastercard, same as before.
const REP = { sub: 'dpr' };
function updateRepTabs() {
  document.querySelectorAll('#repTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === REP.sub));
  document.querySelector('#repTabs [data-t="dpr"]').hidden = !canPage('dpr');
  const perfOk = canPage('performance');
  document.querySelector('#repTabs [data-t="score"]').hidden = !perfOk;
  document.querySelector('#repTabs [data-t="master"]').hidden = !perfOk || ME.role !== 'owner';
  document.querySelector('#repTabs [data-t="compare"]').hidden = !perfOk || ME.role !== 'owner';
  document.querySelector('#repTabs [data-t="projection"]').hidden = !perfOk;
}
function drawRepTabs() {
  if (REP.sub === 'dpr' && !canPage('dpr') && canPage('performance')) REP.sub = 'score';
  if (REP.sub !== 'dpr' && !canPage('performance') && canPage('dpr')) REP.sub = 'dpr';
  $('repDpr').hidden = REP.sub !== 'dpr'; $('repPerf').hidden = REP.sub === 'dpr';
  updateRepTabs();
  if (REP.sub === 'dpr') loadDpr(); else loadPerf();
}
$('repTabs').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  REP.sub = b.dataset.t;
  if (REP.sub !== 'dpr') PF.tab = REP.sub;
  location.hash = REP.sub === 'dpr' ? '#dpr' : '#performance';
  $('repDpr').hidden = REP.sub !== 'dpr'; $('repPerf').hidden = REP.sub === 'dpr';
  updateRepTabs();
  if (REP.sub === 'dpr') loadDpr(); else { PF.netStore = null; drawPerf(); }
};

function drawScore() {
  const m = PF.month, sid = PF.studio, prev = mAdd(m, -1), yoy = mAdd(m, -12), ms12 = Array.from({ length: 12 }, (_, i) => mAdd(m, i - 11)), cur = pfRows(m, sid);
  if (!cur.length) { $('pfBody').innerHTML = '<p class="lead">Your own numbers for this month have not been added yet. Use Upload my monthly sheet or Add or edit a month. Corporate\u2019s numbers for this month are on the Master card tab.</p>'; return; }
  const cp = (sid && PF.corp[sid] && PF.corp[sid][m]) || {}, name = sid ? (locs.find(l => l.id === sid) || {}).name : 'All six studios (Austin total)';
  const spark = a => { const v = a.filter(x => x !== null); if (v.length < 2) return ''; const lo = Math.min(...v), hi = Math.max(...v); return `<svg viewBox="0 0 100 28" class="spark" preserveAspectRatio="none"><polyline fill="none" stroke="#8ec9f0" stroke-width="2" points="${a.map((x, i) => x === null ? '' : (i * 100 / 11).toFixed(1) + ',' + (26 - (x - lo) / ((hi - lo) || 1) * 24).toFixed(1)).filter(Boolean).join(' ')}"/></svg>`; };
  const tile = K => {
    const v = pfVal(cur, K), pts = ms12.map(x => pfVal(pfRows(x, sid), K));
    const d = (o, lbl) => { if (v === null || o === null) return ''; const ch = K.f === 'pct' ? (v - o) * 100 : (o ? (v - o) / Math.abs(o) * 100 : null); if (ch === null) return ''; return `<span class="${Math.abs(ch) < .5 ? '' : ch * (K.dir || 1) > 0 ? 'up' : 'dn'}">${ch >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(ch).toFixed(0)}${K.f === 'pct' ? ' pts' : '%'}</span> vs ${lbl}`; };
    const cr = K.corp && cp[K.corp];
    return `<button class="kt ${PF.kpi === K.k ? 'on' : ''}" data-k="${K.k}"><span class="kn">${K.n}</span>${K.s ? `<small>${K.s}</small>` : ''}<b>${fv(v, K.f)}</b><span class="kd">${d(pfVal(pfRows(prev, sid), K), mLbl(prev))}</span><span class="kd">${d(pfVal(pfRows(yoy, sid), K), mLbl(yoy))}</span>${spark(pts)}${cr && cr.rank ? `<small>#${cr.rank} of ${cr.of_total} in the network</small>` : ''}</button>`;
  };
  $('pfBody').innerHTML = `<div class="pcard" style="margin-top:.5rem"><h3 id="pfTitle"></h3><div style="position:relative;height:320px"><canvas id="pfChart"></canvas></div><p class="lead" id="pfNote" style="margin:.6rem 0 0;font-size:.85rem"></p></div>
    <h3 class="sub" style="margin-top:1.5rem">${esc(name)} \u2022 ${mLbl(m, 1)}</h3><p class="lead" style="margin:0">Click a card to chart it above.</p><div class="kgrid">${KPI.map(tile).join('')}</div>`;
  drawChart();
}

function drawChart() {
  const K = KPI.find(x => x.k === PF.kpi), own = ME.role === 'owner';
  if (typeof Chart === 'undefined') {
    if (document.readyState !== 'complete') { $('pfNote').textContent = 'Loading the chart...'; addEventListener('load', () => { if ($('pfChart')) drawChart(); }, { once: true }); }
    else $('pfNote').textContent = 'The chart library did not load. Check your connection or an ad blocker, then refresh.';
    return;
  }
  const all = pfMonths().filter(x => x <= PF.month), ms = PF.range >= 99 ? all : all.slice(-PF.range);
  const ln = (label, data, color, dash) => ({ label, data, borderColor: color, backgroundColor: color, tension: .25, borderDash: dash || [], pointRadius: 2, borderWidth: 2, spanGaps: false });
  const ds = [];
  if (!PF.studio) locs.filter(l => PF.rows.some(r => r.studio_id === l.id)).forEach((l, i) => ds.push(ln(l.name, ms.map(m => pfVal(pfRows(m, l.id), K)), COLORS[i % 6])));
  else {
    ds.push(ln((locs.find(l => l.id === PF.studio) || {}).name, ms.map(m => pfVal(pfRows(m, PF.studio), K)), '#d9573f'));
    if (own) ds.push(ln('Austin average per studio', ms.map(m => pfVal(pfRows(m), K, true)), '#8ec9f0'));
  }
  if (K.corp) ds.push(ln('All Stretch Zone average per studio', ms.map(m => (PF.net[m] || {})[K.corp] ?? null), '#ffffff', [6, 4]));
  $('pfTitle').textContent = K.n + (K.s ? ' (' + K.s.toLowerCase() + ')' : '');
  $('pfNote').textContent = K.corp ? 'Corporate averages are per studio. Months before Sep 2025 are only available for revenue.' : 'Corporate does not report this KPI.';
  if (PF.chart) PF.chart.destroy();
  PF.chart = new Chart($('pfChart'), { type: 'line', data: { labels: ms.map(m => mLbl(m)), datasets: ds }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: '#eaf3fb' } }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fv(c.parsed.y, K.f) } } },
    scales: { x: { ticks: { color: '#9fb8d4' }, grid: { color: 'rgba(42,82,127,.5)' } }, y: { ticks: { color: '#9fb8d4', callback: v => fv(v, K.f) }, grid: { color: 'rgba(42,82,127,.5)' } } } } });
}

const netSpark = a => { const v = a.filter(x => x !== null); if (v.length < 2) return ''; const lo = Math.min(...v), hi = Math.max(...v); return `<svg viewBox="0 0 100 28" class="spark" preserveAspectRatio="none"><polyline fill="none" stroke="#2e6da4" stroke-width="2" points="${a.map((x, i) => x === null ? '' : (i * 100 / (a.length - 1 || 1)).toFixed(1) + ',' + (26 - (x - lo) / ((hi - lo) || 1) * 24).toFixed(1)).filter(Boolean).join(' ')}"/></svg>`; };

async function loadNetStore(store, fallback) {
  PF.netStore = { store, name: (fallback && fallback.name) || store, franchise: (fallback && fallback.franchise) || '', tier: (fallback && fallback.tier) || '', rows: [], kpi: 'revenue' };
  drawMaster();
  const { data, error } = await db.from('kpi_network_all').select('*').eq('store', store).order('month');
  if (error) { $('pfBody').innerHTML = '<p class="lead">Could not load this location. ' + esc(error.message) + '</p>'; return; }
  PF.netStore.rows = data || [];
  const last = PF.netStore.rows[PF.netStore.rows.length - 1];
  if (last) { PF.netStore.name = last.name || store; PF.netStore.franchise = last.franchise || ''; PF.netStore.tier = last.tier || ''; }
  drawNetStore();
}

function netBackToList() { PF.netStore = null; drawMaster(); }

function drawNetStore() {
  const st = PF.netStore, rows = st.rows, last = rows[rows.length - 1];
  const tile = ([k, n, f]) => {
    const pts = rows.map(r => r.kpis[k] ?? null), v = last ? (last.kpis[k] ?? null) : null;
    const prevRow = rows[rows.length - 2], pv = prevRow ? (prevRow.kpis[k] ?? null) : null;
    const d = (v !== null && pv !== null && prevRow) ? (() => { const ch = f === 'pct' ? (v - pv) * 100 : (pv ? (v - pv) / Math.abs(pv) * 100 : null); if (ch === null) return ''; return `<span class="${Math.abs(ch) < .5 ? '' : ch > 0 ? 'up' : 'dn'}">${ch >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(ch).toFixed(0)}${f === 'pct' ? ' pts' : '%'}</span> vs ${mLbl(prevRow.month)}`; })() : '';
    return `<button class="kt netkt ${st.kpi === k ? 'on' : ''}" data-k="${k}"><span class="kn">${n}</span><b>${fmtNet(v, f)}</b><span class="kd">${d}</span>${netSpark(pts)}</button>`;
  };
  $('pfBody').innerHTML = `<button class="quiet" id="netBack" style="margin-bottom:1rem">\u2190 All Stretch Zone Mastercard</button>
    <h3 style="margin:0 0 .15rem">${esc(st.name)}</h3><p class="lead" style="margin:0 0 1rem">${esc([st.franchise, st.tier].filter(Boolean).join(' \u2022 ')) || 'Store ' + esc(st.store)}${rows.length ? ' \u2022 ' + rows.length + ' month' + (rows.length === 1 ? '' : 's') + ' on file' : ''}</p>
    ${!rows.length ? '<p class="lead">No history uploaded for this location yet.</p>' : `<div class="pcard"><h3 id="netTitle"></h3><div style="position:relative;height:320px"><canvas id="netChart"></canvas></div><p class="lead" id="netNote" style="margin:.6rem 0 0;font-size:.85rem"></p></div>
    <h3 class="sub" style="margin-top:1.5rem">Click a card to chart it above</h3><div class="kgrid">${CORP.map(tile).join('')}</div>`}`;
  if (rows.length) drawNetChart();
}

function drawNetChart() {
  const st = PF.netStore, [k, n, f] = CORP.find(x => x[0] === st.kpi);
  if (typeof Chart === 'undefined') { $('netNote').textContent = 'The chart library did not load. Check your connection or an ad blocker, then refresh.'; return; }
  const months = st.rows.map(r => r.month);
  const ln = (label, data, color, dash) => ({ label, data, borderColor: color, backgroundColor: color, tension: .25, borderDash: dash || [], pointRadius: 2, borderWidth: 2, spanGaps: false });
  const ds = [ln(st.name, st.rows.map(r => r.kpis[k] ?? null), '#d9573f')];
  ds.push(ln('All Stretch Zone average per studio', months.map(m => (PF.net[m] || {})[k] ?? null), '#8ec9f0', [6, 4]));
  $('netTitle').textContent = n; $('netNote').textContent = 'All Stretch Zone average is per studio, from your uploaded corporate scorecards.';
  if (PF.netChart) PF.netChart.destroy();
  PF.netChart = new Chart($('netChart'), { type: 'line', data: { labels: months.map(m => mLbl(m)), datasets: ds }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: '#16202b' } }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmtNet(c.parsed.y, f) } } },
    scales: { x: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(228,224,214,1)' } }, y: { ticks: { color: '#6b7280', callback: v => fmtNet(v, f) }, grid: { color: 'rgba(228,224,214,1)' } } } } });
}
