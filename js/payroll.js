// ---------- Payroll ----------
const PAY = { studio: '', period: '', periods: [], rows: [], settings: null, people: [], pay: [], msg: '' };
const pad2p = n => String(n).padStart(2, '0');
const shortName = full => { const p = String(full || '').trim().split(/\s+/); return p[0] ? p[0] + (p[1] ? ' ' + p[1][0].toUpperCase() : '') : ''; };
const nameKey = s => shortName(s).toLowerCase();
const m$$ = x => '$' + (+x || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function payDateFor(startStr) {
  const d = new Date(startStr + 'T00:00');
  if (d.getDate() <= 15) { const p = new Date(d.getFullYear(), d.getMonth(), 25); return ymd(p); }
  const p = new Date(d.getFullYear(), d.getMonth() + 1, 10); return ymd(p);
}

function payGrid(sheet) { return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }); }
function findHeader(g, cols) { return g.findIndex((r, i) => i < 6 && cols.every(c => r.includes(c))); }
function rowsAfter(g, hi) {
  const cols = {}; g[hi].forEach((h, i) => { if (h !== null && !(h in cols)) cols[h] = i; });
  return { cols, data: g.slice(hi + 1) };
}

function parsePayrollFile(name, g) {
  let hi;
  if ((hi = findHeader(g, ['Salesperson', 'Invoice', '# Previous Agreements'])) >= 0) return { kind: 'agreements', grid: g, ...rowsAfter(g, hi) };
  if ((hi = findHeader(g, ['Employee User ID', 'Total\nMinutes'])) >= 0) return { kind: 'timeclock', grid: g, ...rowsAfter(g, hi) };
  if ((hi = findHeader(g, ['Total Sessions', 'Time Clock\nHours Worked'])) >= 0) return { kind: 'session', grid: g, ...rowsAfter(g, hi) };
  return null;
}

function periodFromName(name) {
  const m = name.match(/_(\d{4,6})_-_(\d{4}-\d{2}-\d{2})_-_(\d{4}-\d{2}-\d{2})/);
  return m ? { store: m[1], start: m[2], end: m[3] } : null;
}

// Falls back to the date range and store number printed inside the report itself (its title cell),
// since a downloaded file can end up renamed in ways the filename check above won't catch.
function periodFromTitle(g) {
  const title = String((g[0] || [])[0] || '') + ' ' + String((g[1] || [])[0] || '');
  const d = title.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!d) return null;
  const iso = (mo, da, yr) => yr + '-' + pad2p(+mo) + '-' + pad2p(+da);
  const store = (title.match(/\((\d{4,6})\)/) || [])[1] || null;
  return { store, start: iso(d[1], d[2], d[3]), end: iso(d[4], d[5], d[6]) };
}

// Builds one row per ClubReady employee from the three reports, matches each to a teammate,
// and works out their pay for the period. Pure function so it can be tested on its own.
function buildPayrollRows(files, settings, roster) {
  const byId = new Map(), addRow = (id, name) => { if (!byId.has(id)) byId.set(id, { club_user_id: id, display_name: name, hours: 0, sessions: 0, new_agreements: 0, renewal_agreements: 0, commission: 0 }); return byId.get(id); };
  const nameToId = new Map(); // "first lastinitial" (lowercase) -> club_user_id, from files that carry a real ID
  const num = v => (v === null || v === undefined || v === '') ? 0 : +v || 0;

  if (files.timeclock) { const { cols, data } = files.timeclock;
    data.forEach(r => {
      const id = r[cols['Employee User ID']]; if (id === null || id === undefined) return;
      const first = r[cols['Employee First Name']] || '', last = r[cols['Employee Last Name']] || '';
      const nm = (first + ' ' + last).trim(), row = addRow(+id, nm);
      row.hours = num(r[cols['Total\nMinutes']]) / 60;
      nameToId.set(nameKey(nm), +id);
    });
  }
  if (files.session) { const { cols, data } = files.session;
    data.forEach(r => {
      const id = r[cols['User ID']]; if (id === null || id === undefined) return;
      const first = r[cols['First Name']] || '', last = r[cols['Last Name']] || '';
      const nm = (first + ' ' + last).trim(), row = addRow(+id, nm);
      row.sessions = num(r[cols['Total Sessions']]);
      if (nm.trim()) nameToId.set(nameKey(nm), +id);
    });
  }
  const unmatchedSales = [];
  if (files.agreements) { const { cols, data } = files.agreements;
    data.forEach(r => {
      const invoice = r[cols['Invoice']], sp = r[cols['Salesperson']];
      if (invoice === null || invoice === undefined || !sp) return;
      const prev = num(r[cols['# Previous Agreements']]), isNew = prev === 0;
      const pct = isNew ? (settings.new_pct || .10) : (settings.renewal_pct || .05);
      const names = String(sp).split(/[+,&]/).map(x => x.replace(/\n/g, ' ').trim()).filter(Boolean);
      if (!names.length) return;
      const each = (invoice * pct) / names.length;
      names.forEach(n => {
        const key = nameKey(n), id = nameToId.get(key);
        if (id === undefined) { unmatchedSales.push(n); return; }
        const row = addRow(id, n);
        row.commission += each;
        if (isNew) row.new_agreements++; else row.renewal_agreements++;
      });
    });
  }

  const byClub = new Map(roster.filter(p => p.club_user_id).map(p => [p.club_user_id, p]));
  const byName = new Map(roster.map(p => [nameKey(p.full_name), p]));
  const today = todayStr();
  const rows = [...byId.values()].filter(r => r.hours > 0.005 || r.sessions > 0 || r.commission > 0.005).map(r => {
    const person = byClub.get(r.club_user_id) || byName.get(nameKey(r.display_name)) || null;
    const matched = !!byClub.get(r.club_user_id);
    let hourly_rate = null, pay_type = null, per_stretch = null;
    if (person) {
      const inEff = PAY.pay.filter(x => x.user_id === person.id && x.effective_date <= today).sort((a, b) => a.effective_date < b.effective_date ? 1 : -1);
      if (inEff[0]) { hourly_rate = inEff[0].rate === null || inEff[0].rate === undefined ? null : +inEff[0].rate; pay_type = inEff[0].pay_type; }
      const ps = inEff.find(x => x.per_stretch !== null && x.per_stretch !== undefined); if (ps) per_stretch = +ps.per_stretch;
    }
    const regular_pay = pay_type === 'hourly' && hourly_rate !== null ? r.hours * hourly_rate : 0;
    const stretch_pay = r.sessions * (per_stretch ?? (settings.stretch_rate || 4));
    const total_pay = regular_pay + stretch_pay + r.commission;
    return { ...r, user_id: person ? person.id : null, display_name: person ? person.full_name : r.display_name, matched_by_id: matched, pay_type, hourly_rate, regular_pay, stretch_pay, total_pay };
  });
  rows.sort((a, b) => b.total_pay - a.total_pay);
  return { rows, unmatchedSales: [...new Set(unmatchedSales)] };
}

async function loadPayroll() {
  const own = ME.role === 'owner';
  if (!PAY.studio) PAY.studio = own ? (locs[0] || {}).id : ME.location_id;
  $('payStudio').hidden = !own;
  if (own) $('payStudio').innerHTML = locs.map(l => `<option value="${l.id}" ${l.id === PAY.studio ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  if (!PAY.studio) { $('payBody').innerHTML = '<p class="lead">You have not been assigned to a studio yet.</p>'; return; }
  const [st, per, pe, ppl] = await Promise.all([
    db.from('payroll_settings').select('*').maybeSingle(),
    db.from('payroll_lines').select('period_start,period_end,pay_date').eq('studio_id', PAY.studio),
    db.from('pay_history').select('user_id,effective_date,rate,pay_type'),
    db.from('team_directory').select('id,full_name,location_id,club_user_id')]);
  // Pay rates now live on the Leadership page (staff + staff_pay); use them for anyone linked to a login
  const [sf, sp] = await Promise.all([db.from('staff').select('id,user_id'), db.from('staff_pay').select('staff_id,effective_date,base_rate,per_stretch,pay_type')]);
  if (!sf.error && !sp.error) { const u = Object.fromEntries((sf.data || []).filter(x => x.user_id).map(x => [x.id, x.user_id]));
    pe.data = (sp.data || []).filter(x => u[x.staff_id]).map(x => ({ user_id: u[x.staff_id], effective_date: x.effective_date, rate: x.base_rate, pay_type: x.pay_type || 'hourly', per_stretch: x.per_stretch })); }
  PAY.settings = st.data || { stretch_rate: 4, new_pct: .10, renewal_pct: .05 };
  PAY.pay = pe.data || []; PAY.people = ppl.data || [];
  const seen = new Map(); (per.data || []).forEach(x => seen.set(x.period_start, x));
  PAY.periods = [...seen.values()].sort((a, b) => b.period_start < a.period_start ? -1 : 1);
  $('payPeriod').innerHTML = PAY.periods.map(x => `<option value="${x.period_start}" ${x.period_start === PAY.period ? 'selected' : ''}>${fmt(x.period_start)} \u2013 ${fmt(x.period_end)} (pay ${fmt(x.pay_date)})</option>`).join('') || '<option value="">No periods uploaded yet</option>';
  if (!PAY.period && PAY.periods[0]) PAY.period = PAY.periods[0].period_start;
  if (!PAY.period) { $('payBody').innerHTML = '<p class="lead">No payroll uploaded for this studio yet. Click Upload reports to start.</p>'; $('payAlert').innerHTML = ''; return; }
  const { data } = await db.from('payroll_lines').select('*').eq('studio_id', PAY.studio).eq('period_start', PAY.period).order('total_pay', { ascending: false });
  PAY.rows = data || [];
  drawPayroll();
}

function drawPayroll() {
  const rows = PAY.rows, tot = rows.reduce((n, r) => n + +r.total_pay, 0), hrs = rows.reduce((n, r) => n + +r.hours, 0), comm = rows.reduce((n, r) => n + +r.commission, 0);
  const unmatched = rows.filter(r => !r.user_id);
  $('payAlert').innerHTML = unmatched.length ? tile(unmatched.length, 'Rows need a match', 'pick who this is, in the table below') : '';
  $('payBody').innerHTML = `<div class="sum">${tile(m$$(tot), 'Total for this period')}${tile(hrs.toFixed(1), 'Hours')}${tile(m$$(comm), 'Commission')}${tile(rows.length, 'People paid')}</div>
    <div class="table-wrap"><table class="mt"><thead><tr><th>Name</th><th>Hours</th><th>Rate</th><th>Regular pay</th><th>Sessions</th><th>Stretch pay</th><th>New</th><th>Renewal</th><th>Commission</th><th>Total</th></tr></thead><tbody>` +
    rows.map(r => `<tr style="cursor:default"><td>${r.user_id ? '<b>' + esc(r.display_name) + '</b>' : `<span class="pill warn">Not matched</span> ${esc(r.display_name)}<select class="qty" data-assign="${r.id}" style="margin-top:.3rem"><option value="">Who is this?</option>${PAY.people.map(p => `<option value="${p.id}">${esc(p.full_name)}</option>`).join('')}</select>`}</td>` +
      `<td>${(+r.hours).toFixed(2)}</td><td>${r.pay_type === 'salary' ? 'Salaried' : r.hourly_rate ? m$$(r.hourly_rate) + '/hr' : '-'}</td><td>${m$$(r.regular_pay)}</td><td>${r.sessions}</td><td>${m$$(r.stretch_pay)}</td><td>${r.new_agreements || ''}</td><td>${r.renewal_agreements || ''}</td><td>${m$$(r.commission)}</td><td><b>${m$$(r.total_pay)}</b></td></tr>`).join('') +
    '</tbody></table></div>';
}

function payUpForm() {
  PAY.pend = null;
  $('dlgBody').innerHTML = `<h2>Upload payroll reports</h2><p class="lead" style="margin:.25rem 0 1rem">Select the Agreements Log, Time Clock Payroll Summary, and Session Payroll Summary together, all for the same pay period.</p>
    <label>Files <input id="payFiles" type="file" multiple accept=".xlsx"></label><div id="upInfo" style="margin-bottom:.75rem"></div>
    <div class="err" id="pErr" role="alert"></div><div class="acts"><button data-act="paySave" id="upGo" disabled>Save</button><button class="quiet" data-act="close">Cancel</button></div>`;
  $('payFiles').onchange = payReadFiles;
  $('dlg').showModal();
}

async function payReadFiles() {
  const files = {}; let period = null, lines = [];
  for (const f of $('payFiles').files) {
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', raw: true });
      const parsed = parsePayrollFile(f.name, payGrid(wb.Sheets[wb.SheetNames[0]]));
      if (!parsed) { lines.push(`\u2717 ${esc(f.name)}: not a report I recognize`); continue; }
      files[parsed.kind] = parsed; lines.push(`✓ ${{ agreements: 'Agreements Log', timeclock: 'Time Clock Payroll Summary', session: 'Session Payroll Summary' }[parsed.kind]} (${parsed.data.length} rows)`);
      const p = periodFromName(f.name) || periodFromTitle(parsed.grid);
      if (p && (!period || p.store)) period = { ...period, ...p };
    } catch (e) { lines.push(`\u2717 ${esc(f.name)}: could not be read`); }
  }
  let err = '';
  if (!files.timeclock && !files.session) err = 'Add at least the Time Clock Payroll Summary or the Session Payroll Summary.';
  else if (!period) err = 'Could not tell the pay period from the file names. Use the files exactly as ClubReady exports them.';
  else if (locs.find(l => l.id === PAY.studio) && locs.find(l => l.id === PAY.studio).club_store_id && locs.find(l => l.id === PAY.studio).club_store_id !== period.store) err = `These files are for ClubReady store ${period.store}, but ${studio(PAY.studio)} is store ${locs.find(l => l.id === PAY.studio).club_store_id}. Pick the right studio.`;
  $('upInfo').innerHTML = '<p style="margin:.5rem 0">' + lines.join('<br>') + '</p>';
  if (err) { $('pErr').textContent = err; $('upGo').disabled = true; return; }
  const { rows, unmatchedSales } = buildPayrollRows(files, PAY.settings, PAY.people);
  const pay_date = payDateFor(period.start);
  PAY.pend = { period, pay_date, rows };
  const matched = rows.filter(r => r.user_id).length;
  $('upInfo').innerHTML += `<p>Pay period <b>${fmt(period.start)} \u2013 ${fmt(period.end)}</b>, paid on <b>${fmt(pay_date)}</b></p><p><b>${rows.length}</b> people, <b>${matched}</b> matched automatically${rows.length - matched ? `, <b>${rows.length - matched}</b> need you to confirm who they are` : ''}.</p>` +
    (unmatchedSales.length ? `<p class="lead">Could not credit commission to: ${esc(unmatchedSales.join(', '))}. They may need to clock in or do a session first so I know who they are.</p>` : '');
  $('pErr').textContent = ''; $('upGo').disabled = false;
}

async function paySave() {
  const p = PAY.pend; if (!p) return;
  const go = $('upGo'); go.disabled = true; go.textContent = 'Saving...';
  const del = await db.from('payroll_lines').delete().eq('studio_id', PAY.studio).eq('period_start', p.period.start);
  if (del.error) { $('pErr').textContent = 'Could not save. ' + del.error.message; go.disabled = false; go.textContent = 'Save'; return; }
  const rows = p.rows.map(r => ({ studio_id: PAY.studio, period_start: p.period.start, period_end: p.period.end, pay_date: p.pay_date, club_user_id: r.club_user_id, user_id: r.user_id, display_name: r.display_name,
    hours: r.hours, pay_type: r.pay_type, hourly_rate: r.hourly_rate, regular_pay: r.regular_pay, sessions: r.sessions, stretch_pay: r.stretch_pay, new_agreements: r.new_agreements, renewal_agreements: r.renewal_agreements, commission: r.commission, total_pay: r.total_pay, created_by: ME.id }));
  const ins = rows.length ? await db.from('payroll_lines').insert(rows) : { error: null };
  if (ins.error) { $('pErr').textContent = 'Could not save. ' + ins.error.message; go.disabled = false; go.textContent = 'Save'; return; }
  const newlyMatched = p.rows.filter(r => r.user_id && !r.matched_by_id);
  for (const r of newlyMatched) await db.from('profiles').update({ club_user_id: r.club_user_id }).eq('id', r.user_id).is('club_user_id', null);
  $('dlg').close(); PAY.period = p.period.start; await loadPayroll();
}

function payRatesForm() {
  const s = PAY.settings;
  $('dlgBody').innerHTML = `<h2>Payroll rates</h2><p class="lead" style="margin:.25rem 0 1rem">Used the next time you upload reports. Past periods already saved do not change.</p>
    <div class="grid2"><label>Pay per stretch ($)<input id="rStretch" type="number" step="any" min="0" value="${s.stretch_rate}"></label>
    <label>Commission on new agreements (%)<input id="rNew" type="number" step="any" min="0" max="100" value="${(s.new_pct * 100).toFixed(2)}"></label>
    <label>Commission on renewals (%)<input id="rRenew" type="number" step="any" min="0" max="100" value="${(s.renewal_pct * 100).toFixed(2)}"></label></div>
    <div class="err" id="pErr" role="alert"></div><div class="acts"><button data-act="rateSave">Save</button><button class="quiet" data-act="close">Cancel</button></div>`;
  $('dlg').showModal();
}

$('payStudio').onchange = e => { PAY.studio = e.target.value; PAY.period = ''; loadPayroll(); };
$('payPeriod').onchange = e => { PAY.period = e.target.value; loadPayroll(); };
$('payUp').onclick = payUpForm;
$('payRates').onclick = payRatesForm;
$('payCsv').onclick = () => {
  const head = ['Name', 'Hours', 'Pay type', 'Hourly rate', 'Regular pay', 'Sessions', 'Stretch pay', 'New agreements', 'Renewal agreements', 'Commission', 'Total pay', 'Pay date'];
  const lines = [head.map(csvCell).join(',')].concat(PAY.rows.map(r => [r.display_name, (+r.hours).toFixed(2), r.pay_type || '', r.hourly_rate || '', r.regular_pay.toFixed(2), r.sessions, r.stretch_pay.toFixed(2), r.new_agreements, r.renewal_agreements, r.commission.toFixed(2), r.total_pay.toFixed(2), r.pay_date].map(csvCell).join(',')));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = 'payroll-' + studio(PAY.studio).replace(/\s+/g, '-').toLowerCase() + '-' + PAY.period + '.csv'; a.click();
};
$('payBody').onchange = async e => {
  if (!e.target.dataset.assign) return;
  const id = e.target.dataset.assign, uid = e.target.value; if (!uid) return;
  const row = PAY.rows.find(x => x.id === id); if (!row) return;
  const { error } = await db.from('payroll_lines').update({ user_id: uid }).eq('id', id);
  if (error) { alert('Could not save that. ' + error.message); return; }
  await db.from('profiles').update({ club_user_id: row.club_user_id }).eq('id', uid).is('club_user_id', null);
  loadPayroll();
};
$('dlgBody').addEventListener('click', e => {
  const a = e.target.dataset.act;
  if (a === 'paySave') paySave();
  else if (a === 'rateSave') {
    const stretch_rate = numOrNull($('rStretch').value), new_pct = numOrNull($('rNew').value), renewal_pct = numOrNull($('rRenew').value);
    if (stretch_rate === null || new_pct === null || renewal_pct === null) { $('pErr').textContent = 'Fill in all three.'; return; }
    db.from('payroll_settings').update({ stretch_rate, new_pct: new_pct / 100, renewal_pct: renewal_pct / 100, updated_by: ME.id, updated_at: new Date().toISOString() }).eq('id', true)
      .then(({ error }) => { if (error) { $('pErr').textContent = error.message; return; } PAY.settings = { ...PAY.settings, stretch_rate, new_pct: new_pct / 100, renewal_pct: renewal_pct / 100 }; $('dlg').close(); });
  }
});
