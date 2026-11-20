import { post } from '../core/api.js';
import { icon, esc, timeAgo, riskBadge } from '../core/util.js';
import { toast, empty, confirmModal } from '../components/ui.js';
import { state, emit, loadAll, loadIssues } from '../core/store.js';

function reasonsFor(i) {
  const r = [];
  if (i.risk_score >= 70) r.push(`Risk ${i.risk_score} ≥ 70`);
  if (/money|checkout|auth|security/i.test(i.defect_type || '')) r.push('Sensitive area');
  if (!r.length) r.push('Reviewer gate');
  return r;
}

export function inboxView() {
  const pending = (state.issues || []).filter((i) => i.status === 'AWAITING_APPROVAL');
  const html = `<div class="page">
    <div class="page-head"><div><div class="eyebrow">Human in the loop</div><h1>Approval inbox</h1>
      <div class="sub">${pending.length} fix${pending.length === 1 ? '' : 'es'} waiting for a decision. Non-critical fixes never appear here.</div></div>
      <div class="row"><span class="kbd-hint">${esc('<j>')} / ${esc('<k>')} navigate · ${esc('<a>')} approve · ${esc('<r>')} reject</span></div>
    </div>
    <div class="grid" id="inboxList" style="gap:14px">
      ${pending.length ? pending.map((i, idx) => approvalCard(i, idx)).join('') : empty('All caught up', 'No fixes are waiting for approval right now.', 'check-check')}
    </div>
  </div>`;

  return {
    html,
    mount(root) {
      const cards = [...root.querySelectorAll('.inbox-card')];
      const select = (idx) => {
        emit({ selectedApproval: idx });
        cards.forEach((c, n) => c.classList.toggle('sel', n === idx));
        cards[idx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      cards.forEach((c, idx) => {
        c.onclick = (e) => {
          if (e.target.closest('[data-act]')) return;
          window.dispatchEvent(new CustomEvent('bs:navigate', { detail: { view: 'issue', id: c.dataset.id } }));
        };
        c.querySelector('[data-act="approve"]').onclick = () => decide(c.dataset.id, 'approve');
        c.querySelector('[data-act="reject"]').onclick = async () => {
          if (await confirmModal('Reject this fix?', 'The patch will not be deployed and the issue will be closed.', { danger: true })) decide(c.dataset.id, 'reject');
        };
      });
      const onKey = (e) => {
        if (!state.view.startsWith('inbox') || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
        const cur = state.selectedApproval || 0;
        if (e.key === 'j') select(Math.min(cards.length - 1, cur + 1));
        else if (e.key === 'k') select(Math.max(0, cur - 1));
        else if (e.key === 'a' && cards[cur]) decide(cards[cur].dataset.id, 'approve');
        else if (e.key === 'r' && cards[cur]) decide(cards[cur].dataset.id, 'reject');
      };
      document.addEventListener('keydown', onKey, { once: false });
    },
  };

  async function decide(id, kind) {
    try {
      await post(`/api/issues/${id}/${kind}`, { reason: kind === 'approve' ? 'approved from inbox' : 'rejected from inbox' });
      toast(kind === 'approve' ? 'Fix approved — deploying' : 'Fix rejected', kind === 'approve' ? 'ok' : 'info');
      await Promise.all([loadAll(), loadIssues()]);
    } catch (e) { toast(e.message, 'err'); }
  }
}

function approvalCard(i, idx) {
  const diffLines = (i.summary || '').split('\n').slice(0, 2).join(' ');
  return `<article class="card inbox-card ${idx === 0 ? 'sel' : ''}" data-id="${i.id}">
    <div class="inbox-top">
      <span class="badge amber">${icon('hand','sm')} Needs you</span>
      <div style="flex:1"><div class="key mono small">${esc(i.issue_key)} · ${esc(i.website_name || '')} · ${timeAgo(i.created_at)}</div>
        <div class="ttl">${esc(i.title)}</div></div>
      ${riskBadge(i.risk_score, i.risk_band)}
    </div>
    <div class="inbox-why">${reasonsFor(i).map((r) => `<span class="chip">${icon('shield-alert','sm')}${esc(r)}</span>`).join('')}
      <span class="chip">${icon('git-pull-request','sm')} minimal diff</span></div>
    <div class="inbox-diff"><div class="mini-diff"><span style="color:var(--teal)">+ ${esc(diffLines)}</span></div></div>
    <div class="inbox-actions">
      <button class="btn good sm" data-act="approve">${icon('check','sm')} Approve</button>
      <button class="btn sm" data-act="reject">${icon('x','sm')} Reject</button>
      <span class="spacer"></span><span class="kbd-hint">${esc('<a>')} / ${esc('<r>')}</span>
    </div>
  </article>`;
}
