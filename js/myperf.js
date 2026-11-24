// ---------- My performance: your clocked-in time, stretching, open time, contacts and daily tasks ----------
// Data: staff_daily (ClubReady Staff Utilization + Time Clock Payroll, one row per person per day, loaded by the bot),
// staff_contacts_daily (Contact Log counts per person per day) and the portal's own task checklists.
// Everyone sees their own; owners can pick anyone, managers anyone at their studio. No ratings or rankings.
const MP = { range: 'week', uid: null, people: null, chart: null };
const MP_RATE = 5;   // contacts expected per open hour (clocked in but not stretching)
const MP_RANGES = [['week', 'This week'], ['lastweek', 'Last week'], ['month', 'This month'], ['lastmonth', 'Last month']];
const mpDay = d => ymd(d), mpAdd = (d, n) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + n); return ymd(x); };
const mpMon = d => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };
function mpSpan() {
  const t = ymd(new Date()), y = mpAdd(t, -1);   // numbers come in each morning for the day before
  if (MP.range === 'week') { const f = mpMon(t); return { from: f, to: y < f ? f : y, label: 'This week' }; }
  if (MP.range === 'lastweek') { const f = mpAdd(mpMon(t), -7); return { from: f, to: mpAdd(f, 6), label: 'Last week' }; }
  if (MP.range === 'month') { const f = t.slice(0, 8) + '01'; return { from: f, to: y < f ? f : y, label: 'This month' }; }
  const lm = new Date(+t.slice(0, 4), +t.slice(5, 7) - 2, 1), f = ymd(lm); return { from: f, to: ymd(new Date(lm.getFullYear(), lm.getMonth() + 1, 0)), label: 'Last month' };
}
// Is this ClubReady name this person? Their ClubReady name if set, else the same name, else same first name + last initial
// ("Dorothy E" for Dorothy Elemento) at their studio.
const mpNorm = s => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
function mpIsMe(p, name, sid) {
  const n = mpNorm(name); if (!n) return false;
  const cr = mpNorm(p.clubready_name), fn = mpNorm(p.full_name);
  if (cr) return n === cr;
  if (n === fn) return true;
  const a = fn.split(' '), b = n.split(' ');
  return a.length > 1 && b.length > 1 && a[0] === b[0] && b[b.length - 1][0] === a[a.length - 1][0] && (!p.location_id || !sid || String(p.location_id) === String(sid));
}
const mpMins = v => { if (v === null || v === undefined || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,\s]/g, '')); return isNaN(n) ? null : n; };
const mpCol = (data, re) => { if (!data) return null; const k = Object.keys(data).find(x => re.test(x)); return k ? mpMins(data[k]) : null; };
const mpH = m => m === null || m === undefined ? '–' : (Math.round(m / 6) / 10).toFixed(1).replace(/\.0$/, '');   // minutes -> hours, 1 decimal

async function loadMyPerf() {
  if (!MP.uid) MP.uid = ME.id;
  if (!MP.people) {
    const { data } = await db.from('profiles').select('id,full_name,location_id,role,clubready_name').order('full_name');
    const all = (data || []).filter(p => !/\bbot\b/i.test(p.full_name || ''));
    MP.people = ME.role === 'owner' ? all : ME.role === 'manager' ? all.filter(p => p.id === ME.id || p.location_id === ME.location_id) : all.filter(p => p.id === ME.id);
    if (!MP.people.some(p => p.id === ME.id)) MP.people.unshift({ id: ME.id, full_name: ME.full_name, location_id: ME.location_id, role: ME.role, clubready_name: ME.clubready_name });
  }
  drawMpBar(); $('mpBody').innerHTML = '<p class="lead loading">Loading…</p>';
  const S = mpSpan(), p = MP.people.find(x => x.id === MP.uid) || MP.people[0];
  const [sd, sc, pp, ck] = await Promise.all([
    db.from('staff_daily').select('studio_id,day,staff_key,staff_name,util,data,clock_minutes').gte('day', S.from).lte('day', S.to).limit(5000),
    db.from('staff_contacts_daily').select('studio_id,day,staff_name,kind,n,made').gte('day', S.from).lte('day', S.to).limit(10000),
    db.from('profile_positions').select('position_id').eq('user_id', p.id),
    db.from('task_checks').select('template_id,check_date').eq('user_id', p.id).gte('check_date', S.from).lte('check_date', S.to).limit(5000)]);
  if (sd.error && /relation|does not exist|schema cache/i.test(sd.error.message)) { $('mpBody').innerHTML = '<p class="lead">My performance needs a one-time setup: run <b>sql/staff_daily.sql</b> in Supabase.</p>'; return; }
  // Daily tasks this person has (weekly and monthly ones are on the Tasks page)
  const mine = new Set((pp.data || []).map(x => x.position_id));
  let daily = typeof templates !== 'undefined' && templates.length ? templates.filter(t => mine.has(t.position_id) && (t.frequency || 'daily') === 'daily') : null;
  if (!daily) { const { data } = mine.size ? await db.from('task_templates').select('id,position_id,frequency').eq('active', true).in('position_id', [...mine]) : { data: [] }; daily = (data || []).filter(t => (t.frequency || 'daily') === 'daily'); }
  const dailyIds = new Set(daily.map(t => t.id));
  // One line per day
  const days = []; for (let d = S.from; d <= S.to; d = mpAdd(d, 1)) days.push({ d, clock: null, stretch: null, contacts: 0, made: 0, tasks: 0, staffed: false });
  const at = d => days.find(x => x.d === d);
  (sd.data || []).filter(r => mpIsMe(p, r.staff_name, r.studio_id)).forEach(r => {
    const x = at(r.day); if (!x) return;
    const clock = r.clock_minutes ?? mpCol(r.data, /^clocked\s*in\s*minutes$/i), svc = mpCol(r.data, /^services\s*provided\s*minutes$/i);
    if (clock !== null) x.clock = (x.clock || 0) + clock; if (svc !== null) x.stretch = (x.stretch || 0) + svc;
  });
  (sc.data || []).filter(r => mpIsMe(p, r.staff_name, r.studio_id)).forEach(r => { const x = at(r.day); if (x) { x.contacts += r.n || 0; x.made += r.made || 0; } });
  (ck.data || []).filter(c => dailyIds.has(c.template_id)).forEach(c => { const x = at(c.check_date); if (x) x.tasks++; });
  days.forEach(x => {
    x.worked = (x.clock || 0) > 0 || x.tasks > 0;
    x.open = x.clock !== null ? Math.max(0, x.clock - (x.stretch || 0)) : null;
    x.goal = x.open !== null ? Math.round(x.open / 60 * MP_RATE) : null;
    x.assigned = x.worked ? dailyIds.size : 0;
  });
  MP.data = { S, p, days, nTasks: dailyIds.size, matched: (sd.data || []).some(r => mpIsMe(p, r.staff_name, r.studio_id)) };
  drawMyPerf();
}

function drawMpBar() {
  const pick = MP.people && MP.people.length > 1 ? `<select id="mpWho" aria-label="Person">${MP.people.map(p => `<option value="${p.id}" ${p.id === MP.uid ? 'selected' : ''}>${esc(p.full_name || 'Unnamed')}${p.id === ME.id ? ' (you)' : ''}</option>`).join('')}</select>` : '';
  $('mpBar').innerHTML = `${pick}<span class="tabs toseg" role="group" aria-label="Time frame">${MP_RANGES.map(([k, l]) => `<button type="button" data-mpr="${k}" class="${MP.range === k ? 'on' : ''}">${l}</button>`).join('')}</span>`;
}

function drawMyPerf() {
  const { S, p, days, nTasks, matched } = MP.data, W = days.filter(x => x.worked);
  const sum = k => days.reduce((n, x) => n + (x[k] || 0), 0);
  const clock = sum('clock'), stretch = sum('stretch'), open = days.reduce((n, x) => n + (x.open || 0), 0), contacts = sum('contacts'), goal = sum('goal'), tasks = sum('tasks'), assigned = sum('assigned');
  const util = clock ? stretch / clock : null, cpct = goal ? contacts / goal : null, tpct = assigned ? Math.min(1, tasks / assigned) : null;
  const tile = (label, big, sub, cls) => `<div class="kt dlk ${cls || ''}"><span class="kn">${label}</span><b>${big}</b><span class="kdl">${sub}</span></div>`;
  const first = String(p.full_name || '').split(' ')[0], you = p.id === ME.id;
  const note = !matched ? `<p class="lead">No ClubReady hours found for ${you ? 'you' : esc(first)} in this time frame yet.${ME.role === 'owner' ? ` If ${you ? 'your' : 'their'} name is spelled differently in ClubReady, it needs to be linked once (profiles.clubready_name in Supabase).` : ''} Hours and stretching come in each morning for the day before.</p>` : '';
  const head = `<p class="lead mem-lead"><b>${esc(p.full_name || '')}</b> • ${S.label} (${fmt(S.from)} – ${fmt(S.to)}) • ${W.length} day${W.length === 1 ? '' : 's'} worked</p>`;
  const tiles = `<div class="kgrid kg4">` +
    tile('Clocked in', `${mpH(clock)} hrs`, `${W.length} day${W.length === 1 ? '' : 's'}`) +
    tile('Stretching', `${mpH(stretch)} hrs`, util !== null ? `<b>${Math.round(util * 100)}%</b> utilization` : 'utilization –') +
    tile('Contacts', `${contacts}`, goal ? `goal ~${goal} for ${mpH(open)} open hrs${cpct !== null ? ` • <b>${Math.round(cpct * 100)}%</b>` : ''}` : 'no open time on record', goal && contacts >= goal ? 'mpok' : '') +
    tile('Daily tasks', tpct !== null ? `${Math.round(tpct * 100)}%` : '–', assigned ? `${tasks} of ${assigned} done${nTasks ? ` • ${nTasks} a day` : ''}` : nTasks ? 'no work days yet' : 'no daily tasks assigned', tpct === 1 ? 'mpok' : '') + '</div>';
  const shown = days.filter(x => x.worked || x.clock !== null || x.contacts);
  const rows = shown.length ? `<div class="table-wrap"><table class="mt mpt"><thead><tr><th>Day</th><th>Clocked in</th><th>Stretching</th><th>Open time</th><th>Contacts</th><th>Daily tasks</th></tr></thead><tbody>${shown.map(x => {
      const lbl = new Date(x.d + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const c = x.goal ? `<span class="${x.contacts >= x.goal ? 'up' : 'dn'}">${x.contacts}</span> <span class="muted">of ~${x.goal}</span>` : `${x.contacts}`;
      const t = x.assigned ? `<span class="${x.tasks >= x.assigned ? 'up' : 'dn'}">${Math.min(x.tasks, x.assigned)} of ${x.assigned}</span>` : x.tasks ? `${x.tasks}` : '<span class="muted">–</span>';
      return `<tr><td><b>${lbl}</b></td><td>${x.clock !== null ? mpH(x.clock) + ' hrs' : '<span class="muted">–</span>'}</td><td>${x.stretch !== null ? mpH(x.stretch) + ' hrs' : '<span class="muted">–</span>'}${x.clock ? ` <span class="muted">${Math.round((x.stretch || 0) / x.clock * 100)}%</span>` : ''}</td><td>${x.open !== null ? mpH(x.open) + ' hrs' : '<span class="muted">–</span>'}</td><td>${c}</td><td>${t}</td></tr>`; }).join('')}</tbody></table></div>`
    : '<p class="lead empty">Nothing on record for this time frame yet.</p>';
  const chart = shown.length ? `<section class="scsec"><h3>Day by day <details class="dlinfo"><summary aria-label="How this works">ⓘ</summary><div>Each bar is the time clocked in that day, split into stretching (sessions given) and open time. The dots are contacts logged, next to a goal of about ${MP_RATE} for every open hour. Hours and contacts come from ClubReady each morning; daily tasks from the portal's checklists.</div></details></h3><div class="pcard mpchart"><canvas id="mpCanvas" height="220"></canvas></div></section>` : '';
  $('mpBody').innerHTML = head + note + tiles + chart + `<section class="scsec"><h3>Each day</h3>${rows}</section>`;
  if (MP.chart) { MP.chart.destroy(); MP.chart = null; }
  if (shown.length && typeof Chart !== 'undefined') {
    const L = shown.map(x => new Date(x.d + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })), h = m => m === null ? null : Math.round(m / 6) / 10;
    MP.chart = new Chart($('mpCanvas'), { data: { labels: L, datasets: [
      { type: 'bar', label: 'Stretching (hrs)', data: shown.map(x => h(x.stretch || 0)), backgroundColor: '#2f5f8f', stack: 'h', yAxisID: 'y' },
      { type: 'bar', label: 'Open time (hrs)', data: shown.map(x => h(x.open || 0)), backgroundColor: 'rgba(47,95,143,.28)', stack: 'h', yAxisID: 'y' },
      { type: 'line', label: 'Contacts', data: shown.map(x => x.contacts), borderColor: '#d9573f', backgroundColor: '#d9573f', showLine: false, pointRadius: 5, yAxisID: 'y2' },
      { type: 'line', label: 'Contact goal', data: shown.map(x => x.goal), borderColor: 'rgba(217,87,63,.55)', borderDash: [5, 4], pointRadius: 0, fill: false, yAxisID: 'y2' }] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' } },
        scales: { y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Hours' } }, y2: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'Contacts' } }, x: { stacked: true } } } });
  }
}

$('mpBar').addEventListener('click', e => { const b = e.target.closest('[data-mpr]'); if (b) { MP.range = b.dataset.mpr; loadMyPerf(); } });
$('mpBar').addEventListener('change', e => { if (e.target.id === 'mpWho') { MP.uid = e.target.value; loadMyPerf(); } });
