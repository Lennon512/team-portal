// ---------- Passwords ----------
$('forgot').onclick = async e => {
  e.preventDefault();
  const em = $('email').value.trim();
  if (!em) { $('err').textContent = 'Type your email above first, then click Forgot your password.'; return; }
  $('err').textContent = ''; $('okmsg').textContent = 'Sending...';
  const { error } = await db.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
  if (error) { $('okmsg').textContent = ''; $('err').textContent = 'Could not send the reset email. ' + error.message; return; }
  $('okmsg').textContent = 'If that email has an account, a reset link is on its way. Check your inbox and spam folder.';
};
$('resetForm').onsubmit = async e => {
  e.preventDefault();
  const a = $('rp1').value, b = $('rp2').value;
  if (a.length < 8) { $('rerr').textContent = 'Use at least 8 characters.'; return; }
  if (a !== b) { $('rerr').textContent = 'The two passwords do not match.'; return; }
  const { error } = await db.auth.updateUser({ password: a });
  if (error) { $('rerr').textContent = 'Could not save. ' + error.message; return; }
  recovering = false; $('reset').hidden = true; $('rp1').value = ''; $('rp2').value = ''; history.replaceState(null, '', location.pathname); init();
};
$('pwBtn').onclick = () => {
  $('dlgBody').innerHTML = `<h2>Change my password</h2><label>New password <input id="cp1" type="password" autocomplete="new-password"></label><label>Confirm password <input id="cp2" type="password" autocomplete="new-password"></label>
    <div class="err" id="cpErr" role="alert"></div><div class="acts"><button data-act="pwSave">Save password</button><button class="quiet" data-act="close">Cancel</button></div>`;
  $('dlg').showModal();
};
$('dlgBody').addEventListener('click', async e => {
  if (e.target.dataset.act !== 'pwSave') return;
  const a = $('cp1').value, b = $('cp2').value;
  if (a.length < 8) { $('cpErr').textContent = 'Use at least 8 characters.'; return; }
  if (a !== b) { $('cpErr').textContent = 'The two passwords do not match.'; return; }
  const { error } = await db.auth.updateUser({ password: a });
  if (error) { $('cpErr').textContent = 'Could not save. ' + error.message; return; }
  $('dlgBody').innerHTML = '<h2>Password changed</h2><p class="lead">Use your new password next time you sign in.</p><div class="acts"><button data-act="close">Close</button></div>';
});
