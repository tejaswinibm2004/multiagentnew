import { post } from '../core/api.js';
import { icon, esc } from '../core/util.js';
import { toast } from '../components/ui.js';
import { emit } from '../core/store.js';
import { connectWs } from '../core/ws.js';

export function loginView() {
  const html = `<div class="login-wrap">
    <section class="login-brand">
      <div class="brand"><div class="brand-mark">${icon('shield-check')}</div><div><div class="brand-name">BugShield</div><div class="brand-sub">Mission control</div></div></div>
      <div class="login-hero">
        <span class="eyebrow">Multi-agent bug detection</span>
        <h1>From report to <em>deployed fix</em>, automatically.</h1>
        <p>A visitor reports a bug. AI reads your real source code, decides if it's genuine, writes a minimal fix, verifies it with real tools, and ships it through a Git commit — with a human gate for anything risky.</p>
        <div class="login-feats">
          <div class="login-feat"><div class="fi">${icon('brain','sm')}</div><div><b>Explainable AI triage</b><br><span class="muted">Every verdict is backed by source windows and a recorded step.</span></div></div>
          <div class="login-feat"><div class="fi">${icon('git-commit-horizontal','sm')}</div><div><b>Real deployment proof</b><br><span class="muted">Fixes land as commits; the live SHA is verified before we call it done.</span></div></div>
          <div class="login-feat"><div class="fi">${icon('hand','sm')}</div><div><b>Safe by default</b><br><span class="muted">Money, auth and critical-risk fixes pause for your approval.</span></div></div>
        </div>
      </div>
      <div class="login-foot">BCS786 · Team 40 · Sai Vidya Institute of Technology · VTU</div>
    </section>
    <section class="login-side">
      <form class="login-card" id="loginForm">
        <h2>Welcome back</h2>
        <p class="sub">Sign in to your BugShield workspace.</p>
        <div class="field"><label for="email">Email</label><input class="input" id="email" type="email" autocomplete="username" value="admin@bugshield.local" required></div>
        <div class="field"><label for="password">Password</label><input class="input" id="password" type="password" autocomplete="current-password" placeholder="••••••••••••" required></div>
        <div class="row" style="margin:6px 0 20px"><label class="row small muted" style="gap:7px"><input type="checkbox" id="showPw"> Show password</label></div>
        <button class="btn primary block" type="submit" id="signIn">${icon('log-in','sm')} Sign in</button>
        <div class="demo-note">Local demo credentials are pre-filled. Set <code>BUGSHIELD_SEED_PASSWORD</code> in your environment for a fresh deploy.</div>
      </form>
    </section>
  </div>`;
  return {
    html,
    mount() {
      const form = document.getElementById('loginForm');
      document.getElementById('showPw').onchange = (e) => {
        document.getElementById('password').type = e.target.checked ? 'text' : 'password';
      };
      form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('signIn');
        btn.disabled = true; btn.textContent = 'Signing in…';
        try {
          const r = await post('/auth/login', { email: document.getElementById('email').value, password: document.getElementById('password').value });
          emit({ user: r.user }); connectWs();
          window.dispatchEvent(new CustomEvent('bs:navigate', { detail: { view: 'overview' } }));
        } catch (err) {
          toast(err.message, 'err'); btn.disabled = false; btn.textContent = 'Sign in';
        }
      };
    },
  };
}
