// ---------- Calendar ----------
let calTab = 'all', calMonth = new Date(), calStudio = null, events = [], offs = [], roster = [];
let calMode = (() => { try { return localStorage.getItem('calMode') || (innerWidth < 760 ? 'list' : 'month'); } catch (_) { return innerWidth < 760 ? 'list' : 'month'; } })();
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

// ----- helpers -----
const addD = (d, n) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + n); return ymd(x); };
const isClosed = ev => /^closed\b/i.test(ev.title || '');
const fmtLong = d => new Date(d + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
// Major US holidays for a year (fixed dates plus Memorial Day, Labor Day, Thanksgiving)
function holidays(y) {
  const nth = (m, wd, n) => { const d = new Date(y, m, 1); d.setDate(1 + ((wd - d.getDay() + 7) % 7) + 7 * (n - 1)); return ymd(d); };
  const last = (m, wd) => { const d = new Date(y, m + 1, 0); d.setDate(d.getDate() - ((d.getDay() - wd + 7) % 7)); return ymd(d); };
  return [[`${y}-01-01`, 'New Year’s Day'], [last(4, 1), 'Memorial Day'], [`${y}-07-04`, 'Independence Day'], [nth(8, 1, 1), 'Labor Day'], [nth(10, 4, 4), 'Thanksgiving'], [`${y}-12-24`, 'Christmas Eve'], [`${y}-12-25`, 'Christmas Day'], [`${y}-12-31`, 'New Year’s Eve']];
}
const canDecide = o => o.status === 'pending' && (ME.role === 'owner' || (ME.role === 'manager' && o.location_id === ME.location_id && o.user_id !== ME.id));
// Other people at the same studio who are out (or asking to be) during the same days
const clashes = o => offs.filter(x => x.id !== o.id && x.user_id !== o.user_id && x.location_id === o.location_id && x.start_date <= o.end_date && x.end_date >= o.start_date);

// Everything on the calendar between two dates, as spans with a start and end day
function calItems(from, to) {
  const sf = x => !calStudio || x.location_id === calStudio, ov = (s, e) => s <= to && e >= from, out = [];
  if (calTab === 'all' || calTab === 'events') {
    events.filter(x => ov(x.event_date, x.ends_on || x.event_date) && (!x.location_id || sf(x))).forEach(x => out.push({ s: x.event_date, e: x.ends_on || x.event_date,
      t: (x.time_label ? x.time_label + ' ' : '') + (x.location_id && !calStudio ? studio(x.location_id) + ': ' : '') + x.title, k: isClosed(x) ? 'closed' : x.location_id ? 'es' : 'ea', id: x.id }));
    for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) holidays(y).filter(([d]) => d >= from && d <= to).forEach(([d, t]) => out.push({ s: d, e: d, t, k: 'hol' }));
  }
  if (calTab === 'all' || calTab === 'off') offs.filter(o => ov(o.start_date, o.end_date) && sf(o)).forEach(o => out.push({ s: o.start_date, e: o.end_date, t: o.full_name + ' out', k: o.status === 'pending' ? 'pend' : 'off', oid: o.id, o }));
  if (calTab === 'all' || calTab === 'cel') for (let d = from; d <= to; d = addD(d, 1)) celItems(d, sf).forEach(c => out.push({ s: d, e: d, t: c.t, k: 'cel', pid: c.pid }));
  const rank = { closed: 0, hol: 1, ea: 2, es: 3, off: 4, pend: 5, cel: 6 };
  return out.sort((a, b) => a.s < b.s ? -1 : a.s > b.s ? 1 : (b.e > a.e) - (a.e > b.e) || rank[a.k] - rank[b.k]);
}
// How many people are out per studio on a day; returns the busiest studio
function coverage(d) {
  const by = {};
  offs.filter(o => d >= o.start_date && d <= o.end_date && (!calStudio || o.location_id === calStudio)).forEach(o => (by[o.location_id] = by[o.location_id] || []).push(o.full_name));
  const top = Object.entries(by).sort((a, b) => b[1].length - a[1].length)[0];
  return top && top[1].length >= 2 ? { n: top[1].length, loc: top[0], names: top[1] } : null;
}
const attrs = x => `${x.id ? `data-ev="${x.id}"` : ''} ${x.oid ? `data-off="${x.oid}"` : ''} ${x.pid ? `data-cel="${x.pid}"` : ''}`;

function drawCal() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth(), today = ymd(new Date());
  $('monthLbl').textContent = calMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  document.querySelectorAll('#calTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === calTab));
  document.querySelectorAll('#calViewTabs button').forEach(b => b.classList.toggle('on', b.dataset.v === calMode));
  $('calStudio').hidden = false;
  $('calStudio').innerHTML = '<option value="">All studios</option>' + locs.map(x => `<option value="${x.id}" ${x.id === calStudio ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  const canAdd = calTab === 'cel' ? false : calTab === 'off' ? true : ME.role !== 'staff';
  $('calAdd').hidden = !canAdd;
  $('calLegend').hidden = calTab !== 'all' || calMode === 'list';
  $('calAdd').textContent = { all: 'Add event', events: 'Add event', off: 'Request time off', cel: '' }[calTab];
  $('calNote').textContent = calTab === 'cel' ? 'Pulled automatically from each person’s Birthday and Start date on their team card.' : '';
  $('calGridWrap').hidden = calMode === 'list';
  $('calLayout').classList.toggle('list', calMode === 'list');
  // Month grid: one row per week; multi-day items are drawn as a single bar across the days
  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay()), weeks = new Date(y, m + 1, 0).getDate() + new Date(y, m, 1).getDay() > 35 ? 6 : 5;
  let h = '<div class="calhead">' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(x => `<div>${x}</div>`).join('') + '</div>';
  for (let w = 0; w < weeks; w++) {
    const ws = new Date(start); ws.setDate(start.getDate() + 7 * w);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(ws.getDate() + i); return d; }), keys = days.map(ymd), from = keys[0], to = keys[6];
    const items = calItems(from, to), lanes = [];
    const placed = items.map(x => {
      const c1 = keys.indexOf(x.s < from ? from : x.s), c2 = keys.indexOf(x.e > to ? to : x.e);
      let lane = lanes.findIndex(end => end < c1); if (lane < 0) { lane = lanes.length; lanes.push(-1); } lanes[lane] = c2;
      return { ...x, c1, c2, lane, cl: x.s < from, cr: x.e > to };
    });
    const closedDays = new Set(items.filter(x => x.k === 'closed').flatMap(x => keys.filter(k => k >= x.s && k <= x.e)));
    const L = Math.max(lanes.length, 2);
    h += `<div class="wk" style="grid-template-rows:2rem repeat(${L}, 1.55rem) minmax(.8rem, 1fr)">` +
      days.map((d, i) => { const k = keys[i], cov = coverage(k);
        return `<div class="cd${d.getMonth() !== m ? ' out' : ''}${k === today ? ' today' : ''}${i === 0 || i === 6 ? ' wkend' : ''}${closedDays.has(k) ? ' closed' : ''}" style="grid-column:${i + 1}" data-day="${k}"><span class="cdn">${d.getDate()}</span>` +
          (cov && calTab !== 'cel' && calTab !== 'events' ? `<span class="cov" title="${esc(studio(cov.loc))}: ${esc(cov.names.join(', '))}">${cov.n} out</span>` : '') + '</div>'; }).join('') +
      placed.map(x => `<button class="cbar ${x.k}${x.cl ? ' cl' : ''}${x.cr ? ' cr' : ''}" style="grid-column:${x.c1 + 1} / ${x.c2 + 2};grid-row:${x.lane + 2}" ${attrs(x)} title="${esc(x.t)}">${esc(x.t)}${x.k === 'pend' ? ' <i>pending</i>' : ''}</button>`).join('') + '</div>';
  }
  $('cal').className = 'calm';
  $('cal').innerHTML = h;
  drawUpcoming();
}

// Upcoming list: next 14 days beside the month, or the whole month in List view
function drawUpcoming() {
  const today = ymd(new Date()), ms = ymd(calMonth), me = ymd(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0));
  const list = calMode === 'list', from = list ? (today > ms && today <= me ? today : ms) : today, to = list ? me : addD(today, 13);
  const items = calItems(from, to), byDay = {};
  items.forEach(x => { const d = x.s < from ? from : x.s; (byDay[d] = byDay[d] || []).push(x); });
  const covDays = []; for (let d = from; d <= to; d = addD(d, 1)) { const c = calTab === 'all' || calTab === 'off' ? coverage(d) : null; if (c) { (byDay[d] = byDay[d] || []); covDays.push(d); } }
  const label = d => d === today ? 'Today' : d === addD(today, 1) ? 'Tomorrow' : fmtLong(d);
  const span = x => x.e !== x.s ? ` <small>${x.k === 'off' || x.k === 'pend' ? 'until' : 'through'} ${fmt(x.e)}</small>` : '';
  const row = x => `<div class="up-item ${x.k}"><button class="up-main" ${attrs(x)}><i class="up-dot"></i><span>${esc(x.t)}${x.k === 'pend' ? ' <em>pending</em>' : ''}${span(x)}</span></button>` +
    (x.k === 'pend' && canDecide(x.o) ? `<span class="up-acts">${clashes(x.o).length ? `<small class="up-warn">Also out: ${esc(clashes(x.o).map(c => c.full_name.split(' ')[0]).join(', '))}</small>` : ''}<button class="sm" data-decide="approved" data-id="${x.oid}">Approve</button><button class="quiet sm" data-decide="denied" data-id="${x.oid}">Decline</button></span>` : '') + '</div>';
  const days = Object.keys(byDay).sort();
  $('calUp').innerHTML = `<h3>${list ? calMonth.toLocaleString('en-US', { month: 'long' }) + (from > ms ? ' from today' : '') : 'Next two weeks'}</h3>` +
    (days.length ? days.map(d => { const c = covDays.includes(d) ? coverage(d) : null;
      return `<div class="up-day"><div class="up-date">${label(d)}${c ? `<span class="cov" title="${esc(c.names.join(', '))}">${c.n} out at ${esc(studio(c.loc))}</span>` : ''}</div>${byDay[d].map(row).join('')}</div>`; }).join('')
      : `<p class="lead">Nothing on the calendar${list ? ' this month' : ' in the next two weeks'}.</p>`);
}

function showEv(id) {
  const ev = events.find(x => x.id === id); if (!ev) return;
  const when = fmt(ev.event_date) + (ev.ends_on ? ' \u2013 ' + fmt(ev.ends_on) : '') + (ev.time_label ? ' \u2022 ' + ev.time_label : '');
  $('dlgBody').innerHTML = `<h2>${esc(ev.title)}</h2><p class="lead" style="margin:.25rem 0 1rem">${esc(when)} \u2022 ${esc(ev.location_id ? studio(ev.location_id) : 'All of Austin')}</p>
    <p style="white-space:pre-wrap">${esc(ev.notes || '')}</p>
    <p><a class="gcal" target="_blank" rel="noopener" href="${gcalLink(ev)}">Add to my Google Calendar</a></p>
    <div class="acts">${canEdit(ev) ? `<button data-act="editEv" data-id="${id}">Edit</button>` : ''}<button class="quiet" data-act="close">Close</button></div>`;
  if (!$('dlg').open) $('dlg').showModal();
}

// Google Calendar "add event" link (all-day; end date is exclusive)
function gcalLink(ev) {
  const d = x => x.replace(/-/g, ''), end = addD(ev.ends_on || ev.event_date, 1);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates: d(ev.event_date) + '/' + d(end), details: [ev.time_label, ev.notes].filter(Boolean).join('\n'), location: ev.location_id ? 'Stretch Zone ' + studio(ev.location_id) : 'Stretch Zone Austin' });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

function eventForm(ev) {
  ev = ev || {};
  const loc = ev.id ? ev.location_id : ((!calStudio && ME.role === 'owner') ? '' : (calStudio || ME.location_id));
  $('dlgBody').innerHTML = `<h2>${ev.id ? 'Edit event' : 'New event'}</h2>
    <label>Title <input id="eT" maxlength="100" value="${esc((ev.title || '').replace(/^closed:\s*/i, ''))}"></label>
    <label>Date <input id="eD" type="date" value="${esc(ev.event_date)}"></label>
    <label>End date (optional) <input id="eE" type="date" value="${esc(ev.ends_on)}"></label>
    <label>Time (optional) <input id="eTm" maxlength="30" placeholder="6:00 PM" value="${esc(ev.time_label)}"></label>
    ${ME.role === 'owner' ? `<label>Where <select id="eL"><option value="">All of Austin</option>${locs.map(x => `<option value="${x.id}" ${x.id === loc ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
    <label>Details <textarea id="eN" maxlength="600">${esc(ev.notes)}</textarea></label>
    <label class="chkline"><input type="checkbox" id="eC" ${ev.title && isClosed(ev) ? 'checked' : ''}> Studio closed (shades the day on the calendar)</label>
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
    const t0 = $('eT').value.trim().replace(/^closed:\s*/i, ''), row = { title: $('eC').checked && t0 ? (/^closed\b/i.test(t0) ? t0 : 'Closed: ' + t0) : t0, event_date: $('eD').value, ends_on: $('eE').value || null, time_label: $('eTm').value.trim() || null, notes: $('eN').value.trim() || null,
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
$('calViewTabs').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; calMode = b.dataset.v; try { localStorage.setItem('calMode', calMode); } catch (_) {} drawCal(); };
$('calUp').onclick = async e => {
  const dc = e.target.closest('[data-decide]');
  if (dc) {
    dc.disabled = true;
    const { error } = await db.rpc('decide_time_off', { p_id: dc.dataset.id, p_status: dc.dataset.decide });
    if (error) { dc.disabled = false; alert('That did not work: ' + error.message); return; }
    toast(dc.dataset.decide === 'approved' ? 'Approved' : 'Declined'); loadCal(); if (typeof timeOffBadge === 'function') timeOffBadge(); return;
  }
  const b = e.target.closest('[data-ev]'), o = e.target.closest('[data-off]'), c = e.target.closest('[data-cel]');
  if (b) showEv(b.dataset.ev); else if (o) showOff(o.dataset.off); else if (c) showCel(c.dataset.cel);
};
async function showCel(id) { if (!people.length) await loadPeople(); openCard(id); }
function quickAdd(day) {
  if (calTab === 'off') { location.hash = '#timeoff'; return; }
  if (calTab === 'cel' || ME.role === 'staff') return;
  eventForm({ event_date: day });
}
$('cal').onclick = e => { const b = e.target.closest('[data-ev]'), o = e.target.closest('[data-off]'), c = e.target.closest('[data-cel]'); if (b) showEv(b.dataset.ev); else if (o) showOff(o.dataset.off); else if (c) showCel(c.dataset.cel); else { const cell = e.target.closest('[data-day]'); if (cell) quickAdd(cell.dataset.day); } };
