// ---------- Calendar ----------
let calTab = 'all', calMonth = new Date(), calStudio = null, events = [], offs = [], roster = [];
calMonth.setDate(1);
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const fmt = d => new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const canEdit = ev => ME.role === 'owner' || (ME.role === 'manager' && ev.location_id && ev.location_id === ME.location_id);

async function loadCal() {
  if (calStudio === null) calStudio = calTab === 'all' ? '' : (ME.location_id || '');
  const [e, o, r] = await Promise.all([db.from('events').select('*').order('event_date'), db.from('time_off_calendar').select('*'), db.from('team_directory').select('id,full_name,location_id,birthday,start_date')]);
  events = e.data || []; offs = o.data || []; roster = r.data || [];
  drawCal();
}

function celItems(d, sf) {
  const md = d.slice(5), first = n => n.split(' ')[0];
  return roster.filter(sf).flatMap(p => {
    const out = [];
    if (p.birthday && p.birthday.slice(5) === md) out.push({ t: first(p.full_name) + '\u2019s birthday', cel: 1, pid: p.id });
    if (p.start_date && p.start_date.slice(5) === md) { const y = +d.slice(0, 4) - +p.start_date.slice(0, 4); if (y > 0) out.push({ t: first(p.full_name) + '\u2019s ' + y + '-year anniversary', cel: 1, pid: p.id }); }
    return out;
  });
}

function dayItems(d) {
  const inE = x => d >= x.event_date && d <= (x.ends_on || x.event_date), sf = x => !calStudio || x.location_id === calStudio;
  const ev = x => ({ t: (x.time_label ? x.time_label + ' ' : '') + ((calTab === 'all' || calTab === 'events') && x.location_id ? studio(x.location_id) + ': ' : '') + x.title, id: x.id, k: x.location_id ? 'es' : 'ea' });
  const of = o => ({ t: o.full_name + ' out' + (o.status === 'pending' ? ' (pending)' : ''), off: 1, pend: o.status === 'pending', oid: o.id });
  if (calTab === 'cel') return celItems(d, sf);
  const out = offs.filter(o => d >= o.start_date && d <= o.end_date && sf(o)).map(of);
  if (calTab === 'off') return out;
  if (calTab === 'all') return events.filter(x => inE(x) && (!x.location_id || sf(x))).map(ev).concat(out).concat(celItems(d, sf));
  if (calTab === 'events') return events.filter(x => inE(x) && (!x.location_id || sf(x))).map(ev);
  return [];
}

function drawCal() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth(), today = ymd(new Date());
  $('monthLbl').textContent = calMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  document.querySelectorAll('#calTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === calTab));
  $('calStudio').hidden = false;
  $('calStudio').innerHTML = '<option value="">All studios</option>' + locs.map(x => `<option value="${x.id}" ${x.id === calStudio ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  const canAdd = calTab === 'cel' ? false : calTab === 'off' ? true : ME.role !== 'staff';
  $('calAdd').hidden = !canAdd;
  $('calLegend').hidden = calTab !== 'all';
  $('calAdd').textContent = { all: 'Add event', events: 'Add event', off: 'Request time off', cel: '' }[calTab];
  $('calNote').textContent = calTab === 'cel' ? 'Pulled automatically from each person\u2019s Birthday and Start date on their team card.' : '';
  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay());
  let h = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x => `<div class="dow">${x}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (i === 35 && d.getMonth() !== m) break;
    const k = ymd(d);
    h += `<div class="${d.getMonth() !== m ? 'out' : ''} ${k === today ? 'today' : ''}" data-day="${k}"><span>${d.getDate()}</span>` +
      dayItems(k).map(x => `<button class="chip ${x.k || ''} ${x.off ? 'off' : ''} ${x.pend ? 'pend' : ''} ${x.cel ? 'cel' : ''}" ${x.id ? `data-ev="${x.id}"` : ''} ${x.oid ? `data-off="${x.oid}"` : ''} ${x.pid ? `data-cel="${x.pid}"` : ''}>${esc(x.t)}</button>`).join('') + '</div>';
  }
  $('cal').innerHTML = h;
}

function showEv(id) {
  const ev = events.find(x => x.id === id); if (!ev) return;
  const when = fmt(ev.event_date) + (ev.ends_on ? ' \u2013 ' + fmt(ev.ends_on) : '') + (ev.time_label ? ' \u2022 ' + ev.time_label : '');
  $('dlgBody').innerHTML = `<h2>${esc(ev.title)}</h2><p class="lead" style="margin:.25rem 0 1rem">${esc(when)} \u2022 ${esc(ev.location_id ? studio(ev.location_id) : 'All of Austin')}</p>
    <p style="white-space:pre-wrap">${esc(ev.notes || '')}</p>
    <div class="acts">${canEdit(ev) ? `<button data-act="editEv" data-id="${id}">Edit</button>` : ''}<button class="quiet" data-act="close">Close</button></div>`;
  if (!$('dlg').open) $('dlg').showModal();
}

function eventForm(ev) {
  ev = ev || {};
  const loc = ev.id ? ev.location_id : ((!calStudio && ME.role === 'owner') ? '' : (calStudio || ME.location_id));
  $('dlgBody').innerHTML = `<h2>${ev.id ? 'Edit event' : 'New event'}</h2>
    <label>Title <input id="eT" maxlength="100" value="${esc(ev.title)}"></label>
    <label>Date <input id="eD" type="date" value="${esc(ev.event_date)}"></label>
    <label>End date (optional) <input id="eE" type="date" value="${esc(ev.ends_on)}"></label>
    <label>Time (optional) <input id="eTm" maxlength="30" placeholder="6:00 PM" value="${esc(ev.time_label)}"></label>
    ${ME.role === 'owner' ? `<label>Where <select id="eL"><option value="">All of Austin</option>${locs.map(x => `<option value="${x.id}" ${x.id === loc ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
    <label>Details <textarea id="eN" maxlength="600">${esc(ev.notes)}</textarea></label>
    <div id="cErr" role="alert" style="color:var(--danger)"></div>
    <div class="acts"><button data-act="saveEv" data-id="${ev.id || ''}">Save</button>${ev.id ? `<button class="quiet" data-act="delEv" data-id="${ev.id}">Delete</button>` : ''}<button class="quiet" data-act="close">Cancel</button></div>`;
  if (!$('dlg').open) $('dlg').showModal();
}

function offForm() {
  $('dlgBody').innerHTML = `<h2>Request time off</h2>
    <label>First day <input id="tS" type="date"></label>
    <label>Last day <input id="tE" type="date"></label>
    <label>Type <select id="tK"><option value="vacation">Vacation</option><option value="sick">Sick</option><option value="personal">Personal</option><option value="other">Other</option></select></label>
    <label>Note (optional, only your manager sees it) <textarea id="tN" maxlength="300"></textarea></label>
    <div id="cErr" role="alert" style="color:var(--danger)"></div>
    <div class="acts"><button data-act="saveOff">Send request</button><button class="quiet" data-act="close">Cancel</button></div>`;
  if (!$('dlg').open) $('dlg').showModal();
}

$('dlgBody').addEventListener('click', async e => {
  const a = e.target.dataset.act, id = e.target.dataset.id; if (!a) return;
  const fail = m => { $('cErr').textContent = m; };
  if (a === 'close') $('dlg').close();
  else if (a === 'editEv') eventForm(events.find(x => x.id === id));
  else if (a === 'delEv') { const { error } = await db.from('events').delete().eq('id', id); if (error) return fail('Could not delete.'); $('dlg').close(); loadCal(); }
  else if (a === 'saveEv') {
    const row = { title: $('eT').value.trim(), event_date: $('eD').value, ends_on: $('eE').value || null, time_label: $('eTm').value.trim() || null, notes: $('eN').value.trim() || null,
      location_id: ME.role === 'owner' ? ($('eL').value || null) : ME.location_id };
    if (!row.title || !row.event_date) return fail('Add a title and a date.');
    if (row.ends_on && row.ends_on < row.event_date) return fail('The end date is before the start date.');
    const { error } = id ? await db.from('events').update(row).eq('id', id) : await db.from('events').insert({ ...row, created_by: ME.id });
    if (error) return fail('Could not save. ' + error.message);
    $('dlg').close(); loadCal();
  } else if (a === 'saveOff') {
    const r = { user_id: ME.id, start_date: $('tS').value, end_date: $('tE').value || $('tS').value, kind: $('tK').value, note: $('tN').value.trim() || null };
    if (!r.start_date) return fail('Pick the first day.');
    if (r.end_date < r.start_date) return fail('The last day is before the first day.');
    const { error } = await db.from('time_off_requests').insert(r);
    if (error) return fail('Could not send. ' + error.message);
    $('dlg').close(); loadCal();
  }
});

async function loadOffPanel() {
  const { data } = await db.from('time_off_requests').select('*, profiles(full_name, email)').order('start_date', { ascending: false });
  const all = data || [], nm = r => (r.profiles && (r.profiles.full_name || r.profiles.email)) || 'Someone';
  const line = r => `${fmt(r.start_date)}${r.end_date !== r.start_date ? ' \u2013 ' + fmt(r.end_date) : ''} \u2022 ${r.kind}${r.note ? ' \u2022 ' + esc(r.note) : ''}`;
  const pend = ME.role === 'staff' ? [] : all.filter(r => r.status === 'pending' && (r.user_id !== ME.id || ME.role === 'owner'));
  const mine = all.filter(r => r.user_id === ME.id);
  $('offPanel').innerHTML =
    (pend.length ? '<h2>Waiting for your approval</h2>' + pend.map(r => `<div class="req"><div><b>${esc(nm(r))}</b><br>${line(r)}</div><div class="acts" style="margin:0"><button data-a="approved" data-id="${r.id}">Approve</button><button class="quiet" data-a="denied" data-id="${r.id}">Deny</button></div></div>`).join('') : '') +
    '<h2>My requests</h2>' + (mine.map(r => `<div class="req"><div>${line(r)}</div><div>${esc(r.status)}${r.status === 'pending' ? ` <button class="quiet" data-a="cancel" data-id="${r.id}">Cancel</button>` : ''}</div></div>`).join('') || '<p class="lead">No requests yet. Use Request time off above.</p>');
}

$('offPanel').onclick = async e => {
  const a = e.target.dataset.a, id = e.target.dataset.id; if (!a) return;
  const { error } = a === 'cancel' ? await db.from('time_off_requests').delete().eq('id', id) : await db.rpc('decide_time_off', { p_id: id, p_status: a });
  if (error) alert('That did not work: ' + error.message);
  loadCal();
};
$('calTabs').onclick = e => { const b = e.target.closest('button'); if (b) { calTab = b.dataset.t; if (calTab === 'all') calStudio = ''; else if (!calStudio) calStudio = ME.location_id || ''; loadCal(); } };
$('prevM').onclick = () => { calMonth.setMonth(calMonth.getMonth() - 1); drawCal(); };
$('nextM').onclick = () => { calMonth.setMonth(calMonth.getMonth() + 1); drawCal(); };
$('calStudio').onchange = e => { calStudio = e.target.value; drawCal(); };
$('calAdd').onclick = () => calTab === 'off' ? (location.hash = '#timeoff') : eventForm();
$('calToday').onclick = () => { calMonth = new Date(); calMonth.setDate(1); drawCal(); };
async function showCel(id) { if (!people.length) await loadPeople(); openCard(id); }
function quickAdd(day) {
  if (calTab === 'off') { location.hash = '#timeoff'; return; }
  if (calTab === 'cel' || ME.role === 'staff') return;
  eventForm({ event_date: day });
}
$('cal').onclick = e => { const b = e.target.closest('[data-ev]'), o = e.target.closest('[data-off]'), c = e.target.closest('[data-cel]'); if (b) showEv(b.dataset.ev); else if (o) showOff(o.dataset.off); else if (c) showCel(c.dataset.cel); else { const cell = e.target.closest('[data-day]'); if (cell) quickAdd(cell.dataset.day); } };
