// ---------- My page ----------
async function homeAttn() {
  if (!ME.location_id) return null;
  if (mem.studio !== ME.location_id || !mem.meta) { mem.studio = ME.location_id; await loadMem(); }
  return mem.meta ? mem.rows.filter(r => r.grp === 'member' && calc(r).attn).length : null;
}

async function loadHome() {
  const now = new Date(), td = todayStr(), mo = ymd(new Date(now.getFullYear(), now.getMonth(), 1)), in14 = ymd(new Date(now.getTime() + 14 * DAY)), in30 = ymd(new Date(now.getTime() + 30 * DAY));
  const [ov, mine, ev, offs2, pend, att, sup, sitems, scounts, sthr, dprr] = await Promise.all([
    db.rpc('task_overview', { p_month: mo, p_today: td }),
    db.from('time_off_requests').select('id,start_date,end_date,status').eq('user_id', ME.id).gte('end_date', td).in('status', ['pending', 'approved']).order('start_date').limit(3),
    db.from('events').select('*').or(`ends_on.gte.${td},event_date.gte.${td}`).lte('event_date', in30).order('event_date').limit(60),
    db.from('time_off_calendar').select('*').gte('end_date', td).lte('start_date', in14).order('start_date'),
    ME.role === 'staff' ? null : db.from('time_off_requests').select('id,user_id').eq('status', 'pending'),
    canPage('members') ? homeAttn() : null,
    ME.role === 'owner' ? db.from('supply_requests').select('*, supply_items(name)') : null,
    ME.role === 'owner' ? db.from('supply_items').select('*').eq('active', true) : null,
    ME.role === 'owner' ? db.from('supply_counts').select('*') : null,
    ME.role === 'owner' ? db.from('supply_thresholds').select('*') : null,
    ME.role !== 'staff' && canPage('dpr') ? db.from('dpr_daily').select('studio_id,day').gte('day', ymd(new Date(Date.now() - 30 * DAY))) : null]);
  drawHome({ t: (ov.data || []).find(x => x.user_id === ME.id), mine: mine.data || [], ev: ev.data || [], offs: offs2.data || [],
    pend: pend ? (pend.data || []).filter(r => r.user_id !== ME.id || ME.role === 'owner').length : null, att, day: now.getDate(), sup: sup ? (sup.data || []) : [], sitems: sitems ? (sitems.data || []) : [], counts: scounts ? (scounts.data || []) : [], thr: sthr ? (sthr.data || []) : [], dpr: dprr ? (dprr.data || []) : null });
}

function drawHome(d) {
  const T = d.t, tp = T && T.assigned ? Math.round(100 * T.done_today / T.assigned) : 0, mp = T && T.assigned ? mtd(T.done_month, T.done_today, T.assigned, true, d.day) : null;
  const rng = r => fmt(r.start_date) + (r.end_date !== r.start_date ? ' \u2013 ' + fmt(r.end_date) : '');
  const evs = d.ev.filter(e => !e.location_id || !ME.location_id || e.location_id === ME.location_id).slice(0, 4);
  const out = d.offs.filter(o => o.user_id !== ME.id && (!ME.location_id || o.location_id === ME.location_id)).slice(0, 5);
  const card = (title, body, link, cls) => link && !canHref(link[0]) ? '' : `<div class="hcard ${cls || ''}"><h3>${title}</h3>${body}${link ? `<p style="margin-top:.75rem"><a href="${link[0]}">${link[1]}</a></p>` : ''}</div>`;
  const none = t => `<p class="lead" style="margin:0">${t}</p>`;
  const needs = (d.sup || []).filter(r => r.status === 'needed'), ord = (d.sup || []).filter(r => r.status === 'ordered');
  const lowN = ME.role === 'owner' ? locs.reduce((n, l) => n + (d.sitems || []).filter(it => spState(l.id, it, { thr: d.thr || [], counts: d.counts || [] }).low && !(d.sup || []).some(r => r.studio_id === l.id && r.item_id === it.id)).length, 0) : 0;
  let supCard = '';
  if (ME.role === 'owner' && (needs.length || ord.length || lowN)) {
    const g = {}; needs.forEach(r => { const n = (r.supply_items && r.supply_items.name) || 'Item'; (g[n] = g[n] || []).push(studio(r.studio_id) + (r.qty ? ': ' + r.qty : '')); });
    const names = Object.keys(g);
    supCard = card('Supplies needed', (names.slice(0, 6).map(n => `<p><b>${esc(n)}</b> <span style="color:var(--muted);font-size:.85rem">${esc(g[n].join(' \u2022 '))}</span></p>`).join('') + (names.length > 6 ? `<p class="lead" style="margin:0">and ${names.length - 6} more</p>` : '') || none('Nothing requested yet.'))
      + (lowN ? `<p style="margin:.5rem 0 0;color:#ff9b8f">${lowN} more below minimum, not requested yet</p>` : '') + (ord.length ? `<p class="lead" style="margin:.5rem 0 0">${ord.length} on order</p>` : ''), ['#supplies', 'Review and order'], names.length || lowN ? 'alert' : '');
  }
  let dprCard = '';
  if (d.dpr && d.dpr.length) {
    const last = {}; d.dpr.forEach(r => { if (!last[r.studio_id] || r.day > last[r.studio_id]) last[r.studio_id] = r.day; });
    const stale = Object.entries(last).map(([sid, day]) => ({ sid, day, n: Math.floor((new Date(todayStr() + 'T00:00') - new Date(day + 'T00:00')) / DAY) })).filter(x => x.n >= 2 && (ME.role === 'owner' || x.sid === ME.location_id));
    if (stale.length) dprCard = card('DPR not entered', stale.map(x => `<p><b>${esc(studio(x.sid))}</b> <span style="color:var(--muted);font-size:.85rem">last entry ${fmt(x.day)} (${x.n} days ago)</span></p>`).join(''), ['#dpr', 'Open the DPR'], 'alert');
  }
  $('alertCards').innerHTML = dprCard + supCard;
  $('alertCards').hidden = !(dprCard || supCard);
  const pillCls = st => st === 'approved' ? 'ok' : st === 'denied' ? 'warn' : 'ice';
  $('myCards').innerHTML =
    card('My tasks', T && T.assigned ? `<div class="meter"><i style="width:${Math.min(tp, 100)}%"></i></div><p style="margin-top:.5rem">Today <b>${tp}%</b> (${T.done_today} of ${T.assigned}) \u2022 month so far <b>${mp === null ? 'starts tomorrow' : mp + '%'}</b></p>` : none('No tasks assigned yet.'), ['#tasks', 'Open my tasks']) +
    card('My time off', (d.pend ? `<p><b>${d.pend}</b> request${d.pend === 1 ? '' : 's'} waiting for your approval</p>` : '') + (d.mine.map(r => `<p>${rng(r)} <span class="pill ${pillCls(r.status)}" style="margin:0 0 0 .4rem">${r.status}</span></p>`).join('') || none('Nothing scheduled.')), ['#timeoff', 'Request time off']) +
    card('Calendar', `<div class="hsplit"><div><b style="font-size:.85rem;color:var(--muted)">COMING UP</b>${evs.map(e => `<p style="margin:.35rem 0 0"><b>${fmt(e.event_date)}</b> ${esc(e.title)}<br><span style="color:var(--muted);font-size:.85rem">${esc(e.location_id ? studio(e.location_id) : 'All Austin')}</span></p>`).join('') || none('No events in the next 30 days.')}</div>
      <div><b style="font-size:.85rem;color:var(--muted)">OUT IN THE NEXT 2 WEEKS</b>${out.map(o => `<p style="margin:.35rem 0 0">${esc(o.full_name.split(' ')[0])} ${rng(o)}${o.status === 'pending' ? ' <span class="pill ice" style="margin:0">pending</span>' : ''}${ME.location_id ? '' : '<br><span style="color:var(--muted);font-size:.85rem">' + esc(studio(o.location_id)) + '</span>'}</p>`).join('') || none('No one is off.')}</div></div>`, ['#calendar', 'Open the calendar']) +
    (d.att === null || d.att === undefined ? '' : card('Members', `<p><b>${d.att}</b> member${d.att === 1 ? '' : 's'} need attention</p>`, ['#members', 'Open members']));
}
