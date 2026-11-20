import { api, post } from './core/api.js';
import { state, emit, subscribe, loadAll, loadIssues, loadDetail } from './core/store.js';
import { connectWs } from './core/ws.js';
import { icon, esc, initials, lucide, groupOf } from './core/util.js';
import { toast, modal, confirmModal } from './components/ui.js';
import { loginView } from './views/login.js';
import { overviewView } from './views/overview.js';
import { inboxView } from './views/inbox.js';
import { issuesView } from './views/issues.js';
import { issueDetailView } from './views/issueDetail.js';
import { deploymentsView } from './views/deployments.js';
import { websitesView, websiteDetailView } from './views/websites.js';
import { settingsView, teamView, auditView, evaluationView } from './views/settings.js';

const app = document.getElementById('app');
const NAV = [
  { group: 'Work', items: [['overview', 'Overview', 'layout-dashboard'], ['inbox', 'Inbox', 'inbox'], ['issues', 'Issues', 'list-todo'], ['deployments', 'Deployments', 'rocket']] },
  { group: 'Sites', items: [['websites', 'Websites', 'globe']] },
  { group: 'Insight', items: [['evaluation', 'Evaluation', 'flask-conical'], ['audit', 'Audit', 'history']] },
  { group: 'Admin', items: [['team', 'Team', 'users'], ['settings', 'Settings', 'settings-2']] },
];
const TITLES = { overview: 'Overview', inbox: 'Approval inbox', issues: 'Issues', issue: 'Issue detail', deployments: 'Deployments', websites: 'Websites', website: 'Website detail', evaluation: 'Evaluation', audit: 'Audit log', team: 'Team', settings: 'Settings' };

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [view, id] = raw.split('/');
  return { view: view || 'overview', id };
}
function navigate(view, id) {
  location.hash = `#/${view}${id ? '/' + id : ''}`;
}
window.addEventListener('hashchange', route);
window.addEventListener('bs:navigate', (e) => navigate(e.detail.view, e.detail.id));

async function route() {
  const { view, id } = parseHash();
  emit({ view, params: { id } }, true);
  if (!state.user) { renderLogin(); return; }
  if (view === 'issue' && id) {
    try { await loadDetail(id); } catch (e) { toast(e.message, 'err'); navigate('issues'); return; }
  }
  if (view === 'inbox' || view === 'issues') { loadIssues().catch(() => {}); }
  render();
}

function shell(view) {
  const counts = { inbox: state.stats?.awaiting || 0 };
  const nav = NAV.map((g) => `<div class="nav-group"><div class="nav-label">${g.group}</div>
    ${g.items.map(([v, label, ico]) => `<button class="nav-item ${view === v ? 'active' : ''}" data-nav="${v}">
      ${icon(ico)}<span>${label}</span>${counts[v] ? `<span class="count alert">${counts[v]}</span>` : ''}</button>`).join('')}
  </div>`).join('');
  return `<div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">${icon('shield-check')}</div><div><div class="brand-name">BugShield</div><div class="brand-sub">Mission control</div></div></div>
      <nav>${nav}</nav>
      <div class="sidebar-foot"><div class="live-chip"><span class="dot ${state.live ? '' : 'off'}"></span><span>${state.live ? 'Live · WebSocket connected' : 'Live · reconnecting'}</span></div>
        <div class="version-line">${esc(state.renderGitCommit || 'local')} · $0 hosting</div></div>
    </aside>
    <div class="main-col">
      <header class="topbar">
        <div class="crumb">BugShield&nbsp;/&nbsp;<b>${esc(TITLES[view] || view)}</b></div>
        <button class="search-trigger" id="paletteBtn">${icon('search','sm')}<span class="lbl">Search or jump to…</span><kbd>Ctrl K</kbd></button>
        <span class="spacer"></span>
        <span class="badge ${state.live ? 'green' : 'gray'}"><span class="dot ${state.live ? '' : 'off'}"></span>${state.live ? 'LIVE' : 'OFFLINE'}</span>
        <button class="icon-btn" id="themeBtn" title="Toggle theme">${icon(state.theme === 'light' ? 'sun' : 'moon')}</button>
        <button class="icon-btn" id="bellBtn" title="Notifications">${icon('bell')}${state.stats?.awaiting ? '<span class="notif"></span>' : ''}</button>
        <div class="user-chip"><span class="avatar">${esc(initials(state.user?.name || 'BU'))}</span><span class="nm">${esc(state.user?.name || '')}</span>
          <button class="icon-btn sm" id="userBtn">${icon('chevron-down','sm')}</button></div>
      </header>
      <main class="content" id="viewRoot"></main>
      <nav class="bottom-tabs">${[['overview','Home','house'],['inbox','Inbox','inbox'],['issues','Issues','list-todo'],['websites','Sites','globe'],['settings','Settings','settings-2']].map(([v,l,i]) => `<button data-nav="${v}" class="${view === v ? 'active' : ''}">${icon(i)}<span>${l}</span></button>`).join('')}</nav>
    </div>
  </div>`;
}

function renderLogin() {
  app.innerHTML = loginView().html;
  lucide();
  loginView().mount();
}

async function render() {
  if (!state.user) { renderLogin(); return; }
  const view = state.view;
  app.innerHTML = shell(view);
  const root = document.getElementById('viewRoot');
  let v;
  switch (view) {
    case 'overview': v = overviewView(); break;
    case 'inbox': v = inboxView(); break;
    case 'issues': v = issuesView(); break;
    case 'issue': v = issueDetailView(); break;
    case 'deployments': v = await deploymentsView(); break;
    case 'websites': v = websitesView(); break;
    case 'website': v = websiteDetailView(); break;
    case 'evaluation': v = await evaluationView(); break;
    case 'audit': v = auditView(); break;
    case 'team': v = teamView(); break;
    case 'settings': v = settingsView(); break;
    default: v = overviewView();
  }
  root.innerHTML = v.html;
  v.mount?.(root);
  bindShell();
  lucide();
}

function bindShell() {
  document.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => navigate(b.dataset.nav));
  document.getElementById('themeBtn').onclick = () => {
    const order = ['dark', 'light', 'system'];
    const next = order[(order.indexOf(state.theme) + 1) % 3];
    setTheme(next);
  };
  document.getElementById('bellBtn').onclick = () => navigate('inbox');
  document.getElementById('paletteBtn').onclick = openPalette;
  document.getElementById('userBtn').onclick = async () => {
    if (await confirmModal('Sign out?', 'You will need to sign in again.')) {
      await post('/auth/logout', {}); emit({ user: null, detail: null }); navigate('overview');
    }
  };
}

function setTheme(t) {
  const resolved = t === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t;
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem('bs-theme', t);
  emit({ theme: t }, true);
}

const COMMANDS = [
  ['Go to Overview', 'layout-dashboard', 'overview'], ['Open Approval inbox', 'inbox', 'inbox'],
  ['Browse Issues', 'list-todo', 'issues'], ['View Deployments', 'rocket', 'deployments'],
  ['Manage Websites', 'globe', 'websites'], ['Evaluation', 'flask-conical', 'evaluation'],
  ['Audit log', 'history', 'audit'], ['Team', 'users', 'team'], ['Settings', 'settings-2', 'settings'],
];
function openPalette() {
  let q = '';
  const m = modal({ title: 'Command palette', body: `<input class="input" id="palQ" placeholder="Type a command…" autofocus><div class="palette-list" id="palList"></div>` });
  const list = m.el.querySelector('#palList');
  const draw = () => {
    const items = COMMANDS.filter((c) => c[0].toLowerCase().includes(q.toLowerCase()));
    list.innerHTML = items.map((c, n) => `<div class="palette-item ${n === 0 ? 'sel' : ''}" data-view="${c[2]}">${icon(c[1])}<span>${esc(c[0])}</span></div>`).join('') || '<div class="empty small">No commands</div>';
    list.querySelectorAll('[data-view]').forEach((el) => el.onclick = () => { m.close(); navigate(el.dataset.view); });
  };
  const inp = m.el.querySelector('#palQ');
  inp.oninput = () => { q = inp.value; draw(); };
  inp.onkeydown = (e) => {
    if (e.key === 'Enter') { const first = list.querySelector('[data-view]'); if (first) { m.close(); navigate(first.dataset.view); } }
  };
  setTimeout(() => inp.focus(), 30);
  draw();
}

window.addEventListener('bs:theme', (e) => setTheme(e.detail.theme));

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (state.user) openPalette(); }
  if (e.key === 'Escape') document.querySelector('.backdrop [data-close]')?.click();
});

window.addEventListener('bs:unauthorized', async () => {
  if (!state.user) return;
  const m = modal({
    title: 'Session expired',
    body: '<p class="muted">Your session has ended. Sign in again to continue.</p>',
    foot: '<button class="btn primary" data-ok>Sign in</button>',
  });
  m.el.querySelector('[data-ok]').onclick = async () => { m.close(); emit({ user: null }); navigate('overview'); };
});

setTheme(state.theme);
subscribe(() => { if (state.user && document.getElementById('app')) render().catch((e) => console.error(e)); });

(async function boot() {
  try { await loadAll(); } catch (e) { toast(e.message, 'err'); }
  await route();
  if (state.user) connectWs();
})();
