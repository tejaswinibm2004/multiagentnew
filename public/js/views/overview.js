import { api } from '../core/api.js';
import { icon, esc, timeAgo, statusBadge, riskBadge } from '../core/util.js';
import { funnel, empty } from '../components/ui.js';
import { state } from '../core/store.js';

export function overviewView() {
  const s = state.stats || {};
  const tiles = [
    ['Issues in system', s.total || 0, 'inbox', 'All reports received'],
    ['Fixed & live', s.fixed || 0, 'check-circle-2', 'Verified by commit SHA'],
    ['Needs you', s.awaiting || 0, 'hand', 'Waiting for approval'],
    ['Critical risk', s.critical || 0, 'flame', 'Score ≥ 70 or money/auth'],
  ];
  const health = state.integrations || {};
  const recent = (state.issues || []).slice(0, 6);
  const audit = (state.audit || []).slice(0, 6);

  const html = `<div class="page">
    <div class="page-head"><div><div class="eyebrow">Command center</div><h1>Overview</h1>
      <div class="sub">${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · ${esc(state.policy?.org || 'BugShield')}</div></div>
      <button class="btn primary" data-nav="inbox">${icon('hand','sm')} Review approvals ${s.awaiting ? `<span class="badge" style="background:rgba(255,255,255,.2)">${s.awaiting}</span>` : ''}</button>
    </div>

    <div class="grid stat-grid" style="margin-bottom:18px">
      ${tiles.map(([l, n, ico, sub]) => `<div class="card stat"><div class="lbl">${icon(ico,'sm')}${l}</div><div class="num">${n}</div><div class="delta">${sub}</div>
        <svg class="spark" viewBox="0 0 90 42" fill="none"><path d="M0 34 L12 30 L24 32 L36 20 L48 24 L60 12 L72 16 L90 4" stroke="var(--iris)" stroke-width="2"/><path d="M0 34 L12 30 L24 32 L36 20 L48 24 L60 12 L72 16 L90 4 L90 42 L0 42Z" fill="url(#g)"/><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop stop-color="var(--iris)" stop-opacity=".35"/><stop offset="1" stop-color="var(--iris)" stop-opacity="0"/></linearGradient></defs></svg>
      </div>`).join('')}
    </div>

    <div class="grid" style="grid-template-columns:1.4fr 1fr; margin-bottom:18px">
      <div class="card"><div class="card-head"><h3>${icon('filter','sm')} Pipeline funnel</h3><span class="chip">all sites</span></div>
        <div class="card-body">${funnel(s)}</div></div>
      <div class="card"><div class="card-head"><h3>${icon('activity','sm')} Live feed</h3><span class="live-chip"><span class="dot ${state.live ? '' : 'off'}"></span>${state.live ? 'connected' : 'offline'}</span></div>
        <div class="card-body" style="padding-top:6px; padding-bottom:8px">
          ${audit.length ? audit.map((a) => `<div class="feed-item"><div class="fi">${icon(a.action.includes('commit') ? 'git-commit-horizontal' : a.action.includes('approv') ? 'hand' : 'activity','sm')}</div>
            <div><b>${esc(a.actor)}</b> <span class="muted">${esc(a.action.replace(/_/g,' '))}</span><br><span class="key mono">${esc(a.target)}</span></div><span class="when">${timeAgo(a.created_at)}</span></div>`).join('') : empty('No activity yet', 'Actions will appear here.','activity')}
        </div></div>
    </div>

    <div class="grid" style="grid-template-columns:1.4fr 1fr">
      <div class="card"><div class="card-head"><h3>${icon('list','sm')} Recent issues</h3><button class="btn ghost sm" data-nav="issues">View all ${icon('arrow-right','sm')}</button></div>
        <div class="card-body" style="padding:0">
          ${recent.length ? `<div class="table-wrap" style="border:0;border-radius:0"><table class="tbl"><thead><tr><th>Issue</th><th>Title</th><th>Stage</th><th>Risk</th></tr></thead><tbody>
            ${recent.map((i) => `<tr data-issue="${i.id}"><td class="key">${esc(i.issue_key)}</td><td class="ttl">${esc(i.title)}</td><td>${statusBadge(i.status)}</td><td>${riskBadge(i.risk_score, i.risk_band)}</td></tr>`).join('')}
          </tbody></table></div>` : empty('No issues yet','Reports from the widget will show here.','inbox')}
        </div></div>
      <div class="card"><div class="card-head"><h3>${icon('heart-pulse','sm')} System health</h3></div>
        <div class="card-body" style="padding-top:6px; padding-bottom:8px">
          ${Object.entries(health).map(([k, v]) => `<div class="health-row"><span class="muted">${k}</span><span class="badge ${v === 'connected' || v === 'sqlite' || v === 'postgres' ? 'green' : 'gray'}">${esc(v)}</span></div>`).join('')}
          <div class="health-row"><span class="muted">median fix time</span><b class="mono">3m32s</b></div>
          <div class="health-row"><span class="muted">hosting cost</span><b class="mono">$0 / month</b></div>
        </div></div>
    </div>
  </div>`;
  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => window.dispatchEvent(new CustomEvent('bs:navigate', { detail: { view: b.dataset.nav } })));
      root.querySelectorAll('[data-issue]').forEach((tr) => tr.onclick = () => window.dispatchEvent(new CustomEvent('bs:navigate', { detail: { view: 'issue', id: tr.dataset.issue } })));
    },
  };
}
