// ---------- Page access ----------
const PAGES = [['team', 'Team', 'Team cards and bios'], ['studio', 'Studio', 'Studio pages and rosters'], ['calendar', 'Calendar', 'Events, time off, celebrations'], ['tasks', 'Tasks', 'Daily task checklists'],
  ['members', 'Members & prospects', 'Member lists, at-risk and new members'], ['timeoff', 'Time off', 'Request and approve time off'], ['dpr', 'Daily & weekly', 'Daily review, weekly review, and entering numbers'], ['supplies', 'Supplies', 'Supply counts and requests'],
  ['performance', 'Performance', 'KPI scorecards (their own studio only)'], ['leadership', 'Directory', 'Pay, reviews, and discipline for everyone'], ['leadership_studio', 'Directory (own studio)', 'Pay, reviews, and discipline for their own studio only'], ['payroll', 'Payroll', 'Hours, stretch pay, and commission for every pay period'], ['people', 'People', 'Names, roles, and studios (only the owner can change them)']];
const DEFPAGES = { staff: ['team', 'studio', 'calendar', 'tasks', 'members', 'timeoff', 'dpr', 'supplies'], manager: ['team', 'studio', 'calendar', 'tasks', 'members', 'timeoff', 'dpr', 'supplies', 'performance', 'people'] };
const NAVID = { team: 'navTeam', studio: 'navStudio', calendar: 'navCal', tasks: 'navTasks', members: 'navMem', timeoff: 'navOff', supplies: 'navSup', leadership: 'navHr', payroll: 'navPay', people: 'navPeople' };
const canPage = k => !!ME && (ME.role === 'owner' || (ME.pages || []).includes(k) || (k === 'leadership' && (ME.pages || []).includes('leadership_studio')));
// Leadership limited to their own studio (no full Leadership access)
const hrScoped = () => !!ME && ME.role !== 'owner' && !(ME.pages || []).includes('leadership') && (ME.pages || []).includes('leadership_studio');
const canHref = h => { const k = { '#tasks': 'tasks', '#timeoff': 'timeoff', '#calendar': 'calendar', '#members': 'members', '#dpr': 'dpr', '#enter': 'dpr', '#supplies': 'supplies' }[h]; return !k || canPage(k); };
const SENSITIVE = ['leadership', 'leadership_studio', 'payroll'];
const acc = { groups: null, people: [], msg: '', edit: null, status: null };

async function loadPages() {
  // The database decides. If that is not set up yet, fall back to what each role could always see.
  const { data, error } = await db.rpc('my_pages');
  ME.pages = !error && Array.isArray(data) ? data : [...(DEFPAGES[ME.role] || DEFPAGES.staff)].concat(ME.hr_access ? ['leadership'] : []);
}
function applyNav() {
  Object.entries(NAVID).forEach(([k, id]) => { $(id).hidden = !canPage(k); });
  // "More" holds Supplies, Team, Studio and Time off, plus the Admin pages below a divider
  const adm = ['leadership', 'payroll', 'people'].some(canPage);
  $('navAdminSep').hidden = !adm;
  $('navAdminWrap').hidden = !adm && !['supplies', 'team', 'studio', 'timeoff'].some(canPage);
  $('navRep').hidden = !(canPage('dpr') || canPage('performance'));
}
$('navAdminBtn').onclick = e => { e.stopPropagation(); const open = $('navAdminMenu').hidden; if (open) { const r = $('navAdminBtn').getBoundingClientRect(), w = 178, left = Math.min(r.left, window.innerWidth - w - 8); if (r.top > window.innerHeight / 2) { $('navAdminMenu').style.top = 'auto'; $('navAdminMenu').style.bottom = (window.innerHeight - r.top + 8) + 'px'; } else { $('navAdminMenu').style.bottom = 'auto'; $('navAdminMenu').style.top = (r.bottom + 4) + 'px'; } $('navAdminMenu').style.left = Math.max(8, left) + 'px'; } $('navAdminMenu').hidden = !open; $('navAdminBtn').setAttribute('aria-expanded', String(open)); };
document.body.appendChild($('navAdminMenu'));
document.addEventListener('click', e => { if (!e.target.closest('.navdrop') && !e.target.closest('#navAdminMenu')) { $('navAdminMenu').hidden = true; $('navAdminBtn').setAttribute('aria-expanded', 'false'); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('navAdminMenu').hidden) { $('navAdminMenu').hidden = true; $('navAdminBtn').setAttribute('aria-expanded', 'false'); $('navAdminBtn').focus(); } });
// Count badges on nav items (keeps the icon); a dot on More when something inside it has a count
function setNavBadge(id, n) {
  const a = $(id); if (!a) return;
  let b = a.querySelector('.navbadge'); if (!b) { b = document.createElement('span'); b.className = 'navbadge'; a.appendChild(b); }
  b.textContent = n || ''; b.hidden = !n;
  $('navMoreDot').hidden = ![...$('navAdminMenu').querySelectorAll('.navbadge')].some(x => !x.hidden);
}
// Account menu (name in the top bar): dark mode, change password, sign out
const acctClose = () => { $('acctMenu').hidden = true; $('acctBtn').setAttribute('aria-expanded', 'false'); };
$('acctBtn').onclick = e => { e.stopPropagation(); const open = $('acctMenu').hidden; $('acctMenu').hidden = !open; $('acctBtn').setAttribute('aria-expanded', String(open)); if (open) { const f = $('acctMenu').querySelector('button'); if (f) f.focus(); } };
$('acctMenu').addEventListener('click', e => { if (e.target.closest('button')) acctClose(); });
document.addEventListener('click', e => { if (!e.target.closest('.acct')) acctClose(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('acctMenu').hidden) { acctClose(); $('acctBtn').focus(); } });
const themeLabel = () => { const d = document.documentElement.classList.contains('dark'); $('themeTxt').textContent = d ? 'Light mode' : 'Dark mode'; $('themeBtn').firstElementChild.textContent = d ? '☀️' : '🌙'; };
$('themeBtn').onclick = () => { const d = document.documentElement.classList.toggle('dark'); try { localStorage.setItem('theme', d ? 'dark' : 'light'); } catch (e) {} themeLabel(); };
themeLabel();
$('navAdminMenu').addEventListener('click', () => { $('navAdminMenu').hidden = true; $('navAdminBtn').setAttribute('aria-expanded', 'false'); });

// One grid: pages down the side, groups across the top
function drawAccess() {
  const sec = $('accessSec');
  if (!ME || ME.role !== 'owner' || acc.groups === null) { sec.hidden = true; return; }
  sec.hidden = false;
  if (!acc.edit) acc.edit = acc.groups.map(g => ({ id: g.id, name: g.name, pages: [...(g.pages || [])] }));
  const dirty = JSON.stringify(acc.edit) !== JSON.stringify(acc.groups.map(g => ({ id: g.id, name: g.name, pages: [...(g.pages || [])] })));
  $('accessNote').innerHTML = 'Tick what each group can see, then save. Choose a person’s group in the table above; anyone without a group gets the standard pages for their role. Owners always see everything, and everyone sees My page.';
  const cnt = id => acc.people.filter(x => x.page_group === id && x.role !== 'owner').length;
  const dflt = r => `<th class="agdef"><b>Standard ${r}</b><small>${acc.people.filter(x => x.role === r && !x.page_group).length} people • can’t change</small></th>`;
  const head = `<tr><th class="agpage">Page</th>${dflt('staff')}${dflt('manager')}${acc.edit.map((g, i) => `<th class="aggrp"><span class="agname"><input class="gname" data-gi="${i}" value="${esc(g.name)}" maxlength="60" aria-label="Group name" placeholder="Group name"><button type="button" class="agx" data-gdel="${i}" aria-label="Delete ${esc(g.name)}">×</button></span><small>${g.id ? cnt(g.id) + ' ' + (cnt(g.id) === 1 ? 'person' : 'people') : 'new'}</small></th>`).join('')}<th class="agadd"><button type="button" class="quiet sm" id="gAdd">+ New group</button></th></tr>`;
  const body = PAGES.map(([k, n, d]) => `<tr class="${SENSITIVE.includes(k) ? 'agsens' : ''}"><td class="agpage"><b>${n}</b><small>${d}</small></td>${['staff', 'manager'].map(r => `<td class="agdef">${DEFPAGES[r].includes(k) ? '✓' : '<span class="muted">–</span>'}</td>`).join('')}${acc.edit.map((g, i) => `<td><input type="checkbox" data-gi="${i}" data-pg="${k}" ${g.pages.includes(k) ? 'checked' : ''} aria-label="${esc(g.name)} can see ${n}"></td>`).join('')}<td></td></tr>`).join('');
  $('accessBody').innerHTML = `<div class="table-wrap"><table class="mt agrid"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <div class="acts"><button id="gSave" ${dirty ? '' : 'disabled'}>Save changes</button>${dirty ? '<button class="quiet" id="gUndo">Undo changes</button>' : ''}<span class="status" id="gSt">${esc(acc.msg)}</span></div>`;
  acc.msg = '';
}

$('accessBody').oninput = e => { const t = e.target; if (t.classList.contains('gname')) { acc.edit[+t.dataset.gi].name = t.value; const st = $('gSave'); if (st) st.disabled = false; } };
$('accessBody').onchange = e => {
  const t = e.target; if (!t.dataset.pg) return;
  const g = acc.edit[+t.dataset.gi], k = t.dataset.pg;
  if (t.checked && SENSITIVE.includes(k) && !confirm(`Everyone in "${g.name || 'this group'}" will see ${PAGES.find(x => x[0] === k)[1]}, which shows pay information. Continue?`)) { t.checked = false; return; }
  g.pages = t.checked ? [...new Set([...g.pages, k])] : g.pages.filter(x => x !== k);
  if (t.checked && k === 'leadership') g.pages = g.pages.filter(x => x !== 'leadership_studio');
  if (t.checked && k === 'leadership_studio') g.pages = g.pages.filter(x => x !== 'leadership');
  drawAccess();
};
$('accessBody').onclick = async e => {
  const t = e.target;
  if (t.id === 'gAdd') { acc.edit.push({ id: null, name: '', pages: ['team', 'studio', 'calendar', 'tasks', 'timeoff'] }); drawAccess(); const ins = document.querySelectorAll('#accessBody .gname'); ins[ins.length - 1].focus(); return; }
  if (t.id === 'gUndo') { acc.edit = null; return drawAccess(); }
  const del = t.closest('[data-gdel]');
  if (del) { const g = acc.edit[+del.dataset.gdel], n = g.id ? cnt0(g.id) : 0;
    if (g.id && !confirm(`Delete the "${g.name}" group?${n ? ' ' + n + ' ' + (n === 1 ? 'person goes' : 'people go') + ' back to the standard pages for their role.' : ''} This happens when you save.`)) return;
    acc.edit.splice(+del.dataset.gdel, 1); return drawAccess(); }
  if (t.id !== 'gSave') return;
  const st = $('gSt'), say = m => { st.textContent = m; };
  if (acc.edit.some(g => !g.name.trim())) return say('Give every group a name.');
  const names = acc.edit.map(g => g.name.trim().toLowerCase()); if (new Set(names).size !== names.length) return say('Two groups have the same name.');
  t.disabled = true; say('Saving…');
  const keep = new Set(acc.edit.filter(g => g.id).map(g => g.id));
  for (const g of acc.groups.filter(x => !keep.has(x.id))) { const { error } = await db.from('page_groups').delete().eq('id', g.id); if (error) { t.disabled = false; return say('Could not delete ' + g.name + '. ' + error.message); } }
  for (const g of acc.edit) {
    const row = { name: g.name.trim(), pages: g.pages }, old = acc.groups.find(x => x.id === g.id);
    if (old && old.name === row.name && JSON.stringify(old.pages || []) === JSON.stringify(row.pages)) continue;
    const { error } = g.id ? await db.from('page_groups').update(row).eq('id', g.id) : await db.from('page_groups').insert(row);
    if (error) { t.disabled = false; return say(/duplicate|unique/i.test(error.message) ? 'That group name is already used.' : 'Could not save ' + row.name + '. ' + error.message); }
  }
  acc.edit = null; acc.msg = '✓ Saved'; invite.groups = null;
  await loadTeam(ME);
};
const cnt0 = id => acc.people.filter(x => x.page_group === id && x.role !== 'owner').length;
