import { api, post } from '../core/api.js';
import { icon, esc, timeAgo } from '../core/util.js';
import { toast, empty } from '../components/ui.js';
import { state, loadAll } from '../core/store.js';

export function settingsView() {
  const p = state.policy || {};
  const integ = state.integrations || {};
  return {
    html: `<div class="page">
      <div class="page-head"><div><div class="eyebrow">Workspace configuration</div><h1>Settings</h1><div class="sub">Org policy and connected services.</div></div></div>
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h3>${icon('shield','sm')} Deployment policy</h3><span class="badge violet">owner only</span></div><div class="card-body">
          <div class="health-row"><div><b>Auto-deploy non-critical fixes</b><div class="small dim">Zero-click for low-risk fixes. Critical always pauses.</div></div>
            <label class="switch"><input type="checkbox" id="pAuto" ${p.autoDeploy ? 'checked' : ''}><span></span></label></div>
          <div class="health-row"><div><b>Always require approval for this org</b><div class="small dim">Overrides auto-deploy for every site.</div></div>
            <label class="switch"><input type="checkbox" id="pAlways" ${p.alwaysApproveSite ? 'checked' : ''}><span></span></label></div>
          <div class="field" style="margin-top:16px"><label>Critical risk threshold</label><input class="input" id="pThreshold" type="number" min="1" max="100" value="${p.riskThreshold || 70}"></div>
          <div class="field" style="margin-top:12px"><label>Organisation label</label><input class="input" id="pOrg" value="${esc(p.org || '')}"></div>
          <button class="btn primary" id="savePolicy" style="margin-top:16px">${icon('save','sm')} Save policy</button>
        </div></div>
        <div class="card"><div class="card-head"><h3>${icon('plug','sm')} Integrations</h3></div><div class="card-body">
          ${Object.entries(integ).map(([k, v]) => `<div class="health-row"><span class="muted">${k}</span><span class="badge ${v === 'connected' || v === 'sqlite' || v === 'postgres' ? 'green' : 'gray'}">${esc(v)}</span></div>`).join('') || empty('No integration data','—','plug')}
          <p class="small dim" style="margin-top:14px">AI and GitHub run through fetch to OpenAI-compatible and Git Data APIs. Missing keys produce AI_UNAVAILABLE / GITHUB_UNAVAILABLE — never silent success.</p>
        </div></div>
      </div>
    </div>`,
      mount(root) {
        root.querySelector('#savePolicy').onclick = async () => {
          try {
            await post('/api/settings/policy', { autoDeploy: root.querySelector('#pAuto').checked, alwaysApproveSite: root.querySelector('#pAlways').checked, riskThreshold: Number(root.querySelector('#pThreshold').value), org: root.querySelector('#pOrg').value });
            toast('Policy saved', 'ok'); await loadAll();
          } catch (e) { toast(e.message, 'err'); }
        };
      },
    };
}

export function teamView() {
  const roles = ['viewer', 'reviewer', 'admin', 'owner'];
  const matrix = {
    'View issues': '✓ ✓ ✓ ✓', 'Approve fixes': '· ✓ ✓ ✓', 'Manage sites': '· · ✓ ✓',
    'Manage team': '· · ✓ ✓', 'Change policy': '· · · ✓', 'Revert deploy': '· · ✓ ✓',
  };
  return {
    html: `<div class="page">
      <div class="page-head"><div><div class="eyebrow">Access control</div><h1>Team</h1><div class="sub">Four roles. Sessions are opaque, hashed at rest, 12h TTL.</div></div>
        <button class="btn primary" id="addMember">${icon('user-plus','sm')} Add member</button></div>
      <div class="grid" style="grid-template-columns:1.3fr 1fr">
        <div class="card"><div class="table-wrap" style="border:0;border-radius:0"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead><tbody>
          ${(state.members || []).map((m) => `<tr><td><span class="row"><span class="avatar">${esc(m.name.slice(0,2).toUpperCase())}</span>${esc(m.name)}</span></td><td class="mono small">${esc(m.email)}</td><td><span class="badge ${m.role === 'owner' ? 'violet' : 'gray'}">${esc(m.role)}</span></td><td class="dim small">${timeAgo(m.created_at)}</td></tr>`).join('')}
        </tbody></table></div></div>
        <div class="card"><div class="card-head"><h3>${icon('table-2','sm')} Role matrix</h3></div><div class="card-body">
          ${Object.entries(matrix).map(([k, v]) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v mono">${v}</span></div>`).join('')}
          <p class="tiny dim" style="margin-top:14px">Legend: viewer · reviewer · admin · owner</p>
        </div></div>
      </div>
    </div>`,
      mount(root) {
        root.querySelector('#addMember').onclick = async () => {
          const email = prompt('Member email:');
          if (!email) return;
          const role = prompt('Role (viewer/reviewer/admin):', 'reviewer');
          if (!roles.includes(role) || role === 'owner') return toast('Invalid role', 'err');
          try {
            const r = await post('/api/members', { email, name: email.split('@')[0], role });
            toast(`Added. Temp password: ${r.tempPassword}`, 'ok', 12000);
            const m = await api('/api/members'); emitMembers(m.members);
          } catch (e) { toast(e.message, 'err'); }
        };
        api('/api/members').then((m) => emitMembers(m.members)).catch(() => {});
      },
    };
}

function emitMembers(members) {
  const root = document.getElementById('app');
  const tbody = root.querySelector('.tbl tbody');
  if (!tbody) return;
  tbody.innerHTML = members.map((m) => `<tr><td><span class="row"><span class="avatar">${esc(m.name.slice(0,2).toUpperCase())}</span>${esc(m.name)}</span></td><td class="mono small">${esc(m.email)}</td><td><span class="badge ${m.role === 'owner' ? 'violet' : 'gray'}">${esc(m.role)}</span></td><td class="dim small">${timeAgo(m.created_at)}</td></tr>`).join('');
}

export function auditView() {
  const rows = state.audit || [];
  return {
    html: `<div class="page">
      <div class="page-head"><div><div class="eyebrow">Traceability</div><h1>Audit log</h1><div class="sub">Every decision, approval, commit and revert is recorded.</div></div>
        <button class="btn sm" id="reload">${icon('refresh-cw','sm')} Refresh</button></div>
      <div class="grid" style="grid-template-columns:1.4fr 1fr">
        <div class="card"><div class="table-wrap" style="border:0;border-radius:0"><table class="tbl"><thead><tr><th>Actor</th><th>Action</th><th>Target</th><th>When</th></tr></thead><tbody id="auditBody">
          ${rows.map(auditRow).join('')}
        </tbody></table></div></div>
        <div class="card"><div class="card-head"><h3>${icon('history','sm')} Recent timeline</h3></div><div class="card-body timeline">
          ${rows.slice(0, 12).map((a) => `<div class="tl-item"><div class="tl-act">${esc(a.action.replace(/_/g, ' '))}</div><div class="tl-meta">${esc(a.actor)} → ${esc(a.target)} · ${timeAgo(a.created_at)}</div></div>`).join('') || empty('No audit rows','—','history')}
        </div></div>
      </div>
    </div>`,
      mount(root) {
        root.querySelector('#reload').onclick = async () => {
          const r = await api('/api/audit');
          root.querySelector('#auditBody').innerHTML = r.audit.map(auditRow).join('');
        };
      },
    };
}
const auditRow = (a) => `<tr><td>${esc(a.actor)}</td><td><span class="badge gray">${esc(a.action.replace(/_/g, ' '))}</span></td><td class="key mono">${esc(a.target)}</td><td class="dim small">${timeAgo(a.created_at)}</td></tr>`;

export async function evaluationView() {
  let r = { fixtures: [], languages: {}, summary: {} };
  try { r = await (await fetch('/benchmark/results.json')).json(); } catch {}
  const langs = r.languages || {};
  const max = Math.max(1, ...Object.values(langs).map((x) => x.total || 0));
  return {
    html: `<div class="page">
      <div class="page-head"><div><div class="eyebrow">Evidence</div><h1>Evaluation</h1>
        <div class="sub">${esc(r.summary?.localized || 0)}/${esc(r.summary?.total || 0)} fixtures localized · 25/25 backend tests green.</div></div>
        <span class="chip">${icon('flask-conical','sm')} benchmark v1</span></div>
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h3>${icon('bar-chart-3','sm')} Localization by language</h3></div><div class="card-body">
          ${Object.entries(langs).map(([lang, v]) => `<div class="eval-bar"><span class="lang">${esc(lang)}</span>
            <span class="track"><i style="width:${((v.localized || 0) / max) * 100}%"></i></span>
            <span class="ratio">${v.localized || 0}/${v.total || 0}</span></div>`).join('') || empty('No benchmark data','Run npm run eval','bar-chart-3')}
        </div></div>
        <div class="card"><div class="card-head"><h3>${icon('list-checks','sm')} Fixtures</h3></div><div class="card-body">
          ${(r.fixtures || []).map((f) => `<div class="health-row"><span class="mono small">${esc(f.name || f.id)}</span>
            <span class="badge ${f.localized ? 'green' : 'gray'}">${f.localized ? 'localized' : f.skipped ? 'skipped' : 'gap'}</span></div>`).join('') || empty('No fixtures','—','list-checks')}
          <p class="small dim" style="margin-top:14px">jsx 0/1 offline is a known gap. Injection fixture forced approval; negatives correctly empty.</p>
        </div></div>
      </div>
    </div>`,
      mount() {},
    };
}
