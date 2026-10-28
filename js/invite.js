// ---------- Add & invite ----------
const invite = { groups: null, staff: [] };
const genPass = () => { const w = ['Coral', 'Trail', 'Summit', 'Amber', 'Cedar', 'Delta', 'Maple', 'River', 'Clover', 'Basil', 'Harbor', 'Willow']; return w[Math.floor(Math.random() * w.length)] + w[Math.floor(Math.random() * w.length)] + (10 + Math.floor(Math.random() * 90)); };

async function inviteForm() {
  if (invite.groups === null) { const { data } = await db.from('page_groups').select('*').order('name'); invite.groups = data || []; }
  // People on the Leadership pay roster who don't have a login yet
  const sr = await db.from('staff').select('id,full_name,studio_id,role,user_id,status').is('user_id', null).order('full_name');
  invite.staff = sr.error ? [] : (sr.data || []).filter(x => x.status !== 'terminated');
  $('dlgBody').innerHTML = `<h2>Add & invite</h2><p class="lead" style="margin:.25rem 0 1rem">Creates their login right away. You'll get an email you can send them with their sign-in details.</p>
    ${invite.staff.length ? `<label>Pick from your staff list <small class="muted">(fills in their name and studio, and links their pay record)</small><select id="ivStaff"><option value="">Someone new</option>${locs.map(l => [l, invite.staff.filter(x => x.studio_id === l.id)]).concat([[{ name: 'No studio' }, invite.staff.filter(x => !x.studio_id || !locs.some(l => l.id === x.studio_id))]]).filter(([, a]) => a.length).map(([l, a]) => `<optgroup label="${esc(l.name)}">${a.map(x => `<option value="${x.id}">${esc(x.full_name)}${x.role ? ' \u2022 ' + esc(x.role) : ''}</option>`).join('')}</optgroup>`).join('')}</select></label>` : ''}
    <div class="grid2"><label>Full name<input id="ivName" maxlength="80"></label><label>Email<input id="ivEmail" type="email"></label>
    <label>Role<select id="ivRole"><option value="staff">Staff</option><option value="manager">Manager</option><option value="owner">Owner</option></select></label>
    <label>Studio<select id="ivStudio"><option value="">None yet</option>${locs.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></label>
    <label>Page access<select id="ivGroup"><option value="">Default for role</option>${invite.groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>
    <label>Temporary password<span style="display:flex;gap:.5rem"><input id="ivPass" value="${genPass()}" style="flex:1"><button type="button" class="quiet" id="ivGen">New</button></span></label></div>
    <div class="err" id="ivErr" role="alert"></div><div class="acts"><button data-act="ivCreate">Create login</button><button class="quiet" data-act="close">Cancel</button></div>`;
  $('ivGen').onclick = () => { $('ivPass').value = genPass(); };
  if ($('ivStaff')) $('ivStaff').onchange = e => { const x = invite.staff.find(y => y.id === e.target.value); if (!x) return; $('ivName').value = x.full_name; $('ivStudio').value = x.studio_id || ''; $('ivRole').value = /manager|director/i.test(x.role || '') ? 'manager' : 'staff'; $('ivEmail').focus(); };
  if (!$('dlg').open) $('dlg').showModal();
}

async function inviteCreate() {
  const name = $('ivName').value.trim(), email = $('ivEmail').value.trim(), role = $('ivRole').value, loc = $('ivStudio').value || null, group = $('ivGroup').value || null, pass = $('ivPass').value;
  const err = $('ivErr'); err.textContent = '';
  if (!name) return err.textContent = 'Add their name.';
  if (!/^\S+@\S+\.\S+$/.test(email)) return err.textContent = 'Add a valid email.';
  if (pass.length < 8) return err.textContent = 'The password needs at least 8 characters.';
  const go = document.querySelector('[data-act="ivCreate"]'); go.disabled = true; go.textContent = 'Creating...';
  const emailLc = email.toLowerCase();
  try {
    // Puts them on the allow-list first, so the database recognizes this signup as one you started.
    const { error: aerr } = await db.from('signup_allowlist').upsert({ email: emailLc, requested_by: ME.id }, { onConflict: 'email' });
    if (aerr) throw new Error(/does not exist|schema cache/i.test(aerr.message) ? 'The database is not set up for this yet. Run invite-security.sql, then try again.' : 'Could not start the invite. ' + aerr.message);
    // A separate, throwaway connection: this creates their login without touching your own sign-in.
    const tmp = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await tmp.auth.signUp({ email, password: pass });
    if (error) {
      await db.from('signup_allowlist').delete().eq('email', emailLc);
      throw new Error(/registered|exists/i.test(error.message) ? 'Someone with that email already has a login.' : /not allowed|disabled/i.test(error.message) ? 'Sign-ups are switched off in Supabase. Turn on Authentication → Sign In / Providers → Email → Allow new users to sign up, then try again.' : error.message);
    }
    if (!data || !data.user) { await db.from('signup_allowlist').delete().eq('email', emailLc); throw new Error('That did not go through. Try again in a moment.'); }
    const { error: perr } = await db.from('profiles').upsert({ id: data.user.id, email, full_name: name, role, location_id: loc, page_group: group }, { onConflict: 'id' });
    if (perr) throw new Error('Login created, but saving their details failed: ' + perr.message);
    const sid = $('ivStaff') && $('ivStaff').value; if (sid) await db.from('staff').update({ user_id: data.user.id }).eq('id', sid);
    inviteDone(name, email, pass);
    await loadTeam(ME);
  } catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = 'Create login'; }
}

function inviteDone(name, email, pass) {
  const first = name.split(' ')[0], site = location.origin + location.pathname;
  const body = `Hi ${first},\n\nYou now have access to the Stretch Zone Austin team portal.\n\nSite: ${site}\nEmail: ${email}\nTemporary password: ${pass}\n\nSign in, then click Password in the top right to set your own password.\n\nOne more thing: check your inbox for a confirmation email and click the link in it once, or this password will not work yet.`;
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Your Stretch Zone Austin portal login')}&body=${encodeURIComponent(body)}`;
  $('dlgBody').innerHTML = `<h2>${esc(name)}'s login is ready</h2><p class="lead" style="margin:.25rem 0 1rem">Send them this, or copy it into whatever you use to message them.</p>
    <textarea id="ivMsg" rows="9" readonly>${esc(body)}</textarea>
    <p class="lead" style="margin:.75rem 0 0;font-size:.85rem">They'll also get one confirmation email from Supabase. They need to click it once before the password works.</p>
    <div class="acts"><a href="${mailto}"><button type="button">Open in email</button></a><button class="quiet" id="ivCopy">Copy message</button><button class="quiet" data-act="close">Done</button></div>`;
  $('ivCopy').onclick = () => { $('ivMsg').select(); navigator.clipboard && navigator.clipboard.writeText(body).catch(() => {}); $('ivCopy').textContent = 'Copied'; setTimeout(() => $('ivCopy').textContent = 'Copy message', 1500); };
}

$('addPerson').onclick = inviteForm;
$('dlgBody').addEventListener('click', e => { if (e.target.dataset.act === 'ivCreate') inviteCreate(); });
