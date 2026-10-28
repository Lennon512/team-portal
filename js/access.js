// ---------- Page access ----------
const PAGES = [['team', 'Team', 'Team cards and bios'], ['studio', 'Studio', 'Studio pages and rosters'], ['calendar', 'Calendar', 'Events, time off, celebrations'], ['tasks', 'Tasks', 'Daily task checklists'],
  ['members', 'Members', 'Member lists, at-risk and new members'], ['timeoff', 'Time off', 'Request and approve time off'], ['dpr', 'Daily & weekly', 'Daily production report and studio financials'], ['supplies', 'Supplies', 'Supply counts and requests'],
  ['performance', 'Performance', 'KPI scorecards (their own studio only)'], ['leadership', 'Leadership', 'Pay, reviews, and discipline for everyone'], ['payroll', 'Payroll', 'Hours, stretch pay, and commission for every pay period'], ['people', 'People', 'Names, roles, and studios (only the owner can change them)']];
const DEFPAGES = { staff: ['team', 'studio', 'calendar', 'tasks', 'members', 'timeoff', 'dpr', 'supplies'], manager: ['team', 'studio', 'calendar', 'tasks', 'members', 'timeoff', 'dpr', 'supplies', 'performance', 'people'] };
const NAVID = { team: 'navTeam', studio: 'navStudio', calendar: 'navCal', tasks: 'navTasks', members: 'navMem', timeoff: 'navOff', supplies: 'navSup', leadership: 'navHr', payroll: 'navPay', people: 'navPeople' };
const canPage = k => !!ME && (ME.role === 'owner' || (ME.pages || []).includes(k));
const canHref = h => { const k = { '#tasks': 'tasks', '#timeoff': 'timeoff', '#calendar': 'calendar', '#members': 'members', '#dpr': 'dpr', '#enter': 'dpr', '#supplies': 'supplies' }[h]; return !k || canPage(k); };
const acc = { groups: null, people: [], msg: '' };

async function loadPages() {
  // The database decides. If that is not set up yet, fall back to what each role could always see.
  const { data, error } = await db.rpc('my_pages');
  ME.pages = !error && Array.isArray(data) ? data : [...(DEFPAGES[ME.role] || DEFPAGES.staff)].concat(ME.hr_access ? ['leadership'] : []);
}
function applyNav() {
  Object.entries(NAVID).forEach(([k, id]) => { $(id).hidden = !canPage(k); });
  $('navAdminWrap').hidden = !['leadership', 'payroll', 'people'].some(canPage);
  $('navRep').hidden = !(canPage('dpr') || canPage('performance'));
}
$('navAdminBtn').onclick = e => { e.stopPropagation(); const open = $('navAdminMenu').hidden; if (open) { const r = $('navAdminBtn').getBoundingClientRect(), w = 178, left = Math.min(r.left, window.innerWidth - w - 8); if (r.top > window.innerHeight / 2) { $('navAdminMenu').style.top = 'auto'; $('navAdminMenu').style.bottom = (window.innerHeight - r.top + 8) + 'px'; } else { $('navAdminMenu').style.bottom = 'auto'; $('navAdminMenu').style.top = (r.bottom + 4) + 'px'; } $('navAdminMenu').style.left = Math.max(8, left) + 'px'; } $('navAdminMenu').hidden = !open; $('navAdminBtn').setAttribute('aria-expanded', String(open)); };
document.body.appendChild($('navAdminMenu'));
document.addEventListener('click', e => { if (!e.target.closest('.navdrop') && !e.target.closest('#navAdminMenu')) { $('navAdminMenu').hidden = true; $('navAdminBtn').setAttribute('aria-expanded', 'false'); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('navAdminMenu').hidden) { $('navAdminMenu').hidden = true; $('navAdminBtn').setAttribute('aria-expanded', 'false'); $('navAdminBtn').focus(); } });
$('navAdminMenu').addEventListener('click', () => { $('navAdminMenu').hidden = true; $('navAdminBtn').setAttribute('aria-expanded', 'false'); });

function drawAccess() {
  const sec = $('accessSec');
  if (!ME || ME.role !== 'owner' || acc.groups === null) { sec.hidden = true; return; }
  sec.hidden = false;
  const label = ks => ks.map(k => (PAGES.find(x => x[0] === k) || [k, k])[1]).join(', ');
  $('accessNote').innerHTML = `Make a group, tick the pages it can see, then choose the group for each person in the table above. Owners always see everything. Anyone without a group gets the default for their role: staff see ${esc(label(DEFPAGES.staff))}; managers see ${esc(label(DEFPAGES.manager))}. My page is always visible.` + (acc.msg ? ` <b style="color:var(--accent)">${esc(acc.msg)}</b>` : '');
  const cnt = id => acc.people.filter(x => x.page_group === id).length;
  const grid = sel => `<div class="pgrid">${PAGES.map(([k, n, d]) => `<label><input type="checkbox" data-pg="${k}" ${sel.includes(k) ? 'checked' : ''}><span><b>${n}</b><small>${d}</small></span></label>`).join('')}</div>`;
  const card = g => `<div class="hcard" data-gid="${g ? g.id : ''}" style="margin-bottom:1rem"><label>${g ? 'Group name' : 'New group'}<input class="gname" value="${g ? esc(g.name) : ''}" maxlength="60" placeholder="${g ? '' : 'For example: Front desk'}"></label>${grid(g ? (g.pages || []) : ['team', 'studio', 'calendar', 'tasks', 'timeoff'])}
    ${g ? `<p class="lead" style="margin:.7rem 0 0">${cnt(g.id)} ${cnt(g.id) === 1 ? 'person' : 'people'} in this group${(g.pages || []).includes('leadership') ? ' \u2022 <b style="color:var(--accent)">can see everyone\u2019s pay and discipline records</b>' : ''}</p>` : ''}
    <div class="acts"><button data-acc="save">${g ? 'Save group' : 'Create group'}</button>${g ? '<button class="quiet" data-acc="del">Delete group</button>' : ''}<span class="status"></span></div></div>`;
  $('accessBody').innerHTML = `<div class="dgrid">${acc.groups.map(card).join('')}${card(null)}</div>`;
}

$('accessBody').onclick = async e => {
  const b = e.target.closest('[data-acc]'); if (!b) return;
  const c = b.closest('[data-gid]'), gid = c.dataset.gid, name = c.querySelector('.gname').value.trim(), pages = [...c.querySelectorAll('[data-pg]:checked')].map(x => x.dataset.pg), st = c.querySelector('.status');
  const say = m => { st.textContent = m; };
  if (b.dataset.acc === 'del') {
    const n = acc.people.filter(x => x.page_group === gid).length;
    if (!confirm(`Delete this group?${n ? ' ' + n + ' ' + (n === 1 ? 'person goes' : 'people go') + ' back to the default for their role.' : ''}`)) return;
    const { error } = await db.from('page_groups').delete().eq('id', gid); if (error) return say('Could not delete. ' + error.message);
    acc.msg = 'Group deleted.';
  } else {
    if (!name) return say('Give the group a name.');
    const { error } = gid ? await db.from('page_groups').update({ name, pages }).eq('id', gid) : await db.from('page_groups').insert({ name, pages });
    if (error) return say(/duplicate|unique/i.test(error.message) ? 'That name is already used.' : 'Could not save. ' + error.message);
    acc.msg = gid ? 'Saved ' + name + '.' : 'Created ' + name + '.';
  }
  await loadTeam(ME);
};
