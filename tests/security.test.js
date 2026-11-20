import test from 'node:test';
import assert from 'node:assert/strict';
import { redactString, redactObject, scrubPayload } from '../src/http/redact.js';
import { csrfGuard } from '../src/http/csrf.js';
import { hashPassword, verifyPassword, strongEnough } from '../src/http/auth.js';
import { buildHeaders } from '../src/github/client.js';

function mockRes() {
  return { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

test('redact: bearer tokens are removed from strings', () => {
  assert.equal(redactString('Authorization: Bearer abcdef1234567890'), 'Authorization: [REDACTED]');
});

test('redact: secret-looking keys are removed', () => {
  const r = redactObject({ apiKey: 'abc', title: 'Hello' });
  assert.equal(r.apiKey, '[REDACTED]');
  assert.equal(r.title, 'Hello');
});

test('redact: input values are never persisted', () => {
  const p = scrubPayload({ title: 'Bug', description: 'x', fields: [{ name: 'password', value: 'hunter2' }] });
  assert.equal(JSON.stringify(p).includes('hunter2'), false);
});

test('csrf: missing X-Requested-With is rejected', () => {
  const res = mockRes();
  csrfGuard({ method: 'POST', headers: {} }, res, () => assert.fail('should not continue'));
  assert.equal(res.statusCode, 403);
});

test('csrf: cross-origin mutation is rejected', () => {
  const res = mockRes();
  csrfGuard({ method: 'POST', headers: { 'x-requested-with': 'XMLHttpRequest', origin: 'https://evil.test', host: 'good.test' } }, res, () => assert.fail('should not continue'));
  assert.equal(res.statusCode, 403);
});

test('csrf: same-origin mutation passes', () => {
  let called = false;
  csrfGuard({ method: 'POST', headers: { 'x-requested-with': 'XMLHttpRequest', origin: 'https://good.test', host: 'good.test' } }, mockRes(), () => { called = true; });
  assert.equal(called, true);
});

test('auth: scrypt hash verifies and rejects wrong password', () => {
  const h = hashPassword('a-very-long-password');
  assert.equal(verifyPassword('a-very-long-password', h), true);
  assert.equal(verifyPassword('wrong', h), false);
});

test('auth: password strength requires 12 chars', () => {
  assert.equal(strongEnough('short'), false);
  assert.equal(strongEnough('long-enough-password'), true);
});

test('github: headers are built centrally and never stringify objects', () => {
  const h = buildHeaders({ 'X-Custom': 'ok' });
  assert.equal(h['X-Custom'], 'ok');
  assert.equal(h['X-GitHub-Api-Version'], '2022-11-28');
  assert.equal(String(h.Authorization || '').includes('[object Object]'), false);
});
