// ----- Performance > Lead flow: a Sankey chart of what happened to every lead -----
// Leads (Leads Added report) -> booked or not -> showed / no-show / cancelled / still to come -> bought or not -> followed up or not.
// Built from lead_snapshot (stage, latest booking, upcoming booking), lead_contacts (calls, texts, emails) and new_member_snapshot (sales).
const LF = { studio: 'all', range: 'month', data: null, sel: null, loading: false };
const LF_RANGES = [['month', 'This month'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['120', 'Last 4 months']];

// Pull every row (Supabase returns at most 1000 per request)
async function lfAll(table, cols, studio) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols); if (studio !== 'all') q = q.eq('studio_id', studio);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    out.push(...(data || [])); if (!data || data.length < 1000) return out;
  }
}
const lfStart = r => { const t = todayStr(); if (r === 'month') return t.slice(0, 8) + '01'; const d = new Date(t + 'T00:00'); d.setDate(d.getDate() - +r); return d.toISOString().slice(0, 10); };
const lfStudios = () => ME.role === 'owner' ? locs : locs.filter(l => String(l.id) === String(ME.location_id));   // lead data: owners see every studio, others their own

async function loadFlow() {
  if (ME.role !== 'owner') LF.studio = ME.location_id || (locs[0] || {}).id;
  $('lfBody').innerHTML = ''; LF.loading = true; drawFlowBar();
  try {
    const [leads, contacts, sales] = await Promise.all([lfAll('lead_snapshot', 'studio_id,club_id,name,added_on,stage,booking_status,booking_date,next_booking,source', LF.studio),
      lfAll('lead_contacts', 'studio_id,club_id,contacted_at', LF.studio), lfAll('new_member_snapshot', 'studio_id,club_id,signed_on', LF.studio)]);
    LF.data = { leads, contacts, sales }; LF.sel = null;
  } catch (e) { $('lfBody').innerHTML = `<p class="lead empty">Couldn't load the leads (${esc(e.message || '')}). Lead data comes from the Members page reports the bot loads each morning.</p>`; LF.loading = false; return; }
  LF.loading = false; drawFlow();
}
function drawFlowBar() {
  const st = lfStudios();
  $('lfBar').innerHTML = `${st.length > 1 ? `<select id="lfStudio" aria-label="Studio"><option value="all">All studios</option>${st.map(l => `<option value="${l.id}" ${String(LF.studio) === String(l.id) ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>` : ''}
    <div class="tabs lfrange" role="group" aria-label="Leads added">${LF_RANGES.map(([k, l]) => `<button type="button" data-lfr="${k}" class="${LF.range === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (LF.loading) $('lfBody').innerHTML = '<p class="lead loading">Loading leads…</p>';
}

// Sort every lead into the flow
function lfBuild() {
  const { leads, contacts, sales } = LF.data, start = lfStart(LF.range), today = todayStr();
  const key = x => x.studio_id + ':' + x.club_id;
  const cBy = {}; contacts.forEach(c => (cBy[key(c)] = cBy[key(c)] || []).push(c.contacted_at));
  const sBy = {}; sales.forEach(s => { const k = key(s); if (!sBy[k] || s.signed_on < sBy[k]) sBy[k] = s.signed_on; });
  const followed = (l, after) => (cBy[key(l)] || []).some(t => t.slice(0, 10) > after);
  const N = {}, add = (id, l) => (N[id] = N[id] || []).push(l);
  leads.filter(l => l.added_on && l.added_on >= start && l.added_on <= today).forEach(l => {
    add('leads', l);
    const st = String(l.stage || '').toLowerCase(), bs = String(l.booking_status || '').toLowerCase();
    const signed = sBy[key(l)], bought = !!signed && signed >= l.added_on || /\bmember\b|client/.test(st);
    const booked = !!(l.booking_date || l.next_booking) || bought;
    if (!booked) { add('notbooked', l); add(/dnr|do not/.test(st) ? 'dnr' : 'open', l); return; }
    add('booked', l);
    const showed = bought || /complete|showed|attend|check|arriv|^done/.test(bs);
    if (showed) {
      add('showed', l);
      if (bought) return add('bought', l);
      add('nobuy', l); return add(followed(l, l.booking_date || l.added_on) ? 'nobuy_fu' : 'nobuy_none', l);
    }
    if (/no ?show/.test(bs) || /no ?show/.test(st)) { add('noshow', l); return add(followed(l, l.booking_date || l.added_on) ? 'ns_fu' : 'ns_none', l); }
    if (/cancel/.test(bs)) { add('cancelled', l); return add(followed(l, l.booking_date || l.added_on) ? 'cx_fu' : 'cx_none', l); }
    return add('upcoming', l);
  });
  return N;
}

// [id, label, column, parent, color]
const LF_NODES = [
  ['leads', 'Leads', 0, null, '#5b6b8a'],
  ['booked', 'Booked', 1, 'leads', '#3c6fb4'], ['notbooked', 'Not booked', 1, 'leads', '#9a8f84'],
  ['showed', 'Showed', 2, 'booked', '#2e8a5a'], ['noshow', 'No-show', 2, 'booked', '#c4452f'], ['cancelled', 'Cancelled', 2, 'booked', '#b9873a'], ['upcoming', 'Still to come', 2, 'booked', '#6c8fc7'],
  ['dnr', 'DNR', 2, 'notbooked', '#7d736a'], ['open', 'Not DNR (still open)', 2, 'notbooked', '#b3a89c'],
  ['bought', 'Bought', 3, 'showed', '#1f7a4a'], ['nobuy', "Didn't buy", 3, 'showed', '#d07a2c'],
  ['ns_fu', 'Followed up', 3, 'noshow', '#5a8f6e'], ['ns_none', 'No follow-up', 3, 'noshow', '#a33a28'],
  ['cx_fu', 'Followed up', 3, 'cancelled', '#5a8f6e'], ['cx_none', 'No follow-up', 3, 'cancelled', '#a33a28'],
  ['nobuy_fu', 'Followed up', 4, 'nobuy', '#5a8f6e'], ['nobuy_none', 'No follow-up', 4, 'nobuy', '#a33a28']];

function drawFlow() {
  drawFlowBar();
  const N = lfBuild(), total = (N.leads || []).length, cnt = id => (N[id] || []).length;
  if (!total) { $('lfBody').innerHTML = `<p class="lead empty none">No leads added ${LF_RANGES.find(r => r[0] === LF.range)[1].toLowerCase()}${LF.studio !== 'all' ? ' at this studio' : ''}.</p>`; return; }
  // Layout: columns left to right, each node's height proportional to its count
  const W = 1000, H = 440, colX = [10, 230, 470, 710, 900], nodeW = 14, pad = 14, nodes = LF_NODES.filter(n => cnt(n[0])), byId = {};
  const scale = (H - pad * 5) / total;
  for (let c = 0; c < 5; c++) {
    const col = nodes.filter(n => n[2] === c); let y = 0;
    // stack children in the order of their parent so links don't cross
    col.sort((a, b) => (a[3] ? nodes.findIndex(n => n[0] === a[3]) : 0) - (b[3] ? nodes.findIndex(n => n[0] === b[3]) : 0));
    col.forEach(n => { const h = Math.max(3, cnt(n[0]) * scale); byId[n[0]] = { n, x: colX[c], y, h, out: 0 }; y += Math.max(h + pad, 40); });   // at least room for the two-line label
  }
  // children start where their parent's band sits: line each column up with its parents
  for (let c = 1; c < 5; c++) nodes.filter(n => n[2] === c).forEach(n => { const p = byId[n[3]], me = byId[n[0]]; if (p && me.y < p.y) { const d = p.y - me.y; nodes.filter(m => m[2] === c && byId[m[0]].y >= me.y).forEach(m => byId[m[0]].y += d); } });
  const maxY = Math.max(...Object.values(byId).map(b => b.y + b.h)) + 10;
  const pct = n => Math.round(n / total * 100);
  const links = nodes.filter(n => n[3] && byId[n[3]]).map(n => {
    const s = byId[n[3]], t = byId[n[0]], h = t.h, sy = s.y + s.out, ty = t.y; s.out += h;
    const x0 = s.x + nodeW, x1 = t.x, xm = (x0 + x1) / 2;
    return `<path class="lflink${LF.sel === n[0] ? ' on' : ''}" data-lfn="${n[0]}" d="M${x0},${sy} C${xm},${sy} ${xm},${ty} ${x1},${ty} L${x1},${ty + h} C${xm},${ty + h} ${xm},${sy + h} ${x0},${sy + h} Z" fill="${n[4]}"><title>${esc(n[1])}: ${cnt(n[0])} (${pct(cnt(n[0]))}% of leads)</title></path>`;
  }).join('');
  const boxes = nodes.map(n => { const b = byId[n[0]], c = cnt(n[0]), right = n[2] === 4 || (n[2] === 3 && !nodes.some(m => m[3] === n[0]));
    const lx = right ? b.x + nodeW + 7 : b.x + nodeW + 7, anchor = 'start', ly = b.y + b.h / 2;
    return `<g class="lfnode${LF.sel === n[0] ? ' on' : ''}" data-lfn="${n[0]}" tabindex="0" role="button" aria-label="${esc(n[1])}: ${c} leads, show who">
      <rect x="${b.x}" y="${b.y}" width="${nodeW}" height="${b.h}" rx="3" fill="${n[4]}"></rect>
      <text x="${lx}" y="${ly - 3}" text-anchor="${anchor}" class="lfl">${esc(n[1])}</text>
      <text x="${lx}" y="${ly + 12}" text-anchor="${anchor}" class="lfn">${c}${n[0] !== 'leads' ? ` · ${pct(c)}%` : ''}</text></g>`; }).join('');
  // Quick rates under the chart
  const rate = (a, b) => cnt(b) ? Math.round(cnt(a) / cnt(b) * 100) + '%' : '–';
  const stats = [['Booked', rate('booked', 'leads'), 'of leads'], ['Show rate', rate('showed', 'booked'), 'of booked (incl. still to come)'], ['Close rate', rate('bought', 'showed'), 'of those who showed'],
    ['No-shows followed up', rate('ns_fu', 'noshow'), `${cnt('ns_fu')} of ${cnt('noshow')}`], ['Cancels followed up', rate('cx_fu', 'cancelled'), `${cnt('cx_fu')} of ${cnt('cancelled')}`], ["Didn't-buys followed up", rate('nobuy_fu', 'nobuy'), `${cnt('nobuy_fu')} of ${cnt('nobuy')}`]];
  $('lfBody').innerHTML = `<div class="pcard lfcard"><svg class="lfsvg" viewBox="0 0 ${W} ${maxY}" role="img" aria-label="Lead flow: ${total} leads">${links}${boxes}</svg>
      <p class="muted lfhint">Click any box to see who's in it.</p></div>
    <div class="sum lfstats">${stats.map(([l, v, s]) => `<div><span>${l}</span><b>${v}</b><small>${esc(s)}</small></div>`).join('')}</div>
    <div id="lfList"></div>`;
  if (LF.sel) lfShowList(N);
}
function lfShowList(N) {
  const node = LF_NODES.find(n => n[0] === LF.sel), L = (N || lfBuild())[LF.sel] || [];
  if (!node) return;
  const sname = id => (locs.find(l => String(l.id) === String(id)) || {}).name || '';
  const fmtD = d => d ? new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  $('lfList').innerHTML = `<div class="pcard"><h3>${esc(node[1])} <span class="hcount">${L.length}</span> <button type="button" class="quiet sm" id="lfClose" style="float:right">Close</button></h3>
    ${L.length ? `<div class="table-wrap"><table class="mt"><thead><tr><th>Lead</th>${LF.studio === 'all' ? '<th>Studio</th>' : ''}<th>Added</th><th>Source</th><th>Stage</th><th>Last booking</th><th>Next booking</th></tr></thead><tbody>
    ${L.slice().sort((a, b) => String(b.added_on).localeCompare(String(a.added_on))).map(l => `<tr><td><b>${esc(l.name || 'Unknown')}</b></td>${LF.studio === 'all' ? `<td>${esc(sname(l.studio_id))}</td>` : ''}<td>${fmtD(l.added_on)}</td><td>${esc(l.source || '')}</td><td>${esc(l.stage || '')}</td><td>${fmtD(l.booking_date)}${l.booking_status ? ` <span class="muted">${esc(l.booking_status)}</span>` : ''}</td><td>${fmtD(l.next_booking)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="lead">Nobody here.</p>'}</div>`;
}

document.addEventListener('click', e => {
  if (!$('repFlow') || $('repFlow').hidden) return;
  const r = e.target.closest('[data-lfr]'); if (r) { LF.range = r.dataset.lfr; LF.sel = null; LF.data ? drawFlow() : loadFlow(); return; }
  const n = e.target.closest('[data-lfn]'); if (n) { LF.sel = LF.sel === n.dataset.lfn ? null : n.dataset.lfn; drawFlow(); if (LF.sel) $('lfList').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (e.target.closest('#lfClose')) { LF.sel = null; drawFlow(); }
});
document.addEventListener('keydown', e => { const n = e.target.closest && e.target.closest('g[data-lfn]'); if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); n.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
document.addEventListener('change', e => { if (e.target.id === 'lfStudio') { LF.studio = e.target.value; loadFlow(); } });
