import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { createWebhookHandler, parseEvents, validSignature, readRawBody, MAX_BODY_BYTES } from '../lib/tssWhatsappWebhook.mjs';

const appSecret = 'synthetic-app-secret-for-tests-only';
const verifyToken = 'synthetic-verify-token-for-tests-only';
const allowedPairs = [{ wabaId: '2882413005471663', phoneNumberId: '1378287792033123' }];
const sample = () => ({ object: 'whatsapp_business_account', entry: [{ id: allowedPairs[0].wabaId, changes: [{ field: 'messages', value: {
  messaging_product: 'whatsapp', metadata: { phone_number_id: allowedPairs[0].phoneNumberId },
  messages: [{ id: 'wamid.synthetic', timestamp: '1792533600', from: '15550000000', type: 'text', text: { body: 'Private synthetic enquiry 🔒' } }],
  statuses: [{ id: 'wamid.outbound.synthetic', timestamp: '1792533601', recipient_id: '15550000000', status: 'delivered' }]
} }] }] });
const sign = raw => 'sha256=' + createHmac('sha256', appSecret).update(raw).digest('hex');
function harness(overrides = {}) {
  const records = new Map();
  const audit = [];
  const store = { async putIfAbsent(event) { if (records.has(event.eventKey)) return false; records.set(event.eventKey, event); return true; } };
  const deps = { appSecret, verifyToken, allowedPairs, store };
  const handler = createWebhookHandler({ enabled: true, loadDependencies: async () => deps, audit: (...args) => audit.push(args), ...overrides });
  return { handler, records, audit, deps };
}
async function invoke(handler, { method = 'POST', url = '/', raw = Buffer.from(JSON.stringify(sample())), signature, body } = {}) {
  const req = Readable.from([raw]);
  Object.assign(req, { method, url, headers: { 'x-hub-signature-256': signature ?? sign(raw) } });
  if (body !== undefined) req.body = body;
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(value) { this.body = value; } };
  await handler(req, res);
  return res;
}
test('Vercel lazy request.body getter is not invoked before raw signature bytes', async () => {
  const raw = Buffer.from('{"b": 2,  "a": 1}');
  const req = Readable.from([raw]);
  let getterCalled = false;
  Object.defineProperty(req, 'body', { configurable: true, get() { getterCalled = true; throw Error('UNSAFE_PARSED_BODY_ACCESS'); } });
  const result = await readRawBody(req);
  assert.deepEqual(result, raw);
  assert.equal(getterCalled, false);
});
test('challenge valid, invalid, missing, duplicate query and wrong mode', async () => {
  const { handler } = harness();
  const url = '/?hub.mode=subscribe&hub.verify_token=' + verifyToken + '&hub.challenge=123456';
  const result = await invoke(handler, { method: 'GET', url });
  assert.equal(result.statusCode, 200); assert.equal(result.body, '123456');
  assert.equal((await invoke(handler, { method: 'GET', url: url.replace(verifyToken, 'wrong') })).statusCode, 403);
  assert.equal((await invoke(handler, { method: 'GET', url: '/' })).statusCode, 400);
  assert.equal((await invoke(handler, { method: 'GET', url: url + '&hub.challenge=bad' })).statusCode, 400);
  assert.equal((await invoke(handler, { method: 'GET', url: url.replace('subscribe', 'other') })).statusCode, 403);
});
test('strict SHA256 HMAC checks original bytes, Unicode, malformed and missing signatures', async () => {
  const raw = Buffer.from(JSON.stringify(sample(), null, 2));
  assert.equal(validSignature(raw, sign(raw), appSecret), true);
  for (const signature of ['', 'sha1=' + 'a'.repeat(40), 'sha256=' + '0'.repeat(64), 'sha256=zz', sign(raw) + '=']) {
    const h = harness();
    assert.equal((await invoke(h.handler, { raw, signature })).statusCode, 401);
    assert.equal(h.records.size, 0);
  }
  const h = harness();
  assert.equal((await invoke(h.handler, { raw: Buffer.from(JSON.stringify(sample())), signature: sign(raw) })).statusCode, 401);
  assert.equal((await invoke(h.handler, { raw })).statusCode, 200);
});
test('message/status fields preserved and replay deduplicates across new handlers and concurrency', async () => {
  const h = harness();
  const next = harness({ loadDependencies: async () => h.deps });
  const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => invoke(i % 2 ? h.handler : next.handler)));
  assert.ok(responses.every(r => r.statusCode === 200)); assert.equal(h.records.size, 2);
  const events = [...h.records.values()];
  assert.equal(events[0].messageId, 'wamid.synthetic');
  assert.equal(events[0].phoneNumberId, allowedPairs[0].phoneNumberId);
  assert.equal(events[0].wabaId, allowedPairs[0].wabaId);
  assert.equal(events[0].timestamp, '1792533600');
  assert.equal(events[1].status, 'delivered');
  const payload = sample(); payload.entry[0].changes[0].value.messages[0].timestamp = '1792533999';
  assert.equal(parseEvents(payload, allowedPairs)[0].eventKey, events[0].eventKey);
});
test('partial commit returns retryable 503 and retry retains committed event', async () => {
  const h = harness(); const original = h.deps.store.putIfAbsent; let calls = 0;
  h.deps.store.putIfAbsent = async event => { if (++calls === 2) throw Error('private provider error'); return original(event); };
  const failure = await invoke(h.handler);
  assert.equal(failure.statusCode, 503); assert.equal(failure.headers['Retry-After'], '30'); assert.equal(h.records.size, 1);
  assert.equal((await invoke(h.handler)).statusCode, 200); assert.equal(h.records.size, 2);
  assert.doesNotMatch(JSON.stringify(h.audit), /Private|private provider|15550000000|wamid|synthetic-app/);
});
test('malformed JSON/schema, wrong accounts and oversize bodies rejected before write', async () => {
  for (const payload of [null, {}, { ...sample(), entry: {} }, { ...sample(), entry: [null] }]) {
    const h = harness(); assert.equal((await invoke(h.handler, { raw: Buffer.from(JSON.stringify(payload)) })).statusCode, 400); assert.equal(h.records.size, 0);
  }
  const h = harness();
  assert.equal((await invoke(h.handler, { raw: Buffer.from('{') })).statusCode, 400);
  const payload = sample(); payload.entry[0].id = '2247151412732806';
  assert.equal((await invoke(h.handler, { raw: Buffer.from(JSON.stringify(payload)) })).statusCode, 403);
  assert.equal((await invoke(h.handler, { raw: Buffer.alloc(MAX_BODY_BYTES + 1) })).statusCode, 413);
  assert.equal((await invoke(h.handler, { body: sample() })).statusCode, 503);
  assert.equal(h.records.size, 0);
});
test('inactive and missing dependencies fail closed, no external send or CRM writes', async () => {
  let called = false;
  const h = harness({ enabled: false, loadDependencies: async () => { called = true; } });
  assert.equal((await invoke(h.handler)).statusCode, 503); assert.equal(called, false);
  assert.equal((await invoke(h.handler, { method: 'DELETE' })).statusCode, 405);
  const missing = harness({ loadDependencies: async () => ({}) });
  assert.equal((await invoke(missing.handler)).statusCode, 503);
});
test('failed Google WIF is classified without leaking provider messages', async () => {
  const audit = [];
  const handler = createWebhookHandler({
    enabled: true,
    loadDependencies: async () => { throw Error('GOOGLE_WIF_UNAVAILABLE'); },
    audit: (event, data) => audit.push({ event, data })
  });
  const response = await invoke(handler, { method: 'GET', url: '/?hub.mode=subscribe&hub.verify_token=public-fake&hub.challenge=X' });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(audit, [{ event: 'dependency_unavailable', data: { category: 'GOOGLE_WIF_UNAVAILABLE' } }]);
});
test('provider errors persist for review without logging their contents', async () => {
  const h = harness(); const payload = sample();
  const value = payload.entry[0].changes[0].value; delete value.messages; delete value.statuses;
  value.errors = [{ code: 131000, title: 'synthetic failure' }];
  assert.equal((await invoke(h.handler, { raw: Buffer.from(JSON.stringify(payload)) })).statusCode, 200);
  assert.equal([...h.records.values()][0].kind, 'provider_error');
});
