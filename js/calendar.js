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
  await loadToAct(); drawCal();
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
const isHalf = ev => /^half day\b/i.test(ev.title || '');   // studio open shorter hours that day
const isMeeting = ev => /^meeting\s*:/i.test(ev.title || '');   // meetings are events whose title starts with "Meeting:"
const bareTitle = t => (t || '').replace(/^(closed|half day|meeting)\s*:\s*/i, '');
// Times look the same however they were typed: "1pm", "1:00pm", "1:00 p.m." all show as "1:00 PM"
const tFmt = t => String(t || '').replace(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\b\.?/gi, (_, h, m, ap) => `${+h}:${m || '00'} ${ap.toUpperCase()}M`)
  .replace(/\b(\d{1,2}):(\d{2})\s*-\s*(?=\d{1,2}(:\d{2})? [AP]M)/g, '$1:$2 \u2013 ').replace(/([AP]M)\s*-\s*/g, '$1 \u2013 ').replace(/\s+-\s+/g, ' \u2013 ');
const fmtLong = d => new Date(d + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
// Major US holidays for a year (fixed dates plus Memorial Day, Labor Day, Thanksgiving)
function holidays(y) {
  const nth = (m, wd, n) => { const d = new Date(y, m, 1); d.setDate(1 + ((wd - d.getDay() + 7) % 7) + 7 * (n - 1)); return ymd(d); };
  const last = (m, wd) => { const d = new Date(y, m + 1, 0); d.setDate(d.getDate() - ((d.getDay() - wd + 7) % 7)); return ymd(d); };
  return [[`${y}-01-01`, 'New Year’s Day'], [last(4, 1), 'Memorial Day'], [`${y}-07-04`, 'Independence Day'], [nth(8, 1, 1), 'Labor Day'], [nth(10, 4, 4), 'Thanksgiving'], [`${y}-12-24`, 'Christmas Eve'], [`${y}-12-25`, 'Christmas Day'], [`${y}-12-31`, 'New Year’s Eve']];
}
// Double approval: toAct holds the pending requests this person still needs to sign off on
// (from the database). If that lookup isn't set up yet, fall back to the old owner/manager rule.
let toAct = null;
async function loadToAct() {
  if (!ME || ME.role === 'staff') { toAct = new Set(); return; }
  const { data, error } = await db.rpc('time_off_to_act');
  toAct = error ? null : new Set((data || []).map(x => x && typeof x === 'object' ? Object.values(x)[0] : x));
}
const canDecide = o => o.status === 'pending' && (toAct ? toAct.has(o.id)
  : (ME.role === 'owner' || (ME.role === 'manager' && (o.location_id || (typeof reqLoc === 'function' ? reqLoc(o) : null)) === ME.location_id && o.user_id !== ME.id)));
// Other people at the same studio who are out (or asking to be) during the same days
const clashes = o => offs.filter(x => x.id !== o.id && x.user_id !== o.user_id && x.location_id === o.location_id && x.start_date <= o.end_date && x.end_date >= o.start_date);

// Everything on the calendar between two dates, as spans with a start and end day
function calItems(from, to) {
  const sf = x => !calStudio || x.location_id === calStudio, ov = (s, e) => s <= to && e >= from, out = [];
  if (calTab === 'all' || calTab === 'events' || calTab === 'meet') {
    events.filter(x => ov(x.event_date, x.ends_on || x.event_date) && (!x.location_id || sf(x)) && (calTab === 'all' || (calTab === 'meet') === isMeeting(x))).forEach(x => out.push({ s: x.event_date, e: x.ends_on || x.event_date,
      t: (x.time_label ? tFmt(x.time_label) + ' ' : '') + (x.location_id && !calStudio ? studio(x.location_id) + ': ' : '') + (isMeeting(x) ? bareTitle(x.title) : x.title), k: isMeeting(x) ? 'mt' : isClosed(x) ? 'closed' : isHalf(x) ? 'half' : x.location_id ? 'es' : 'ea', id: x.id }));
  }
  if (calTab === 'all' || calTab === 'events') {
    const closedOn = d => events.some(x => isClosed(x) && x.event_date <= d && (x.ends_on || x.event_date) >= d && (!x.location_id || sf(x)));   // you're closed that day: the closure shows, not the holiday too
    for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) holidays(y).filter(([d]) => d >= from && d <= to && !closedOn(d)).forEach(([d, t]) => out.push({ s: d, e: d, t, k: 'hol' }));
  }
  if (calTab === 'all' || calTab === 'off') offs.filter(o => ov(o.start_date, o.end_date) && sf(o)).forEach(o => out.push({ s: o.start_date, e: o.end_date, t: o.full_name + ' out', k: o.status === 'pending' ? 'pend' : 'off', oid: o.id, o }));
  if (calTab === 'all' || calTab === 'cel') for (let d = from; d <= to; d = addD(d, 1)) celItems(d, sf).forEach(c => out.push({ s: d, e: d, t: c.t, k: 'cel', pid: c.pid }));
  const rank = { closed: 0, half: 0.5, hol: 1, mt: 1.5, ea: 2, es: 3, off: 4, pend: 5, cel: 6 };
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
  $('calAdd').textContent = { all: 'Add event', events: 'Add event', meet: 'Add meeting', off: 'Request time off', cel: '' }[calTab];
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
    const halfDays = new Set(items.filter(x => x.k === 'half').flatMap(x => keys.filter(k => k >= x.s && k <= x.e)));
    const L = Math.max(lanes.length, 2);
    h += `<div class="wk" style="grid-template-rows:2rem repeat(${L}, 1.55rem) minmax(.8rem, 1fr)">` +
      days.map((d, i) => { const k = keys[i], cov = coverage(k);
        return `<div class="cd${d.getMonth() !== m ? ' out' : ''}${k === today ? ' today' : ''}${i === 0 || i === 6 ? ' wkend' : ''}${closedDays.has(k) ? ' closed' : halfDays.has(k) ? ' half' : ''}" style="grid-column:${i + 1}" data-day="${k}"><span class="cdn">${d.getDate()}</span>` +
          (cov && calTab !== 'cel' && calTab !== 'events' && calTab !== 'meet' ? `<span class="cov" title="${esc(studio(cov.loc))}: ${esc(cov.names.join(', '))}">${cov.n} out</span>` : '') + '</div>'; }).join('') +
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
  const when = fmt(ev.event_date) + (ev.ends_on ? ' \u2013 ' + fmt(ev.ends_on) : '') + (ev.time_label ? ' \u2022 ' + tFmt(ev.time_label) : '') + (ev.series_id ? ' \u2022 \u21BB ' + (ev.repeat_rule || 'Repeats') : '');
  const link = t => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  $('dlgBody').innerHTML = `${isMeeting(ev) ? '<span class="pill mtpill">Meeting</span>' : ''}<h2>${esc(isMeeting(ev) ? bareTitle(ev.title) : ev.title)}</h2><p class="lead" style="margin:.25rem 0 1rem">${esc(when)} \u2022 ${esc(ev.location_id ? studio(ev.location_id) : 'All of Austin')}</p>
    <p style="white-space:pre-wrap">${link(ev.notes || '')}</p>
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

// ----- repeating events: saved as one row per date, sharing a series_id -----
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const WDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], NTH = ['1st', '2nd', '3rd', '4th', '5th'];
const repOpts = d => { if (!d) return [['w1', 'Every week'], ['w2', 'Every 2 weeks'], ['mn', 'Every month (same weekday)'], ['md', 'Every month (same date)'], ['wd', 'Every weekday (Mon\u2013Fri)']];
  const x = new Date(d + 'T00:00'), wd = WDAY[x.getDay()], n = Math.floor((x.getDate() - 1) / 7);
  return [['w1', `Every week on ${wd}`], ['w2', `Every 2 weeks on ${wd}`], ['mn', `Every month on the ${n >= 4 ? 'last' : NTH[n]} ${wd}`], ['md', `Every month on the ${ord(x.getDate())}`], ['wd', 'Every weekday (Mon\u2013Fri)']]; };
function repDates(start, rule, until) {
  const out = [], s = new Date(start + 'T00:00'), n = Math.floor((s.getDate() - 1) / 7), wd = s.getDay();
  for (let i = 0, d = start; d <= until && out.length < 120 && i < 800; i++) {
    if (rule === 'w1' || rule === 'w2') d = addD(start, i * (rule === 'w1' ? 7 : 14));
    else if (rule === 'wd') { d = addD(start, i); const k = new Date(d + 'T00:00').getDay(); if (d <= until && (k === 0 || k === 6)) continue; }
    else { const m = new Date(s.getFullYear(), s.getMonth() + i, 1);
      const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      if (rule === 'md') d = ymd(new Date(m.getFullYear(), m.getMonth(), Math.min(s.getDate(), last)));   // the 31st becomes the last day in shorter months
      else { let f = 1 + ((wd - m.getDay() + 7) % 7) + 7 * Math.min(n, 3); if (n >= 4) while (f + 7 <= last) f += 7;   // a 5th weekday repeats as the last one
        d = ymd(new Date(m.getFullYear(), m.getMonth(), f)); } }
    if (d <= until) out.push(d);
  }
  return out;
}

function eventForm(ev) {
  ev = ev || {};
  const mt = ev.title ? isMeeting(ev) : (ev.meeting || calTab === 'meet');
  const loc = ev.id ? ev.location_id : ((!calStudio && ME.role === 'owner') ? '' : (calStudio || ME.location_id));
  $('dlgBody').innerHTML = `<h2 id="eH">${ev.id ? 'Edit' : 'New'} ${mt ? 'meeting' : 'event'}</h2>
    <label>Type <select id="eK"><option value="event">Event</option><option value="meeting" ${mt ? 'selected' : ''}>Meeting</option></select></label>
    <label>Title <input id="eT" maxlength="100" value="${esc(bareTitle(ev.title))}" placeholder="${mt ? 'Managers meeting' : ''}"></label>
    <label>Date <input id="eD" type="date" value="${esc(ev.event_date)}"></label>
    <label>End date (optional) <input id="eE" type="date" value="${esc(ev.ends_on)}"></label>
    ${ev.id ? (ev.series_id ? `<p class="muted evrep">\u21BB Repeats${ev.repeat_rule ? ': ' + esc(ev.repeat_rule.toLowerCase()) : ''}</p>` : '')
      : `<div class="grid2"><label>Repeat <select id="eR"><option value="">Does not repeat</option>${repOpts(ev.event_date).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label id="eUw" hidden>Until <input id="eU" type="date" value="${esc(ev.event_date ? addD(ev.event_date, 91) : '')}"></label></div>`}
    <label id="eCw"${mt ? ' hidden' : ''}>Studio hours <select id="eC"><option value="">Open as usual</option><option value="half" ${ev.title && isHalf(ev) ? 'selected' : ''}>Half day (shorter hours)</option><option value="closed" ${ev.title && isClosed(ev) ? 'selected' : ''}>Closed all day</option></select></label>
    <label><span id="eTmL">${ev.title && isHalf(ev) ? 'Hours that day' : 'Time (optional)'}</span> <input id="eTm" maxlength="30" placeholder="${ev.title && isHalf(ev) ? '9 AM - 1 PM' : mt ? '10:00 AM - 11:00 AM' : '6:00 PM'}" value="${esc(ev.time_label)}"></label>
    ${ME.role === 'owner' ? `<label>Where <select id="eL"><option value="">All of Austin</option>${locs.map(x => `<option value="${x.id}" ${x.id === loc ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
    <label><span id="eNL">${mt ? 'Agenda, who should come, Zoom or Meet link' : 'Details'}</span> <textarea id="eN" maxlength="1500" rows="4">${esc(ev.notes)}</textarea></label>
    <div id="cErr" role="alert" style="color:var(--danger)"></div>
    <div class="acts">${ev.series_id ? `<button data-act="saveEv" data-id="${ev.id}">Save this date</button><button data-act="saveEv" data-all="1" data-id="${ev.id}">Save this and later dates</button>
        <button class="quiet" data-act="delEv" data-id="${ev.id}">Delete this date</button><button class="quiet" data-act="delEv" data-all="1" data-id="${ev.id}">Delete this and later</button>`
      : `<button data-act="saveEv" data-id="${ev.id || ''}">Save</button>${ev.id ? `<button class="quiet" data-act="delEv" data-id="${ev.id}">Delete</button>` : ''}`}<button class="quiet" data-act="close">Cancel</button></div>`;
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
  else if (a === 'delEv') {
    const ev = events.find(x => x.id === id), all = e.target.dataset.all && ev && ev.series_id;
    if (all && !confirm(`Delete "${bareTitle(ev.title)}" on ${fmt(ev.event_date)} and every later date in the series?`)) return;
    const { error } = all ? await db.from('events').delete().eq('series_id', ev.series_id).gte('event_date', ev.event_date) : await db.from('events').delete().eq('id', id);
    if (error) return fail('Could not delete.'); $('dlg').close(); loadCal(); }
  else if (a === 'saveEv') {
    const t0 = bareTitle($('eT').value.trim()), mtg = $('eK').value === 'meeting', hrs = mtg ? '' : $('eC').value, row = { title: !t0 ? t0 : mtg ? 'Meeting: ' + t0 : hrs === 'closed' ? 'Closed: ' + t0 : hrs === 'half' ? 'Half day: ' + t0 : t0, event_date: $('eD').value, ends_on: $('eE').value || null, time_label: tFmt($('eTm').value.trim()) || null, notes: $('eN').value.trim() || null,
      location_id: ME.role === 'owner' ? ($('eL').value || null) : ME.location_id };
    if (!row.title || !row.event_date) return fail('Add a title and a date.');
    if (row.ends_on && row.ends_on < row.event_date) return fail('The end date is before the start date.');
    const ev = id ? events.find(x => x.id === id) : null, all = e.target.dataset.all && ev && ev.series_id, rule = !id && $('eR') ? $('eR').value : '';
    let error;
    if (all) {   // this date (with any date change) plus the same title, time, place and details on every later date
      const { event_date, ends_on, ...rest } = row;
      ({ error } = await db.from('events').update(row).eq('id', id));
      if (!error) ({ error } = await db.from('events').update(rest).eq('series_id', ev.series_id).gt('event_date', ev.event_date));
    } else if (rule) {
      const until = $('eU').value; if (!until || until < row.event_date) return fail('Pick when the repeating stops.');
      const ds = repDates(row.event_date, rule, until), len = row.ends_on ? Math.round((new Date(row.ends_on + 'T00:00') - new Date(row.event_date + 'T00:00')) / DAY) : null;
      if (ds.length < 2) return fail('That only makes one date. Pick a later Until date.');
      const sid = crypto.randomUUID(), lbl = (repOpts(row.event_date).find(x => x[0] === rule) || [])[1] || null;
      ({ error } = await db.from('events').insert(ds.map(d => ({ ...row, event_date: d, ends_on: len !== null ? addD(d, len) : null, series_id: sid, repeat_rule: lbl, created_by: ME.id }))));
      if (error && /series_id|repeat_rule|column/i.test(error.message)) return fail('Repeating events need a one-time setup: run sql/events_repeat.sql in Supabase, then try again.');
      if (!error) toast(`Added ${ds.length} dates`);
    } else ({ error } = id ? await db.from('events').update(row).eq('id', id) : await db.from('events').insert({ ...row, created_by: ME.id }));
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
    '<h2>My requests</h2>' + (mine.map(r => `<div class="req"><div>${line(r)}</div><div>${esc(r.status)}${r.status === 'pending' ? ` <button class="quiet" data-a="cancel" data-id="${r.id}">Cancel</button>` : ''}</div></div>`).join('') || '<p class="lead empty none">No requests yet. Use Request time off above.</p>');
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

// Event form: relabel the time box when Half day is picked
document.addEventListener('change', e => {
  if (e.target.id === 'eR') { $('eUw').hidden = !e.target.value; if (e.target.value && !$('eU').value && $('eD').value) $('eU').value = addD($('eD').value, 91); return; }
  if (e.target.id === 'eD' && $('eR')) { const v = $('eR').value; $('eR').innerHTML = '<option value="">Does not repeat</option>' + repOpts(e.target.value).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join(''); if (e.target.value && (!$('eU').value || $('eU').value < e.target.value)) $('eU').value = addD(e.target.value, 91); return; }
});
document.addEventListener('change', e => { if (e.target.id !== 'eK') return; const m = e.target.value === 'meeting';
  $('eCw').hidden = m; if (m) $('eC').value = ''; $('eNL').textContent = m ? 'Agenda, who should come, Zoom or Meet link' : 'Details';
  $('eH').textContent = $('eH').textContent.replace(/meeting|event/, m ? 'meeting' : 'event'); $('eTm').placeholder = m ? '10:00 AM - 11:00 AM' : '6:00 PM'; });
document.addEventListener('change', e => { if (e.target.id !== 'eC') return; const h = e.target.value === 'half';
  $('eTmL').textContent = h ? 'Hours that day' : 'Time (optional)'; $('eTm').placeholder = h ? '9 AM - 1 PM' : '6:00 PM'; });
