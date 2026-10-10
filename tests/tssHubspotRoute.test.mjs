import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/crm.js';

function response() {
  return {
    code: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(n) { this.code = n; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; }
  };
}

test('bridge route refuses unauthenticated callers and does not dispatch existing CRM', async () => {
  const res = response();
  await handler({ method: 'POST', query: { tssHubspotSync: '1' }, headers: {}, body: { mode: 'preview' } }, res);
  assert.equal(res.code, 401);
  assert.equal(res.body.status, 'unauthorized');
});

test('G5 direct intake route is isolated and refuses unauthenticated callers', async () => {
  const res = response();
  await handler({ method: 'POST', query: { tssG5CommercialIntake: '1' }, headers: {}, body: {} }, res);
  assert.equal(res.code, 401);
  assert.equal(res.body.code, 'UNAUTHORIZED');
});

test('existing CRM preflight OPTIONS continues using its original handler', async () => {
  const res = response();
  await handler({ method: 'OPTIONS', query: {}, headers: { origin: 'https://www.thesmartysolution.com' } }, res);
  assert.equal(res.code, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://www.thesmartysolution.com');
});

test('existing CRM disallows unapproved method as before', async () => {
  const res = response();
  await handler({ method: 'GET', query: {}, headers: {} }, res);
  assert.equal(res.code, 405);
  assert.equal(res.body.error, 'METHOD_NOT_ALLOWED');
});
