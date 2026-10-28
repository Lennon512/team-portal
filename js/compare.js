// ---------- Compare two locations ----------
const CMP_LOWER = new Set(['attrition', 'at_risk']);

async function loadCmpIndex() {
  if (PF.cmpIndex) return PF.cmpIndex;
  const { data } = await db.from('kpi_network_all').select('store,name,franchise,tier,month').order('month', { ascending: false }).limit(3000);
  const seen = new Map();
  (data || []).forEach(r => { if (!seen.has(r.store)) seen.set(r.store, r); });
  PF.cmpIndex = [...seen.values()];
  return PF.cmpIndex;
}

async function selectCmpSlot(side, store) {
  const idx = (PF.cmpIndex || []).find(x => x.store === store);
  PF.cmp.find[side] = '';
  const { data } = await db.from('kpi_network_all').select('*').eq('store', store).order('month');
  PF.cmp[side] = { store, name: (idx && idx.name) || store, franchise: (idx && idx.franchise) || '', tier: (idx && idx.tier) || '', rows: data || [] };
  drawCompare();
}

function cmpResultsHtml(side) {
  const q = (PF.cmp.find[side] || '').trim().toLowerCase();
  if (q.length < 2) return '';
  const results = (PF.cmpIndex || []).filter(x => (x.name || '').toLowerCase().includes(q) || (x.franchise || '').toLowerCase().includes(q)).slice(0, 8);
  return results.length ? `<div class="cmplist">${results.map(r => `<button type="button" class="cmpitem" data-side="${side}" data-store="${esc(r.store)}">${esc(r.name)} <span class="lead">${esc(r.franchise || '')}</span></button>`).join('')}</div>` : '<p class="lead" style="margin:.4rem 0 0">No match.</p>';
}

async function drawCompare() {
  if (!PF.cmpIndex) { $('pfBody').innerHTML = '<p class="lead">Loading locations...</p>'; await loadCmpIndex(); }
  const slot = (side, label) => {
    const c = PF.cmp[side];
    if (c) return `<div class="hcard"><b>${esc(c.name)}</b><div class="lead" style="margin:.2rem 0 .6rem">${esc([c.franchise, c.tier].filter(Boolean).join(' \u2022 '))}${c.rows.length ? ' \u2022 ' + c.rows.length + ' month' + (c.rows.length === 1 ? '' : 's') + ' on file' : ' \u2022 no history yet'}</div><button class="quiet sm" data-cmpclear="${side}">Change</button></div>`;
    return `<div class="hcard"><label>${label}<input type="search" class="cmpsearch" id="cmpIn_${side}" data-side="${side}" placeholder="Search by name or franchise" value="${esc(PF.cmp.find[side] || '')}"></label><div id="cmpList_${side}">${cmpResultsHtml(side)}</div></div>`;
  };
  let html = `<p class="lead" style="margin:0 0 1rem">Pick any two Stretch Zone locations you\u2019ve uploaded a scorecard for, yours or anyone else\u2019s.</p><div class="dgrid3">${slot('a', 'Location A')}${slot('b', 'Location B')}</div>`;
  if (PF.cmp.a && PF.cmp.b) {
    const A = PF.cmp.a, B = PF.cmp.b, la = A.rows[A.rows.length - 1], lb = B.rows[B.rows.length - 1];
    const rows = CORP.map(([k, n, f]) => {
      const va = la ? (la.kpis[k] ?? null) : null, vb = lb ? (lb.kpis[k] ?? null) : null;
      const better = va !== null && vb !== null && va !== vb ? (CMP_LOWER.has(k) ? (va < vb ? 'a' : 'b') : (va > vb ? 'a' : 'b')) : '';
      return `<tr data-k="${k}" class="cmprow ${PF.cmp.kpi === k ? 'on' : ''}"><td>${n}</td><td class="${better === 'a' ? 'best' : ''}">${fmtNet(va, f)}</td><td class="${better === 'b' ? 'best' : ''}">${fmtNet(vb, f)}</td></tr>`;
    }).join('');
    html += `<h3 class="sub" style="margin-top:1.5rem">Side by side</h3><p class="lead" style="margin:0 0 .5rem">${la ? esc(A.name) + '\u2019s most recent month on file is ' + mLbl(la.month) : esc(A.name) + ' has no history yet'}, ${lb ? esc(B.name) + '\u2019s is ' + mLbl(lb.month) : esc(B.name) + ' has no history yet'}. The better number for each KPI is highlighted. Click a row to chart it.</p>
      <div class="table-wrap"><table class="mt"><thead><tr><th>KPI</th><th>${esc(A.name)}</th><th>${esc(B.name)}</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="pcard" style="margin-top:1rem"><h3 id="cmpTitle"></h3><div style="position:relative;height:320px"><canvas id="cmpChart"></canvas></div></div>`;
  }
  $('pfBody').innerHTML = html;
  if (PF.cmp.a && PF.cmp.b) drawCmpChart();
}

function drawCmpChart() {
  const [k, n, f] = CORP.find(x => x[0] === PF.cmp.kpi);
  if (typeof Chart === 'undefined') { $('cmpTitle').textContent = n; return; }
  const A = PF.cmp.a, B = PF.cmp.b;
  const months = [...new Set([...A.rows.map(r => r.month), ...B.rows.map(r => r.month)])].sort();
  const seriesFor = loc => months.map(m => { const r = loc.rows.find(x => x.month === m); return r ? (r.kpis[k] ?? null) : null; });
  const ln = (label, data, color) => ({ label, data, borderColor: color, backgroundColor: color, tension: .25, pointRadius: 2, borderWidth: 2, spanGaps: false });
  $('cmpTitle').textContent = n;
  if (PF.cmpChart) PF.cmpChart.destroy();
  PF.cmpChart = new Chart($('cmpChart'), { type: 'line', data: { labels: months.map(m => mLbl(m)), datasets: [ln(A.name, seriesFor(A), '#d9573f'), ln(B.name, seriesFor(B), '#2e6da4')] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#16202b' } }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmtNet(c.parsed.y, f) } } },
      scales: { x: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(228,224,214,1)' } }, y: { ticks: { color: '#6b7280', callback: v => fmtNet(v, f) }, grid: { color: 'rgba(228,224,214,1)' } } } } });
}
