import { sanity } from './base.js';
export default function validate(content) {
  const base = sanity(content);
  if (base.status !== 'ok') return base;
  const opens = (String(content).match(/<([a-z][\w-]*)\b[^>]*?(?<!\/)>/gi) || []).filter((t) => !/^(meta|link|br|hr|img|input|source|area|base|col|embed|wbr)\b/i.test(t)).length;
  const closes = (String(content).match(/<\/[a-z][\w-]*>/gi) || []).length;
  if (opens - closes > 25) return { status: 'failed', detail: `unbalanced tags (${opens} open, ${closes} close)` };
  return { status: 'ok', detail: 'basic HTML structure passed (parser not run)' };
}
