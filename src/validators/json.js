export default function validate(content) {
  try { JSON.parse(content); return { status: 'ok', detail: 'valid JSON' }; }
  catch (e) { return { status: 'failed', detail: e.message }; }
}
