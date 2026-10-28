// ---------- Performance uploads ----------
const CLAB = { 'Revenue': 'revenue', 'EFT Collected': 'eft', 'EFT/Rev': 'eft_rev', 'Leads': 'leads', 'Demos': 'demos', 'Lead to Demo': 'l2d', 'Show %': 'show', 'First Visit Closing %': 'fv_close', 'Total Active Members': 'members', 'NMG (Net Member Gain/Loss)': 'nmg',
  'Attrition (%)': 'attrition', 'At Risk (%)': 'at_risk', '% of Basic Mem': 'basic', 'Price per Session': 'pps', 'Adj. Price per Session': 'adj_pps', 'Active Practitioners': 'practitioners', 'Practitioner Turnover': 'turnover' };
const NETLAB = { 'Revenue': 'revenue', 'EFT Collected': 'eft', 'EFT/Rev': 'eft_rev', 'Leads': 'leads', 'Demos': 'demos', 'Lead to Demo': 'l2d', 'Show %': 'show', 'First Visit Closing %': 'fv_close', 'Total Active Members': 'members',
  'NMG (Net Member Gain/Loss)': 'nmg', 'Attrition (%)': 'attrition', 'At Risk (%)': 'at_risk', 'Price per Session': 'pps', 'Adj. Price per Session': 'adj_pps', 'Contacts per Day': 'contacts' };
const LOWER = new Set(['attrition', 'at_risk']), NORANK = new Set(['basic', 'practitioners', 'turnover']);
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const pad2 = n => String(n).padStart(2, '0');
const grid = ws => XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
const serialMonth = v => { if (typeof v !== 'number' || v < 40000) return null; const d = new Date(Date.UTC(1899, 11, 30) + v * DAY); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`; };

function parseCorp(wb) {
  const out = { corp: [], net: [], months: [], studios: new Set(), allRows: [] };
  for (const sn of wb.SheetNames) {
    const mm = sn.trim().match(/^([A-Za-z]{3})[a-z]*[- ](\d{2})$/); if (!mm || !MON[mm[1]]) continue;
    const g = grid(wb.Sheets[sn]), hi = g.findIndex((r, i) => i < 15 && r.includes('Franchise') && r.includes('Location') && r.includes('Revenue')); if (hi < 0) continue;
    const month = `20${mm[2]}-${pad2(MON[mm[1]])}-01`, cols = {}, li = g[hi].indexOf('Location'), fi = g[hi].indexOf('Franchise'), ti = g[hi].indexOf('Tier');
    g[hi].forEach((h, i) => { const k = CLAB[h] || (String(h).startsWith('Contacts per') ? 'contacts' : null); if (k) cols[k] = i; });
    const data = g.slice(hi + 1).filter(r => r[li] && /\(\d+\)\s*$/.test(String(r[li])));
    if (!data.length) continue;
    out.months.push(month);
    data.forEach(r => {
      const store = (String(r[li]).match(/\(([0-9]+)\)\s*$/) || [])[1]; if (!store) return;
      const kpis = {}; Object.entries(cols).forEach(([k, ci]) => { const v = r[ci]; if (typeof v === 'number') kpis[k] = v; });
      out.allRows.push({ month, store, name: String(r[li]).replace(/\s*\(\d+\)\s*$/, '').trim(), franchise: fi >= 0 ? String(r[fi] || '').trim() || null : null, tier: ti >= 0 ? String(r[ti] || '').trim() || null : null, kpis });
    });
    Object.entries(cols).forEach(([k, ci]) => {
      const pool = data.map(r => r[ci]).filter(v => typeof v === 'number' && (v !== 0 || k === 'nmg'));
      data.forEach(r => {
        const loc = locs.find(l => l.club_store_id === (String(r[li]).match(/\((\d+)\)\s*$/) || [])[1]), v = r[ci];
        if (!loc || typeof v !== 'number') return;
        out.studios.add(loc.name);
        const ranked = !NORANK.has(k) && (v !== 0 || k === 'nmg');
        out.corp.push({ studio_id: loc.id, month, kpi: k, value: v, rank: ranked ? 1 + pool.filter(x => LOWER.has(k) ? x < v : x > v).length : null, of_total: ranked ? pool.length : null });
      });
    });
  }
  const cs = wb.SheetNames.find(n => n.trim() === 'Charting');
  if (cs) {
    const g = grid(wb.Sheets[cs]), di = g.findIndex((r, i) => i < 25 && r.filter(x => typeof x === 'number' && x > 40000).length >= 6), seen = new Map();
    if (di >= 0) {
      const dc = g[di].map((x, i) => [i, serialMonth(x)]).filter(x => x[1]);
      g.slice(di + 1, di + 40).forEach(r => {
        const lab = r.find(x => typeof x === 'string' && NETLAB[x.trim()]); if (!lab) return;
        const k = NETLAB[lab.trim()];
        dc.forEach(([i, m]) => { const v = r[i]; if (typeof v === 'number' && (v !== 0 || k === 'nmg') && !seen.has(m + k)) seen.set(m + k, { month: m, kpi: k, value: v, source: 'corporate' }); });
      });
    }
    out.net = [...seen.values()];
  }
  return out;
}

const NORM = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9#%]+/g, ' ').trim();
const HMAP = { 'month': 'month', 'studio': 'studio', 'gross revenu': 'gross_revenue', 'gross revenue': 'gross_revenue', 'draft': 'draft', 'refunds': 'refunds', 'leads': 'leads', 'scheduled': 'scheduled', 'demos completed': 'demos',
  '# of agreements': 'agreements', 'agreements': 'agreements', 'cash sales': 'cash_sales', 'eft sales': 'eft_sales', 'average eft': 'avg_eft', 'staff utilization': 'staff_util', 'calls per day': 'calls_per_day', 'cancellations': 'cancellations', 'active members': 'active_members' };
const SCODE = { gt: 'georgetown', fp: 'fourpoints', wc: 'williamcannon', wl: 'westlake', lw: 'lakeway', rr: 'roundrock' };
const INTC = new Set(['leads', 'scheduled', 'demos', 'agreements', 'cancellations', 'active_members']);
const numv = v => { if (v === null || v === undefined || v === '') return null; if (typeof v === 'number') return v; const n = parseFloat(String(v).replace(/[$,%\s]/g, '')); return isNaN(n) ? null : n; };
const monthOf = v => {
  if (typeof v === 'number') return serialMonth(v);
  const t = String(v ?? '').trim(); let m = t.match(/^([A-Za-z]{3})[a-z]*[- ,.]*(?:\d{1,2}[, ]+)?(\d{4}|\d{2})$/);
  if (m && MON[m[1]]) return `${m[2].length === 2 ? '20' + m[2] : m[2]}-${pad2(MON[m[1]])}-01`;
  m = t.match(/^(\d{4})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-01`;
  m = t.match(/^(\d{1,2})\/\d{1,2}\/(\d{4})$/); return m ? `${m[2]}-${pad2(m[1])}-01` : null;
};

function parseMine(g) {
  const hi = g.findIndex((r, i) => i < 10 && r.some(x => HMAP[NORM(x)] === 'month') && r.some(x => HMAP[NORM(x)] === 'studio'));
  if (hi < 0) return null;
  const cols = {}; g[hi].forEach((h, i) => { const k = HMAP[NORM(h)]; if (k && !(k in cols)) cols[k] = i; });
  const rows = [], skipped = [];
  g.slice(hi + 1).forEach(r => {
    if (r.every(x => x === null || x === '')) return;
    const st = NORM(r[cols.studio]).replace(/ /g, ''), key = SCODE[st] || st, loc = locs.find(l => l.name.toLowerCase().replace(/[^a-z]/g, '') === key), month = monthOf(r[cols.month]);
    if (!loc || !month) { skipped.push(String(r[cols.studio] ?? '?')); return; }
    const row = { studio_id: loc.id, month };
    Object.keys(HMAP).forEach(h => { const k = HMAP[h]; if (k !== 'month' && k !== 'studio' && k in cols && !(k in row)) { const v = numv(r[cols[k]]); row[k] = v === null ? null : INTC.has(k) ? Math.round(v) : v; } });
    if (!(row.gross_revenue || row.leads || row.scheduled || row.demos)) return;   // studio not open yet
    rows.push(row);
  });
  return { rows, skipped, missing: RAW.filter(([k]) => !(k in cols)).map(x => x[1]) };
}

function xlsbHint(f, e) {
  const msg = (e && e.message) || 'Unknown error.';
  const isXlsb = f && /\.xlsb$/i.test(f.name);
  return `That file could not be read (${esc(msg)}).` +
    (isXlsb ? ' This can happen with .xlsb files that use certain formulas. Open it in Excel and choose File \u2192 Save As \u2192 Excel Workbook (.xlsx), or in Google Sheets choose File \u2192 Download \u2192 Microsoft Excel (.xlsx), then upload that file instead.'
      : ' Try re-saving it as a .xlsx file and uploading that instead.');
}

async function readBook(f, want) {
  const buf = await f.arrayBuffer();
  if (!want) return XLSX.read(buf, { type: 'array', raw: true });
  const names = XLSX.read(buf, { type: 'array', bookSheets: true }).SheetNames;
  return XLSX.read(buf, { type: 'array', sheets: names.filter(want) });
}

function pfUpForm(title, blurb, id, extra) {
  $('dlgBody').innerHTML = `<h2>${title}</h2><p class="lead" style="margin:.25rem 0 1rem">${blurb}</p>${extra || ''}<label>File <input id="${id}" type="file" accept=".xlsx,.xlsb,.csv"></label><div id="upInfo" style="margin-bottom:.75rem"></div>
    <div class="err" id="pErr" role="alert"></div><div class="acts"><button data-act="${id}Save" id="upGo" disabled>Save</button><button class="quiet" data-act="close">Cancel</button></div>`;
  if (!$('dlg').open) $('dlg').showModal();
}
const upMsg = (html, err) => { $('upInfo').innerHTML = html; $('pErr').textContent = err || ''; $('upGo').disabled = !!err || !html; };

function pfMenu() {
  $('dlgBody').innerHTML = `<h2>Update data</h2><p class="lead" style="margin:.25rem 0 1rem">What do you want to update?</p>
    <div class="menu">
      <button class="quiet" data-act="pfM1"><b>Upload my monthly sheet</b><small>Your numbers for one or many months, from a spreadsheet or CSV</small></button>
      <button class="quiet" data-act="pfM2"><b>Upload corporate scorecard</b><small>The monthly Stretch Zone scorecard (.xlsb)</small></button>
      <button class="quiet" data-act="pfM3"><b>Add or edit a month</b><small>Type in one studio\u2019s numbers for one month</small></button>
    </div><div class="acts"><button class="quiet" data-act="close">Close</button></div>`;
  if (!$('dlg').open) $('dlg').showModal();
}
$('dlgBody').addEventListener('click', e => { const b = e.target.closest('[data-act]'), a = b && b.dataset.act; if (a === 'pfM1') pfMineForm(); else if (a === 'pfM2') pfCorpForm(); else if (a === 'pfM3') pfForm(); });

function pfCorpForm() {
  PF.pend = null; pfUpForm('Upload corporate scorecard', 'Drop in the monthly Stretch Zone scorecard (.xlsb or .xlsx). Only your six studios and the network averages are saved. Every other franchisee\u2019s rows are ignored.', 'cFile');
  $('cFile').onchange = async () => {
    try {
      const f = $('cFile').files[0]; upMsg('Reading the file, this can take a few seconds...');
      const wb = await readBook(f, n => /^[A-Za-z]{3}[a-z]*[- ]\d{2}$/.test(n.trim()) || n.trim() === 'Charting');
      const r = PF.pend = parseCorp(wb);
      if (!r.corp.length) return upMsg('', 'I could not find your studios. Check that this is the Stretch Zone monthly scorecard, and that all six studios have their store numbers set.');
      const n = new Set(r.allRows.map(x => x.store)).size;
      upMsg(`<p>Months found: <b>${r.months.map(m => mLbl(m)).join(', ')}</b></p><p>Your studios found: <b>${r.studios.size} of ${locs.length}</b> \u2022 ${r.corp.length} numbers with network ranks</p><p>Network averages: <b>${new Set(r.net.map(x => x.month)).size} months</b> \u2022 ${r.net.length} numbers</p><p>All Stretch Zone locations: <b>${n}</b>, for the All Stretch Zone Mastercard</p>`);
    } catch (e) { upMsg('', xlsbHint($('cFile').files[0], e)); }
  };
}

function pfMineForm() {
  PF.pend = null; pfUpForm('Upload my monthly sheet', 'Use a spreadsheet or CSV with the same columns as your Notion table (Month, Studio, Gross Revenue, Draft, Refunds, Leads, Scheduled, Demos Completed, # of Agreements, Cash Sales, EFT Sales, Average EFT, Staff Utilization, Calls per day, Cancellations, Active Members). Studio can be GT, FP, WC, WL, LW, RR or the full name. Existing months are updated, so uploading your whole history again is fine. <a href="#" id="pfTpl">Download a blank template</a>', 'mFile');
  $('pfTpl').onclick = e => { e.preventDefault(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([['Month', 'Studio', ...RAW.map(x => x[1].replace(' ($)', ''))].join(',') + '\n'], { type: 'text/csv' })); a.download = 'monthly-kpis-template.csv'; a.click(); };
  $('mFile').onchange = async () => {
    try {
      const f = $('mFile').files[0], wb = await readBook(f), r = parseMine(grid(wb.Sheets[wb.SheetNames[0]]));
      if (!r) return upMsg('', 'I could not find the Month and Studio columns in the first rows of this file.');
      const same = (a, b) => (a ?? null) === (b ?? null), ch = { n: 0, c: 0, u: 0 }, todo = [];
      r.rows.forEach(row => { const ex = PF.rows.find(x => x.studio_id === row.studio_id && x.month === row.month); const state = !ex ? 'n' : RAW.some(([k]) => k in row && !same(ex[k], row[k])) ? 'c' : 'u'; ch[state]++; if (state !== 'u') todo.push(row); });
      PF.pend = todo;
      const ms = r.rows.map(x => x.month).sort();
      upMsg(`<p><b>${r.rows.length}</b> studio-months from ${r.rows.length ? mLbl(ms[0]) + ' to ' + mLbl(ms[ms.length - 1]) : 'none'}: <b>${ch.n}</b> new, <b>${ch.c}</b> changed, ${ch.u} unchanged.</p>${r.skipped.length ? `<p class="lead">Skipped ${r.skipped.length} rows with a studio I did not recognize: ${esc([...new Set(r.skipped)].slice(0, 5).join(', '))}</p>` : ''}${r.missing.length ? `<p class="lead">Columns not found (left as they are): ${esc(r.missing.join(', '))}</p>` : ''}`, todo.length ? '' : 'Nothing new to save.');
    } catch (e) { upMsg('', xlsbHint($('mFile').files[0], e)); }
  };
}

async function pfUpSave(kind) {
  const up = async (table, rows, conflict) => { for (let i = 0; i < rows.length; i += 400) { const { error } = await db.from(table).upsert(rows.slice(i, i + 400), { onConflict: conflict }); if (error) return error; } };
  $('upGo').disabled = true; $('upGo').textContent = 'Saving...';
  const err = kind === 'corp' ? (await up('kpi_corp_studio', PF.pend.corp, 'studio_id,month,kpi')) || (await up('kpi_network', PF.pend.net, 'month,kpi')) || (await up('kpi_network_all', PF.pend.allRows, 'month,store')) : await up('kpi_monthly', PF.pend, 'studio_id,month');
  if (err) { $('pErr').textContent = 'Could not save. ' + err.message; $('upGo').disabled = false; $('upGo').textContent = 'Save'; return; }
  $('dlg').close(); PF.netAll = {}; loadPerf();
}

$('dlgBody').addEventListener('click', e => { const a = e.target.dataset.act; if (a === 'cFileSave') pfUpSave('corp'); else if (a === 'mFileSave') pfUpSave('mine'); });
