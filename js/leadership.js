// ---------- Leadership: pay, raises, reviews and discipline ----------
// Everyone on payroll is a row in `staff`, whether or not they have a portal login.
// Each pay change is a row in `staff_pay` (base hourly rate + pay per stretch); the newest
// one on or before today is their current pay, and the one before it gives the "old" rate.
const CHG = { hire: 'Starting pay', annual_raise: 'Annual raise', performance_raise: 'Performance raise', promotion: 'Promotion', adjustment: 'Adjustment', other: 'Other' };
const DKIND = { coaching: 'Coaching', verbal_warning: 'Verbal warning', written_warning: 'Written warning', final_warning: 'Final warning', suspension: 'Suspension', other: 'Other' };
const HRSTAT = { active: 'Active', on_leave: 'On leave', terminated: 'Former employee' };
const EMPT = { '': 'Not set', full_time: 'Full time', part_time: 'Part time', contractor: 'Contractor' };
const HRSHOW = { active: 'Active staff', due: 'Reviews due in 60 days', overdue: 'Reviews overdue', nopay: 'No pay on file', former: 'Former employees', all: 'Everyone' };
const hr = { staff: [], pay: [], rev: [], dis: [], accts: [], studio: '', find: '', show: 'active', view: 'pay', sid: null, pend: null, missing: false };
const hrAllowed = () => canPage('leadership');
const hrFmt = d => d ? new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
const hrOpts = (o, sel) => Object.entries(o).map(([k, v]) => `<option value="${k}" ${k === (sel || '') ? 'selected' : ''}>${esc(v)}</option>`).join('');
const hr$ = x => x === null || x === undefined || x === '' || isNaN(x) ? '-' : '$' + (+x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hrBase = r => !r || r.base_rate === null || r.base_rate === undefined ? '-' : r.pay_type === 'salary' ? '$' + Math.round(r.base_rate).toLocaleString() + ' / yr' : hr$(r.base_rate) + ' / hr';
const hrPlusYear = d => { const x = new Date(d + 'T00:00'); x.setFullYear(x.getFullYear() + 1); return ymd(x); };
const csvCell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const hrDelta = (a, b) => a === null || a === undefined || b === null || b === undefined || +a === +b ? '' : `<span class="hrd ${+a > +b ? 'up' : 'dn'}">${+a > +b ? '+' : '−'}${hr$(Math.abs(a - b))}</span>`;
function hrTenure(d) {
  if (!d) return '';
  const n = new Date(); let m = (n.getFullYear() - +d.slice(0, 4)) * 12 + (n.getMonth() - (+d.slice(5, 7) - 1)); if (n.getDate() < +d.slice(8, 10)) m--;
  if (m < 0) return 'starts ' + hrFmt(d); const y = Math.floor(m / 12), r = m % 12;
  return y ? y + ' yr' + (y === 1 ? '' : 's') + (r ? ' ' + r + ' mo' : '') : r ? r + ' mo' : 'new';
}

async function loadHr() {
  if (!hrAllowed()) { $('hrSum').innerHTML = ''; $('hrTools').hidden = true; $('hrTabs').hidden = true; $('hrBody').innerHTML = '<p class="lead">This page is only for people with leadership access. Ask the owner.</p>'; return; }
  const [s, p, r, d, a] = await Promise.all([db.from('staff').select('*').order('full_name'), db.from('staff_pay').select('*').order('effective_date'), db.from('staff_reviews').select('*').order('review_date'),
    db.from('staff_discipline').select('*').order('incident_date'), db.from('team_directory').select('id,full_name')]);
  hr.missing = !!(s.error && /relation|does not exist|schema cache/i.test(s.error.message));
  if (hr.missing) { $('hrSum').innerHTML = ''; $('hrTools').hidden = true; $('hrTabs').hidden = true; $('hrBody').innerHTML = `<div class="pcard"><h3>One-time setup needed</h3><p>${ME.role === 'owner' ? 'Open Supabase → SQL Editor → New query, paste the contents of <a href="https://github.com/Lennon512/team-portal/blob/main/sql/staff_pay.sql" target="_blank" rel="noopener">sql/staff_pay.sql</a>, and click Run. Then refresh this page. Anything already on this page is copied over.' : 'Ask the owner to run the setup, then refresh this page.'}</p></div>`; return; }
  const bad = [s, p, r, d].find(x => x.error);
  if (bad) { $('hrBody').innerHTML = '<p class="err">Could not load leadership data. ' + esc(bad.error.message) + '</p>'; return; }
  hr.staff = s.data || []; hr.pay = p.data || []; hr.rev = r.data || []; hr.dis = d.data || []; hr.accts = a.data || [];
  $('hrTools').hidden = false; $('hrTabs').hidden = false;
  $('hrStudio').innerHTML = '<option value="">All studios</option>' + locs.map(l => `<option value="${l.id}" ${l.id === hr.studio ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  $('hrFilter').innerHTML = hrOpts(HRSHOW, hr.show);
  drawHr();
}

// Pay entries for one person, oldest first, and their current/previous pay
const hrPays = id => hr.pay.filter(x => x.staff_id === id).sort((a, b) => a.effective_date < b.effective_date ? -1 : 1);
function hrSum(s) {
  const td = todayStr(), pays = hrPays(s.id), inEff = pays.filter(x => x.effective_date <= td);
  const cur = inEff[inEff.length - 1] || null, prev = inEff[inEff.length - 2] || null, next = pays.find(x => x.effective_date > td) || null;
  const raise = [...inEff].reverse().find((x, i, arr) => x.change_type !== 'hire' && arr[i + 1]) || null;
  const due = s.next_review_due || null;
  return { s, cur, prev, next, raise, raisePrev: raise ? inEff[inEff.indexOf(raise) - 1] : null, due, dueDays: due ? dayDiff(td, due) : null, open: hr.dis.filter(x => x.staff_id === s.id && !x.resolved).length, status: s.status || 'active' };
}
function hrRows() {
  const q = hr.find.trim().toLowerCase(), all = hr.staff.map(hrSum);
  const F = { active: x => x.status !== 'terminated', due: x => x.status !== 'terminated' && x.dueDays !== null && x.dueDays >= 0 && x.dueDays <= 60, overdue: x => x.status !== 'terminated' && x.dueDays !== null && x.dueDays < 0,
    nopay: x => !x.cur && x.status !== 'terminated', former: x => x.status === 'terminated', all: () => true };
  const sName = id => studio(id) || 'zzz';
  return { all, rows: all.filter(x => (!hr.studio || x.s.studio_id === hr.studio) && (!q || (x.s.full_name || '').toLowerCase().includes(q) || (x.s.role || '').toLowerCase().includes(q)) && (F[hr.show] || F.active)(x))
    .sort((a, b) => sName(a.s.studio_id).localeCompare(sName(b.s.studio_id)) || String(a.s.full_name).localeCompare(String(b.s.full_name))) };
}

function drawHr() {
  if (hr.missing) return;
  const { all, rows } = hrRows(), act = all.filter(x => x.status !== 'terminated' && (!hr.studio || x.s.studio_id === hr.studio)), hourly = act.filter(x => x.cur && x.cur.pay_type !== 'salary' && x.cur.base_rate);
  const avg = hourly.length ? hourly.reduce((n, x) => n + +x.cur.base_rate, 0) / hourly.length : null;
  const yr = todayStr().slice(0, 4), ids = new Set(act.map(x => x.s.id)), raises = hr.pay.filter(x => ids.has(x.staff_id) && x.change_type !== 'hire' && x.effective_date.slice(0, 4) === yr && x.effective_date <= todayStr()).length;
  const overdue = act.filter(x => x.dueDays !== null && x.dueDays < 0).length, soon = act.filter(x => x.dueDays !== null && x.dueDays >= 0 && x.dueDays <= 60).length;
  $('hrSum').innerHTML = tile(act.length, 'Active staff', act.filter(x => !x.cur).length ? act.filter(x => !x.cur).length + ' with no pay on file' : 'everyone has pay on file') + tile(avg === null ? '-' : hr$(avg), 'Average base rate', hourly.length + ' hourly staff') +
    tile(raises, 'Raises in ' + yr) + tile(soon, 'Reviews due in 60 days', overdue ? `<span class="bad">${overdue} overdue</span>` : 'none overdue');
  document.querySelectorAll('#hrTabs button').forEach(b => b.classList.toggle('on', b.dataset.v === hr.view));
  if (!hr.staff.length) { $('hrBody').innerHTML = '<div class="pcard"><h3>No one here yet</h3><p>Click <b>Import pay sheet</b> to bring in your Employee Pay Tracker (Pay Tracker and Raise History tabs), or <b>Add employee</b> to enter people one at a time.</p></div>'; return; }
  if (hr.view === 'history') return drawHrHistory(rows);
  let last = null;
  const body = rows.map(x => {
    const grp = !hr.studio && x.s.studio_id !== last ? `<tr class="hrgrp"><td colspan="8">${esc(studio(x.s.studio_id) || 'No studio')} <small>${rows.filter(y => y.s.studio_id === x.s.studio_id).length}</small></td></tr>` : ''; last = x.s.studio_id;
    const cls = x.dueDays === null ? '' : x.dueDays < 0 ? 'hr-over' : x.dueDays <= 60 ? 'hr-soon' : '';
    const dueTxt = x.due ? `${hrFmt(x.due)}<small>${x.dueDays < 0 ? 'overdue ' + (-x.dueDays) + ' days' : x.dueDays === 0 ? 'due today' : 'in ' + x.dueDays + ' days'}</small>` : '<span class="muted">Not set</span>';
    const rz = x.raise ? `${hrFmt(x.raise.effective_date)}<small>${hrDelta(x.raise.base_rate, x.raisePrev && x.raisePrev.base_rate) || esc(CHG[x.raise.change_type] || '')}${x.raise.per_stretch !== null && x.raisePrev && x.raisePrev.per_stretch !== null && +x.raise.per_stretch !== +x.raisePrev.per_stretch ? ' • stretch ' + hrDelta(x.raise.per_stretch, x.raisePrev.per_stretch) : ''}</small>` : '<span class="muted">None yet</span>';
    return grp + `<tr data-hr="${x.s.id}"><td><b>${esc(x.s.full_name)}</b>${x.status !== 'active' ? `<span class="pill ice">${HRSTAT[x.status]}</span>` : ''}${x.open ? `<span class="pill warn">${x.open} open discipline</span>` : ''}<small>${esc(x.s.role || '')}</small></td>
      <td>${x.s.hire_date ? hrFmt(x.s.hire_date) + `<small>${hrTenure(x.s.hire_date)}</small>` : '<span class="muted">-</span>'}</td>
      <td class="hrnum"><b>${hrBase(x.cur)}</b>${x.next ? `<small>${hr$(x.next.base_rate)} from ${hrFmt(x.next.effective_date)}</small>` : ''}</td><td class="hrnum">${x.cur && x.cur.per_stretch !== null ? hr$(x.cur.per_stretch) : '-'}</td>
      <td>${rz}</td><td class="${cls}">${dueTxt}</td><td class="hract"><button class="quiet sm" data-hrraise="${x.s.id}">Give raise</button></td></tr>`;
  }).join('');
  $('hrBody').innerHTML = rows.length ? `<div class="table-wrap"><table class="mt hrt"><thead><tr><th>Employee</th><th>Hired</th><th>Base rate</th><th>Per stretch</th><th>Last raise</th><th>Next review</th><th></th></tr></thead><tbody>${body}</tbody></table></div>`
    : '<p class="lead">No one matches.</p>';
}

// Every pay change across the team, newest first
function drawHrHistory(rows) {
  const ids = new Set(rows.map(x => x.s.id)), byId = Object.fromEntries(hr.staff.map(s => [s.id, s]));
  const list = hr.pay.filter(x => ids.has(x.staff_id)).sort((a, b) => a.effective_date < b.effective_date ? 1 : a.effective_date > b.effective_date ? -1 : String(byId[a.staff_id].full_name).localeCompare(byId[b.staff_id].full_name));
  const prevOf = x => { const p = hrPays(x.staff_id); return p[p.indexOf(x) - 1] || null; };
  const td = todayStr();
  $('hrBody').innerHTML = list.length ? `<p class="lead" style="margin:0 0 .6rem">${list.length} pay change${list.length === 1 ? '' : 's'}, newest first. Click one to open that person.</p><div class="table-wrap"><table class="mt hrt"><thead><tr><th>Effective</th><th>Employee</th><th>Base rate</th><th>Per stretch</th><th>Reason</th><th>Note</th></tr></thead><tbody>` + list.map(x => {
    const p = prevOf(x), s = byId[x.staff_id];
    const ch = (n, o) => n === null || n === undefined ? '-' : (o !== null && o !== undefined && +o !== +n ? `<span class="muted">${hr$(o)} →</span> ` : '') + `<b>${hr$(n)}</b>${o !== null && o !== undefined ? ' ' + hrDelta(n, o) : ''}`;
    return `<tr data-hr="${x.staff_id}"><td>${hrFmt(x.effective_date)}${x.effective_date > td ? ' <span class="pill ice">scheduled</span>' : ''}</td><td><b>${esc(s.full_name)}</b><small>${esc(studio(s.studio_id) || '')}</small></td><td class="hrnum">${ch(x.base_rate, p && p.base_rate)}</td><td class="hrnum">${ch(x.per_stretch, p && p.per_stretch)}</td><td>${esc(CHG[x.change_type] || x.change_type || '')}</td><td class="nt">${esc(x.note || '')}</td></tr>`;
  }).join('') + '</tbody></table></div>' : '<p class="lead">No pay changes logged yet.</p>';
}

// ----- one person -----
function hrPerson(id, focus) {
  const isNew = !id, s = isNew ? { status: 'active' } : hr.staff.find(x => x.id === id); if (!s) return;
  hr.sid = id || null;
  const td = todayStr(), sum = isNew ? {} : hrSum(s), cur = sum.cur || {}, by = (k, f) => isNew ? [] : hr[k].filter(x => x.staff_id === id).sort((a, b) => a[f] < b[f] ? 1 : -1);
  const pays = isNew ? [] : hrPays(id).reverse(), revs = by('rev', 'review_date'), diss = by('dis', 'incident_date');
  const linked = new Set(hr.staff.filter(x => x.user_id && x.id !== id).map(x => x.user_id));
  const details = `<div class="grid2"><label>Name<input id="hfName" value="${esc(s.full_name || '')}" maxlength="80" placeholder="First and last name"></label><label>Studio<select id="hfStudio"><option value="">No studio</option>${locs.map(l => `<option value="${l.id}" ${l.id === s.studio_id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      <label>Role<input id="hfRole" value="${esc(s.role || '')}" maxlength="60" list="hrRoles" placeholder="Practitioner"></label><label>Hire date<input id="hfHire" type="date" value="${s.hire_date || ''}"></label>
      <label>Next review due<input id="hfNext" type="date" value="${s.next_review_due || ''}"></label><label>Status<select id="hfStat">${hrOpts(HRSTAT, s.status || 'active')}</select></label>
      <label>Employment type<select id="hfType">${hrOpts(EMPT, s.employment_type)}</select></label><label>Portal login <small class="muted">(optional)</small><select id="hfUser"><option value="">Not linked</option>${hr.accts.filter(a => !linked.has(a.id)).map(a => `<option value="${a.id}" ${a.id === s.user_id ? 'selected' : ''}>${esc(a.full_name || '')}</option>`).join('')}</select></label></div>
      <datalist id="hrRoles">${[...new Set(['Practitioner', 'Senior Practitioner', 'Lead / Practitioner', 'Sales Associate', 'Sales / Lead', 'Manager'].concat(hr.staff.map(x => x.role).filter(Boolean)))].map(r => `<option value="${esc(r)}">`).join('')}</datalist>
      <label>Private notes<textarea id="hfNotes" rows="2" maxlength="2000">${esc(s.notes || '')}</textarea></label>`;
  if (isNew) {
    $('dlgBody').innerHTML = `<h2>Add employee</h2><p class="lead" style="margin:.25rem 0 .8rem">They don’t need a portal login. You can link one later.</p><div class="err" id="hrErr" role="alert"></div>${details}
      <div class="hrsec"><h3>Starting pay</h3><div class="grid2"><label>Base hourly rate ($)<input id="hpBase" type="number" step="0.25" min="0" inputmode="decimal"></label><label>Pay per stretch ($)<input id="hpStretch" type="number" step="0.25" min="0" inputmode="decimal" value="4"></label></div></div>
      <div class="acts"><button data-act="hrAdd">Add employee</button><button class="quiet" data-act="close">Cancel</button></div>`;
    $('dlg').classList.add('wide'); if (!$('dlg').open) $('dlg').showModal(); $('hfName').focus(); return;
  }
  const payRows = pays.map((r, i) => { const pv = pays[i + 1];
    return `<tr style="cursor:default"><td>${hrFmt(r.effective_date)}${r.effective_date > td ? ' <span class="pill ice">scheduled</span>' : ''}</td><td class="hrnum"><b>${hrBase(r)}</b> ${pv ? hrDelta(r.base_rate, pv.base_rate) : ''}</td><td class="hrnum">${r.per_stretch !== null ? hr$(r.per_stretch) : '-'} ${pv ? hrDelta(r.per_stretch, pv.per_stretch) : ''}</td><td>${esc(CHG[r.change_type] || r.change_type || '')}</td><td class="nt">${esc(r.note || '')}</td><td><button class="quiet sm" data-act="hrDelPay" data-id="${r.id}" aria-label="Remove this pay entry">Remove</button></td></tr>`; }).join('');
  $('dlgBody').innerHTML = `<h2>${esc(s.full_name)}</h2><p class="lead" style="margin:.25rem 0 .5rem">${esc([s.role, studio(s.studio_id), s.hire_date ? 'hired ' + hrFmt(s.hire_date) + ' (' + hrTenure(s.hire_date) + ')' : '', s.status !== 'active' ? HRSTAT[s.status] : ''].filter(Boolean).join(' • '))}</p>
    <div class="err" id="hrErr" role="alert"></div>
    <div class="hrpaynow"><div><small>Base rate</small><b>${hrBase(sum.cur)}</b></div><div><small>Per stretch</small><b>${cur.per_stretch !== null && cur.per_stretch !== undefined ? hr$(cur.per_stretch) : '-'}</b></div><div><small>Last raise</small><b>${sum.raise ? hrFmt(sum.raise.effective_date) : 'None yet'}</b></div><div><small>Next review</small><b class="${sum.dueDays !== null && sum.dueDays < 0 ? 'bad' : ''}">${sum.due ? hrFmt(sum.due) : 'Not set'}</b></div></div>
    <div class="hrsec" id="hrRaiseSec" style="border:0;padding-top:0"><h3>Give a raise or change pay</h3>
      <div class="grid2 hrraise"><label>New base rate ($/hr)<input id="hpBase" type="number" step="0.25" min="0" inputmode="decimal" value="${cur.base_rate ?? ''}"></label><label>New pay per stretch ($)<input id="hpStretch" type="number" step="0.25" min="0" inputmode="decimal" value="${cur.per_stretch ?? ''}"></label>
        <label>Starting on<input id="hpDate" type="date" value="${td}"></label><label>Reason<select id="hpChg">${hrOpts(CHG, sum.cur ? 'annual_raise' : 'hire')}</select></label>
        <label>Next review due<input id="hpNext" type="date" value="${hrPlusYear(td)}"></label><label>Note <small class="muted">(optional)</small><input id="hpNote" maxlength="200" placeholder="e.g. Passed level 2"></label></div>
      <p class="hrprev" id="hrPrev"></p><div class="acts"><button data-act="hrPay">Save pay change</button></div>
      <details class="hrhist" ${pays.length ? 'open' : ''}><summary>Pay history (${pays.length})</summary><div class="table-wrap"><table class="mt"><thead><tr><th>Effective</th><th>Base rate</th><th>Per stretch</th><th>Reason</th><th>Note</th><th></th></tr></thead><tbody>${payRows || '<tr style="cursor:default"><td colspan="6" class="lead">No pay history yet.</td></tr>'}</tbody></table></div></details></div>
    <div class="hrsec"><h3>Reviews</h3>${revs.map(r => `<div class="item"><b>${hrFmt(r.review_date)}</b>${r.rating ? ` • rated ${r.rating} of 5` : ''}${r.summary ? `<div style="white-space:pre-wrap;margin-top:.25rem">${esc(r.summary)}</div>` : ''}<div class="acts"><button class="quiet sm" data-act="hrDelRev" data-id="${r.id}">Remove</button></div></div>`).join('') || '<p class="lead" style="margin:0 0 .5rem">No reviews logged yet.</p>'}
      <details><summary>Log a review</summary><div class="grid2"><label>Review date<input id="hvDate" type="date" value="${td}"></label><label>Rating<select id="hvRate"><option value="">No rating</option>${[1, 2, 3, 4, 5].map(n => `<option>${n}</option>`).join('')}</select></label><label>Next review due<input id="hvNext" type="date" value="${hrPlusYear(td)}"></label></div>
      <label>Summary<textarea id="hvSum" rows="3" maxlength="1500" placeholder="Strengths, areas to grow, goals"></textarea></label><div class="acts"><button data-act="hrRev">Save review</button></div></details></div>
    <div class="hrsec"><h3>Discipline</h3>${diss.map(r => `<div class="item"><b>${hrFmt(r.incident_date)}</b> <span class="pill ${r.resolved ? 'ice' : 'warn'}" style="margin:0 0 0 .3rem">${esc(DKIND[r.kind] || '')}</span>${r.acknowledged ? ' <span class="pill" style="margin:0">Employee acknowledged</span>' : ''}${r.resolved ? ' <span class="pill ice" style="margin:0">Resolved</span>' : ''}
        <div style="white-space:pre-wrap;margin-top:.25rem">${esc(r.description)}</div>${r.action_taken ? `<div style="color:var(--muted);margin-top:.2rem">Action: ${esc(r.action_taken)}</div>` : ''}${r.follow_up_date ? `<div style="color:var(--muted)">Follow up ${hrFmt(r.follow_up_date)}</div>` : ''}
        <div class="acts"><button class="quiet sm" data-act="hrResolve" data-id="${r.id}" data-res="${r.resolved ? 0 : 1}">${r.resolved ? 'Reopen' : 'Mark resolved'}</button><button class="quiet sm" data-act="hrDelDis" data-id="${r.id}">Remove</button></div></div>`).join('') || '<p class="lead" style="margin:0 0 .5rem">Nothing on file.</p>'}
      <details><summary>Log discipline</summary><div class="grid2"><label>Date<input id="hdDate" type="date" value="${td}"></label><label>Type<select id="hdKind">${hrOpts(DKIND, 'verbal_warning')}</select></label><label>Follow-up date (optional)<input id="hdFollow" type="date"></label></div>
      <label>What happened (facts only)<textarea id="hdDesc" rows="3" maxlength="2000"></textarea></label><label>Action taken (optional)<input id="hdAct" maxlength="300"></label>
      <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" id="hdAck" style="width:auto"> Employee has acknowledged this</label><div class="acts"><button data-act="hrDis">Save discipline record</button></div></details></div>
    <div class="hrsec"><details><summary><h3 style="display:inline">Details</h3></summary>${details}<div class="acts"><button data-act="hrProf">Save details</button><button class="quiet" data-act="hrDelStaff">Delete employee</button></div></details></div>
    <div class="acts"><button class="quiet" data-act="close">Close</button></div>`;
  $('dlg').classList.add('wide');
  if (!$('dlg').open) $('dlg').showModal();
  hrPreview();
  if (focus === 'raise') { $('hpBase').focus(); $('hpBase').select(); } else $('dlgBody').scrollTop = 0;
}
// Live "+$1.00 (+6.7%)" line under the raise form
function hrPreview() {
  const el = $('hrPrev'), s = hr.staff.find(x => x.id === hr.sid); if (!el || !s) return;
  const cur = hrSum(s).cur, nb = numOrNull($('hpBase').value), ns = numOrNull($('hpStretch').value), parts = [];
  if (cur && nb !== null && cur.base_rate !== null && +cur.base_rate !== nb) parts.push(`Base ${hr$(cur.base_rate)} → <b>${hr$(nb)}</b> ${hrDelta(nb, cur.base_rate)} (${((nb - cur.base_rate) / cur.base_rate * 100).toFixed(1)}%)`);
  if (cur && ns !== null && cur.per_stretch !== null && +cur.per_stretch !== ns) parts.push(`Per stretch ${hr$(cur.per_stretch)} → <b>${hr$(ns)}</b> ${hrDelta(ns, cur.per_stretch)}`);
  el.innerHTML = parts.length ? parts.join('<br>') : cur ? '<span class="muted">Change the base rate or pay per stretch above.</span>' : '';
}

$('dlgBody').addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'hpNext' || t.id === 'hvNext') t.dataset.touched = '1';
  if (t.id === 'hpDate' && t.value && $('hpNext') && !$('hpNext').dataset.touched) $('hpNext').value = hrPlusYear(t.value);
  if (t.id === 'hvDate' && t.value && $('hvNext') && !$('hvNext').dataset.touched) $('hvNext').value = hrPlusYear(t.value);
  if (t.id === 'hpBase' || t.id === 'hpStretch') hrPreview();
});

const hrDetails = () => ({ full_name: $('hfName').value.trim(), studio_id: $('hfStudio').value || null, role: $('hfRole').value.trim() || null, hire_date: $('hfHire').value || null, next_review_due: $('hfNext').value || null,
  status: $('hfStat').value, employment_type: $('hfType').value || null, user_id: $('hfUser').value || null, notes: $('hfNotes').value.trim() || null, updated_at: new Date().toISOString() });

$('dlgBody').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'), a = b && b.dataset.act;
  if (!a || !a.startsWith('hr')) return;
  if (a === 'hrFileSave') return hrUpSave();
  const sid = hr.sid, fail = m => { const el = $('hrErr'); if (el) { el.textContent = m; el.scrollIntoView({ block: 'nearest' }); } };
  let r, keep = sid;
  b.disabled = true; const done = () => { b.disabled = false; };
  if (a === 'hrAdd') {
    const d = hrDetails(); if (!d.full_name) { done(); return fail('Enter their name.'); }
    r = await db.from('staff').insert(d).select().single(); if (r.error) { done(); return fail('Could not save. ' + r.error.message); }
    keep = r.data.id; const base = numOrNull($('hpBase').value), st = numOrNull($('hpStretch').value);
    if (base !== null || st !== null) { const p = await db.from('staff_pay').insert({ staff_id: keep, effective_date: d.hire_date || todayStr(), pay_type: 'hourly', base_rate: base, per_stretch: st, change_type: 'hire', created_by: ME.id }); if (p.error) { done(); return fail('Saved, but the pay did not. ' + p.error.message); } }
    toast('Added ' + d.full_name);
  } else if (a === 'hrPay') {
    const date = $('hpDate').value, base = numOrNull($('hpBase').value), st = numOrNull($('hpStretch').value);
    if (!date) { done(); return fail('Pick the date the new pay starts.'); } if (base === null && st === null) { done(); return fail('Enter the new base rate or pay per stretch.'); }
    r = await db.from('staff_pay').upsert({ staff_id: sid, effective_date: date, pay_type: base !== null && base >= 1000 ? 'salary' : 'hourly', base_rate: base, per_stretch: st, change_type: $('hpChg').value, note: $('hpNote').value.trim() || null, created_by: ME.id }, { onConflict: 'staff_id,effective_date' });
    if (r.error) { done(); return fail('Could not save. ' + r.error.message); }
    if ($('hpNext').value) { const n = await db.from('staff').update({ next_review_due: $('hpNext').value, updated_at: new Date().toISOString() }).eq('id', sid); if (n.error) { done(); return fail('Pay saved, but the review date did not. ' + n.error.message); } }
    toast('Pay change saved');
  } else if (a === 'hrRev') {
    const date = $('hvDate').value; if (!date) { done(); return fail('Pick the review date.'); }
    r = await db.from('staff_reviews').insert({ staff_id: sid, review_date: date, rating: numOrNull($('hvRate').value), summary: $('hvSum').value.trim() || null, created_by: ME.id });
    if (r.error) { done(); return fail('Could not save. ' + r.error.message); }
    if ($('hvNext').value) await db.from('staff').update({ next_review_due: $('hvNext').value }).eq('id', sid);
  } else if (a === 'hrDis') {
    const date = $('hdDate').value, desc = $('hdDesc').value.trim();
    if (!date) { done(); return fail('Pick the date.'); } if (!desc) { done(); return fail('Describe what happened.'); }
    r = await db.from('staff_discipline').insert({ staff_id: sid, incident_date: date, kind: $('hdKind').value, description: desc, action_taken: $('hdAct').value.trim() || null, follow_up_date: $('hdFollow').value || null, acknowledged: $('hdAck').checked, created_by: ME.id });
    if (r.error) { done(); return fail('Could not save. ' + r.error.message); }
  } else if (a === 'hrProf') {
    const d = hrDetails(); if (!d.full_name) { done(); return fail('Enter their name.'); }
    r = await db.from('staff').update(d).eq('id', sid); if (r.error) { done(); return fail('Could not save. ' + r.error.message); }
    toast('Details saved');
  } else if (a === 'hrResolve') {
    r = await db.from('staff_discipline').update({ resolved: b.dataset.res === '1' }).eq('id', b.dataset.id); if (r.error) { done(); return fail(r.error.message); }
  } else if (a === 'hrDelPay' || a === 'hrDelRev' || a === 'hrDelDis') {
    if (!confirm('Remove this entry? This cannot be undone.')) return done();
    r = await db.from({ hrDelPay: 'staff_pay', hrDelRev: 'staff_reviews', hrDelDis: 'staff_discipline' }[a]).delete().eq('id', b.dataset.id); if (r.error) { done(); return fail(r.error.message); }
  } else if (a === 'hrDelStaff') {
    const s = hr.staff.find(x => x.id === sid);
    if (!confirm(`Delete ${s.full_name} and all of their pay, review and discipline history? This cannot be undone.\n\nIf they just left, set Status to "Former employee" instead.`)) return done();
    r = await db.from('staff').delete().eq('id', sid); if (r.error) { done(); return fail(r.error.message); }
    $('dlg').close(); return loadHr();
  } else return done();
  await loadHr(); hrPerson(keep);
});

// ----- import the Employee Pay Tracker workbook (Pay Tracker + Raise History tabs) -----
const HRCOL = { 'employee name': 'name', 'employee': 'name', 'name': 'name', 'full name': 'name', 'studio': 'studio', 'location': 'studio', 'role': 'role', 'title': 'role', 'position': 'role', 'hire date': 'hire', 'start date': 'hire',
  'base hourly rate': 'base', 'base rate': 'base', 'hourly rate': 'base', 'pay rate': 'base', 'rate': 'base', 'pay per stretch': 'stretch', '$ / stretch': 'stretch', 'per stretch': 'stretch', 'last raise date': 'lastraise', 'next annual review': 'next', 'next review': 'next', 'next review due': 'next',
  'status': 'status', 'notes': 'notes', 'note': 'notes', 'effective date': 'eff', 'effective': 'eff', 'old base rate': 'oldbase', 'new base rate': 'newbase', 'old $ / stretch': 'oldstretch', 'new $ / stretch': 'newstretch', 'reason / notes': 'reason', 'reason': 'reason' };
const hrKey = h => HRCOL[String(h ?? '').trim().toLowerCase().replace(/\s+/g, ' ')];
function hrDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return ymd(v);
  if (typeof v === 'number') { if (v < 20000 || v > 80000) return null; const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * DAY); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
  const t = String(v).trim(); let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); return m ? (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad2(m[1]) + '-' + pad2(m[2]) : null;
}
function hrSheet(g, need) {
  const hi = g.findIndex((r, i) => i < 12 && need.every(k => r.some(x => hrKey(x) === k))); if (hi < 0) return null;
  const c = {}; g[hi].forEach((h, i) => { const k = hrKey(h); if (k && !(k in c)) c[k] = i; });
  return g.slice(hi + 1).filter(r => r[c.name] !== null && String(r[c.name] ?? '').trim()).map(r => Object.fromEntries(Object.entries(c).map(([k, i]) => [k, r[i]])));
}
const hrNum = v => { if (v === null || v === undefined || v === '') return null; const n = +String(v).replace(/[$,\s]/g, ''); return isNaN(n) ? null : n; };
const hrReason = t => { t = String(t || '').toLowerCase(); return /hire|start|onboard/.test(t) ? 'hire' : /annual|yearly|anniv/.test(t) ? 'annual_raise' : /perform|merit|level|cert/.test(t) ? 'performance_raise' : /promo/.test(t) ? 'promotion' : /adjust|market|correct/.test(t) ? 'adjustment' : t ? 'other' : 'annual_raise'; };
// Match a sheet name like "Alyssa S" to "Alyssa Stanley"
function hrMatch(name, extra) {
  const all = hr.staff.concat(extra || []), n = NORM(name), exact = all.filter(s => NORM(s.full_name) === n); if (exact.length === 1) return exact[0];
  const k = nameKey(name), short = all.filter(s => nameKey(s.full_name) === k); return short.length === 1 ? short[0] : null;
}
function hrParseBook(wb) {
  let track = null, hist = null;
  wb.SheetNames.forEach(n => { const g = grid(wb.Sheets[n]); if (!track) track = hrSheet(g, ['name', 'base']); if (!hist) hist = hrSheet(g, ['name', 'eff', 'newbase']); });
  if (!track && !hist) return null;
  const people = [], made = [], pay = new Map(), skipped = [], td = todayStr();
  const who = (name, row) => { let s = hrMatch(name, made); if (!s) { s = { id: 'new:' + made.length, full_name: String(name).trim(), _new: true }; made.push(s); } if (row) people.push({ s, row }); return s; };
  const studioOf = v => { if (!v) return null; const l = dlLoc(v); return l ? l.id : null; };
  (track || []).forEach(r => who(r.name, r));
  (hist || []).forEach(r => {
    const s = who(r.name), d = hrDate(r.eff), nb = hrNum(r.newbase), ns = hrNum(r.newstretch);
    if (!d) return skipped.push(`${r.name}: raise with no effective date`);
    pay.set(s.id + '|' + d, { s, effective_date: d, base_rate: nb, per_stretch: ns, change_type: hrReason(r.reason), note: r.reason ? String(r.reason).trim() : null, oldbase: hrNum(r.oldbase), oldstretch: hrNum(r.oldstretch) });
  });
  // Old rates before the first logged raise become their starting pay (on the hire date)
  const hire = s => { const p = people.find(x => x.s === s); return (p && hrDate(p.row.hire)) || s.hire_date || null; };
  [...pay.values()].forEach(x => { const first = [...pay.values()].filter(y => y.s === x.s).sort((a, b) => a.effective_date < b.effective_date ? -1 : 1)[0], h = hire(x.s);
    if (x === first && (x.oldbase !== null || x.oldstretch !== null) && !(x.s._new ? false : hrPays(x.s.id).some(p => p.effective_date < x.effective_date))) {
      const d = h && h < x.effective_date ? h : null; if (d && !pay.has(x.s.id + '|' + d)) pay.set(x.s.id + '|' + d, { s: x.s, effective_date: d, base_rate: x.oldbase, per_stretch: x.oldstretch, change_type: 'hire', note: null }); } });
  // Current pay from the tracker when it differs from what history says
  people.forEach(({ s, row }) => {
    const base = hrNum(row.base), st = hrNum(row.stretch); if (base === null && st === null) return;
    const known = [...(s._new ? [] : hrPays(s.id)), ...[...pay.values()].filter(x => x.s === s)].filter(x => x.effective_date <= td).sort((a, b) => a.effective_date < b.effective_date ? -1 : 1), last = known[known.length - 1];
    if (last && (base === null || +last.base_rate === base) && (st === null || +last.per_stretch === st)) return;
    const lr = hrDate(row.lastraise), h = hrDate(row.hire), d = lr && (!last || lr > last.effective_date) ? lr : !last ? (h || td) : td;
    pay.set(s.id + '|' + d, { s, effective_date: d, base_rate: base, per_stretch: st, change_type: !last && !lr ? 'hire' : last ? 'adjustment' : 'other', note: last ? 'From pay tracker sheet' : null });
  });
  const upd = people.map(({ s, row }) => ({ s, full_name: s._new ? String(row.name).trim() : s.full_name, studio_id: studioOf(row.studio) || s.studio_id || null, role: row.role ? String(row.role).trim() : s.role || null,
    hire_date: hrDate(row.hire) || s.hire_date || null, next_review_due: hrDate(row.next) || s.next_review_due || null, notes: row.notes ? String(row.notes).trim() : s.notes || null }));
  made.filter(s => !people.some(p => p.s === s)).forEach(s => upd.push({ s, full_name: s.full_name }));
  return { upd, pay: [...pay.values()], made, skipped, sheets: [track ? 'Pay Tracker' : '', hist ? 'Raise History' : ''].filter(Boolean) };
}

function hrUpForm() {
  hr.pend = null;
  pfUpForm('Import pay sheet', 'Pick your Employee Pay Tracker (in Google Sheets: File → Download → Microsoft Excel). Both tabs are read: <b>Pay Tracker</b> for everyone’s current pay, studio, role, hire date and next review, and <b>Raise History</b> for past raises. Names like “Alyssa S” are matched to people already here. Importing again later is safe.', 'hrFile');
  $('hrFile').onchange = async () => {
    try {
      const f = $('hrFile').files[0]; upMsg('Reading the file...');
      const wb = await readBook(f), r = hrParseBook(wb);
      if (!r) return upMsg('', 'I could not find the columns. The sheet needs an Employee Name column and a Base Hourly Rate column (or Effective Date and New Base Rate for raise history).');
      hr.pend = r;
      const exist = r.upd.filter(x => !x.s._new).length;
      upMsg(`<p>Found ${esc(r.sheets.join(' and '))}: <b>${r.upd.length}</b> people (<b>${r.made.length}</b> new, ${exist} already here) and <b>${r.pay.length}</b> pay entries to save.</p>` +
        (r.made.length ? `<p class="lead" style="font-size:.85rem">New: ${esc(r.made.map(s => s.full_name).join(', '))}</p>` : '') +
        (r.skipped.length ? `<p class="lead">Skipped ${r.skipped.length}: ${esc(r.skipped.slice(0, 5).join('; '))}</p>` : ''));
    } catch (e) { upMsg('', xlsbHint($('hrFile').files[0], e)); }
  };
}
async function hrUpSave() {
  $('upGo').disabled = true; $('upGo').textContent = 'Saving...';
  const P = hr.pend, now = new Date().toISOString(), ids = {}, fail = m => { $('pErr').textContent = 'Could not save. ' + m; $('upGo').disabled = false; $('upGo').textContent = 'Save'; };
  for (const u of P.upd) {
    const row = { full_name: u.full_name, studio_id: u.studio_id ?? null, role: u.role ?? null, hire_date: u.hire_date ?? null, next_review_due: u.next_review_due ?? null, notes: u.notes ?? null, updated_at: now };
    if (u.s._new) { const r = await db.from('staff').insert(row).select('id').single(); if (r.error) return fail(r.error.message); ids[u.s.id] = r.data.id; }
    else { const r = await db.from('staff').update(row).eq('id', u.s.id); if (r.error) return fail(r.error.message); ids[u.s.id] = u.s.id; }
  }
  const rows = P.pay.map(x => ({ staff_id: ids[x.s.id] || x.s.id, effective_date: x.effective_date, pay_type: x.base_rate !== null && x.base_rate >= 1000 ? 'salary' : 'hourly', base_rate: x.base_rate, per_stretch: x.per_stretch, change_type: x.change_type, note: x.note, created_by: ME.id }));
  for (let i = 0; i < rows.length; i += 400) { const { error } = await db.from('staff_pay').upsert(rows.slice(i, i + 400), { onConflict: 'staff_id,effective_date' }); if (error) return fail(error.message); }
  $('dlg').close(); toast(`Imported ${P.upd.length} people and ${rows.length} pay entries`); loadHr();
}

// Download in the same layout as the Google Sheet
function hrDownload() {
  const { rows } = hrRows(), head = ['Employee Name', 'Studio', 'Role', 'Hire Date', 'Base Hourly Rate', 'Pay Per Stretch', 'Last Raise Date', 'Next Annual Review', 'Status', 'Notes'];
  const lines = [head.map(csvCell).join(',')].concat(rows.map(x => [x.s.full_name, studio(x.s.studio_id), x.s.role, x.s.hire_date || '', x.cur ? x.cur.base_rate : '', x.cur ? x.cur.per_stretch : '', x.raise ? x.raise.effective_date : '', x.due || '', HRSTAT[x.status], x.s.notes || ''].map(csvCell).join(',')));
  const byId = Object.fromEntries(hr.staff.map(s => [s.id, s])), ids = new Set(rows.map(x => x.s.id));
  const hist = [['Employee Name', 'Studio', 'Effective Date', 'Old Base Rate', 'New Base Rate', 'Old $ / Stretch', 'New $ / Stretch', 'Reason / Notes'].map(csvCell).join(',')].concat(hr.pay.filter(x => ids.has(x.staff_id) && x.change_type !== 'hire').sort((a, b) => a.effective_date < b.effective_date ? 1 : -1)
    .map(x => { const p = hrPays(x.staff_id), pv = p[p.indexOf(x) - 1] || {}; return [byId[x.staff_id].full_name, studio(byId[x.staff_id].studio_id), x.effective_date, pv.base_rate ?? '', x.base_rate ?? '', pv.per_stretch ?? '', x.per_stretch ?? '', [CHG[x.change_type], x.note].filter(Boolean).join(' - ')].map(csvCell).join(','); }));
  const save = (txt, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv' })); a.download = name; a.click(); };
  save(lines.join('\n'), 'pay-tracker-' + todayStr() + '.csv'); setTimeout(() => save(hist.join('\n'), 'raise-history-' + todayStr() + '.csv'), 400);
}

$('hrStudio').onchange = e => { hr.studio = e.target.value; drawHr(); };
$('hrFind').oninput = e => { hr.find = e.target.value; drawHr(); };
$('hrFilter').onchange = e => { hr.show = e.target.value; drawHr(); };
$('hrUp').onclick = hrUpForm;
$('hrCsv').onclick = hrDownload;
$('hrAddBtn').onclick = () => hrPerson(null);
$('hrTabs').onclick = e => { const b = e.target.closest('button[data-v]'); if (b) { hr.view = b.dataset.v; drawHr(); } };
$('hrBody').onclick = e => { const rz = e.target.closest('[data-hrraise]'); if (rz) return hrPerson(rz.dataset.hrraise, 'raise'); const tr = e.target.closest('tr[data-hr]'); if (tr) hrPerson(tr.dataset.hr); };
$('dlg').addEventListener('close', () => $('dlg').classList.remove('wide'));
