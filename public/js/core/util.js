export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function icon(name, cls = '') {
  return `<i data-lucide="${esc(name)}" class="icon ${cls}"></i>`;
}

export function lucide() { try { window.lucide?.createIcons({ attrs: { 'stroke-width': 1.8 } }); } catch {} }

export function timeAgo(ts) {
  if (!ts) return '—';
  const d = new Date(ts.replace ? ts.replace(' ', 'T') : ts);
  if (isNaN(d)) return '—';
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString();
}

export const STATUS = {
  RECEIVED: ['Received', 'gray', 'inbox'], DEDUPLICATED: ['Deduplicated', 'gray', 'copy'],
  TRIAGING: ['Triaging', 'violet', 'search'], ANALYZING: ['Analyzing', 'violet', 'brain'],
  INVALID_REPORT: ['Not a defect', 'gray', 'circle-slash'], NOT_REPRODUCIBLE_IN_CODE: ['Not in code', 'gray', 'file-x'],
  SOURCE_UNAVAILABLE: ['Source unavailable', 'gray', 'cloud-off'], AI_UNAVAILABLE: ['AI unavailable', 'amber', 'bot-off'],
  PATCHING: ['Patching', 'violet', 'wand-2'], PATCH_FAILED: ['Patch failed', 'red', 'wand-2'],
  VALIDATING: ['Validating', 'violet', 'shield-check'], VALIDATION_FAILED: ['Validation failed', 'red', 'shield-x'],
  AWAITING_APPROVAL: ['Needs you', 'amber', 'hand'], REJECTED_BY_ADMIN: ['Rejected', 'red', 'ban'],
  APPROVED: ['Approved', 'blue', 'check-check'], PUSHING: ['Pushing', 'blue', 'git-push'],
  DEPLOYING: ['Deploying', 'blue', 'rocket'], RESOLVED_AND_DEPLOYED: ['Fixed & live', 'green', 'check-circle-2'],
  DEPLOY_TIMEOUT: ['Unverified', 'amber', 'timer'], ROLLED_BACK: ['Rolled back', 'red', 'rotate-ccw'],
  FAILED: ['Failed', 'red', 'triangle-alert'],
};

export const GROUPS = {
  Received: ['RECEIVED', 'DEDUPLICATED'],
  Investigating: ['TRIAGING', 'ANALYZING', 'SOURCE_UNAVAILABLE', 'AI_UNAVAILABLE', 'INVALID_REPORT', 'NOT_REPRODUCIBLE_IN_CODE'],
  Fixing: ['PATCHING', 'PATCH_FAILED', 'VALIDATING', 'VALIDATION_FAILED'],
  'Needs you': ['AWAITING_APPROVAL'],
  Shipping: ['APPROVED', 'PUSHING', 'DEPLOYING', 'DEPLOY_TIMEOUT'],
  'Fixed & live': ['RESOLVED_AND_DEPLOYED'],
  Closed: ['REJECTED_BY_ADMIN', 'ROLLED_BACK'],
  Stuck: ['FAILED'],
};

export function statusBadge(status) {
  const [label, tone, ico] = STATUS[status] || [status, 'gray', 'circle'];
  return `<span class="badge ${tone}">${icon(ico, 'sm')}${esc(label)}</span>`;
}
export function groupOf(status) {
  for (const [g, list] of Object.entries(GROUPS)) if (list.includes(status)) return g;
  return 'Closed';
}
export function riskTone(score) { return score >= 70 ? 'red' : score >= 40 ? 'amber' : 'green'; }
export function riskBadge(score, band) { return `<span class="badge ${riskTone(score)}">${icon('gauge','sm')}${score} · ${esc(band || '')}</span>`; }
export function short(s, n = 10) { return String(s || '').slice(0, n); }
export function initials(name) { return String(name || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase(); }
export function money(n) { return `$${Number(n || 0).toFixed(2)}`; }
