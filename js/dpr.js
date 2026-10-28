// ---------- DPR (daily production report) ----------
const DAILY = [['total_leads', 'Total leads'], ['manual_leads', 'Manually added leads'], ['demos_scheduled', 'Demos scheduled'], ['demos_showed', 'Demos showed'], ['demo_sales', '# of demo sales'], ['referrals', 'Referrals'], ['total_cash', 'Total cash ($)'],
  ['total_draft', 'Total draft ($)'], ['cancellations', 'Cancellations'], ['calls_made', 'Calls made'], ['utilization', 'Practitioner utilization (%)'], ['refunds', 'Refunds ($)'], ['google_reviews', 'Google reviews']];
const SNAP = [['mtd_gross', 'Current gross, month to date ($)'], ['mtd_eft_collected', 'EFT collected ($)'], ['eft_remaining', 'EFT remaining ($)'], ['mtd_refunds', 'Refunds, month to date ($)']];
const STYPES = ['Basic Membership', '1x Membership', '2x Membership', '3x Membership', '4x Membership', 'Add-on', 'Other'];
const SOURCES = ['Events', 'Mailers', 'Outreach', 'Paid Tad Media', 'Partnership', 'Referral', 'Social Media-Organic', 'WalkIn', 'Website', 'Other'];
const dpr = { studio: '', month: '', daily: [], sales: [], goals: null, note: '', staff: [] };
const nn = x => Number(x.toFixed(2)).toString(), pc = x => (x * 100).toFixed(1) + '%', m$ = x => '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numOrNull = v => { v = String(v).trim(); return v === '' || isNaN(+v) ? null : +v; };
const flash = el => { el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 900); };

async function loadDpr() {
  const own = ME.role === 'owner';
  if (!dpr.month) dpr.month = todayStr().slice(0, 7) + '-01';
  if (own) { if (!dpr.studio) dpr.studio = (locs.find(l => l.name === 'Lakeway') || locs[0] || {}).id; } else dpr.studio = ME.location_id;
  $('dprStudio').hidden = !own;
  if (own) $('dprStudio').innerHTML = locs.map(l => `<option value="${l.id}" ${l.id === dpr.studio ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  $('dprMonth').textContent = mLbl(dpr.month, 1);
  if (!dpr.studio) { $('dprBody').innerHTML = '<p class="lead">You have not been assigned to a studio yet. Ask the owner.</p>'; return; }
  const m = dpr.month, end = mAdd(m, 1), sid = dpr.studio;
  const [a, b, g, n, t] = await Promise.all([
    db.from('dpr_daily').select('*').eq('studio_id', sid).gte('day', m).lt('day', end),
    db.from('dpr_sales').select('*').eq('studio_id', sid).gte('sale_date', m).lt('sale_date', end).order('sale_date').order('created_at'),
    db.from('dpr_goals').select('*').eq('studio_id', sid).lte('month', m).order('month', { ascending: false }).limit(1),
    db.from('dpr_notes').select('*').eq('studio_id', sid).eq('month', m).maybeSingle(),
    db.from('team_directory').select('full_name').eq('location_id', sid)]);
  dpr.daily = a.data || []; dpr.sales = b.data || []; dpr.goals = (g.data || [])[0] || null; dpr.note = (n.data && n.data.note) || '';
  dpr.staff = (t.data || []).map(x => { const p = String(x.full_name).split(' '); return p[0] + (p[1] ? ' ' + p[1][0] : ''); });
  drawDpr();
}

function dprCalc() {
  const D = new Date(+dpr.month.slice(0, 4), +dpr.month.slice(5, 7), 0).getDate(), td = todayStr(), cur = td.slice(0, 7) === dpr.month.slice(0, 7);
  const d = cur ? +td.slice(8, 10) : (td < dpr.month ? 0 : D), G = dpr.goals || {};
  const S = f => dpr.daily.reduce((n, r) => n + (+r[f] || 0), 0), sum = (arr, f) => arr.reduce((n, r) => n + (+r[f] || 0), 0);
  const utilRows = dpr.daily.filter(r => r.utilization !== null && r.utilization !== undefined);
  const latest = f => { const r = dpr.daily.filter(x => x[f] !== null && x[f] !== undefined).sort((p, q) => p.day < q.day ? 1 : -1)[0]; return r ? +r[f] : null; };
  const cashRows = dpr.sales.filter(x => x.cash !== null && x.cash !== undefined);
  const c = { D, d, G, S, latest, leads: S('total_leads'), manual: S('manual_leads'), sched: S('demos_scheduled'), showed: S('demos_showed'), dsales: S('demo_sales'), refs: S('referrals'), cash: S('total_cash'), draft: S('total_draft'),
    canc: S('cancellations'), calls: S('calls_made'), refunds: S('refunds'), reviews: S('google_reviews'), util: utilRows.length ? utilRows.reduce((n, r) => n + +r.utilization, 0) / utilRows.length : null,
    gross: latest('mtd_gross'), eftCol: latest('mtd_eft_collected'), eftRem: latest('eft_remaining'), mtdRef: latest('mtd_refunds'),
    logCash: sum(dpr.sales, 'cash'), logEft: sum(dpr.sales, 'eft'), avgEft: cashRows.length ? sum(cashRows, 'cash') / cashRows.length : null };
  c.proj = d ? (c.logCash / d) * D + (c.eftCol || 0) + (c.eftRem || 0) : null;
  c.needed = G.revenue != null ? G.revenue - ((c.gross || 0) + (c.eftRem || 0)) : null;
  return c;
}

function dprBox(title, rows, c, own) {
  return `<div class="hcard"><h3>${title}</h3><table class="mt dp"><thead><tr><th>Section</th><th>Total</th><th>Goal</th><th>+/- Pace / Goal</th></tr></thead><tbody>` + rows.map(x => {
    const has = x.v !== null && x.g !== null && x.g !== undefined; let ex = null, good = null;
    if (has) { if (x.kind === 'pace') { ex = x.g / c.D * c.d; good = x.v >= ex; } else if (x.kind === 'diff') { ex = x.v - x.g; good = ex >= 0; } else if (x.kind === 'low') { ex = x.v - x.g; good = ex <= 0; } else { ex = x.g - x.v; good = ex >= 0; } }
    const gcell = own && x.gk ? `<input class="cellin" type="number" step="any" min="0" data-goal="${x.gk}" data-sc="${x.sc}" value="${x.g === null || x.g === undefined ? '' : nn(x.g * x.sc)}" style="width:5rem;min-width:0" aria-label="${x.label} goal">` : (x.g === null || x.g === undefined ? '-' : x.f(x.g));
    return `<tr style="cursor:default"><td>${x.label}</td><td>${x.v === null ? '-' : x.f(x.v)}</td><td>${gcell}</td><td class="${good === null ? '' : good ? 'good' : 'bad'}">${ex === null ? '-' : x.f === pc ? (ex * 100).toFixed(2) + '%' : x.f(ex)}</td></tr>`;
  }).join('') + '</tbody></table></div>';
}

function drawTop() {
  const c = dprCalc(), G = c.G, own = ME.role === 'owner', r = (label, v, g, kind, f, gk, sc) => ({ label, v, g, kind, f, gk, sc: sc || 1 });
  const funnel = [r('Total Leads', c.leads, G.leads, 'pace', nn, 'leads'), r('Manually added', c.manual, G.leads != null ? G.leads * 0.2 : null, 'pace', nn), r('Lead to Demo %', c.leads ? c.sched / c.leads : null, G.lead_to_demo, 'diff', pc, 'lead_to_demo', 100),
    r('Show %', c.sched ? c.showed / c.sched : null, G.show_rate, 'diff', pc, 'show_rate', 100), r('Close %', c.showed ? c.dsales / c.showed : null, G.close_rate, 'diff', pc, 'close_rate', 100), r('# of Sales', c.dsales, G.sales, 'pace', nn, 'sales')];
  const ops = [r('Utilization %', c.util === null ? null : c.util / 100, G.utilization, 'diff', pc, 'utilization', 100), r('Calls per day', c.d ? c.calls / c.d : null, G.calls_per_day, 'diff', nn, 'calls_per_day'), r('Referrals', c.refs, G.referrals, 'pace', nn, 'referrals'),
    r('Google Reviews', c.reviews, G.google_reviews, 'pace', nn, 'google_reviews'), r('Cancellations', c.canc, G.cancellations, 'low', nn, 'cancellations'), r('Net Member Gain', c.dsales - c.canc, G.net_member_gain, 'pace', nn, 'net_member_gain')];
  const fin = [r('Revenue', c.gross, G.revenue, 'pace', m$, 'revenue'), r('Studio Cash', c.cash, G.studio_cash, 'pace', m$, 'studio_cash'), r('Studio Draft', c.draft, G.studio_draft, 'pace', m$, 'studio_draft'), r('Cash Sales', c.logCash, G.cash_sales, 'pace', m$, 'cash_sales'),
    r('EFT Sales', c.eftRem, G.eft_sales, 'pace', m$, 'eft_sales'), r('Average EFT', c.avgEft, G.avg_eft, 'diff', m$, 'avg_eft'), r('Refunds', c.refunds, G.refunds, 'refund', m$, 'refunds')];
  const kv = rows => '<table class="mt dp"><tbody>' + rows.map(x => `<tr style="cursor:default"><td>${x[0]}</td><td><b>${x[1]}</b></td></tr>`).join('') + '</tbody></table>';
  const mv = x => x === null || x === undefined ? '-' : m$(x), perDay = c.needed !== null && c.D - c.d > 0 ? c.needed / (c.D - c.d) : null;
  $('dprTop').innerHTML = `<div class="dgrid3">${dprBox('Marketing & Sales Funnel', funnel, c, own)}${dprBox('Operations', ops, c, own)}${dprBox('Financials', fin, c, own)}</div>
    ${dpr.goals ? '' : `<p class="lead">No goals set yet.${own ? ' Type them into the Goal column above.' : ' The owner sets them.'}</p>`}
    <h3 class="sub" style="margin-top:1.5rem">Projection</h3><div class="dgrid3"><div class="hcard"><h3>Revenue snapshot</h3>${kv([['Cash sales', m$(c.logCash)], ['EFT sales', m$(c.logEft)], ['EFT collected', mv(c.eftCol)], ['EFT remaining', mv(c.eftRem)], ['Refunds', mv(c.mtdRef)], ['Current gross', mv(c.gross)]])}
    <p style="margin:.6rem 0 0">Projected month end <b>${mv(c.proj)}</b> \u2022 goal <b>${mv(G.revenue)}</b> \u2022 <b>${c.proj !== null && G.revenue ? ((c.proj / G.revenue) * 100).toFixed(2) + '%' : '-'}</b> to goal</p></div>
    <div class="hcard"><h3>Revenue needed to goal</h3>${kv([['Monthly revenue goal', mv(G.revenue)], ['Current gross', mv(c.gross)], ['Invoices coming due', mv(c.eftRem)], ['Cancellations\u2019 value', c.avgEft === null ? '-' : m$(c.canc * c.avgEft)], ['New sales still needed', mv(c.needed)]])}
    <h3 style="margin:1rem 0 .5rem">Sales target from today forward</h3>${kv([['Days remaining', c.D - c.d], ['New sales needed', mv(c.needed)], ['Sales needed per day', mv(perDay)]])}</div>
    <div class="hcard"><h3>Sales breakdown</h3><table class="mt dp"><thead><tr><th>Type</th><th>Actual</th><th>Projection</th><th># of</th></tr></thead><tbody>` +
    ['1x Membership', '2x Membership', '3x Membership', '4x Membership', 'Basic Membership', 'Add-on'].map(t => { const rows = dpr.sales.filter(x => x.sale_type === t), a = rows.reduce((n, x) => n + (+x.cash || 0), 0); return `<tr style="cursor:default"><td>${t}</td><td>${m$(a)}</td><td>${c.d ? m$(a / c.d * c.D) : '-'}</td><td>${rows.length}</td></tr>`; }).join('') + '</tbody></table></div></div>';
}

function drawNote() {
  const mgr = ME.role === 'owner' || ME.role === 'manager';
  $('dprNote').innerHTML = `<div class="hcard" style="margin-top:1rem"><h3>Initiatives / Alerts</h3>${mgr ? `<textarea id="dNote" rows="3" maxlength="1500" placeholder="What is the studio focused on this month?">${esc(dpr.note)}</textarea><button id="dNoteSave" style="margin-top:.5rem">Save note</button>` : `<p style="white-space:pre-wrap;margin:0">${esc(dpr.note) || '<span class="lead">No note this month.</span>'}</p>`}</div>`;
}

function drawGrid() {
  const m = dpr.month, D = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(), byDay = Object.fromEntries(dpr.daily.map(x => [x.day, x])), td = todayStr();
  $('dprGrid').innerHTML = `<div class="table-wrap"><table class="mt dg"><thead><tr><th>Day</th>${DAILY.map(x => `<th>${x[1]}</th>`).join('')}${SNAP.map(x => `<th class="ycol">${x[1]}</th>`).join('')}</tr></thead><tbody>` +
    Array.from({ length: D }, (_, i) => { const day = m.slice(0, 8) + String(i + 1).padStart(2, '0'), rw = byDay[day] || {}, cell = (x, cls) => `<td class="${cls || ''}"><input class="cellin" type="number" step="any" min="0" data-f="${x[0]}" value="${rw[x[0]] ?? ''}" aria-label="${x[1]}, day ${i + 1}"></td>`;
      return `<tr data-day="${day}" class="${day === td ? 'tod' : ''}" style="cursor:default"><td>${i + 1}</td>${DAILY.map(x => cell(x)).join('')}${SNAP.map(x => cell(x, 'ycol')).join('')}</tr>`; }).join('') +
    `<tr class="tot" style="cursor:default"><td>Total</td>${DAILY.map(x => `<td data-tot="${x[0]}"></td>`).join('')}${SNAP.map(x => `<td class="ycol" data-tot="${x[0]}"></td>`).join('')}</tr></tbody></table></div>`;
  drawTotals();
}

function drawTotals() {
  const c = dprCalc();
  document.querySelectorAll('#dprGrid [data-tot]').forEach(td => { const f = td.dataset.tot, sn = SNAP.some(x => x[0] === f); const v = sn ? c.latest(f) : f === 'utilization' ? c.util : c.S(f); td.textContent = v === null || v === undefined ? '' : nn(+v); });
}

function drawSales() {
  const opt = (a, sel) => `<option value=""></option>` + a.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const m = dpr.month, td = todayStr(), dd = td.slice(0, 7) === m.slice(0, 7) ? td : m;
  const row = x => `<tr data-id="${x.id || ''}" style="cursor:default"><td><input class="cellin" type="date" data-s="sale_date" value="${x.sale_date || dd}" style="min-width:8.5rem"></td><td><input class="cellin" data-s="member_name" maxlength="80" value="${esc(x.member_name)}" style="min-width:10rem"></td>
    <td><select class="cellin" data-s="sale_type">${opt(STYPES, x.sale_type)}</select></td><td><input class="cellin" type="number" step="any" min="0" data-s="cash" value="${x.cash ?? ''}"></td><td><input class="cellin" type="number" step="any" min="0" data-s="eft" value="${x.eft ?? ''}"></td>
    <td><select class="cellin" data-s="source">${opt(SOURCES, x.source)}</select></td><td><input class="cellin" data-s="staff" list="dprStaff" maxlength="60" value="${esc(x.staff)}"></td><td><input class="cellin" type="number" min="0" data-s="addon_qty" value="${x.addon_qty ?? ''}"></td>
    <td>${x.id ? `<button class="quiet sm" data-sdel="${x.id}">Remove</button>` : ''}</td></tr>`;
  $('dprSales').innerHTML = `<datalist id="dprStaff">${dpr.staff.map(x => `<option>${esc(x)}</option>`).join('')}</datalist><div class="table-wrap"><table class="mt dg"><thead><tr><th>Date</th><th>Member name</th><th>Sale type</th><th>Cash</th><th>EFT</th><th>Source</th><th>Staff</th><th>Add-on quantity</th><th></th></tr></thead><tbody>` +
    dpr.sales.map(row).join('') + [0, 1, 2].map(() => row({})).join('') + '</tbody></table></div>';
}

function drawDpr() {
  $('dprBody').innerHTML = `<div id="dprTop" style="margin-top:.5rem"></div><div id="dprNote"></div>
    <h3 class="sub" style="margin-top:1.5rem">Daily numbers</h3><p class="lead" style="margin:0 0 .6rem">Type straight into any cell. It saves as soon as you leave the cell, and you can change it any time. The yellow columns are the month-to-date numbers from ClubReady.</p><div id="dprGrid"></div>
    <h3 class="sub" style="margin-top:1.5rem">Sales log</h3><p class="lead" style="margin:0 0 .6rem">Fill in a blank row (date and member name are required). Change any cell to edit a sale.</p><div id="dprSales"></div>`;
  drawTop(); drawNote(); drawGrid(); drawSales();
}

$('dprStudio').onchange = e => { dpr.studio = e.target.value; loadDpr(); };
$('dprPrev').onclick = () => { dpr.month = mAdd(dpr.month, -1); loadDpr(); };
$('dprNext').onclick = () => { dpr.month = mAdd(dpr.month, 1); loadDpr(); };

$('dprBody').onchange = async e => {
  const t = e.target, now = new Date().toISOString();
  if (t.dataset.f) {
    const day = t.closest('tr').dataset.day, f = t.dataset.f, v = numOrNull(t.value);
    const { error } = await db.from('dpr_daily').upsert({ studio_id: dpr.studio, day, [f]: v, updated_by: ME.id, updated_at: now }, { onConflict: 'studio_id,day' });
    if (error) { alert('Could not save that. ' + error.message); return; }
    let rw = dpr.daily.find(x => x.day === day); if (!rw) { rw = { studio_id: dpr.studio, day }; dpr.daily.push(rw); } rw[f] = v;
    flash(t); drawTop(); drawTotals();
  } else if (t.dataset.goal) {
    const k = t.dataset.goal, v = numOrNull(t.value), row = { ...(dpr.goals || {}), studio_id: dpr.studio, month: dpr.month, [k]: v === null ? null : v / +t.dataset.sc };
    const { error } = await db.from('dpr_goals').upsert(row, { onConflict: 'studio_id,month' });
    if (error) { alert('Could not save that goal. ' + error.message); return; }
    dpr.goals = row; drawTop();
  } else if (t.dataset.s) {
    const tr = t.closest('tr'), id = tr.dataset.id, g = k => tr.querySelector(`[data-s="${k}"]`).value;
    const row = { sale_date: g('sale_date'), member_name: g('member_name').trim(), sale_type: g('sale_type') || null, cash: numOrNull(g('cash')), eft: numOrNull(g('eft')), source: g('source') || null, staff: g('staff').trim() || null, addon_qty: numOrNull(g('addon_qty')) };
    if (!row.sale_date || !row.member_name) return;
    if (id) {
      const { error } = await db.from('dpr_sales').update(row).eq('id', id);
      if (error) { alert('Could not save that. ' + error.message); return; }
      Object.assign(dpr.sales.find(x => x.id === id) || {}, row); flash(t); drawTop();
    } else {
      const { data, error } = await db.from('dpr_sales').insert({ studio_id: dpr.studio, ...row, created_by: ME.id }).select().single();
      if (error) { alert('Could not save that. ' + error.message); return; }
      dpr.sales.push(data); dpr.sales.sort((p, q) => p.sale_date < q.sale_date ? -1 : p.sale_date > q.sale_date ? 1 : 0); drawSales(); drawTop();
    }
  }
};
$('dprBody').onclick = async e => {
  const t = e.target;
  if (t.dataset.sdel) {
    if (!confirm('Remove this sale?')) return;
    const { error } = await db.from('dpr_sales').delete().eq('id', t.dataset.sdel); if (error) { alert(error.message); return; }
    dpr.sales = dpr.sales.filter(x => x.id !== t.dataset.sdel); drawSales(); drawTop();
  } else if (t.id === 'dNoteSave') {
    const { error } = await db.from('dpr_notes').upsert({ studio_id: dpr.studio, month: dpr.month, note: $('dNote').value.trim() || null, updated_by: ME.id, updated_at: new Date().toISOString() }, { onConflict: 'studio_id,month' });
    if (error) { alert(error.message); return; } dpr.note = $('dNote').value.trim(); t.textContent = 'Saved';
  }
};
