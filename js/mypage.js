// ---------- My page ----------
// Home: greeting, a "needs your attention" row, then tasks / time off / coming up.
let home = {};

async function loadHome() {
  loadAnnouncements();   // separate so a slow or missing table never holds up the rest
  const now = new Date(), td = todayStr(), mo = ymd(new Date(now.getFullYear(), now.getMonth(), 1)), in14 = ymd(new Date(now.getTime() + 14 * DAY)), in30 = ymd(new Date(now.getTime() + 30 * DAY));
  const lead = ME.role !== 'staff', loc = ME.role === 'owner' ? null : ME.location_id;
  const byLoc = q => loc ? q.eq('studio_id', loc) : q;
  const mgr = isMgrHome(), supOk = ME.role === 'owner' || (mgr && canPage('supplies'));
  const [ov, mine, ev, offs2, pend, sup, sitems, scounts, sthr, dprr, dir, pp, tpl, chk, msnap, nsnap, meta] = await Promise.all([
    db.rpc('task_scores', { p_month: mo, p_day: td, p_today: td }).then(r => r.error ? db.rpc('task_overview', { p_month: mo, p_today: td }) : r),
    db.from('time_off_requests').select('id,start_date,end_date,status').eq('user_id', ME.id).gte('end_date', td).in('status', ['pending', 'approved']).order('start_date').limit(3),
    db.from('events').select('*').or(`ends_on.gte.${td},event_date.gte.${td}`).lte('event_date', in30).order('event_date').limit(60),
    db.from('time_off_calendar').select('*').gte('end_date', td).lte('start_date', in30).order('start_date'),
    lead ? db.from('time_off_requests').select('id,user_id,status').eq('status', 'pending') : null,
    supOk ? byLoc(db.from('supply_requests').select('*, supply_items(name)')) : null,
    supOk ? db.from('supply_items').select('*').eq('active', true) : null,
    supOk ? byLoc(db.from('supply_counts').select('*')) : null,
    supOk ? byLoc(db.from('supply_thresholds').select('*')) : null,
    lead && canPage('dpr') ? db.from('daily_log').select('studio_id,day').gte('day', ymd(new Date(Date.now() - 30 * DAY))) : null,
    db.from('team_directory').select('id,full_name,location_id,birthday,start_date'),
    db.from('profile_positions').select('position_id').eq('user_id', ME.id),
    db.from('task_templates').select('*').eq('active', true).order('sort_order'),
    db.from('task_checks').select('template_id,check_date').eq('user_id', ME.id).gte('check_date', weekStart(td) < td.slice(0, 8) + '01' ? weekStart(td) : td.slice(0, 8) + '01').lte('check_date', addDays(weekStart(td), 6) > monthEnd(td) ? addDays(weekStart(td), 6) : monthEnd(td)),
    lead && canPage('members') ? byLoc(db.from('member_snapshot').select('studio_id,club_id,grp,frozen,next_due,next_booking,last_session').eq('grp', 'member')).limit(5000) : null,
    lead && canPage('members') ? byLoc(db.from('new_member_snapshot').select('*')).limit(2000) : null,
    lead && canPage('members') ? byLoc(db.from('snapshot_meta').select('*')) : null]);
  // Reuse the calendar's data so the "coming up" list matches the Calendar page
  await loadToAct();
  events = ev.data || []; offs = offs2.data || []; roster = dir.data || []; calTab = 'all'; calStudio = loc || '';
  // A task is done if it was checked off in its current period (today, this week or this month)
  const tpl0 = tpl.data || [], fOf = id => fq(tpl0.find(x => x.id === id) || {});
  (ov.data || []).forEach(x => { if (x.total !== undefined) { x.assigned = x.total; x.done_today = x.done_day; } });
  const myPos = new Set((pp.data || []).map(x => x.position_id)), done = new Set((chk.data || []).filter(c => { const [a, b] = periodOf({ frequency: fOf(c.template_id) }, td); return c.check_date >= a && c.check_date <= b; }).map(x => x.template_id));
  // Managers see their team's task progress: everyone at their studio except themselves
  // Work days (if set up) so people who are off today don't drag the team number down
  { const ws = await db.from('work_schedules').select('user_id,days'); sched = ws.error ? null : Object.fromEntries((ws.data || []).map(x => [x.user_id, x.days || []])); }
  const team0 = mgr ? (dir.data || []).filter(p => p.location_id === ME.location_id && p.id !== ME.id).map(p => ({ p, s: (ov.data || []).find(x => x.user_id === p.id) })).filter(x => x.s && x.s.assigned) : [];
  const team = team0.filter(x => worksOn(x.p.id, td)), teamOff = team0.filter(x => !worksOn(x.p.id, td)).map(x => x.p.full_name.split(' ')[0]);
  home = { team, teamOff, t: (ov.data || []).find(x => x.user_id === ME.id), mine: mine.data || [], pendIds: pend ? (pend.data || []).filter(r => toAct ? toAct.has(r.id) : (r.user_id !== ME.id || ME.role === 'owner')).map(r => r.id) : [],
    sup: sup ? (sup.data || []) : [], sitems: sitems ? (sitems.data || []) : [], counts: scounts ? (scounts.data || []) : [], thr: sthr ? (sthr.data || []) : [], dpr: dprr ? (dprr.error ? { error: true } : (dprr.data || [])) : null,
    tasks: (tpl.data || []).filter(x => myPos.has(x.position_id)), done, ms: msnap ? (msnap.data || []) : null, ns: nsnap ? (nsnap.data || []) : null, meta: meta ? (meta.data || []) : [] };
  drawHome();
}

// Managers with a studio get a team view on the home page instead of their own tasks and time off
const isMgrHome = () => ME.role === 'manager' && !!ME.location_id;

// Counts for the attention row, using the same rules as the Members page
function memberCounts() {
  const H = home; if (!H.ms) return null;
  const hasInvFor = sid => H.ms.some(r => r.studio_id === sid && r.next_due);
  const toCall = H.ms.filter(r => !r.frozen && !r.next_booking && (hasInvFor(r.studio_id) ? r.next_due && -daysAgo(r.next_due) <= 7 : false)).length;
  const notBookedAny = H.ms.filter(r => !r.frozen && !r.next_booking).length, anyInv = H.ms.some(r => r.next_due);
  const last = {}; H.ms.forEach(r => last[r.club_id] = r.last_session);
  const risk = (H.ns || []).filter(r => {
    const day = Math.max(1, daysAgo(r.signed_on) + 1); if (day > 30) return false;
    const dl = last[r.club_id] ? daysAgo(last[r.club_id]) : null, exp = r.plan_sessions ? r.plan_sessions * day / 30 : null;
    return nmHealth(r, day, dl, exp ? r.sessions_done / Math.max(exp, 1) : null).health === 'risk';
  }).length;
  const stale = H.meta.map(m => ({ sid: m.studio_id, n: daysAgo(m.as_of) })).filter(x => x.n > 7).sort((a, b) => b.n - a.n);
  return { toCall: anyInv ? toCall : notBookedAny, anyInv, risk, stale };
}

function drawHome() {
  const H = home, T = H.t, td = todayStr();
  const tile = (n, label, sub, href, cls) => `<a class="mtile hatile ${cls || ''}" href="${href}"><b>${n}</b>${label}${sub ? `<span>${sub}</span>` : ''}</a>`;
  // ---- needs your attention ----
  const tiles = [], mc = memberCounts();
  if (mc) {
    if (mc.stale.length) tiles.push(tile(mc.stale[0].n + ' days', 'Since ClubReady upload', esc(mc.stale.map(x => studio(x.sid)).slice(0, 3).join(', ')) + (ME.role === 'staff' ? '' : ' • upload new reports'), '#members', 'hot'));
  }
  if (H.pendIds.length) tiles.push(tile(H.pendIds.length, `Time-off request${H.pendIds.length === 1 ? '' : 's'} waiting`, 'approve below or on the calendar', '#calendar', 'warm'));
  if (H.dpr && !H.dpr.error) {
    // Studios whose numbers for yesterday aren't in the Daily log yet
    const yd = ymd(new Date(Date.now() - DAY)), have = new Set(H.dpr.filter(r => r.day === yd).map(r => r.studio_id));
    const miss = locs.filter(l => (ME.role === 'owner' || l.id === ME.location_id) && !have.has(l.id));
    if (miss.length) tiles.push(tile(miss.length, `Daily log${miss.length === 1 ? '' : 's'} missing`, esc(miss.map(l => l.name).slice(0, 3).join(', ')) + ' \u2022 yesterday', '#enter', 'hot'));
  }
  // supplies: compact list
  let supCard = '';
  if (ME.role === 'owner' || (isMgrHome() && canPage('supplies'))) {
    const own = ME.role === 'owner', sLocs = own ? locs : locs.filter(l => l.id === ME.location_id);
    const needs = H.sup.filter(r => r.status === 'needed'), ord = H.sup.filter(r => r.status === 'ordered');
    const lowN = sLocs.reduce((n, l) => n + H.sitems.filter(it => spState(l.id, it, { thr: H.thr, counts: H.counts }).low && !H.sup.some(r => r.studio_id === l.id && r.item_id === it.id)).length, 0);
    const qty = q => q ? String(q).replace(/^\s*low:?\s*have\s*(\d+)\s*$/i, '$1 left') : '';
    if (needs.length || lowN) supCard = `<div class="hcard hsup"><h3>Supplies to order <span class="hcount">${needs.length}</span></h3><ul class="hlist">` +
      needs.slice(0, 5).map(r => `<li><b>${esc((r.supply_items && r.supply_items.name) || 'Item')}</b> <span class="muted">${own ? '• ' + esc(studio(r.studio_id)) : ''}${r.qty ? ' • ' + esc(qty(r.qty)) : ''}</span></li>`).join('') + '</ul>' +
      (needs.length > 5 ? `<p class="muted hsmall">and ${needs.length - 5} more</p>` : '') + (lowN ? `<p class="hsmall warn-t">${lowN} more below minimum, not requested yet</p>` : '') + (ord.length ? `<p class="muted hsmall">${ord.length} on order</p>` : '') +
      `<a class="hlink" href="#supplies">${own ? 'Review and order' : 'Open supplies'} →</a></div>`;
    else if (!own) supCard = `<div class="hcard hsup"><h3>Supplies</h3><p class="hclear" style="margin:0">✓ Nothing needed right now.${ord.length ? ` ${ord.length} on order.` : ''}</p><a class="hlink" href="#supplies">Open supplies →</a></div>`;
  }
  $('alertCards').innerHTML = (tiles.length ? `<div class="hattn">${tiles.join('')}</div>` : (ME.role !== 'staff' ? '<p class="hclear">✓ All caught up. Nothing needs your attention right now.</p>' : ''));
  $('alertCards').hidden = false;

  // ---- my tasks: progress + next three open ----
  const n = T && T.assigned ? T.assigned : H.tasks.length, d = T && T.assigned ? Math.min(T.done_today || 0, n) : H.tasks.filter(x => H.done.has(x.id)).length, pct = n ? Math.round(100 * d / n) : 0;
  const open = H.tasks.filter(x => !H.done.has(x.id)).sort(byFreq).slice(0, 3);
  const offToday = !worksOn(ME.id, td) && d === 0;
  const taskCard = offToday ? `<div class="hcard"><h3>My tasks</h3><p class="lead" style="margin:0">You don\u2019t usually work today, so there are no tasks. Enjoy your day off.</p><a class="hlink" href="#tasks">Open my tasks \u2192</a></div>`
    : `<div class="hcard"><h3>My tasks</h3>` + (n ? `<div class="tk-progress"><div class="tk-today"><b>${d} of ${n}</b> done today</div></div><div class="meter tk-meter" style="max-width:none;margin:.5rem 0 .8rem"><i style="width:${Math.min(pct, 100)}%"></i></div>` +
      (open.length ? '<div class="hopen">' + open.map(x => isNum(x) ? `<a class="htask" href="#tasks"><span class="tk-num-ic" aria-hidden="true">#</span><span>${esc(splitTitle(x.title)[0])} <span class="tk-freq">Enter number</span></span></a>` : `<label class="htask"><input type="checkbox" data-htask="${x.id}"><span>${esc(splitTitle(x.title)[0])}${fq(x) !== 'daily' ? ` <span class="tk-freq">${fq(x) === 'weekly' ? 'This week' : 'This month'}</span>` : ''}</span></label>`).join('') + '</div>' : '<p class="hclear" style="margin:0">✓ All done for today!</p>')
    : '<p class="lead" style="margin:0">No tasks assigned yet.</p>') + `<a class="hlink" href="#tasks">${open.length && n - d > open.length ? `See all ${n - d} left →` : 'Open my tasks →'}</a></div>`;

  // ---- time off: mine + approvals ----
  const rng = r => fmt(r.start_date) + (r.end_date !== r.start_date ? ' – ' + fmt(r.end_date) : '');
  const pillCls = st => st === 'approved' ? 'ok' : st === 'denied' ? 'warn' : 'ice';
  const pendOffs = offs.filter(o => H.pendIds.includes(o.id) && canDecide(o)).slice(0, 3);
  const offCard = `<div class="hcard"><h3>Time off</h3>` +
    (pendOffs.length ? '<p class="hsub">Waiting for you</p>' + pendOffs.map(o => `<div class="happ"><div><b>${esc(o.full_name)}</b> <span class="muted">${rng(o)}${ME.location_id ? '' : ' • ' + esc(studio(o.location_id))}</span>${clashes(o).length ? `<small class="up-warn">Also out: ${esc(clashes(o).map(c => c.full_name.split(' ')[0]).join(', '))}</small>` : ''}</div><span><button class="sm" data-hdecide="approved" data-id="${o.id}">Approve</button> <button class="quiet sm" data-hdecide="denied" data-id="${o.id}">Decline</button></span></div>`).join('') : '') +
    '<p class="hsub">Mine</p>' + (H.mine.map(r => `<p class="hline">${rng(r)} <span class="pill ${pillCls(r.status)}" style="margin:0 0 0 .4rem">${r.status}</span></p>`).join('') || '<p class="lead" style="margin:0">Nothing scheduled.</p>') +
    '<a class="hlink" href="#timeoff">Request time off →</a></div>';

  // ---- managers: team tasks and every request waiting on them ----
  let teamCard = '', mgrOffCard = '';
  if (isMgrHome()) {
    const tn = H.team.reduce((a, x) => a + x.s.assigned, 0), tdn = H.team.reduce((a, x) => a + Math.min(x.s.done_today || 0, x.s.assigned), 0), tp = tn ? Math.round(100 * tdn / tn) : 0;
    const rows = H.team.map(x => ({ name: x.p.full_name, n: x.s.assigned, d: Math.min(x.s.done_today || 0, x.s.assigned) })).sort((a, b) => a.d / a.n - b.d / b.n);
    teamCard = `<div class="hcard"><h3>Team tasks</h3>` + (tn ? `<div class="tk-progress"><div class="tk-today"><b>${tp}%</b> done today <span class="muted">• ${tdn} of ${tn} tasks</span></div></div><div class="meter tk-meter" style="max-width:none;margin:.5rem 0 .8rem"><i style="width:${Math.min(tp, 100)}%"></i></div>` +
        rows.slice(0, 6).map(r => `<p class="hline"><b>${esc(r.name.split(' ')[0])}</b> <span class="muted">${r.d >= r.n ? '✓ all done' : `${r.d} of ${r.n} • ${Math.round(100 * r.d / r.n)}%`}</span></p>`).join('') + (rows.length > 6 ? `<p class="muted hsmall">and ${rows.length - 6} more</p>` : '')
      : (H.teamOff.length ? '<p class="lead" style="margin:0">Everyone with tasks is off today.</p>' : '<p class="lead" style="margin:0">No tasks assigned to your team yet.</p>')) + (H.teamOff.length ? `<p class="muted hsmall">Off today: ${esc(H.teamOff.join(', '))}</p>` : '') + '<a class="hlink" href="#tasks">Open team tasks →</a></div>';
    const waiting = offs.filter(o => H.pendIds.includes(o.id) && canDecide(o)).slice(0, 5), more = H.pendIds.length - waiting.length;
    mgrOffCard = `<div class="hcard"><h3>Time off to approve${H.pendIds.length ? ` <span class="hcount">${H.pendIds.length}</span>` : ''}</h3>` +
      (waiting.length ? waiting.map(o => `<div class="happ"><div><b>${esc(o.full_name)}</b> <span class="muted">${rng(o)}</span>${clashes(o).length ? `<small class="up-warn">Also out: ${esc(clashes(o).map(c => c.full_name.split(' ')[0]).join(', '))}</small>` : ''}</div><span><button class="sm" data-hdecide="approved" data-id="${o.id}">Approve</button> <button class="quiet sm" data-hdecide="denied" data-id="${o.id}">Decline</button></span></div>`).join('') + (more > 0 ? `<p class="muted hsmall">and ${more} more on the calendar</p>` : '')
        : H.pendIds.length ? `<p class="lead" style="margin:0">${H.pendIds.length} waiting, further out than 30 days.</p>` : '<p class="hclear" style="margin:0">✓ No requests waiting.</p>') + '<a class="hlink" href="#calendar">Open the calendar →</a></div>';
  }

  // ---- coming up: same list as the calendar, next 7 days ----
  const to = addD(td, 6), items = calItems(td, to), byDay = {};
  items.forEach(x => { const k = x.s < td ? td : x.s; (byDay[k] = byDay[k] || []).push(x); });
  for (let k = td; k <= to; k = addD(k, 1)) if (coverage(k)) byDay[k] = byDay[k] || [];
  const days = Object.keys(byDay).sort(), label = k => k === td ? 'Today' : k === addD(td, 1) ? 'Tomorrow' : fmtLong(k);
  const calCard = `<div class="hcard"><h3>Coming up</h3>` + (days.length ? days.map(k => { const c = coverage(k);
      return `<div class="up-day"><div class="up-date">${label(k)}${c ? `<span class="cov">${c.n} out at ${esc(studio(c.loc))}</span>` : ''}</div>` + byDay[k].map(x => `<div class="up-item ${x.k}"><span class="up-main"><i class="up-dot"></i><span>${esc(x.t)}${x.k === 'pend' ? ' <em>pending</em>' : ''}${x.e !== x.s ? ` <small>${x.k === 'off' || x.k === 'pend' ? 'until' : 'through'} ${fmt(x.e)}</small>` : ''}</span></span></div>`).join('') + '</div>'; }).join('')
    : '<p class="lead" style="margin:0">Nothing in the next 7 days.</p>') + '<a class="hlink" href="#calendar">Open the calendar →</a></div>';

  $('myCards').innerHTML = isMgrHome()
    ? (canHref('#tasks') ? teamCard : '') + mgrOffCard + (canHref('#calendar') ? calCard : '') + supCard
    : (canHref('#tasks') ? taskCard : '') + (canHref('#timeoff') ? offCard : '') + (canHref('#calendar') ? calCard : '') + supCard;
}

$('myCards').addEventListener('change', async e => {
  const id = e.target.dataset.htask; if (!id) return;
  e.target.disabled = true;
  const { error } = await db.from('task_checks').insert({ user_id: ME.id, template_id: id, check_date: todayStr() });
  if (error) { e.target.disabled = false; e.target.checked = false; alert('Could not save that. ' + error.message); return; }
  e.target.closest('.htask').classList.add('just-done');
  setTimeout(() => { home.done.add(id); if (home.t) home.t.done_today = (home.t.done_today || 0) + 1; drawHome(); }, 380);
});
$('myCards').addEventListener('click', async e => {
  const b = e.target.closest('[data-hdecide]'); if (!b) return;
  b.disabled = true;
  const { error } = await db.rpc('decide_time_off', { p_id: b.dataset.id, p_status: b.dataset.hdecide });
  if (error) { b.disabled = false; alert('That did not work: ' + error.message); return; }
  toast(b.dataset.hdecide === 'approved' ? 'Approved' : 'Declined'); if (typeof timeOffBadge === 'function') timeOffBadge(); loadHome();
});

// ---------- Announcements ----------
// Shown at the top of everyone's homepage. Owners post, edit and remove them.
const ANN_KINDS = { promo: ['🎁', 'Promotion'], contest: ['🏆', 'Contest'], news: ['📣', 'News'], important: ['⚠️', 'Important'] };
let ann = { rows: [], missing: false, open: new Set() };

async function loadAnnouncements() {
  const { data, error } = await db.from('announcements').select('*').eq('active', true).order('pinned', { ascending: false }).order('starts_on', { ascending: false });
  ann.missing = !!error; ann.rows = error ? [] : (data || []);
  drawAnnouncements();
}

// Light formatting for announcement details: "- " lines become bullets, a short line right above bullets becomes a small heading,
// **bold**, links; blank lines start a new paragraph
const annText = t => {
  const inline = x => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const isB = l => /^\s*[-•*]\s+/.test(l), L = String(t || '').replace(/\r/g, '').split('\n');
  let out = '', para = [], list = [];
  const flushP = () => { if (para.length) out += `<p>${para.map(inline).join('<br>')}</p>`; para = []; };
  const flushL = () => { if (list.length) out += '<ul>' + list.map(l => `<li>${inline(l)}</li>`).join('') + '</ul>'; list = []; };
  L.forEach((l, k) => {
    const s = l.trim();
    if (!s) { flushP(); flushL(); return; }
    if (isB(l)) { flushP(); list.push(s.replace(/^[-•*]\s+/, '')); return; }
    flushL();
    const next = (L.slice(k + 1).find(x => x.trim()) || '');
    const head = isB(next) && (s.length <= 45 && !/[.!?,]$/.test(s) || /:$/.test(s)) && !/^\*\*.*\*\*$/.test(s) || /^\*\*[^*]+\*\*:?$/.test(s);
    if (head) { flushP(); out += `<h4>${inline(s.replace(/^\*\*|\*\*:?$|:$/g, ''))}</h4>`; return; }
    para.push(s);
  });
  flushP(); flushL();
  return out;
};

function drawAnnouncements() {
  const el = $('annCards'); if (!el) return;
  const own = ME.role === 'owner', td = todayStr();
  if (ann.missing) { el.innerHTML = own ? '<div class="ann-setup">Announcements need a one-time setup: run <b>sql/announcements.sql</b> in Supabase, then refresh.</div>' : ''; return; }
  const forMe = r => !r.location_ids || !r.location_ids.length || own || r.location_ids.includes(ME.location_id);
  const live = ann.rows.filter(r => forMe(r) && r.starts_on <= td && (!r.ends_on || r.ends_on >= td));
  const later = own ? ann.rows.filter(r => r.starts_on > td) : [];
  const fmtD = d => new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const card = (r, soon) => {
    const [ic, lab] = ANN_KINDS[r.kind] || ANN_KINDS.news, left = r.ends_on ? Math.round((new Date(r.ends_on + 'T00:00') - new Date(td + 'T00:00')) / DAY) : null;
    const when = soon ? `Starts ${fmtD(r.starts_on)}` : left === null ? '' : left === 0 ? 'Ends today' : left === 1 ? 'Ends tomorrow' : `Ends ${fmtD(r.ends_on)}${left <= 7 ? ` • ${left} days left` : ''}`;
    const who = own && r.location_ids && r.location_ids.length && !locs.every(l => r.location_ids.includes(l.id)) ? r.location_ids.map(studio).join(', ') : '';   // every studio ticked = same as everyone
    return `<article class="ann ann-${esc(r.kind)}${soon ? ' ann-soon' : ''}">
      <div class="ann-top"><span class="ann-tag"><span aria-hidden="true">${ic}</span> ${lab}</span>${r.pinned ? '<span class="ann-pin">Pinned</span>' : ''}${when ? `<span class="ann-when">${when}</span>` : ''}
        ${own ? `<button class="quiet sm ann-edit" data-annedit="${r.id}" aria-label="Edit announcement">Edit</button>` : ''}</div>
      <h3>${esc(r.title)}</h3>${r.body ? `<div class="ann-body${ann.open.has(r.id) ? ' open' : ''}" data-annbody="${r.id}">${annText(r.body)}</div><button class="linkish ann-more" data-annmore="${r.id}" hidden>${ann.open.has(r.id) ? 'Show less' : 'Show more'}</button>` : ''}
      ${r.link ? `<a class="hlink" href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.link_label || 'Learn more')} →</a>` : ''}
      ${who ? `<p class="muted hsmall">Only for ${esc(who)}</p>` : ''}</article>`;
  };
  if (!live.length && !later.length && !own) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="ann-head"><h2>Announcements</h2>${own ? '<button class="sm" data-annedit="">+ Post announcement</button>' : ''}</div>` +
    (live.length ? `<div class="ann-grid">${live.map(r => card(r)).join('')}</div>` : '<p class="muted" style="margin:0 0 1rem">No announcements right now.</p>') +
    (later.length ? `<p class="hsub">Scheduled</p><div class="ann-grid">${later.map(r => card(r, true)).join('')}</div>` : '');
  el.querySelectorAll('[data-annbody]').forEach(b => { const btn = el.querySelector(`[data-annmore="${b.dataset.annbody}"]`); const long = b.scrollHeight > b.clientHeight + 4; b.classList.toggle('clip', long && !b.classList.contains('open')); if (btn) btn.hidden = !b.classList.contains('open') && !long; });
}

function annForm(id) {
  const r = ann.rows.find(x => x.id === id) || { kind: 'promo', starts_on: todayStr(), location_ids: [] };
  $('dlgBody').innerHTML = `<h2>${r.id ? 'Edit announcement' : 'Post an announcement'}</h2>
    <label>Title <input id="anT" maxlength="120" value="${esc(r.title)}" placeholder="Holiday special: 3 intro stretches for $99"></label>
    <label>Type <select id="anK">${Object.entries(ANN_KINDS).map(([k, [ic, l]]) => `<option value="${k}" ${r.kind === k ? 'selected' : ''}>${ic} ${l}</option>`).join('')}</select></label>
    <label>Details <small class="muted">(blank line = new paragraph, start lines with "- " for bullets, **bold**)</small><textarea id="anB" rows="6" maxlength="4000">${esc(r.body)}</textarea></label>
    <div class="grid2"><label>Link (optional) <input id="anL" type="url" maxlength="500" value="${esc(r.link)}" placeholder="https://"></label>
      <label>Button text <input id="anLL" maxlength="40" value="${esc(r.link_label)}" placeholder="Learn more"></label></div>
    <div class="grid2"><label>Show starting <input id="anS" type="date" value="${esc(r.starts_on)}"></label>
      <label>Take down after <small class="muted">(optional)</small><input id="anE" type="date" value="${esc(r.ends_on)}"></label></div>
    <fieldset class="dlgrp"><legend>Which studios <small class="muted" style="text-transform:none;letter-spacing:0">(leave all unticked for everyone)</small></legend>
      <div class="lbpos">${locs.map(l => `<label class="chkline"><input type="checkbox" data-anloc="${l.id}" ${(r.location_ids || []).includes(l.id) ? 'checked' : ''}> ${esc(l.name)}</label>`).join('')}</div></fieldset>
    <label class="chkline"><input type="checkbox" id="anPin" ${r.pinned ? 'checked' : ''}> Pin to the top</label>
    <div class="err" id="anErr" role="alert"></div>
    <div class="acts"><button data-act="annSave" data-id="${r.id || ''}">${r.id ? 'Save' : 'Post'}</button>${r.id ? `<button class="quiet" data-act="annDel" data-id="${r.id}">Remove</button>` : ''}<button class="quiet" data-act="close">Cancel</button></div>`;
  $('dlg').classList.remove('wide'); if (!$('dlg').open) $('dlg').showModal();
}

async function annSave(id) {
  const err = m => { $('anErr').textContent = m; }, title = $('anT').value.trim(), link = $('anL').value.trim();
  if (!title) return err('Add a title.');
  if (link && !/^https?:\/\//i.test(link)) return err('Links need to start with https://');
  const row = { title, kind: $('anK').value, body: $('anB').value.trim() || null, link: link || null, link_label: ($('anLL').value.trim() || null), starts_on: $('anS').value || todayStr(), ends_on: $('anE').value || null,
    location_ids: [...document.querySelectorAll('[data-anloc]:checked')].map(x => x.dataset.anloc), pinned: $('anPin').checked, updated_at: new Date().toISOString() };
  if (row.ends_on && row.ends_on < row.starts_on) return err('The end date is before the start date.');
  const btn = document.querySelector('[data-act="annSave"]'); btn.disabled = true;
  let res = id ? await db.from('announcements').update(row).eq('id', id) : await db.from('announcements').insert({ ...row, created_by: ME.id });
  if (res.error && /link_label/.test(res.error.message)) {   // before sql/announcements_link_text.sql is run
    if (row.link_label) { btn.disabled = false; return err('Custom button text needs a one-time setup: run sql/announcements_link_text.sql in Supabase. (Or clear the Button text box to save now.)'); }
    delete row.link_label; res = id ? await db.from('announcements').update(row).eq('id', id) : await db.from('announcements').insert({ ...row, created_by: ME.id });
  }
  if (res.error) { btn.disabled = false; return err('Could not save. ' + res.error.message); }
  $('dlg').close(); toast(id ? 'Saved' : 'Announcement posted'); loadAnnouncements();
}

async function annDel(id) {
  const r = ann.rows.find(x => x.id === id); if (!r || !confirm(`Remove "${r.title}"?`)) return;
  const { error } = await db.from('announcements').delete().eq('id', id);
  if (error) { alert('Could not remove it. ' + error.message); return; }
  $('dlg').close(); toast('Removed'); loadAnnouncements();
}

$('annCards').addEventListener('click', e => { const m = e.target.closest('[data-annmore]'); if (m) { const id = m.dataset.annmore; ann.open.has(id) ? ann.open.delete(id) : ann.open.add(id); drawAnnouncements(); return; } });
$('annCards').addEventListener('click', e => { const b = e.target.closest('[data-annedit]'); if (b && ME.role === 'owner') annForm(b.dataset.annedit || null); });
document.addEventListener('click', e => { const b = e.target.closest('[data-act="annSave"],[data-act="annDel"]'); if (!b || !$('dlg').contains(b)) return;
  b.dataset.act === 'annSave' ? annSave(b.dataset.id || null) : annDel(b.dataset.id); });
