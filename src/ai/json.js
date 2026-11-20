import { complete, systemUser } from './provider.js';

function extractJson(text) {
  let s = String(text || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

// Strict JSON with exactly one re-prompt on parse failure.
export async function strictJson(system, user, { temperature = 0.1, maxTokens = 3000, validate } = {}) {
  let result = await complete(systemUser(system, user), { temperature, maxTokens });
  if (!result.ok) return result;
  try {
    const value = extractJson(result.content);
    if (validate && !validate(value)) throw new Error('schema validation failed');
    return { ok: true, value, attempts: 1 };
  } catch {
    const retry = await complete([
      ...systemUser(system, user),
      { role: 'assistant', content: result.content },
      { role: 'user', content: 'Your previous reply was not valid JSON. Return ONLY a single JSON object, no prose, no markdown fences.' },
    ], { temperature: 0, maxTokens });
    if (!retry.ok) return retry;
    try {
      const value = extractJson(retry.content);
      if (validate && !validate(value)) throw new Error('schema validation failed');
      return { ok: true, value, attempts: 2 };
    } catch (e) {
      return { ok: false, reason: 'INVALID_JSON', detail: String(e.message) };
    }
  }
}
