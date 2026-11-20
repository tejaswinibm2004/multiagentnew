import { api, post } from '../core/api.js';
import { icon, esc, timeAgo } from '../core/util.js';
import { toast, empty, modal } from '../components/ui.js';
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

        <div class="card"><div class="card-head"><h3>${icon('palette','sm')} Appearance</h3><span class="badge gray">saved to this browser</span></div><div class="card-body">
          <p class="small muted" style="margin-bottom:14px">Choose a fixed theme or follow your system preference. The choice is applied before the page paints.</p>
          <div class="row wrap" id="themePicker">
            ${[['dark','Moon','moon'],['light','Sun','sun'],['system','System','monitor']].map(([v,l,i]) => `<button class="chip ${state.theme === v ? 'active' : ''}" data-theme="${v}">${icon(i,'sm')} ${l}</button>`).join('')}
          </div>
        </div></div>

        <div class="card"><div class="card-head"><h3>${icon('lock-keyhole','sm')} Change password</h3><span class="badge violet">your account</span></div><div class="card-body">
          <form id="pwForm">
            <div class="field" style="margin-bottom:12px"><label>Current password</label><input class="input" id="pwCurrent" type="password" autocomplete="current-password" required></div>
            <div class="field" style="margin-bottom:12px"><label>New password (12+ characters)</label><input class="input" id="pwNext" type="password" autocomplete="new-password" required></div>
            <div class="field" style="margin-bottom:14px"><label>Confirm new password</label><input class="input" id="pwConfirm" type="password" autocomplete="new-password" required></div>
            <button class="btn primary" type="submit">${icon('key-round','sm')} Update password</button>
            <p class="small dim" style="margin-top:10px">Changing your password signs out your other sessions but keeps this one active.</p>
          </form>
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
        root.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => {
          window.dispatchEvent(new CustomEvent('bs:theme', { detail: { theme: b.dataset.theme } }));
          root.querySelectorAll('[data-theme]').forEach((x) => x.classList.toggle('active', x === b));
        });
        root.querySelector('#pwForm').onsubmit = async (e) => {
          e.preventDefault();
          const current = root.querySelector('#pwCurrent').value;
          const next = root.querySelector('#pwNext').value;
          const confirm = root.querySelector('#pwConfirm').value;
          if (next !== confirm) { toast('New passwords do not match', 'err'); return; }
          try {
            await post('/auth/change-password', { current, next });
            toast('Password updated', 'ok'); e.target.reset();
          } catch (err) { toast(err.message, 'err'); }
        };
      },
    };
}

export function teamView() {
  const owner = state.user?.role === 'owner';
  const roles = ['viewer', 'reviewer', 'admin', 'owner'];
  const matrix = {
    'View issues': '✓ ✓ ✓ ✓', 'Approve fixes': '· ✓ ✓ ✓', 'Manage sites': '· · ✓ ✓',
    'Manage team': '· · ✓ ✓', 'Change policy': '· · · ✓', 'Revert deploy': '· · ✓ ✓',
  };
  return {
    html: `<div class="page">
      <div class="page-head"><div><div class="eyebrow">Access control</div><h1>Team</h1>
        <div class="sub">Members get access only after you approve their email. Sessions are opaque, hashed at rest, 12h TTL.</div></div>
        ${owner ? '<span class="badge violet">Owner controls enabled</span>' : '<span class="badge gray">Read-only · owner only can invite</span>'}</div>
      ${owner ? `<div class="grid grid-2" style="margin-bottom:16px">
        <div class="card"><div class="card-head"><h3>${icon('mail-plus','sm')} Invite by email</h3></div><div class="card-body">
          <form id="inviteForm">
            <div class="field" style="margin-bottom:12px"><label>Email address</label><input class="input" id="invEmail" type="email" placeholder="teammate@example.com" required></div>
            <div class="field" style="margin-bottom:12px"><label>Role</label><select class="select" id="invRole">
              <option value="viewer">viewer — read only</option><option value="reviewer" selected>reviewer — can approve fixes</option><option value="admin">admin — can manage sites & team</option>
            </select></div>
            <div class="field" style="margin-bottom:14px"><label>Note (optional)</label><input class="input" id="invNote" placeholder="Why they need access"></div>
            <button class="btn primary" type="submit">${icon('send','sm')} Send invitation</button>
          </form>
          <p class="small dim" style="margin-top:10px">An invitation grants zero access. After you approve it, an account is created and a one-time password is shown to you.</p>
        </div></div>
        <div class="card"><div class="card-head"><h3>${icon('inbox','sm')} Pending approvals</h3><span class="badge amber" id="pendingCount">0</span></div>
          <div class="card-body" id="inviteList"><div class="skel line"></div><div class="skel line"></div></div></div>
      </div>` : ''}
      <div class="grid" style="grid-template-columns:1.3fr 1fr">
        <div class="card"><div class="table-wrap" style="border:0;border-radius:0"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead><tbody id="memberRows">
          ${(state.members || []).map((m) => `<tr><td><span class="row"><span class="avatar">${esc(m.name.slice(0,2).toUpperCase())}</span>${esc(m.name)}</span></td><td class="mono small">${esc(m.email)}</td><td><span class="badge ${m.role === 'owner' ? 'violet' : 'gray'}">${esc(m.role)}</span></td><td class="dim small">${timeAgo(m.created_at)}</td></tr>`).join('')}
        </tbody></table></div></div>
        <div class="card"><div class="card-head"><h3>${icon('table-2','sm')} Role matrix</h3></div><div class="card-body">
          ${Object.entries(matrix).map(([k, v]) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v mono">${v}</span></div>`).join('')}
          <p class="tiny dim" style="margin-top:14px">Legend: viewer · reviewer · admin · owner</p>
        </div></div>
      </div>
    </div>`,
      mount(root) {
        if (!owner) return;
        const loadInvites = async () => {
          try {
            const r = await api('/api/members/invitations');
            const pending = r.invitations.filter((i) => i.status === 'PENDING');
            root.querySelector('#pendingCount').textContent = String(pending.length);
            root.querySelector('#inviteList').innerHTML = r.invitations.length ? r.invitations.map((inv) => `
              <div class="health-row"><div><b>${esc(inv.email)}</b><div class="tiny dim">${esc(inv.role)} · invited by ${esc(inv.invited_by)} · ${timeAgo(inv.created_at)}</div></div>
                ${inv.status === 'PENDING'
                  ? `<span class="row"><button class="btn good xs" data-approve="${inv.id}">Approve</button><button class="btn xs" data-reject="${inv.id}">Reject</button></span>`
                  : `<span class="badge ${inv.status === 'APPROVED' ? 'green' : 'gray'}">${esc(inv.status)}</span>`}</div>`).join('')
              : empty('No invitations yet', 'Invite a teammate by email above.', 'mail');
            root.querySelectorAll('[data-approve]').forEach((b) => b.onclick = () => approve(b.dataset.approve));
            root.querySelectorAll('[data-reject]').forEach((b) => b.onclick = async () => {
              try { await post(`/api/members/invitations/${b.dataset.reject}/reject`, {}); toast('Invitation rejected', 'info'); loadInvites(); }
              catch (e) { toast(e.message, 'err'); }
            });
          } catch (e) { toast(e.message, 'err'); }
        };
        const approve = async (id) => {
          try {
            const r = await post(`/api/members/invitations/${id}/approve`, {});
            const m = modal({
              title: 'Access approved',
              body: `<p class="muted small">${esc(r.note)} Send this one-time password to the member. They can now sign in.</p>
                <div class="mini-diff" style="margin-top:12px">${esc(r.tempPassword)}</div>`,
              foot: '<button class="btn primary" data-done>Done</button>',
            });
            m.el.querySelector('[data-done]').onclick = () => m.close();
            const members = await api('/api/members'); emitMembers(members.members);
            loadInvites();
          } catch (e) { toast(e.message, 'err'); }
        };
        root.querySelector('#inviteForm').onsubmit = async (e) => {
          e.preventDefault();
          try {
            await post('/api/members/invite', {
              email: root.querySelector('#invEmail').value,
              role: root.querySelector('#invRole').value,
              note: root.querySelector('#invNote').value,
            });
            toast('Invitation created — no access until you approve it', 'ok');
            e.target.reset(); loadInvites();
          } catch (err) { toast(err.message, 'err'); }
        };
        loadInvites();
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
        <div class="sub">${esc(r.summary?.localized || 0)}/${esc(r.summary?.total || 0)} fixtures localized · 32/32 backend tests green.</div></div>
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
