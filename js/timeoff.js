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

function drawTimeOff() {
  const nm = r => (r.profiles && (r.profiles.full_name || r.profiles.email)) || (to.dir[r.user_id] || {}).full_name || 'Someone';
  const span = r => fmt(r.start_date) + (r.end_date !== r.start_date ? ' \u2013 ' + fmt(r.end_date) : '');
  const info = toInfo;
  const pill = r => `<span class="pill ${r.status === 'approved' ? '' : r.status === 'denied' ? 'warn' : 'ice'}" style="margin:0">${r.status}</span>` + (r.status === 'pending' && dayDiff(r.created_at.slice(0, 10), r.start_date) <= 14 ? '<span class="pill warn">Within 2 weeks</span>' : '');
  const sline = r => r.status === 'pending' ? 'Waiting on ' + (nameList(apvFor(reqLoc(r), r.user_id)) || 'a decision')
    : (r.status === 'approved' ? 'Approved' : 'Denied') + (r.decided_by ? ' by ' + ((to.apv.find(x => x.id === r.decided_by) || {}).full_name || 'a manager') : '') + (r.decided_at ? ' on ' + fmt(r.decided_at.slice(0, 10)) : '');
  const row = (r, who, acts) => `<div class="req"><div>${who ? '<b>' + who + '</b> ' : ''}<b>${span(r)}</b><div class="lead" style="margin:.2rem 0 0;font-size:.85rem">${info(r)}${info(r) ? '<br>' : ''}<i>${esc(sline(r))}</i></div></div><div class="acts" style="margin:0;align-items:center">${acts}</div></div>`;
  const pend = ME.role === 'staff' ? [] : to.reqs.filter(r => r.status === 'pending' && (r.user_id !== ME.id || ME.role === 'owner'));
  const mine = to.reqs.filter(r => r.user_id === ME.id);
  $('toBody').innerHTML = (to.err ? `<p class="err">Could not load requests: ${esc(to.err)}</p>` : '') + (to.msg ? `<p class="lead"><b>${to.msg}</b></p>` : '') +
    (pend.length ? '<h3 class="sub">Waiting for your approval</h3>' + pend.map(r => row(r, esc(nm(r)), pill(r) + `<button data-a="approved" data-id="${r.id}">Approve</button><button class="quiet" data-a="denied" data-id="${r.id}">Deny</button>`)).join('') : '') +
    `<h3 class="sub" style="margin-top:1.5rem">Request time off</h3>
    <div class="pcard"><div class="grid2">
      <label>First day <input id="tS" type="date" min="${todayStr()}"></label>
      <label>Last day (if more than one day) <input id="tE" type="date" min="${todayStr()}"></label>
      <label>Shift <select id="tSh"><option value="full">Full shift</option><option value="partial">Partial shift</option><option value="flexible">Can adjust shift time</option></select></label>
      <label>Can you help cover an additional shift that week? <select id="tCv"><option value="no">No</option><option value="yes">Yes</option><option value="maybe">Maybe</option></select></label>
      <label>Have you arranged coverage for your shift? <select id="tCo"><option value="no">No</option><option value="yes">Yes</option><option value="other">Other</option></select></label>
      <label>Coverage details (optional) <input id="tCn" maxlength="200" placeholder="Who is covering, or what is arranged"></label>
    </div>
    <label>Reason for request <textarea id="tN" maxlength="400"></textarea></label>
    <div id="tHint" style="margin:0 0 .75rem"></div><div id="tErr" role="alert" class="err"></div>
    <button id="tSend">Send request</button></div>
    <h3 class="sub" style="margin-top:1.5rem">My requests</h3>` +
    (mine.map(r => row(r, '', pill(r) + (r.status === 'pending' ? `<button class="quiet" data-a="cancel" data-id="${r.id}">Cancel</button>` : ''))).join('') || '<p class="lead">No requests yet.</p>');
}

function toHint() {
  const s = $('tS').value, e = $('tE').value || s;
  if (!s) { $('tHint').innerHTML = ''; return; }
  const clash = ME.location_id ? to.offs.filter(o => o.location_id === ME.location_id && o.user_id !== ME.id && o.start_date <= e && o.end_date >= s) : [];
  $('tHint').innerHTML = (dayDiff(todayStr(), s) <= 14 ? '<b>Heads up:</b> this is within 2 weeks, so it will be marked as an emergency request. ' : '') +
    (clash.length ? 'Already off at your studio on those days: ' + clash.map(o => esc(o.full_name.split(' ')[0]) + ' (' + o.status + ')').join(', ') + '.' : '');
}

async function sendTo() {
  const r = { user_id: ME.id, start_date: $('tS').value, end_date: $('tE').value || $('tS').value, shift_type: $('tSh').value, can_cover: $('tCv').value, coverage: $('tCo').value, coverage_note: $('tCn').value.trim() || null, note: $('tN').value.trim() || null };
  if (!r.start_date) { $('tErr').textContent = 'Pick the first day.'; return; }
  if (r.end_date < r.start_date) { $('tErr').textContent = 'The last day is before the first day.'; return; }
  const { error } = await db.from('time_off_requests').insert(r);
  if (error) { $('tErr').textContent = 'Could not send. ' + error.message; return; }
  const nl = nameList(apvFor(ME.location_id, ME.id)); to.msg = 'Request sent' + (nl ? ' to ' + esc(nl) : '') + '. You will see their decision under My requests.'; loadTimeOff();
}

$('toBody').oninput = e => { if (e.target.id === 'tS' || e.target.id === 'tE') toHint(); };
$('toBody').onclick = async e => {
  const t = e.target;
  if (t.id === 'tSend') return sendTo();
  const a = t.dataset.a, id = t.dataset.id; if (!a) return;
  to.msg = '';
  const { error } = a === 'cancel' ? await db.from('time_off_requests').delete().eq('id', id) : await db.rpc('decide_time_off', { p_id: id, p_status: a });
  if (error) alert('That did not work: ' + error.message);
  loadTimeOff();
};
