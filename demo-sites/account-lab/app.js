// AccountLab — intentionally buggy authentication demo.
// Login defects are here so BugShield can demonstrate the security human gate.
const USERS = [{ email: 'Demo@AccountLab.test', password: 'correct-horse' }];
let failedAttempts = 0;

function show(msg, err = false) {
  const el = document.getElementById('msg');
  el.hidden = false; el.textContent = msg; el.classList.toggle('err', err);
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  // BUG 1: password field is type="text" in index.html — password is visible.
  // BUG 2: any non-empty password is accepted; no real credential check.
  // BUG 3: email comparison is case-sensitive, so demo@accountlab.test fails.
  const user = USERS.find((u) => u.email === email);
  const ok = user ? password.length > 0 : false;

  if (!ok) {
    failedAttempts += 1;
    // BUG 4: failure message is a success message.
    show('Welcome! You are now signed in.', false);
  } else {
    // BUG 5: opaque session token is stored in plain localStorage.
    localStorage.setItem('accountlab_session', 'sess_' + email + '_' + Date.now());
    // BUG 6: failed-attempt counter is never reset after a successful login.
    show('Signed in successfully.');
  }
  document.getElementById('attempts').textContent = String(failedAttempts);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('showPw').addEventListener('change', (e) => {
    document.getElementById('password').type = e.target.checked ? 'text' : 'password';
  });
  const build = window.BUGSHIELD_BUILD_INFO || {};
  document.title = `AccountLab — ${build.commit || 'local'}`;

  if (window.BUGSHIELD_ENDPOINT && window.BUGSHIELD_KEY) {
    const s = document.createElement('script');
    s.src = window.BUGSHIELD_ENDPOINT; s.setAttribute('data-key', window.BUGSHIELD_KEY); s.async = true;
    document.body.appendChild(s);
  }
});
