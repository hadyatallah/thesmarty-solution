import test from 'node:test';
import assert from 'node:assert/strict';
import { googleDependencies } from '../lib/tssWhatsappGoogle.mjs';

const settings = { appSecret: 'synthetic-app-secret-for-tests', verifyToken: 'synthetic-verification-token-for-tests', allowedPairs: [{ wabaId: '1', phoneNumberId: '2' }] };
const env = { TSS_WHATSAPP_SECRET_VERSION: 'projects/test/secrets/whatsapp/versions/1', TSS_WHATSAPP_FIRESTORE_PARENT: 'projects/test/databases/(default)/documents' };
const secretReply = () => Response.json({ payload: { data: Buffer.from(JSON.stringify(settings)).toString('base64') } });
test('Secret Manager and inbox calls use ephemeral bearer, fixed hosts and timeout, not env secrets', async () => {
  const calls = [];
  const load = googleDependencies({ env, getToken: async () => 'synthetic-short-lived-token', fetcher: async (url, options) => {
    calls.push({ url, options }); return calls.length === 1 ? secretReply() : Response.json({ name: 'created' });
  } });
  const deps = await load();
  assert.equal(deps.appSecret, settings.appSecret);
  assert.equal(await deps.store.putIfAbsent({ eventKey: 'a'.repeat(64), messageId: 'wamid.test' }), true);
  assert.match(calls[0].url, /^https:\/\/secretmanager.googleapis.com\//);
  assert.match(calls[1].url, /^https:\/\/firestore.googleapis.com\//);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer synthetic-short-lived-token');
  assert.equal(calls[1].options.redirect, 'error');
  assert.ok(calls[1].options.signal instanceof AbortSignal);
  const fields = JSON.parse(calls[1].options.body).fields;
  assert.equal(fields.state.stringValue, 'held_for_review');
  assert.match(fields.event.stringValue, /wamid.test/);
  assert.doesNotMatch(calls[1].options.body, /synthetic-app-secret|synthetic-verification/);
});
test('only explicit ALREADY_EXISTS counts as a duplicate, all ambiguous failures retry', async () => {
  for (const [status, providerStatus, expected] of [[409, 'ALREADY_EXISTS', false], [409, 'ABORTED', 'error'], [403, 'PERMISSION_DENIED', 'error'], [503, 'UNAVAILABLE', 'error']]) {
    const load = googleDependencies({ env, getToken: async () => 'test', fetcher: async url => url.includes('secretmanager') ? secretReply() : Response.json({ error: { status: providerStatus } }, { status }) });
    const deps = await load();
    if (expected === 'error') await assert.rejects(deps.store.putIfAbsent({ eventKey: 'a'.repeat(64) }), /INBOX_UNAVAILABLE/);
    else assert.equal(await deps.store.putIfAbsent({ eventKey: 'a'.repeat(64) }), false);
  }
});
test('missing resource config, secret denial, and malformed secret all fail closed', async () => {
  await assert.rejects(googleDependencies({ env: {} })(), /CONFIGURATION_INCOMPLETE/);
  for (const response of [new Response('', { status: 403 }), Response.json({}), Response.json({ payload: { data: Buffer.from('{}').toString('base64') } })]) {
    await assert.rejects(googleDependencies({ env, getToken: async () => 'test', fetcher: async () => response })());
  }
});
