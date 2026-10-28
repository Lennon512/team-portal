// ---------- Leadership (HR) ----------
const CHG = { hire: 'Hire', annual_raise: 'Annual raise', performance_raise: 'Performance raise', promotion: 'Promotion', adjustment: 'Adjustment', other: 'Other' };
const DKIND = { coaching: 'Coaching', verbal_warning: 'Verbal warning', written_warning: 'Written warning', final_warning: 'Final warning', suspension: 'Suspension', other: 'Other' };
const HRSTAT = { active: 'Active', on_leave: 'On leave', terminated: 'Former employee' };
const EMPT = { '': 'Not set', full_time: 'Full time', part_time: 'Part time', contractor: 'Contractor' };
const HRFILT = { active: 'Active staff', overdue: 'Reviews overdue', soon: 'Reviews due in 60 days', discipline: 'Open discipline', nopay: 'No pay on file', former: 'Former employees', all: 'Everyone' };
const hr = { people: [], prof: {}, pay: [], rev: [], dis: [], studio: '', find: '', filter: 'active', uid: null, pend: null };
const hrAllowed = () => canPage('leadership');
const hrFmt = d => d ? new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
const hrOpts = (o, sel) => Object.entries(o).map(([k, v]) => `<option value="${k}" ${k === (sel || '') ? 'selected' : ''}>${esc(v)}</option>`).join('');
const hrRate = r => r ? m$(+r.rate) + (r.pay_type === 'salary' ? ' / yr' : ' / hr') : '-';
const hrPct = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const hrPlusYear = d => { const x = new Date(d + 'T00:00'); x.setFullYear(x.getFullYear() + 1); return ymd(x); };
const csvCell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
function hrTenure(d) {
  if (!d) return '-';
  const n = new Date(); let m = (n.getFullYear() - +d.slice(0, 4)) * 12 + (n.getMonth() - (+d.slice(5, 7) - 1)); if (n.getDate() < +d.slice(8, 10)) m--;
  if (m < 0) return '-'; const y = Math.floor(m / 12), r = m % 12;
  return y ? y + ' yr' + (y === 1 ? '' : 's') + (r ? ' ' + r + ' mo' : '') : r + ' mo';
}

async function loadHr() {
  if (!hrAllowed()) { $('hrSum').innerHTML = ''; $('hrTools').hidden = true; $('hrBody').innerHTML = '<p class="lead">This page is only for people with leadership access. Ask the owner.</p>'; return; }
  $('hrTools').hidden = false;
  const [t, p, pay, rev, dis] = await Promise.all([db.from('team_directory').select('*').order('full_name'), db.from('hr_profiles').select('*'), db.from('pay_history').select('*').order('effective_date'),
    db.from('hr_reviews').select('*').order('review_date'), db.from('discipline_records').select('*').order('incident_date')]);
  const bad = [t, p, pay, rev, dis].find(x => x.error);
  if (bad) { $('hrBody').innerHTML = '<p class="err">Could not load leadership data. ' + esc(bad.error.message) + '</p>'; return; }
  hr.people = t.data || []; hr.prof = {}; (p.data || []).forEach(x => hr.prof[x.user_id] = x);
  hr.pay = pay.data || []; hr.rev = rev.data || []; hr.dis = dis.data || [];
  $('hrStudio').innerHTML = '<option value="">All studios</option>' + locs.map(l => `<option value="${l.id}" ${l.id === hr.studio ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  $('hrFilter').innerHTML = hrOpts(HRFILT, hr.filter);
  drawHr();
}

function hrSum(u) {
  const td = todayStr(), pays = hr.pay.filter(x => x.user_id === u.id).sort((a, b) => a.effective_date < b.effective_date ? -1 : 1), inEff = pays.filter(x => x.effective_date <= td);
  const cur = inEff[inEff.length - 1] || null, chg = inEff.filter(x => x.change_type !== 'hire'), last = chg[chg.length - 1] || null;
  let pct = null; if (last) { const prev = inEff[inEff.indexOf(last) - 1]; if (prev && prev.pay_type === last.pay_type && +prev.rate) pct = (last.rate - prev.rate) / prev.rate; }
  const p = hr.prof[u.id] || {}, due = p.next_review_due || null;
  return { u, cur, last, pct, due, dueDays: due ? dayDiff(td, due) : null, open: hr.dis.filter(x => x.user_id === u.id && !x.resolved).length, status: p.status || 'active', et: p.employment_type || '' };
}

function hrRows() {
  const q = hr.find.trim().toLowerCase(), all = hr.people.map(hrSum);
  const F = { active: x => x.status !== 'terminated', overdue: x => x.status !== 'terminated' && x.dueDays !== null && x.dueDays < 0, soon: x => x.status !== 'terminated' && x.dueDays !== null && x.dueDays >= 0 && x.dueDays <= 60,
    discipline: x => x.open > 0, nopay: x => !x.cur && x.status !== 'terminated', former: x => x.status === 'terminated', all: () => true };
  return { all, rows: all.filter(x => (!hr.studio || x.u.location_id === hr.studio) && (!q || (x.u.full_name || '').toLowerCase().includes(q) || (x.u.job_title || '').toLowerCase().includes(q)) && (F[hr.filter] || F.active)(x))
    .sort((a, b) => { const A = a.due || '9999', B = b.due || '9999'; return A < B ? -1 : A > B ? 1 : String(a.u.full_name).localeCompare(String(b.u.full_name)); }) };
}

function drawHr() {
  const { all, rows } = hrRows(), act = all.filter(x => x.status !== 'terminated'), hourly = act.filter(x => x.cur && x.cur.pay_type === 'hourly');
  const avg = hourly.length ? hourly.reduce((n, x) => n + +x.cur.rate, 0) / hourly.length : null;
  const overdue = act.filter(x => x.dueDays !== null && x.dueDays < 0).length, soon = act.filter(x => x.dueDays !== null && x.dueDays >= 0 && x.dueDays <= 60).length, open = act.reduce((n, x) => n + x.open, 0);
  $('hrSum').innerHTML = tile(act.filter(x => x.cur).length + ' of ' + act.length, 'Active staff with pay on file') + tile(avg === null ? '-' : m$(avg), 'Average hourly rate', hourly.length + ' hourly staff') + tile(overdue, 'Reviews overdue') + tile(soon, 'Reviews due in 60 days') + tile(open, 'Open discipline items');
  $('hrBody').innerHTML = rows.length ? `<div class="table-wrap"><table class="mt"><thead><tr><th>Name</th><th>Studio</th><th>Title</th><th>Pay</th><th>Last change</th><th>Next review due</th><th>Open discipline</th><th>Here</th></tr></thead><tbody>` + rows.map(x => {
    const cls = x.dueDays === null ? '' : x.dueDays < 0 ? 'bad' : x.dueDays <= 60 ? 'soon' : '', dueTxt = x.due ? hrFmt(x.due) + `<br><span style="font-size:.8rem">${x.dueDays < 0 ? 'overdue ' + (-x.dueDays) + ' days' : x.dueDays === 0 ? 'due today' : 'in ' + x.dueDays + ' days'}</span>` : '-';
    return `<tr data-hr="${x.u.id}"><td><b>${esc(x.u.full_name)}</b>${x.status !== 'active' ? `<span class="pill ice">${HRSTAT[x.status]}</span>` : ''}</td><td>${esc(studio(x.u.location_id))}</td><td>${esc(x.u.job_title || '')}</td><td>${hrRate(x.cur)}</td>
      <td>${x.last ? hrFmt(x.last.effective_date) + `<br><span style="color:var(--muted);font-size:.8rem">${esc(CHG[x.last.change_type] || '')}${x.pct === null ? '' : ' ' + hrPct(x.pct)}</span>` : '-'}</td><td class="${cls}">${dueTxt}</td><td class="${x.open ? 'bad' : ''}">${x.open || ''}</td><td>${hrTenure(x.u.start_date)}</td></tr>`;
  }).join('') + '</tbody></table></div>' : '<p class="lead">No one matches. People need a name on their team card before they show up here.</p>';
}

function hrPerson(id) {
  const u = hr.people.find(x => x.id === id); if (!u) return;
  hr.uid = id;
  const s = hrSum(u), p = hr.prof[id] || {}, td = todayStr(), by = k => hr[k].filter(x => x.user_id === id);
  const pays = by('pay').sort((a, b) => a.effective_date < b.effective_date ? 1 : -1), revs = by('rev').sort((a, b) => a.review_date < b.review_date ? 1 : -1), diss = by('dis').sort((a, b) => a.incident_date < b.incident_date ? 1 : -1);
  const payRows = pays.map((r, i) => { const pv = pays[i + 1], pc = pv && pv.pay_type === r.pay_type && +pv.rate ? (r.rate - pv.rate) / pv.rate : null;
    return `<tr style="cursor:default"><td>${hrFmt(r.effective_date)}${r.effective_date > td ? ' <span class="pill ice" style="margin:0">scheduled</span>' : ''}</td><td>${hrRate(r)}</td><td>${esc(CHG[r.change_type] || '')}</td><td>${pc === null ? '' : hrPct(pc)}</td><td>${esc(r.note || '')}</td><td><button class="quiet sm" data-act="hrDelPay" data-id="${r.id}">Remove</button></td></tr>`; }).join('');
  const nx = hrPlusYear(td);
  $('dlgBody').innerHTML = `<h2>${esc(u.full_name)}</h2><p class="lead" style="margin:.25rem 0 .5rem">${esc([u.job_title, studio(u.location_id), 'here ' + hrTenure(u.start_date), u.start_date ? 'since ' + hrFmt(u.start_date) : ''].filter(Boolean).join(' \u2022 '))}</p>
    <div class="err" id="hrErr" role="alert"></div>
    <div class="hrsec" style="border:0;margin-top:.5rem;padding-top:0"><h3>Pay</h3><p style="margin:0 0 .5rem">Current: <b>${hrRate(s.cur)}</b>${s.last ? ` \u2022 last change ${hrFmt(s.last.effective_date)} (${esc(CHG[s.last.change_type] || 'change')}${s.pct === null ? '' : ', ' + hrPct(s.pct)})` : ''}</p>
      <div class="table-wrap"><table class="mt"><thead><tr><th>Effective</th><th>Rate</th><th>Change</th><th>%</th><th>Note</th><th></th></tr></thead><tbody>${payRows || '<tr style="cursor:default"><td colspan="6" class="lead">No pay history yet.</td></tr>'}</tbody></table></div>
      <div class="grid2" style="margin-top:.75rem"><label>Effective date<input id="hpDate" type="date" value="${td}"></label><label>Rate ($)<input id="hpRate" type="number" step="any" min="0"></label>
        <label>Pay type<select id="hpType"><option value="hourly">Hourly</option><option value="salary">Salary (per year)</option></select></label><label>What changed<select id="hpChg">${hrOpts(CHG, 'annual_raise')}</select></label>
        <label>Next review due<input id="hpNext" type="date" value="${nx}"></label><label>Note (optional)<input id="hpNote" maxlength="200"></label></div>
      <div class="acts"><button data-act="hrPay">Save pay change</button></div></div>
    <div class="hrsec"><h3>Reviews</h3>${revs.map(r => `<div class="item"><b>${hrFmt(r.review_date)}</b>${r.rating ? ` \u2022 rated ${r.rating} of 5` : ''}${r.summary ? `<div style="white-space:pre-wrap;margin-top:.25rem">${esc(r.summary)}</div>` : ''}<div class="acts"><button class="quiet sm" data-act="hrDelRev" data-id="${r.id}">Remove</button></div></div>`).join('') || '<p class="lead" style="margin:0 0 .5rem">No reviews logged yet.</p>'}
      <div class="grid2"><label>Review date<input id="hvDate" type="date" value="${td}"></label><label>Rating<select id="hvRate"><option value="">No rating</option>${[1, 2, 3, 4, 5].map(n => `<option>${n}</option>`).join('')}</select></label><label>Next review due<input id="hvNext" type="date" value="${nx}"></label></div>
      <label>Summary<textarea id="hvSum" rows="3" maxlength="1500" placeholder="Strengths, areas to grow, goals"></textarea></label><div class="acts"><button data-act="hrRev">Save review</button></div></div>
    <div class="hrsec"><h3>Discipline</h3>${diss.map(r => `<div class="item"><b>${hrFmt(r.incident_date)}</b> <span class="pill ${r.resolved ? 'ice' : 'warn'}" style="margin:0 0 0 .3rem">${esc(DKIND[r.kind] || '')}</span>${r.acknowledged ? ' <span class="pill" style="margin:0">Employee acknowledged</span>' : ''}${r.resolved ? ' <span class="pill ice" style="margin:0">Resolved</span>' : ''}
        <div style="white-space:pre-wrap;margin-top:.25rem">${esc(r.description)}</div>${r.action_taken ? `<div style="color:var(--muted);margin-top:.2rem">Action: ${esc(r.action_taken)}</div>` : ''}${r.follow_up_date ? `<div style="color:var(--muted)">Follow up ${hrFmt(r.follow_up_date)}</div>` : ''}
        <div class="acts"><button class="quiet sm" data-act="hrResolve" data-id="${r.id}" data-res="${r.resolved ? 0 : 1}">${r.resolved ? 'Reopen' : 'Mark resolved'}</button><button class="quiet sm" data-act="hrDelDis" data-id="${r.id}">Remove</button></div></div>`).join('') || '<p class="lead" style="margin:0 0 .5rem">Nothing on file.</p>'}
      <div class="grid2"><label>Date<input id="hdDate" type="date" value="${td}"></label><label>Type<select id="hdKind">${hrOpts(DKIND, 'verbal_warning')}</select></label><label>Follow-up date (optional)<input id="hdFollow" type="date"></label></div>
      <label>What happened (facts only)<textarea id="hdDesc" rows="3" maxlength="2000"></textarea></label><label>Action taken (optional)<input id="hdAct" maxlength="300"></label>
      <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" id="hdAck"> Employee has acknowledged this</label><div class="acts"><button data-act="hrDis">Save discipline record</button></div></div>
    <div class="hrsec"><h3>Employment</h3><div class="grid2"><label>Employment type<select id="hfType">${hrOpts(EMPT, p.employment_type)}</select></label><label>Status<select id="hfStat">${hrOpts(HRSTAT, p.status || 'active')}</select></label><label>Next review due<input id="hfNext" type="date" value="${p.next_review_due || ''}"></label></div>
      <label>Private notes<textarea id="hfNotes" rows="3" maxlength="2000">${esc(p.notes)}</textarea></label><div class="acts"><button data-act="hrProf">Save employment details</button><button class="quiet" data-act="close">Close</button></div></div>`;
  $('dlg').classList.add('wide');
  if (!$('dlg').open) $('dlg').showModal();
  $('hpRate').focus({ preventScroll: true });   // start in the pay box, not on a Remove button
}

$('dlgBody').addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'hpNext' || t.id === 'hvNext') t.dataset.touched = '1';
  if (t.id === 'hpDate' && t.value && !$('hpNext').dataset.touched) $('hpNext').value = hrPlusYear(t.value);
  if (t.id === 'hvDate' && t.value && !$('hvNext').dataset.touched) $('hvNext').value = hrPlusYear(t.value);
});

$('dlgBody').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'), a = b && b.dataset.act;
  if (!a || !a.startsWith('hr')) return;
  if (a === 'hrFileSave') return hrUpSave();
  const uid = hr.uid, now = new Date().toISOString(), fail = m => { const el = $('hrErr'); if (el) { el.textContent = m; el.scrollIntoView({ block: 'nearest' }); } };
  const setNext = async d => d ? (await db.from('hr_profiles').upsert({ user_id: uid, next_review_due: d, updated_by: ME.id, updated_at: now }, { onConflict: 'user_id' })).error : null;
  let r;
  if (a === 'hrPay') {
    const date = $('hpDate').value, rate = numOrNull($('hpRate').value);
    if (!date) return fail('Pick the effective date.'); if (rate === null || rate < 0) return fail('Enter the pay rate.');
    r = await db.from('pay_history').upsert({ user_id: uid, effective_date: date, pay_type: $('hpType').value, rate, change_type: $('hpChg').value, note: $('hpNote').value.trim() || null, created_by: ME.id }, { onConflict: 'user_id,effective_date' });
    if (r.error) return fail('Could not save. ' + r.error.message);
    const ne = await setNext($('hpNext').value); if (ne) return fail('Pay saved, but the review date did not. ' + ne.message);
  } else if (a === 'hrRev') {
    const date = $('hvDate').value; if (!date) return fail('Pick the review date.');
    r = await db.from('hr_reviews').insert({ user_id: uid, review_date: date, rating: numOrNull($('hvRate').value), summary: $('hvSum').value.trim() || null, created_by: ME.id });
    if (r.error) return fail('Could not save. ' + r.error.message);
    const ne = await setNext($('hvNext').value); if (ne) return fail('Review saved, but the next date did not. ' + ne.message);
  } else if (a === 'hrDis') {
    const date = $('hdDate').value, desc = $('hdDesc').value.trim();
    if (!date) return fail('Pick the date.'); if (!desc) return fail('Describe what happened.');
    r = await db.from('discipline_records').insert({ user_id: uid, incident_date: date, kind: $('hdKind').value, description: desc, action_taken: $('hdAct').value.trim() || null, follow_up_date: $('hdFollow').value || null, acknowledged: $('hdAck').checked, created_by: ME.id });
    if (r.error) return fail('Could not save. ' + r.error.message);
  } else if (a === 'hrProf') {
    r = await db.from('hr_profiles').upsert({ user_id: uid, employment_type: $('hfType').value || null, status: $('hfStat').value, next_review_due: $('hfNext').value || null, notes: $('hfNotes').value.trim() || null, updated_by: ME.id, updated_at: now }, { onConflict: 'user_id' });
    if (r.error) return fail('Could not save. ' + r.error.message);
  } else if (a === 'hrResolve') {
    r = await db.from('discipline_records').update({ resolved: b.dataset.res === '1' }).eq('id', b.dataset.id); if (r.error) return fail(r.error.message);
  } else if (a === 'hrDelPay' || a === 'hrDelRev' || a === 'hrDelDis') {
    if (!confirm('Remove this entry? This cannot be undone.')) return;
    r = await db.from({ hrDelPay: 'pay_history', hrDelRev: 'hr_reviews', hrDelDis: 'discipline_records' }[a]).delete().eq('id', b.dataset.id); if (r.error) return fail(r.error.message);
  } else return;
  await loadHr(); hrPerson(uid);
});

// ----- upload a pay report -----
const PAYH = { 'name': 'name', 'employee': 'name', 'employee name': 'name', 'full name': 'name', 'email': 'email', 'work email': 'email', 'effective date': 'date', 'effective': 'date', 'date': 'date', 'raise date': 'date', 'start date': 'date',
  'pay rate': 'rate', 'rate': 'rate', 'hourly rate': 'rate', 'new rate': 'rate', 'wage': 'rate', 'salary': 'rate', 'pay': 'rate', 'pay type': 'type', 'type': 'type', 'change type': 'change', 'change': 'change', 'reason': 'change',
  'note': 'note', 'notes': 'note', 'comment': 'note', 'next review': 'next', 'next review due': 'next', 'next raise': 'next' };
function hrDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return ymd(v);
  if (typeof v === 'number') { if (v < 20000 || v > 80000) return null; const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * DAY); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
  const t = String(v).trim(); let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); return m ? (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad2(m[1]) + '-' + pad2(m[2]) : null;
}
function hrParse(g) {
  const kind = x => PAYH[NORM(x)], hi = g.findIndex((r, i) => i < 10 && r.some(x => kind(x) === 'rate') && r.some(x => kind(x) === 'date') && r.some(x => kind(x) === 'name' || kind(x) === 'email'));
  if (hi < 0) return null;
  const c = {}; g[hi].forEach((h, i) => { const k = kind(h); if (k && !(k in c)) c[k] = i; });
  const byEmail = {}, byName = {}; hr.people.forEach(u => { if (u.email) byEmail[u.email.toLowerCase()] = u; if (u.full_name) byName[NORM(u.full_name)] = u; });
  const rows = new Map(), skipped = [], cell = (r, k) => c[k] === undefined ? '' : String(r[c[k]] ?? '').trim();
  g.slice(hi + 1).forEach(r => {
    if (r.every(x => x === null || x === '')) return;
    const em = cell(r, 'email').toLowerCase(), nm = cell(r, 'name'), u = (em && byEmail[em]) || (nm && byName[NORM(nm)]);
    if (!u) { skipped.push((nm || em || '(no name)') + ': not found on the team'); return; }
    const rate = numv(r[c.rate]), date = hrDate(r[c.date]);
    if (rate === null || rate < 0) { skipped.push(u.full_name + ': no pay rate'); return; }
    if (!date) { skipped.push(u.full_name + ': missing or unreadable date'); return; }
    const tv = cell(r, 'type').toLowerCase(), ct = cell(r, 'change').toLowerCase();
    rows.set(u.id + '|' + date, { user_id: u.id, name: u.full_name, effective_date: date, rate, note: cell(r, 'note') || null, next: c.next === undefined ? null : hrDate(r[c.next]),
      pay_type: /salar|annual|year|yr/.test(tv) ? 'salary' : tv ? 'hourly' : (rate >= 1000 ? 'salary' : 'hourly'),
      change_type: /hire|start|onboard/.test(ct) ? 'hire' : /annual|cola|yearly/.test(ct) ? 'annual_raise' : /perform|merit/.test(ct) ? 'performance_raise' : /promo/.test(ct) ? 'promotion' : /adjust|market|correct/.test(ct) ? 'adjustment' : 'other' });
  });
  return { rows: [...rows.values()], skipped };
}

function hrUpForm() {
  hr.pend = null;
  pfUpForm('Upload pay report', 'A spreadsheet or CSV with one row per pay change. Needed columns: Name (or Email), Effective date, and Pay rate. Optional: Pay type, Change type, Next review due, Note. Rows for the same person and date update the existing entry, so re-uploading is safe. <a href="#" id="hrTpl">Download a blank template</a>', 'hrFile');
  $('hrTpl').onclick = ev => { ev.preventDefault(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([['Name', 'Email', 'Effective date', 'Pay rate', 'Pay type', 'Change type', 'Next review due', 'Note'].join(',') + '\n'], { type: 'text/csv' })); a.download = 'pay-report-template.csv'; a.click(); };
  $('hrFile').onchange = async () => {
    try {
      const f = $('hrFile').files[0]; upMsg('Reading the file...');
      const wb = await readBook(f), r = hrParse(grid(wb.Sheets[wb.SheetNames[0]]));
      if (!r) return upMsg('', 'I could not find the columns. The first rows need a Name (or Email), an Effective date, and a Pay rate column.');
      const st = { n: 0, c: 0, u: 0 }, todo = [];
      r.rows.forEach(x => { const ex = hr.pay.find(y => y.user_id === x.user_id && y.effective_date === x.effective_date); const k = !ex ? 'n' : (+ex.rate !== x.rate || ex.pay_type !== x.pay_type || ex.change_type !== x.change_type || (ex.note || null) !== x.note) ? 'c' : 'u'; st[k]++; if (k !== 'u') todo.push(x); });
      hr.pend = { todo, all: r.rows };
      const hasNext = r.rows.some(x => x.next);
      upMsg(`<p><b>${r.rows.length}</b> pay entries for <b>${new Set(r.rows.map(x => x.user_id)).size}</b> people: <b>${st.n}</b> new, <b>${st.c}</b> changed, ${st.u} unchanged.</p>` +
        (r.skipped.length ? `<p class="lead">Skipped ${r.skipped.length}: ${esc(r.skipped.slice(0, 6).join('; '))}${r.skipped.length > 6 ? '...' : ''}</p>` : ''), todo.length || hasNext ? '' : 'Nothing new to save.');
    } catch (e) { upMsg('', xlsbHint($('hrFile').files[0], e)); }
  };
}

async function hrUpSave() {
  $('upGo').disabled = true; $('upGo').textContent = 'Saving...';
  const now = new Date().toISOString(), chunk = async (table, rows, conflict) => { for (let i = 0; i < rows.length; i += 400) { const { error } = await db.from(table).upsert(rows.slice(i, i + 400), { onConflict: conflict }); if (error) return error; } };
  const pay = hr.pend.todo.map(x => ({ user_id: x.user_id, effective_date: x.effective_date, pay_type: x.pay_type, rate: x.rate, change_type: x.change_type, note: x.note, created_by: ME.id }));
  const nx = {}; hr.pend.all.forEach(x => { if (x.next && (!nx[x.user_id] || x.effective_date > nx[x.user_id].d)) nx[x.user_id] = { d: x.effective_date, v: x.next }; });
  const prof = Object.entries(nx).map(([uid, o]) => ({ user_id: uid, next_review_due: o.v, updated_by: ME.id, updated_at: now }));
  const err = (await chunk('pay_history', pay, 'user_id,effective_date')) || (await chunk('hr_profiles', prof, 'user_id'));
  if (err) { $('pErr').textContent = 'Could not save. ' + err.message; $('upGo').disabled = false; $('upGo').textContent = 'Save'; return; }
  $('dlg').close(); loadHr();
}

function hrDownload() {
  const { all } = hrRows(), head = ['Name', 'Studio', 'Title', 'Status', 'Employment type', 'Current pay', 'Pay type', 'Last change date', 'Last change type', 'Last change %', 'Next review due', 'Open discipline items', 'Start date'];
  const lines = [head.map(csvCell).join(',')].concat(all.map(x => [x.u.full_name, studio(x.u.location_id), x.u.job_title, HRSTAT[x.status], EMPT[x.et] || '', x.cur ? x.cur.rate : '', x.cur ? x.cur.pay_type : '', x.last ? x.last.effective_date : '', x.last ? (CHG[x.last.change_type] || '') : '',
    x.pct === null ? '' : (x.pct * 100).toFixed(1) + '%', x.due || '', x.open, x.u.start_date || ''].map(csvCell).join(',')));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = 'leadership-report-' + todayStr() + '.csv'; a.click();
}

$('hrStudio').onchange = e => { hr.studio = e.target.value; drawHr(); };
$('hrFind').oninput = e => { hr.find = e.target.value; drawHr(); };
$('hrFilter').onchange = e => { hr.filter = e.target.value; drawHr(); };
$('hrUp').onclick = hrUpForm;
$('hrCsv').onclick = hrDownload;
$('hrBody').onclick = e => { const tr = e.target.closest('tr[data-hr]'); if (tr) hrPerson(tr.dataset.hr); };
$('dlg').addEventListener('close', () => $('dlg').classList.remove('wide'));
