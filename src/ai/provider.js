import { config } from '../config.js';

// OpenAI-compatible chat completions. Works with Groq, OpenAI, Together, vLLM, etc.
export function aiAvailable() { return Boolean(config.ai.apiKey); }

export async function complete(messages, { temperature = 0.1, maxTokens = 3000 } = {}) {
  if (!config.ai.apiKey) return { ok: false, reason: 'AI_UNAVAILABLE', detail: 'AI_API_KEY not configured' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.ai.timeoutMs);
  try {
    const res = await fetch(`${config.ai.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.ai.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 500);
      return { ok: false, reason: 'AI_UNAVAILABLE', detail: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return { ok: false, reason: 'AI_UNAVAILABLE', detail: 'Empty completion' };
    return { ok: true, content, usage: data.usage };
  } catch (e) {
    return { ok: false, reason: 'AI_UNAVAILABLE', detail: String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

export function systemUser(system, user) {
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}
