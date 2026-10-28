// ---------- Compare up to four locations (plus network benchmarks) ----------
const CMP_LOWER = new Set(['attrition', 'at_risk']);
const CMP_MAX = 4;
const CMP_BENCH = { '@avg': 'Network average', '@top': 'Top 25% of network' };
const CMP_COLORS = ['#d9573f', '#2e6da4', '#1f9d6a', '#7a4fb3'];

async function loadCmpIndex() {
  if (PF.cmpIndex) return PF.cmpIndex;
  const { data } = await db.from('kpi_network_all').select('store,name,franchise,tier,month').order('month', { ascending: false }).limit(3000);
  const seen = new Map();
  (data || []).forEach(r => { if (!seen.has(r.store)) seen.set(r.store, r); });
  PF.cmpIndex = [...seen.values()];
  return PF.cmpIndex;
}
// Every location's row for one month (cached; shared with All Stretch Zone)
async function loadNetMonth(m) {
  if (!m || PF.netAll[m]) return PF.netAll[m] || [];
  const { data } = await db.from('kpi_network_all').select('*').eq('month', m).limit(1000);
  PF.netAll[m] = data || [];
  return PF.netAll[m];
}
async function loadCmpStore(store) {
  if (!store || store[0] === '@' || PF.cmp.data[store]) return;
  const idx = (PF.cmpIndex || []).find(x => x.store === store);
  const { data } = await db.from('kpi_network_all').select('*').eq('store', store).order('month');
  PF.cmp.data[store] = { store, name: (idx && idx.name) || store, franchise: (idx && idx.franchise) || '', tier: (idx && idx.tier) || '', rows: data || [] };
}
// Called from All Stretch Zone: load these stores and open Compare
async function compareStores(stores, month) {
  PF.cmp.picks = stores.slice(0, CMP_MAX); while (PF.cmp.picks.length < 2) PF.cmp.picks.push('');
  PF.cmp.month = month || '';
  PF.tab = 'compare'; REP.sub = 'compare'; updateRepTabs(); window.scrollTo({ top: 0, behavior: 'smooth' });
  drawPerf();
}

const cmpReal = () => PF.cmp.picks.filter(s => s && s[0] !== '@');
const cmpName = s => CMP_BENCH[s] || (PF.cmp.data[s] ? PF.cmp.data[s].name : s);
// Months that can be picked: any month at least one chosen location has
const cmpMonths = () => [...new Set(cmpReal().flatMap(s => (PF.cmp.data[s] ? PF.cmp.data[s].rows : []).map(r => r.month)))].sort().reverse();
// The month used for benchmarks: the picked month, else the newest month among chosen locations
const cmpBenchMonth = () => PF.cmp.month || cmpMonths()[0] || ((PF.cmpIndex || [])[0] || {}).month || '';
function cmpRowFor(s) {
  const d = PF.cmp.data[s]; if (!d || !d.rows.length) return null;
  return PF.cmp.month ? (d.rows.find(r => r.month === PF.cmp.month) || null) : d.rows[d.rows.length - 1];
}
// Network average or top-quarter value of a KPI for a month
function cmpBench(kind, k, m) {
  const v = (PF.netAll[m] || []).map(r => r.kpis && r.kpis[k]).filter(x => x !== null && x !== undefined && x !== '' && !isNaN(x)).map(Number).sort((a, b) => a - b);
  if (!v.length) return null;
  if (kind === '@avg') return v.reduce((a, b) => a + b, 0) / v.length;
  const q = CMP_LOWER.has(k) ? .25 : .75, i = (v.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return v[lo] + (v[hi] - v[lo]) * (i - lo);
}
function cmpValue(s, k, m) {
  if (!s) return null;
  if (s[0] === '@') return cmpBench(s, k, m || cmpBenchMonth());
  const r = m ? ((PF.cmp.data[s] || { rows: [] }).rows.find(x => x.month === m) || null) : cmpRowFor(s);
  const v = r && r.kpis ? r.kpis[k] : null; return v === undefined || v === '' ? null : v;
}
const cmpGap = (d, f) => { if (d === null || isNaN(d)) return ''; const s = d > 0 ? '+' : d < 0 ? '−' : '', a = Math.abs(d);
  return s + (f === 'pct' ? (a * 100).toFixed(0) + ' pts' : f === 'usd' ? '$' + Math.round(a).toLocaleString() : f === 'usd2' ? '$' + a.toFixed(2) : f === 'dec' ? a.toFixed(1) : Math.round(a).toLocaleString()); };

// Dropdown for one slot: benchmarks, our studios, then every franchise
function cmpSelectHtml(i) {
  const cur = PF.cmp.picks[i] || '', taken = new Set(PF.cmp.picks.filter((s, j) => s && j !== i)), ours = new Set(locs.map(l => l.club_store_id).filter(Boolean));
  const byName = (x, y) => (x.name || x.store).localeCompare(y.name || y.store);
  const opt = (v, label) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''} ${taken.has(v) ? 'disabled' : ''}>${esc(label)}</option>`;
  const idx = PF.cmpIndex || [], mine = idx.filter(r => ours.has(r.store)).sort(byName), groups = new Map();
  idx.filter(r => !ours.has(r.store)).forEach(r => { const f = r.franchise || 'Other'; if (!groups.has(f)) groups.set(f, []); groups.get(f).push(r); });
  return `<select class="cmpsel" data-slot="${i}" aria-label="Location ${i + 1}"><option value="" ${cur ? '' : 'selected'} disabled>Choose a location (${idx.length})</option>` +
    `<optgroup label="Benchmarks">${Object.entries(CMP_BENCH).map(([v, l]) => opt(v, l)).join('')}</optgroup>` +
    (mine.length ? `<optgroup label="Our studios">${mine.map(r => opt(r.store, r.name || r.store)).join('')}</optgroup>` : '') +
    [...groups.keys()].sort((x, y) => x === 'Other' ? 1 : y === 'Other' ? -1 : x.localeCompare(y)).map(f => `<optgroup label="${esc(f)}">${groups.get(f).sort(byName).map(r => opt(r.store, r.name || r.store)).join('')}</optgroup>`).join('') + '</select>';
}

async function selectCmpSlot(i, store) {
  PF.cmp.picks[i] = store;
  drawCompare();
}

async function drawCompare() {
  if (!PF.cmpIndex) { $('pfBody').innerHTML = '<p class="lead">Loading locations...</p>'; await loadCmpIndex(); }
  await Promise.all(cmpReal().map(loadCmpStore));
  if (PF.cmp.month && !cmpMonths().includes(PF.cmp.month)) PF.cmp.month = '';
  const benches = PF.cmp.picks.some(s => s && s[0] === '@');
  if (benches) await loadNetMonth(cmpBenchMonth());
  const P = PF.cmp.picks;
  const slot = (s, i) => {
    const d = PF.cmp.data[s], r = s && s[0] !== '@' ? cmpRowFor(s) : null;
    const info = !s ? '' : s[0] === '@' ? `Across ${(PF.netAll[cmpBenchMonth()] || []).length} locations • ${mLbl(cmpBenchMonth())}` : d ? [d.franchise, d.tier].filter(Boolean).join(' • ') + (d.rows.length ? ` • ${r ? mLbl(r.month) : 'no ' + mLbl(PF.cmp.month)}` : ' • no history yet') : '';
    return `<div class="hcard cmpslot" style="--c:${CMP_COLORS[i]}"><label><span class="cmpdot"></span>Location ${i + 1}${P.length > 2 ? `<button type="button" class="cmpx" data-cmprm="${i}" aria-label="Remove location ${i + 1}">×</button>` : ''}${cmpSelectHtml(i)}</label>${info ? `<div class="lead" style="margin:.45rem 0 0;font-size:.85rem">${esc(info)}</div>` : ''}</div>`;
  };
  const months = cmpMonths();
  let html = `<div class="cmphead"><p class="lead" style="margin:0">Pick up to four Stretch Zone locations, yours or anyone else’s, or a network benchmark.</p>
    ${months.length ? `<label class="cmpmonth">Month <select id="cmpMonth"><option value="">Latest on file</option>${months.map(m => `<option value="${m}" ${m === PF.cmp.month ? 'selected' : ''}>${mLbl(m, 1)}</option>`).join('')}</select></label>` : ''}</div>
    <div class="cmpslots">${P.map(slot).join('')}${P.length < CMP_MAX ? '<button type="button" class="cmpadd" id="cmpAdd">+ Add location</button>' : ''}</div>`;
  const chosen = P.map((s, i) => [s, i]).filter(([s]) => s);
  if (chosen.length >= 2) {
    const two = chosen.length === 2;
    const rows = CORP.map(([k, n, f]) => {
      const vals = chosen.map(([s]) => cmpValue(s, k)), have = vals.filter(v => v !== null), lower = CMP_LOWER.has(k);
      const best = have.length > 1 ? (lower ? Math.min(...have) : Math.max(...have)) : null, worst = have.length > 1 ? (lower ? Math.max(...have) : Math.min(...have)) : null;
      const tone = v => v === null || best === worst ? '' : v === best ? 'cbest' : v === worst ? 'cworst' : '';
      const base = vals[0];
      const cells = vals.map((v, j) => `<td class="${tone(v)}">${fmtNet(v, f)}${!two && j > 0 && v !== null && base !== null ? `<small class="cgap ${(v - base) * (lower ? -1 : 1) > 0 ? 'up' : (v - base) * (lower ? -1 : 1) < 0 ? 'dn' : ''}">${cmpGap(v - base, f)} vs ${esc(cmpName(chosen[0][0]))}</small>` : ''}</td>`).join('');
      const diff = two && vals[0] !== null && vals[1] !== null ? vals[0] - vals[1] : null;
      return `<tr data-k="${k}" class="cmprow ${PF.cmp.kpi === k ? 'on' : ''}"><td>${n}${lower ? ' <small class="muted">(lower is better)</small>' : ''}</td>${cells}${two ? `<td class="cdiff ${diff === null || diff === 0 ? '' : (diff * (lower ? -1 : 1) > 0 ? 'up' : 'dn')}">${diff === null ? '<span class="muted">–</span>' : cmpGap(diff, f)}</td>` : ''}</tr>`;
    }).join('');
    const when = PF.cmp.month ? mLbl(PF.cmp.month, 1) : 'each location’s latest month on file';
    html += `<h3 class="sub" style="margin-top:1.5rem">Side by side</h3><p class="lead" style="margin:0 0 .5rem">Showing ${esc(when)}. Green is the best number in each row and red the worst. ${two ? `Difference is ${esc(cmpName(chosen[0][0]))} minus ${esc(cmpName(chosen[1][0]))}.` : `Small numbers show the gap to ${esc(cmpName(chosen[0][0]))}.`} Click a row to chart it.</p>
      <div class="table-wrap"><table class="mt cmpt"><thead><tr><th>KPI</th>${chosen.map(([s, i]) => `<th><span class="cmpdot" style="--c:${CMP_COLORS[i]}"></span>${esc(cmpName(s))}</th>`).join('')}${two ? '<th>Difference</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="pcard" style="margin-top:1rem"><h3 id="cmpTitle"></h3><div style="position:relative;height:320px"><canvas id="cmpChart"></canvas></div></div>`;
  } else html += '<p class="lead" style="margin-top:1rem">Choose at least two to see them side by side.</p>';
  $('pfBody').innerHTML = html;
  if (chosen.length >= 2) drawCmpChart();
}

async function drawCmpChart() {
  const [k, n, f] = CORP.find(x => x[0] === PF.cmp.kpi);
  const chosen = PF.cmp.picks.map((s, i) => [s, i]).filter(([s]) => s);
  if (typeof Chart === 'undefined' || !$('cmpChart')) { if ($('cmpTitle')) $('cmpTitle').textContent = n; return; }
  let months = [...new Set(cmpReal().flatMap(s => PF.cmp.data[s].rows.map(r => r.month)))].sort();
  if (!months.length) months = [cmpBenchMonth()].filter(Boolean);
  if (chosen.some(([s]) => s[0] === '@')) await Promise.all(months.map(loadNetMonth));
  if (!$('cmpChart')) return;
  const series = s => months.map(m => s[0] === '@' ? cmpBench(s, k, m) : cmpValue(s, k, m));
  $('cmpTitle').textContent = n;
  if (PF.cmpChart) PF.cmpChart.destroy();
  PF.cmpChart = new Chart($('cmpChart'), { type: 'line', data: { labels: months.map(m => mLbl(m)), datasets: chosen.map(([s, i]) => ({ label: cmpName(s), data: series(s), borderColor: CMP_COLORS[i], backgroundColor: CMP_COLORS[i], tension: .25, pointRadius: 2, borderWidth: 2, spanGaps: false, borderDash: s[0] === '@' ? [6, 4] : [] })) },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#16202b' } }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmtNet(c.parsed.y, f) } } },
      scales: { x: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(228,224,214,1)' } }, y: { ticks: { color: '#6b7280', callback: v => fmtNet(v, f) }, grid: { color: 'rgba(228,224,214,1)' } } } } });
}
