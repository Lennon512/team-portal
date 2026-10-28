// ---------- My page ----------
// Home: greeting, a "needs your attention" row, then tasks / time off / coming up.
let home = {};

async function loadHome() {
  const now = new Date(), td = todayStr(), mo = ymd(new Date(now.getFullYear(), now.getMonth(), 1)), in14 = ymd(new Date(now.getTime() + 14 * DAY)), in30 = ymd(new Date(now.getTime() + 30 * DAY));
  const lead = ME.role !== 'staff', loc = ME.role === 'owner' ? null : ME.location_id;
  const byLoc = q => loc ? q.eq('studio_id', loc) : q;
  const [ov, mine, ev, offs2, pend, sup, sitems, scounts, sthr, dprr, dir, pp, tpl, chk, msnap, nsnap, meta] = await Promise.all([
    db.rpc('task_overview', { p_month: mo, p_today: td }),
    db.from('time_off_requests').select('id,start_date,end_date,status').eq('user_id', ME.id).gte('end_date', td).in('status', ['pending', 'approved']).order('start_date').limit(3),
    db.from('events').select('*').or(`ends_on.gte.${td},event_date.gte.${td}`).lte('event_date', in30).order('event_date').limit(60),
    db.from('time_off_calendar').select('*').gte('end_date', td).lte('start_date', in30).order('start_date'),
    lead ? db.from('time_off_requests').select('id,user_id,status').eq('status', 'pending') : null,
    ME.role === 'owner' ? db.from('supply_requests').select('*, supply_items(name)') : null,
    ME.role === 'owner' ? db.from('supply_items').select('*').eq('active', true) : null,
    ME.role === 'owner' ? db.from('supply_counts').select('*') : null,
    ME.role === 'owner' ? db.from('supply_thresholds').select('*') : null,
    lead && canPage('dpr') ? db.from('daily_log').select('studio_id,day').gte('day', ymd(new Date(Date.now() - 30 * DAY))) : null,
    db.from('team_directory').select('id,full_name,location_id,birthday,start_date'),
    db.from('profile_positions').select('position_id').eq('user_id', ME.id),
    db.from('task_templates').select('*').eq('active', true).order('sort_order'),
    db.from('task_checks').select('template_id').eq('user_id', ME.id).eq('check_date', td),
    lead && canPage('members') ? byLoc(db.from('member_snapshot').select('studio_id,club_id,grp,frozen,next_due,next_booking,last_session').eq('grp', 'member')).limit(5000) : null,
    lead && canPage('members') ? byLoc(db.from('new_member_snapshot').select('*')).limit(2000) : null,
    lead && canPage('members') ? byLoc(db.from('snapshot_meta').select('*')) : null]);
  // Reuse the calendar's data so the "coming up" list matches the Calendar page
  events = ev.data || []; offs = offs2.data || []; roster = dir.data || []; calTab = 'all'; calStudio = loc || '';
  const myPos = new Set((pp.data || []).map(x => x.position_id)), done = new Set((chk.data || []).map(x => x.template_id));
  home = { t: (ov.data || []).find(x => x.user_id === ME.id), mine: mine.data || [], pendIds: pend ? (pend.data || []).filter(r => r.user_id !== ME.id || ME.role === 'owner').map(r => r.id) : [],
    sup: sup ? (sup.data || []) : [], sitems: sitems ? (sitems.data || []) : [], counts: scounts ? (scounts.data || []) : [], thr: sthr ? (sthr.data || []) : [], dpr: dprr ? (dprr.error ? { error: true } : (dprr.data || [])) : null,
    tasks: (tpl.data || []).filter(x => myPos.has(x.position_id)), done, ms: msnap ? (msnap.data || []) : null, ns: nsnap ? (nsnap.data || []) : null, meta: meta ? (meta.data || []) : [] };
  drawHome();
}

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
    if (mc.toCall) tiles.push(tile(mc.toCall, mc.anyInv ? 'Members to call' : 'Members not booked', mc.anyInv ? 'billing within 7 days, nothing booked' : 'nothing on the books', '#members', 'warm'));
    if (mc.risk) tiles.push(tile(mc.risk, 'New members at risk', 'two or more warning signs', '#members', 'warm'));
    if (mc.stale.length) tiles.push(tile(mc.stale[0].n + ' days', 'Since ClubReady upload', esc(mc.stale.map(x => studio(x.sid)).slice(0, 3).join(', ')) + (ME.role === 'staff' ? '' : ' • upload new reports'), '#members', 'hot'));
  }
  if (H.pendIds.length) tiles.push(tile(H.pendIds.length, `Time-off request${H.pendIds.length === 1 ? '' : 's'} waiting`, 'approve below or on the calendar', '#calendar', 'warm'));
  if (H.dpr && !H.dpr.error) {
    // Studios whose numbers for yesterday aren't in the Daily log yet
    const yd = ymd(new Date(Date.now() - DAY)), have = new Set(H.dpr.filter(r => r.day === yd).map(r => r.studio_id));
    const miss = locs.filter(l => (ME.role === 'owner' || l.id === ME.location_id) && !have.has(l.id));
    if (miss.length) tiles.push(tile(miss.length, `Daily log${miss.length === 1 ? '' : 's'} missing`, esc(miss.map(l => l.name).slice(0, 3).join(', ')) + ' \u2022 yesterday', '#dpr', 'hot'));
  }
  // supplies: compact list
  let supCard = '';
  if (ME.role === 'owner') {
    const needs = H.sup.filter(r => r.status === 'needed'), ord = H.sup.filter(r => r.status === 'ordered');
    const lowN = locs.reduce((n, l) => n + H.sitems.filter(it => spState(l.id, it, { thr: H.thr, counts: H.counts }).low && !H.sup.some(r => r.studio_id === l.id && r.item_id === it.id)).length, 0);
    const qty = q => q ? String(q).replace(/^\s*low:?\s*have\s*(\d+)\s*$/i, '$1 left') : '';
    if (needs.length || lowN) supCard = `<div class="hcard hsup"><h3>Supplies to order <span class="hcount">${needs.length}</span></h3><ul class="hlist">` +
      needs.slice(0, 5).map(r => `<li><b>${esc((r.supply_items && r.supply_items.name) || 'Item')}</b> <span class="muted">• ${esc(studio(r.studio_id))}${r.qty ? ' • ' + esc(qty(r.qty)) : ''}</span></li>`).join('') + '</ul>' +
      (needs.length > 5 ? `<p class="muted hsmall">and ${needs.length - 5} more</p>` : '') + (lowN ? `<p class="hsmall warn-t">${lowN} more below minimum, not requested yet</p>` : '') + (ord.length ? `<p class="muted hsmall">${ord.length} on order</p>` : '') +
      '<a class="hlink" href="#supplies">Review and order →</a></div>';
  }
  $('alertCards').innerHTML = (tiles.length ? `<div class="hattn">${tiles.join('')}</div>` : (ME.role !== 'staff' ? '<p class="hclear">✓ All caught up. Nothing needs your attention right now.</p>' : ''));
  $('alertCards').hidden = false;

  // ---- my tasks: progress + next three open ----
  const n = T && T.assigned ? T.assigned : H.tasks.length, d = T && T.assigned ? Math.min(T.done_today || 0, n) : H.tasks.filter(x => H.done.has(x.id)).length, pct = n ? Math.round(100 * d / n) : 0;
  const open = H.tasks.filter(x => !H.done.has(x.id)).slice(0, 3);
  const taskCard = `<div class="hcard"><h3>My tasks</h3>` + (n ? `<div class="tk-progress"><div class="tk-today"><b>${d} of ${n}</b> done today</div></div><div class="meter tk-meter" style="max-width:none;margin:.5rem 0 .8rem"><i style="width:${Math.min(pct, 100)}%"></i></div>` +
      (open.length ? '<div class="hopen">' + open.map(x => `<label class="htask"><input type="checkbox" data-htask="${x.id}"><span>${esc(splitTitle(x.title)[0])}</span></label>`).join('') + '</div>' : '<p class="hclear" style="margin:0">✓ All done for today!</p>')
    : '<p class="lead" style="margin:0">No tasks assigned yet.</p>') + `<a class="hlink" href="#tasks">${open.length && n - d > open.length ? `See all ${n - d} left →` : 'Open my tasks →'}</a></div>`;

  // ---- time off: mine + approvals ----
  const rng = r => fmt(r.start_date) + (r.end_date !== r.start_date ? ' – ' + fmt(r.end_date) : '');
  const pillCls = st => st === 'approved' ? 'ok' : st === 'denied' ? 'warn' : 'ice';
  const pendOffs = offs.filter(o => H.pendIds.includes(o.id) && canDecide(o)).slice(0, 3);
  const offCard = `<div class="hcard"><h3>Time off</h3>` +
    (pendOffs.length ? '<p class="hsub">Waiting for you</p>' + pendOffs.map(o => `<div class="happ"><div><b>${esc(o.full_name)}</b> <span class="muted">${rng(o)}${ME.location_id ? '' : ' • ' + esc(studio(o.location_id))}</span>${clashes(o).length ? `<small class="up-warn">Also out: ${esc(clashes(o).map(c => c.full_name.split(' ')[0]).join(', '))}</small>` : ''}</div><span><button class="sm" data-hdecide="approved" data-id="${o.id}">Approve</button> <button class="quiet sm" data-hdecide="denied" data-id="${o.id}">Decline</button></span></div>`).join('') : '') +
    '<p class="hsub">Mine</p>' + (H.mine.map(r => `<p class="hline">${rng(r)} <span class="pill ${pillCls(r.status)}" style="margin:0 0 0 .4rem">${r.status}</span></p>`).join('') || '<p class="lead" style="margin:0">Nothing scheduled.</p>') +
    '<a class="hlink" href="#timeoff">Request time off →</a></div>';

  // ---- coming up: same list as the calendar, next 7 days ----
  const to = addD(td, 6), items = calItems(td, to), byDay = {};
  items.forEach(x => { const k = x.s < td ? td : x.s; (byDay[k] = byDay[k] || []).push(x); });
  for (let k = td; k <= to; k = addD(k, 1)) if (coverage(k)) byDay[k] = byDay[k] || [];
  const days = Object.keys(byDay).sort(), label = k => k === td ? 'Today' : k === addD(td, 1) ? 'Tomorrow' : fmtLong(k);
  const calCard = `<div class="hcard"><h3>Coming up</h3>` + (days.length ? days.map(k => { const c = coverage(k);
      return `<div class="up-day"><div class="up-date">${label(k)}${c ? `<span class="cov">${c.n} out at ${esc(studio(c.loc))}</span>` : ''}</div>` + byDay[k].map(x => `<div class="up-item ${x.k}"><span class="up-main"><i class="up-dot"></i><span>${esc(x.t)}${x.k === 'pend' ? ' <em>pending</em>' : ''}${x.e !== x.s ? ` <small>${x.k === 'off' || x.k === 'pend' ? 'until' : 'through'} ${fmt(x.e)}</small>` : ''}</span></span></div>`).join('') + '</div>'; }).join('')
    : '<p class="lead" style="margin:0">Nothing in the next 7 days.</p>') + '<a class="hlink" href="#calendar">Open the calendar →</a></div>';

  $('myCards').innerHTML = (canHref('#tasks') ? taskCard : '') + (canHref('#timeoff') ? offCard : '') + (canHref('#calendar') ? calCard : '') + supCard;
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
