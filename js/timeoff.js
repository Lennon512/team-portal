// ---------- Time off page ----------
let to = { reqs: [], offs: [], msg: '', apv: [], apvLoaded: false, dir: {}, err: '' };
const SHIFT = { full: 'Full shift', partial: 'Partial shift', flexible: 'Can adjust shift time' };
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / DAY);

const reqLoc = r => (r.profiles && r.profiles.location_id) || (to.dir[r.user_id] || {}).location_id;
const nameList = a => { const n = a.map(x => String(x.full_name).split(' ')[0]); return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; };
const apvFor = (loc, uid) => to.apv.filter(x => x.id !== uid && (x.role === 'owner' || (x.role === 'manager' && x.location_id === loc)));
async function loadApv() { if (!to.apvLoaded) { const { data } = await db.from('time_off_approvers').select('*'); to.apv = data || []; to.apvLoaded = true; } }
const toInfo = r => [SHIFT[r.shift_type], r.can_cover && 'Can cover another shift: ' + r.can_cover, r.coverage && 'Coverage arranged: ' + r.coverage + (r.coverage_note ? ' (' + r.coverage_note + ')' : ''), r.note].filter(Boolean).map(esc).join(' \u2022 ');

async function timeOffBadge() {
  if (!ME || ME.role === 'staff') return;
  const { data } = await db.from('time_off_requests').select('id,user_id').eq('status', 'pending');
  const n = (data || []).filter(r => r.user_id !== ME.id || ME.role === 'owner').length;
  $('navOff').textContent = 'Time off' + (n ? ` (${n})` : '');
}

async function showOff(id) {
  const o = offs.find(x => x.id === id); if (!o) return;
  await loadApv();
  const { data: r } = await db.from('time_off_requests').select('*').eq('id', id).maybeSingle();
  const decide = r && r.status === 'pending' && (ME.role === 'owner' || (ME.role === 'manager' && r.user_id !== ME.id));
  const line = o.status === 'pending' ? 'Waiting on ' + (nameList(apvFor(o.location_id, o.user_id)) || 'a decision')
    : 'Approved' + (r && r.decided_by ? ' by ' + ((to.apv.find(x => x.id === r.decided_by) || {}).full_name || 'a manager') : '');
  $('dlgBody').innerHTML = `<h2>${esc(o.full_name)}</h2>
    <p class="lead" style="margin:.25rem 0 1rem">${esc(fmt(o.start_date) + (o.end_date !== o.start_date ? ' \u2013 ' + fmt(o.end_date) : ''))} \u2022 ${esc(studio(o.location_id))} \u2022 <span class="pill ${o.status === 'approved' ? '' : 'ice'}" style="margin:0">${o.status}</span></p>
    <p style="margin:0 0 .75rem">${esc(line)}</p>
    ${clashes(o).length ? `<p class="clash">Heads up: also out at ${esc(studio(o.location_id))} during these days: ${clashes(o).map(c => `<b>${esc(c.full_name)}</b> (${esc(fmt(c.start_date) + (c.end_date !== c.start_date ? '\u2013' + fmt(c.end_date) : ''))}${c.status === 'pending' ? ', pending' : ''})`).join(', ')}.</p>` : ''}
    ${r && toInfo(r) ? `<p style="margin:0 0 .75rem">${toInfo(r)}</p>` : '<p class="lead" style="font-size:.85rem;margin:0 0 .75rem">Only the person and their managers can see the reason and coverage details.</p>'}
    <div class="acts">${decide ? `<button data-act="offDecide" data-s="approved" data-id="${id}">Approve</button><button class="quiet" data-act="offDecide" data-s="denied" data-id="${id}">Deny</button>` : ''}${r && r.user_id === ME.id && r.status === 'pending' ? `<button class="quiet" data-act="offCancel" data-id="${id}">Cancel request</button>` : ''}<button class="quiet" data-act="close">Close</button></div>`;
  if (!$('dlg').open) $('dlg').showModal();
}

$('dlgBody').addEventListener('click', async e => {
  const a = e.target.dataset.act; if (a !== 'offDecide' && a !== 'offCancel') return;
  const id = e.target.dataset.id;
  const { error } = a === 'offCancel' ? await db.from('time_off_requests').delete().eq('id', id) : await db.rpc('decide_time_off', { p_id: id, p_status: e.target.dataset.s });
  if (error) { alert('That did not work: ' + error.message); return; }
  $('dlg').close(); loadCal(); timeOffBadge();
});

async function loadTimeOff() {
  const q = sel => db.from('time_off_requests').select(sel).order('start_date', { ascending: false }).limit(500);
  const [r0, o, d] = await Promise.all([q('*, profiles!time_off_requests_user_id_fkey(full_name, email, location_id)'), db.from('time_off_calendar').select('*'), db.from('team_directory').select('id,full_name,location_id')]);
  const r = r0.error ? await q('*') : r0;
  to.reqs = r.data || []; to.offs = o.data || []; to.err = r.error ? r.error.message : '';
  to.dir = {}; (d.data || []).forEach(x => to.dir[x.id] = x);
  await loadApv(); drawTimeOff(); timeOffBadge();
}

// Form state survives re-renders so a half-filled request isn't lost
to.f = to.f || { s: '', e: '', shift: 'full', from: '', till: '', cv: 'no', co: 'no', cn: '', n: '' };
const toSpan = r => fmt(r.start_date) + (r.end_date !== r.start_date ? ' – ' + fmt(r.end_date) : '');
const toPill = st => `<span class="topill ${st}">${st === 'approved' ? 'Approved' : st === 'denied' ? 'Denied' : 'Pending'}</span>`;
const toNm = r => (r.profiles && (r.profiles.full_name || r.profiles.email)) || (to.dir[r.user_id] || {}).full_name || 'Someone';
const toClash = (loc, uid, s, e, skip) => loc ? to.offs.filter(o => o.location_id === loc && o.user_id !== uid && o.id !== skip && o.start_date <= e && o.end_date >= s) : [];
const seg = (k, opts) => `<span class="tabs toseg" data-seg="${k}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${to.f[k] === v ? 'on' : ''}">${l}</button>`).join('')}</span>`;

function drawTimeOff() {
  const F = to.f, td = todayStr();
  const sline = r => r.status === 'pending' ? 'Waiting on ' + (nameList(apvFor(reqLoc(r), r.user_id)) || 'a decision')
    : (r.status === 'approved' ? 'Approved' : 'Denied') + (r.decided_by ? ' by ' + ((to.apv.find(x => x.id === r.decided_by) || {}).full_name || 'a manager') : '') + (r.decided_at ? ' on ' + fmt(r.decided_at.slice(0, 10)) : '');
  const urgent = r => r.status === 'pending' && r.created_at && dayDiff(r.created_at.slice(0, 10), r.start_date) <= 14;
  const pend = ME.role === 'staff' ? [] : to.reqs.filter(r => r.status === 'pending' && (r.user_id !== ME.id || ME.role === 'owner'));
  const mine = to.reqs.filter(r => r.user_id === ME.id), up = mine.filter(r => r.end_date >= td).sort((a, b) => a.start_date < b.start_date ? -1 : 1), past = mine.filter(r => r.end_date < td);
  const myRow = r => `<div class="toreq ${r.status}"><div><b>${toSpan(r)}</b> <span class="muted">${dayDiff(r.start_date, r.end_date) + 1} day${r.end_date !== r.start_date ? 's' : ''}</span><small>${toInfo(r)}</small><small class="toline">${esc(sline(r))}</small></div><div class="toacts">${toPill(r.status)}${r.status === 'pending' ? `<button class="quiet sm" data-a="cancel" data-id="${r.id}">Cancel</button>` : ''}</div></div>`;
  const apRow = r => { const cl = toClash(reqLoc(r), r.user_id, r.start_date, r.end_date, r.id);
    return `<div class="toreq pending"><div><b>${esc(toNm(r))}</b> <span class="muted">• ${esc(studio(reqLoc(r)))}</span><div class="todates">${toSpan(r)} <span class="muted">• ${dayDiff(r.start_date, r.end_date) + 1} day${r.end_date !== r.start_date ? 's' : ''}</span>${urgent(r) ? ' <span class="topill denied">Within 2 weeks</span>' : ''}</div><small>${toInfo(r)}</small>${cl.length ? `<small class="up-warn">Also out: ${esc(cl.map(c => c.full_name.split(' ')[0] + ' (' + toSpan(c) + ')').join(', '))}</small>` : ''}</div><div class="toacts"><button class="sm" data-a="approved" data-id="${r.id}">Approve</button><button class="quiet sm" data-a="denied" data-id="${r.id}">Decline</button></div></div>`; };
  $('toBody').innerHTML = (to.err ? `<p class="err">Could not load requests: ${esc(to.err)}</p>` : '') + (to.msg ? `<p class="hclear">✓ ${to.msg}</p>` : '') +
    (pend.length ? `<h3 class="sub">Waiting for your approval <span class="hcount">${pend.length}</span></h3><div class="tolist">${pend.sort((a, b) => a.start_date < b.start_date ? -1 : 1).map(apRow).join('')}</div>` : '') +
    `<h3 class="sub" style="margin-top:${pend.length ? '1.6rem' : '0'}">Request time off</h3>
    <div class="toform-wrap"><div class="pcard toform">
      <div class="tofield"><span class="tolbl">When</span>
        <div class="toquick"><button type="button" class="quiet sm" data-quick="tomorrow">Tomorrow</button><button type="button" class="quiet sm" data-quick="fri">This Friday</button><button type="button" class="quiet sm" data-quick="nextwk">Next week</button></div>
        <div class="grid2"><label>First day <input id="tS" type="date" min="${td}" value="${F.s}"></label><label>Last day <small class="muted">(if more than one)</small> <input id="tE" type="date" min="${td}" value="${F.e}"></label></div></div>
      <div class="tofield"><span class="tolbl">Shift</span>${seg('shift', [['full', 'Full shift'], ['partial', 'Part of my shift'], ['flexible', 'Can adjust my time']])}
        <div class="grid2 topart"${F.shift === 'partial' ? '' : ' hidden'}><label>Out from <input id="tFrom" type="time" value="${F.from}"></label><label>Until <input id="tTill" type="time" value="${F.till}"></label></div></div>
      <div class="tofield"><span class="tolbl">Have you arranged coverage for your shift?</span>${seg('co', [['yes', 'Yes'], ['no', 'Not yet'], ['other', 'Other']])}
        <label class="tocn"${F.co === 'no' ? ' hidden' : ''}>Who is covering, or what is arranged <input id="tCn" maxlength="200" value="${esc(F.cn)}"></label></div>
      <div class="tofield"><span class="tolbl">Can you help cover another shift that week?</span>${seg('cv', [['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']])}</div>
      <label class="tofield">Reason <small class="muted">(only you and your managers see this)</small><textarea id="tN" maxlength="400" rows="3">${esc(F.n)}</textarea></label>
      <div id="tErr" role="alert" class="err"></div>
      <button id="tSend">Send request</button>
    </div><aside class="tosum" id="toSum"></aside></div>
    <h3 class="sub" style="margin-top:1.8rem">My requests</h3>` +
    (up.length ? `<div class="tolist">${up.map(myRow).join('')}</div>` : '<p class="lead" style="margin:0">No upcoming requests.</p>') +
    (past.length ? `<details class="tk-donebox mem-done"><summary>Past requests <span>${past.length}</span></summary><div class="tolist">${past.map(myRow).join('')}</div></details>` : '');
  toHint();
}

// Live summary beside the form
function toHint() {
  const F = to.f, el = $('toSum'); if (!el) return;
  const s = F.s, e = F.e && F.e >= s ? F.e : s, ap = nameList(apvFor(ME.location_id, ME.id));
  if (!s) { el.innerHTML = `<h4>Your request</h4><p class="muted">Pick your first day to see a summary here.</p>${ap ? `<p class="tosmall">Requests go to <b>${esc(ap)}</b>.</p>` : ''}`; return; }
  const n = dayDiff(s, e) + 1, fd = d => new Date(d + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const cl = toClash(ME.location_id, ME.id, s, e), soon = dayDiff(todayStr(), s) <= 14;
  el.innerHTML = `<h4>Your request</h4><p class="todays"><b>${fd(s)}${e !== s ? ' – ' + fd(e) : ''}</b><span>${n} day${n === 1 ? '' : 's'}${F.shift === 'partial' && F.from && F.till ? ' • out ' + t12h(F.from) + ' – ' + t12h(F.till) : F.shift === 'partial' ? ' • part of shift' : F.shift === 'flexible' ? ' • can adjust time' : ''}</span></p>` +
    (soon ? '<p class="towarn"><b>Within 2 weeks.</b> This will be marked as a short-notice request, so give your manager a heads-up too.</p>' : '') +
    (cl.length ? `<p class="towarn">Also out at your studio then: ${cl.map(o => `<b>${esc(o.full_name.split(' ')[0])}</b> (${toSpan(o)}${o.status === 'pending' ? ', pending' : ''})`).join(', ')}.</p>` : '<p class="took">✓ No one else at your studio is out those days.</p>') +
    `<p class="tosmall">Coverage: ${F.co === 'yes' ? 'arranged' : F.co === 'other' ? 'other' : 'not yet'}${F.cn ? ' (' + esc(F.cn) + ')' : ''}</p>` + (ap ? `<p class="tosmall">Goes to <b>${esc(ap)}</b> for approval.</p>` : '');
}
const t12h = t => { let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`; };

async function sendTo() {
  const F = to.f;
  if (!F.s) { $('tErr').textContent = 'Pick the first day.'; return; }
  if (F.e && F.e < F.s) { $('tErr').textContent = 'The last day is before the first day.'; return; }
  if (F.shift === 'partial' && (!F.from || !F.till)) { $('tErr').textContent = 'Add the hours you will be out.'; return; }
  const part = F.shift === 'partial' ? `Out ${t12h(F.from)} – ${t12h(F.till)}.` : '';
  const r = { user_id: ME.id, start_date: F.s, end_date: F.e || F.s, shift_type: F.shift, can_cover: F.cv, coverage: F.co, coverage_note: F.cn.trim() || null, note: [part, F.n.trim()].filter(Boolean).join(' ') || null };
  $('tSend').disabled = true;
  const { error } = await db.from('time_off_requests').insert(r);
  if (error) { $('tSend').disabled = false; $('tErr').textContent = 'Could not send. ' + error.message; return; }
  const nl = nameList(apvFor(ME.location_id, ME.id)); to.msg = 'Request sent' + (nl ? ' to ' + esc(nl) : '') + '. Their decision will show under My requests.';
  to.f = { s: '', e: '', shift: 'full', from: '', till: '', cv: 'no', co: 'no', cn: '', n: '' }; loadTimeOff();
}

$('toBody').oninput = e => {
  const id = e.target.id, F = to.f, map = { tS: 's', tE: 'e', tFrom: 'from', tTill: 'till', tCn: 'cn', tN: 'n' };
  if (map[id]) { F[map[id]] = e.target.value; if (id === 'tS' && F.e && F.e < F.s) { F.e = ''; $('tE').value = ''; } if (id === 'tS') $('tE').min = F.s || todayStr(); $('tErr').textContent = ''; toHint(); }
};
$('toBody').onclick = async e => {
  const t = e.target;
  if (t.id === 'tSend') return sendTo();
  const q = t.closest('[data-quick]');
  if (q) {
    const d = new Date(), add = n => { const x = new Date(d); x.setDate(d.getDate() + n); return ymd(x); };
    if (q.dataset.quick === 'tomorrow') { to.f.s = add(1); to.f.e = ''; }
    else if (q.dataset.quick === 'fri') { const k = (5 - d.getDay() + 7) % 7; to.f.s = add(k); to.f.e = ''; }
    else { const k = (8 - d.getDay()) % 7 || 7; to.f.s = add(k); to.f.e = add(k + 4); }
    $('tS').value = to.f.s; $('tE').value = to.f.e; toHint(); return;
  }
  const sb = t.closest('[data-seg] [data-v]');
  if (sb) {
    const k = sb.parentNode.dataset.seg; to.f[k] = sb.dataset.v;
    sb.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === sb));
    if (k === 'shift') document.querySelector('.topart').hidden = to.f.shift !== 'partial';
    if (k === 'co') document.querySelector('.tocn').hidden = to.f.co === 'no';
    toHint(); return;
  }
  const a = t.dataset.a, id = t.dataset.id; if (!a) return;
  to.msg = ''; t.disabled = true;
  const { error } = a === 'cancel' ? await db.from('time_off_requests').delete().eq('id', id) : await db.rpc('decide_time_off', { p_id: id, p_status: a });
  if (error) { t.disabled = false; alert('That did not work: ' + error.message); return; }
  toast(a === 'cancel' ? 'Request cancelled' : a === 'approved' ? 'Approved' : 'Declined');
  loadTimeOff();
};
