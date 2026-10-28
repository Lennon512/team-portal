function showFatal(msg) {
  let b = document.getElementById('fatal');
  if (!b) { b = document.createElement('div'); b.id = 'fatal'; b.setAttribute('role', 'alert'); b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99;background:#7a1f1a;color:#fff;padding:.75rem 1rem;font:14px system-ui,sans-serif'; document.body.prepend(b); }
  b.textContent = 'Something went wrong: ' + msg + '. Please screenshot this message and send it to Claude.';
}
window.addEventListener('error', e => { if (!window.__stop && e.message && !/ResizeObserver/.test(e.message)) showFatal(e.message); });
window.addEventListener('unhandledrejection', e => showFatal((e.reason && e.reason.message) || String(e.reason)));
if (typeof supabase === 'undefined') { showFatal('the sign-in library did not load. Check your internet connection or an ad blocker, then refresh'); window.__stop = true; throw new Error('supabase library missing'); }
const SUPABASE_URL = 'https://hhjhsjmgywaoubvahbrr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YGJo51nSp2xv33-kDbbrNQ_hk8xi6DV';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let recovering = /type=recovery/.test(location.hash);   // arrived from a password reset email
db.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') { recovering = true; showReset(); } });
function showReset() { $('login').hidden = true; $('app').hidden = true; $('reset').hidden = false; }
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TAGS = ['Six studios. One team. Zero stiff necks.','Reach higher today. Then hold it for 30 seconds.','Great teams are flexible. So are we.','Today\u2019s forecast: lots of range of motion.','Stretch your limits, not your lunch break.','Lengthen your day, one member at a time.'];
let locs = [];

async function init() {
  if (recovering) { showReset(); return; }
  const { data: { session } } = await db.auth.getSession();
  if (session) showApp(session.user); else { $('login').hidden = false; $('app').hidden = true; if (/error_code=/.test(location.hash)) $('err').textContent = 'That reset link has expired or was already used. Click Forgot your password to get a new one.'; }
}

$('loginForm').onsubmit = async e => {
  e.preventDefault();
  $('err').textContent = '';
  const { error } = await db.auth.signInWithPassword({ email: $('email').value.trim(), password: $('pw').value });
  if (error) {
    $('err').textContent = /confirm/i.test(error.message) ? 'Almost there: check the inbox for that email for a message from Supabase and click the link in it, then come back and sign in.'
      : /invalid login/i.test(error.message) ? 'That email and password do not match. Double check both, or use Forgot your password below.'
      : /rate limit|too many/i.test(error.message) ? 'Too many attempts. Wait a few minutes and try again.'
      : 'Could not sign in: ' + error.message;
    return;
  }
  init();
};

$('signout').onclick = async () => { await db.auth.signOut(); $('pw').value = ''; init(); };

async function showApp(user) {
  $('login').hidden = true; $('app').hidden = false;
  const [l, m] = await Promise.all([
    db.from('locations').select('*').order('name'),
    db.from('profiles').select('*').eq('id', user.id).maybeSingle()
  ]);
  locs = l.data || [];
  const me = m.data;
  if (!me) { $('hello').textContent = 'Account not set up'; $('note').textContent = 'Your login has no profile yet. Ask the owner for help.'; return; }
  ME = me;
  await loadPages(); applyNav();
  $('studioFilter').innerHTML = '<option value="">All studios</option>' + locs.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  route();
  const loc = locs.find(x => x.id === me.location_id);
  $('who').textContent = me.full_name || me.email;
  $('meta').textContent = me.role + ' \u2022 ' + (me.role === 'owner' ? 'All locations' : loc ? loc.name : 'No location yet');
  const h = new Date().getHours(), first = me.full_name ? me.full_name.split(' ')[0] : '';
  $('hello').textContent = (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') + (first ? ', ' + first : '') + '!';
  $('tag').textContent = TAGS[Math.floor(Date.now() / 864e5) % TAGS.length];
  $('note').hidden = !(me.role !== 'owner' && !loc);
  $('note').textContent = 'You have not been assigned to a studio yet. Ask the owner to add you.';
  $('team').hidden = !canPage('people'); $('addPerson').hidden = me.role !== 'owner';
  if (canPage('people')) loadTeam(me);
}

function accessCell(p, isOwner) {
  if (!(isOwner && acc.groups && 'page_group' in p)) return '';
  if (p.role === 'owner') return '<span class="lead" style="margin:0">Full access</span>';
  return `<select class="acc" aria-label="Page access for ${esc(p.full_name || p.email)}"><option value="">Default for role</option>${acc.groups.map(g => `<option value="${g.id}" ${g.id === p.page_group ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>`;
}

async function loadTeam(me) {
  const isOwner = me.role === 'owner';
  $('teamTitle').textContent = isOwner ? 'Everyone' : 'Your location\u2019s team';
  $('teamNote').textContent = isOwner ? 'Set each person\u2019s name, role, location, and page access, then save.' : 'People at your location.';
  const [pr, gr] = await Promise.all([db.from('profiles').select('*').order('email'), isOwner ? db.from('page_groups').select('*').order('name') : Promise.resolve({ data: null })]);
  const data = pr.data; acc.groups = isOwner && !gr.error ? (gr.data || []) : null; acc.people = data || [];
  const dis = isOwner ? '' : 'disabled';
  $('rows').innerHTML = (data || []).map(p => {
    const self = p.id === me.id;
    return `<tr data-id="${p.id}">
      <td><input class="n" value="${esc(p.full_name)}" placeholder="Full name" ${dis}></td>
      <td>${esc(p.email)}</td>
      <td><select class="r" ${isOwner && !self ? '' : 'disabled'}>${['owner','manager','staff'].map(r => `<option value="${r}" ${r === p.role ? 'selected' : ''}>${r === 'owner' ? 'owner (sees everything)' : r}</option>`).join('')}</select></td>
      <td><select class="l" ${dis}><option value="">None</option>${locs.map(x => `<option value="${x.id}" ${x.id === p.location_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
      <td class="acccell">${accessCell(p, isOwner)}</td>
      <td>${isOwner ? '<button class="save">Save</button><span class="status"></span>' : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="6">No one here yet.</td></tr>';
  drawAccess();
}

$('rows').onchange = e => {
  if (!e.target.classList.contains('r')) return;
  const tr = e.target.closest('tr'), p = acc.people.find(x => x.id === tr.dataset.id); if (!p) return;
  tr.querySelector('.acccell').innerHTML = accessCell({ ...p, role: e.target.value }, true);
};

$('rows').onclick = async e => {
  if (!e.target.classList.contains('save')) return;
  const tr = e.target.closest('tr');
  const s = tr.querySelector('.status');
  const upd = {
    full_name: tr.querySelector('.n').value.trim() || null,
    role: tr.querySelector('.r').value,
    location_id: tr.querySelector('.l').value || null
  }, ac = tr.querySelector('.acc');
  if (ac) upd.page_group = ac.value || null;
  const { error } = await db.from('profiles').update(upd).eq('id', tr.dataset.id);
  if (!error) { const pp = acc.people.find(x => x.id === tr.dataset.id); if (pp) Object.assign(pp, upd); drawAccess(); }
  s.textContent = error ? 'Could not save' : 'Saved';
  setTimeout(() => s.textContent = '', 2500);
};

let ME = null, people = [], urls = {}, cur = null;

function route() {
  const v = location.hash === '#team' ? 'team' : location.hash === '#calendar' ? 'cal' : location.hash.startsWith('#tasks') ? 'tasks' : location.hash === '#members' ? 'mem' : location.hash === '#timeoff' ? 'off' : location.hash.startsWith('#studio') ? 'studio' : location.hash === '#people' ? 'people' : location.hash === '#performance' ? 'perf' : location.hash === '#supplies' ? 'sup' : location.hash === '#dpr' ? 'dpr' : location.hash === '#leadership' ? 'hr' : location.hash === '#payroll' ? 'pay' : 'home';
  const PK = { team: 'team', cal: 'calendar', tasks: 'tasks', mem: 'members', off: 'timeoff', studio: 'studio', people: 'people', perf: 'performance', sup: 'supplies', dpr: 'dpr', hr: 'leadership', pay: 'payroll' };
  if (ME && PK[v] && !canPage(PK[v])) { location.hash = '#home'; return; }
  $('homeView').hidden = v !== 'home'; $('teamView').hidden = v !== 'team'; $('calView').hidden = v !== 'cal'; $('taskView').hidden = v !== 'tasks'; $('memView').hidden = v !== 'mem'; $('toView').hidden = v !== 'off'; $('studioView').hidden = v !== 'studio'; $('peopleView').hidden = v !== 'people'; $('repView').hidden = v !== 'perf' && v !== 'dpr'; $('supView').hidden = v !== 'sup'; $('hrView').hidden = v !== 'hr'; $('payView').hidden = v !== 'pay';
  if (v === 'dpr') REP.sub = 'dpr'; else if (v === 'perf' && REP.sub === 'dpr') REP.sub = 'score';
  $('navTasks').classList.toggle('on', v === 'tasks'); $('navMem').classList.toggle('on', v === 'mem'); $('navOff').classList.toggle('on', v === 'off'); $('navStudio').classList.toggle('on', v === 'studio'); $('navPeople').classList.toggle('on', v === 'people'); $('navSup').classList.toggle('on', v === 'sup'); $('navHr').classList.toggle('on', v === 'hr'); $('navPay').classList.toggle('on', v === 'pay');
  $('navRep').classList.toggle('on', v === 'perf' || v === 'dpr');
  $('navAdminBtn').classList.toggle('on', ['perf', 'hr', 'pay', 'people'].includes(v));
  $('navHome').classList.toggle('on', v === 'home'); $('navTeam').classList.toggle('on', v === 'team'); $('navCal').classList.toggle('on', v === 'cal');
  if (v === 'team' && ME) loadPeople();
  if (v === 'cal' && ME) loadCal();
  if (v === 'tasks' && ME) { const id = location.hash.split('/')[1]; tk.uid = id || ME.id; if (id) tk.tab = 'mine'; loadTasks(); }
  if (v === 'mem' && ME) loadMem();
  if (v === 'off' && ME) loadTimeOff();
  if (ME && v !== 'off') timeOffBadge();
  if (ME) suppliesBadge();
  if (v === 'home' && ME) loadHome();
  if ((v === 'perf' || v === 'dpr') && ME) drawRepTabs();
  if (v === 'sup' && ME) loadSupplies();

  if (v === 'hr' && ME) loadHr();
  if (v === 'pay' && ME) loadPayroll();
  if (v === 'studio' && ME) loadStudio(location.hash.split('/')[1] || null);
}
addEventListener('hashchange', route);

const studio = id => (locs.find(x => x.id === id) || {}).name || 'No studio yet';
const photo = p => urls[p.photo_path] ? `<img src="${esc(urls[p.photo_path])}" alt="">` : esc((p.full_name || '?').trim()[0].toUpperCase());

async function loadPeople() {
  const { data } = await db.from('team_directory').select('*').order('full_name');
  people = data || []; urls = {};
  const paths = people.map(p => p.photo_path).filter(Boolean);
  if (paths.length) {
    const { data: s } = await db.storage.from('team-photos').createSignedUrls(paths, 3600);
    (s || []).forEach(x => { if (x.signedUrl) urls[x.path] = x.signedUrl; });
  }
  renderPeople();
}

function renderPeople() {
  const f = $('studioFilter').value;
  $('people').innerHTML = people.filter(p => !f || p.location_id === f).map(p =>
    `<button class="person" data-id="${p.id}"><div class="ph">${photo(p)}</div><b>${esc(p.full_name)}</b><span>${esc(p.job_title || '')}</span><span>${esc(studio(p.location_id))}</span></button>`
  ).join('') || '<p class="lead">No one here yet. Names are added by the owner.</p>';
}
$('studioFilter').onchange = renderPeople;
$('people').onclick = e => { const b = e.target.closest('.person'); if (b) openCard(b.dataset.id); };
$('editMine').onclick = () => {
  if (!people.find(p => p.id === ME.id)) { alert('Ask the owner to add your name first, then you can edit your card.'); return; }
  openCard(ME.id, true);
};

function openCard(id, edit) {
  const p = people.find(x => x.id === id); if (!p) return;
  cur = id;
  const canEdit = ME && (ME.id === id || ME.role === 'owner');
  const sub = `<p class="lead" style="margin:.25rem 0 1rem">${esc([p.job_title, studio(p.location_id)].filter(Boolean).join(' \u2022 '))}</p>`;
  const yrs = d => { const a = new Date(d + 'T00:00'), b = new Date(); let y = b.getFullYear() - a.getFullYear(); if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) y--; return y; };
  const bday = d => new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const contact = [p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '', p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : '',
    p.birthday ? 'Birthday ' + bday(p.birthday) : '', p.start_date ? `Here since ${fmt(p.start_date)}${yrs(p.start_date) > 0 ? ' (' + yrs(p.start_date) + ' yr' + (yrs(p.start_date) === 1 ? '' : 's') + ')' : ''}` : ''].filter(Boolean);
  $('dlgBody').innerHTML = edit
    ? `<h2>${esc(p.full_name)}</h2>${sub}
       <label>Photo <input type="file" id="fPhoto" accept="image/*"></label>
       <label>Job title <input id="fTitle" value="${esc(p.job_title)}" maxlength="80"></label>
       <div class="grid2"><label>Phone <input id="fPhone" type="tel" value="${esc(p.phone)}" maxlength="30"></label>
       <label>Birthday <input id="fBday" type="date" value="${esc(p.birthday)}"></label>
       <label>Start date <input id="fStart" type="date" value="${esc(p.start_date)}"></label></div>
       <label>Bio <textarea id="fBio" maxlength="1000" placeholder="Where you're from, what you love about stretching, a fun fact...">${esc(p.bio)}</textarea></label>
       <div id="fErr" role="alert" style="color:var(--danger)"></div>
       <div class="acts"><button id="fSave">Save</button><button class="quiet" id="fCancel">Cancel</button></div>`
    : `<div class="ph">${photo(p)}</div><h2>${esc(p.full_name)}</h2>${sub}
       ${contact.length ? `<div class="contact">${contact.join('<span>\u2022</span>')}</div>` : ''}
       <p style="white-space:pre-wrap;margin-top:.75rem">${esc(p.bio || 'No bio yet.')}</p>
       <div class="acts">${canEdit ? '<button id="fEdit">Edit</button>' : ''}${(ME.id === id || ME.role === 'owner' || (ME.role === 'manager' && p.location_id === ME.location_id)) ? `<button class="quiet" data-tasks="${id}">View tasks</button>` : ''}<button class="quiet" id="fClose">Close</button></div>`;
  if (!$('dlg').open) $('dlg').showModal();
}

function square(file) {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement('canvas');
      c.width = c.height = 480;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 480, 480);
      URL.revokeObjectURL(img.src);
      c.toBlob(b => b ? ok(b) : no(new Error('Photo failed')), 'image/jpeg', .85);
    };
    img.onerror = () => no(new Error('That photo could not be read. Try a JPG or PNG.'));
    img.src = URL.createObjectURL(file);
  });
}

$('dlgBody').onclick = async e => {
  const id = e.target.id;
  if (id === 'fClose') $('dlg').close();
  else if (id === 'fEdit') openCard(cur, true);
  else if (id === 'fCancel') openCard(cur);
  else if (id === 'fSave') {
    $('fSave').disabled = true; $('fErr').textContent = '';
    try {
      let path = null; const file = $('fPhoto').files[0];
      if (file) {
        const blob = await square(file);
        path = `${cur}/${Date.now()}.jpg`;
        const { error } = await db.storage.from('team-photos').upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
      }
      const { error } = await db.rpc('update_profile_card', { p_id: cur, p_title: $('fTitle').value, p_phone: $('fPhone').value, p_birthday: $('fBday').value || null, p_start_date: $('fStart').value || null, p_bio: $('fBio').value, p_photo_path: path });
      if (error) throw error;
      await loadPeople(); openCard(cur);
    } catch (err) { $('fErr').textContent = 'Could not save. ' + (err.message || ''); $('fSave').disabled = false; }
  }
};

// Small message above the tab bar, with an optional Undo
function toast(msg, undo) {
  let el = $('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  clearTimeout(el._t);
  el.innerHTML = `<span>${esc(msg)}</span>` + (undo ? '<button type="button">Undo</button>' : '');
  if (undo) el.querySelector('button').onclick = () => { el.classList.remove('show'); undo(); };
  el.classList.add('show');
  el._t = setTimeout(() => el.classList.remove('show'), undo ? 6000 : 2200);
}
