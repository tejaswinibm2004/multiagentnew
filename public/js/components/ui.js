import { esc, icon, lucide, riskTone } from '../core/util.js';

export function toast(msg, tone = 'ok', ms = 4200) {
  const ico = tone === 'ok' ? 'check-circle-2' : tone === 'err' ? 'circle-alert' : 'info';
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.innerHTML = `${icon(ico)}<span>${esc(msg)}</span>`;
  document.getElementById('toasts').appendChild(el);
  lucide();
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; setTimeout(() => el.remove(), 250); }, ms);
}

export function modal({ title, body, foot = '', wide = false, onClose }) {
  const root = document.getElementById('overlays');
  const back = document.createElement('div');
  back.className = 'backdrop';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close>${icon('x')}</button></div>
    <div class="modal-body">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
  </div>`;
  root.appendChild(back); lucide();
  const close = () => { back.remove(); onClose?.(); };
  back.querySelector('[data-close]').onclick = close;
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  return { el: back, close };
}

export function confirmModal(title, message, { danger = false } = {}) {
  return new Promise((resolve) => {
    const m = modal({
      title,
      body: `<p class="muted">${esc(message)}</p>`,
      foot: `<button class="btn ghost" data-no>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>Confirm</button>`,
      onClose: () => resolve(false),
    });
    m.el.querySelector('[data-no]').onclick = () => { m.close(); resolve(false); };
    m.el.querySelector('[data-yes]').onclick = () => { m.close(); resolve(true); };
  });
}

export const skeleton = (kind = 'card') => `<div class="skel ${kind}"></div>`;
export function empty(title, text, ico = 'inbox') {
  return `<div class="empty"><div class="em-ico">${icon(ico, 'lg')}</div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}

export function diffViewer(diff = '', split = false) {
  let oldN = 0, newN = 0;
  const lines = String(diff).split('\n').map((l) => {
    if (l.startsWith('@@')) {
      const m = l.match(/-(\d+)/); const n = l.match(/\+(\d+)/);
      oldN = m ? Number(m[1]) : oldN; newN = n ? Number(n[1]) : newN;
      return `<div class="diff-line meta">${esc(l)}</div>`;
    }
    if (l.startsWith('---') || l.startsWith('+++')) return `<div class="diff-line meta">${esc(l)}</div>`;
    const cls = l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : '';
    const o = cls === 'add' ? '' : oldN++;
    const n = cls === 'del' ? '' : newN++;
    return `<div class="diff-line ${cls}"><span class="gut l">${o}</span><span class="gut r">${n}</span><span class="txt">${esc(l || ' ')}</span></div>`;
  }).join('');
  return `<div class="diff"><div class="diff-head"><span>${icon('file-diff','sm')} proposed.patch</span>
    <span class="row"><label class="row small dim" style="gap:5px"><input type="checkbox" data-split ${split ? 'checked' : ''}> split</label></span></div>
    <div class="diff-body">${lines || '<div class="diff-line"><span class="txt dim">No diff recorded</span></div>'}</div></div>`;
}

export function riskGauge(score, band) {
  const tone = riskTone(score);
  const color = tone === 'red' ? 'var(--red)' : tone === 'amber' ? 'var(--amber)' : 'var(--teal)';
  return `<div class="gauge" style="background:conic-gradient(${color} ${score * 3.6}deg, var(--panel-3) 0)">
    <div class="val"><b>${score}</b><span>${esc(band || '')}</span></div></div>`;
}

const FLOW = ['INTAKE', 'LOCALIZER', 'ANALYZER', 'RISK', 'PATCHER', 'CRITIC', 'VALIDATOR', 'DEPLOYER', 'VERIFIER'];
export function stepper(steps = [], status = '') {
  const byStage = Object.fromEntries(steps.map((s) => [s.stage, s]));
  const liveIndex = Math.max(0, FLOW.findIndex((s) => !byStage[s]));
  return `<div class="stepper">${FLOW.map((stage, i) => {
    const s = byStage[stage];
    const failed = s && ['failed', 'blocked'].includes(s.status);
    const done = s && !failed;
    const current = !s && i === liveIndex && !['RESOLVED_AND_DEPLOYED', 'ROLLED_BACK', 'REJECTED_BY_ADMIN', 'INVALID_REPORT'].includes(status);
    const cls = failed ? 'failed' : done ? 'done' : current ? 'current' : '';
    const ico = failed ? 'x' : done ? 'check' : String(i + 1);
    return `<div class="step ${cls}" title="${esc(s?.detail || stage)}"><div class="step-node">${ico}</div><div class="step-lbl">${stage}</div></div>`;
  }).join('')}</div>`;
}

export function funnel(stats = {}) {
  const flow = [
    ['Received', (stats.byStatus?.RECEIVED || 0) + (stats.byStatus?.DEDUPLICATED || 0)],
    ['Investigating', stats.investigating || 0],
    ['Fixing', (stats.byStatus?.PATCHING || 0) + (stats.byStatus?.VALIDATING || 0)],
    ['Shipping', stats.awaiting || 0],
    ['Live', stats.fixed || 0],
  ];
  const max = Math.max(1, ...flow.map((f) => f[1]));
  return `<div class="funnel">${flow.map(([l, n]) => `<div class="funnel-step"><div class="funnel-bar"><i style="width:${Math.max(8, (n / max) * 100)}%"></i></div><div class="n">${n}</div><div class="l">${l}</div></div>`).join('')}</div>`;
}
