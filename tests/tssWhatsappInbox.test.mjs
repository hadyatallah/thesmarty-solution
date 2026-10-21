import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInboxHandler, isOwnerProfile, parseBearer,
  parseInboxRequest, parseFirestoreDocument, googleInboxUrl
} from '../lib/tssWhatsappInbox.mjs';

const env = {
  TSS_WHATSAPP_OWNER_EMAIL: 'thesmartysolution@gmail.com',
  TSS_WHATSAPP_FIRESTORE_PARENT: 'projects/tss-crm-508908/databases/(default)/documents',
  TSS_WHATSAPP_READER_AUTH_READY: 'true',
  TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL: 'tss-whatsapp-inbox-reader@tss-crm-508908.iam.gserviceaccount.com',
  TSS_WHATSAPP_GOOGLE_CLIENT_ID: '103840050410-dlhipb15600ot54jk7m6qj0olrbms7i4.apps.googleusercontent.com'
};
const token = 'ya29.mock-short-lived-access-token-with-owner-scopes';
const baseName = 'projects/tss-crm-508908/databases/(default)/documents/tss_whatsapp_inbox/';
const key = 'a'.repeat(64);
const fakeEvent = (overrides = {}) => ({
  provider: 'meta_whatsapp_cloud_api', kind: 'message',
  eventKey: key, wabaId: '2882413005471663', phoneNumberId: '1378287792033123',
  messageId: 'wamid.123', timestamp: '1792533600',
  payload: { from: '15550123456', type: 'text', text: { body: 'Hello, private enquiry.' } },
  ...overrides
});
const document = (event = fakeEvent()) => ({
  name: baseName + key,
  fields: {
    event: { stringValue: JSON.stringify(event) },
    receivedAt: { timestampValue: '2026-10-21T00:44:26Z' },
    state: { stringValue: 'held_for_review' }
  },
  createTime: '2026-10-21T00:44:26Z'
});
function harness({ enabled = true, config = env, profile = { email: 'thesmartysolution@gmail.com', email_verified: true }, storeResponse, fetcher: alternate } = {}) {
  const calls = [];
  const fetcher = alternate || (async (url, options) => {
    calls.push({ url, options });
    return storeResponse || Response.json({ documents: [document()], nextPageToken: 'NEXT+' });
  });
  let verifyCount = 0;
  const handler = createInboxHandler({ enabled, env: config, fetcher,
    verifyIdentity: async () => { verifyCount++; return profile; },
    readerAccessToken: async () => 'keyless-scoped-reader-token'
  });
  async function run({ method = 'GET', url = '/api/tss-whatsapp-inbox', auth = 'Bearer ' + token } = {}) {
    const request = { method, url, headers: { authorization: auth } };
    const response = {
      headers: {}, setHeader(k, v) { this.headers[k] = v; },
      end(body) { this.body = JSON.parse(body); }
    };
    await handler(request, response);
    return response;
  }
  return { run, calls, get verifyCount() { return verifyCount; } };
}
test('owner profile requires an exact verified Google account', () => {
  assert.ok(isOwnerProfile({ email: 'TheSmartySolution@Gmail.com', email_verified: true }));
  assert.ok(isOwnerProfile({ email: 'thesmartysolution@gmail.com', email_verified: 'true' }));
  assert.equal(isOwnerProfile({ email: 'other@gmail.com', email_verified: true }), false);
  assert.equal(isOwnerProfile({ email: 'thesmartysolution@gmail.com', email_verified: false }), false);
  assert.equal(isOwnerProfile({ email: 'thesmartysolution@gmail.com', email_verified: 'false' }), false);
  assert.equal(isOwnerProfile(null), false);
});
test('strict OAuth bearer parsing and query limits', () => {
  assert.equal(parseBearer('Bearer ' + token), token);
  for (const value of ['', 'Basic abc', 'Bearer short', 'Bearer ' + token + '\nLeak', 'Bearer ' + token + ' x']) {
    assert.equal(parseBearer(value), '');
  }
  assert.deepEqual(parseInboxRequest('/api/tss-whatsapp-inbox?pageToken=abc%2B&diagnostic=1'), { pageToken: 'abc+', diagnostic: true });
  for (const url of ['/?pageToken=one&pageToken=two', '/?debug=1', '/?diagnostic=2', '/?pageToken=' + 'x'.repeat(2100), '/?pageToken=%00']) {
    assert.throws(() => parseInboxRequest(url), /BAD_QUERY/);
  }
  const url = new URL(googleInboxUrl({ pageToken: 'a+/b=' }));
  assert.equal(url.hostname, 'firestore.googleapis.com');
  assert.equal(url.searchParams.get('pageToken'), 'a+/b=');
  assert.equal(url.searchParams.get('pageSize'), '30');
  assert.equal(url.searchParams.get('orderBy'), 'receivedAt desc');
  assert.match(url.pathname, /\/documents\/tss_whatsapp_inbox$/);
});
test('disabled and non-GET requests never touch Google', async () => {
  const h = harness({ enabled: false });
  const result = await h.run();
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.error, 'inbox_not_enabled');
  assert.equal(h.calls.length, 0);
  const live = harness();
  const post = await live.run({ method: 'POST' });
  assert.equal(post.statusCode, 405);
  assert.equal(live.calls.length, 0);
});
test('missing configuration and missing credentials fail before Google requests', async () => {
  const missingConfig = harness({ config: {} });
  assert.equal((await missingConfig.run()).statusCode, 503);
  assert.equal(missingConfig.calls.length, 0);
  const h = harness();
  assert.equal((await h.run({ auth: '' })).statusCode, 401);
  assert.equal((await h.run({ url: '/?wrong=1' })).statusCode, 400);
  assert.equal(h.calls.length, 0);
});
test('owner token is authenticated by Google before restricted Firestore read', async () => {
  const h = harness();
  const result = await h.run();
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.records.length, 1);
  assert.equal(result.body.records[0].sender, '15550123456');
  assert.equal(result.body.records[0].body, 'Hello, private enquiry.');
  assert.equal(result.body.records[0].canDraft, true);
  assert.equal(result.body.nextPageToken, 'NEXT+');
  assert.equal(result.body.sendingEnabled, false);
  assert.equal(result.body.automatedReplies, false);
  assert.equal(result.body.retentionPolicyApproved, false);
  assert.equal(h.calls.length, 1);
  assert.equal(h.verifyCount, 1);
  assert.match(h.calls[0].url, /^https:\/\/firestore\.googleapis\.com\/v1\/projects\/tss-crm-508908\/databases\/\(default\)\/documents\/tss_whatsapp_inbox/);
  assert.equal(h.calls[0].options.headers.Authorization, 'Bearer keyless-scoped-reader-token');
  assert.ok(h.calls.every(x => x.options.method === 'GET'));
  assert.equal(result.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.doesNotMatch(JSON.stringify(result.body), /ya29\.mock/);
});
test('wrong and unverified users are rejected before Firestore', async () => {
  for (const profile of [
    { email: 'notowner@gmail.com', email_verified: true },
    { email: 'thesmartysolution@gmail.com', email_verified: false }
  ]) {
    const h = harness({ profile });
    const result = await h.run();
    assert.equal(result.statusCode, 403);
    assert.equal(result.body.error, 'owner_only');
    assert.equal(h.calls.length, 0);
    assert.equal(h.verifyCount, 1);
  }
});
test('expired Google bearer and rejected Firestore scope do not expose data', async () => {
  const unauthorized = harness({ profile: { email: 'notowner@gmail.com', email_verified: true } });
  assert.equal((await unauthorized.run()).statusCode, 403);
  const denied = harness({ storeResponse: Response.json({ error: { message: 'private provider detail' } }, { status: 403 }) });
  const result = await denied.run();
  assert.equal(result.statusCode, 403);
  assert.equal(result.body.error, 'firestore_permission_or_scope_denied');
  assert.doesNotMatch(JSON.stringify(result.body), /private provider detail/);
});
test('API cannot be tricked into arbitrary Google paths or unsupported operations', async () => {
  const h = harness();
  await h.run({ url: '/api/tss-whatsapp-inbox?pageToken=abc' });
  assert.ok(h.calls.some(x => x.url.includes('pageToken=abc')));
  assert.ok(h.calls.every(x => !x.url.includes('graph.facebook.com') && !x.url.includes('othercollection')));
  assert.equal((await h.run({ method: 'DELETE' })).statusCode, 405);
});
test('Firestore payload normalization omits raw provider internals', () => {
  const record = parseFirestoreDocument(document());
  assert.deepEqual(Object.keys(record).sort(), ['key', 'kind','state','receivedAt','timestamp','wabaId','phoneNumberId','messageId','sender','type','body','hasMedia','canDraft'].sort());
  assert.equal(record.key, key);
  const badCollection = document(); badCollection.name = badCollection.name.replace('tss_whatsapp_inbox', 'other');
  assert.equal(parseFirestoreDocument(badCollection), null);
  const badKey = document(fakeEvent({ eventKey: 'bad' }));
  assert.equal(parseFirestoreDocument(badKey), null);
  assert.equal(parseFirestoreDocument({ ...document(), fields: { event: { stringValue: '{' } } }), null);
  const media = parseFirestoreDocument(document(fakeEvent({ payload: { type: 'image', from: '15550123456' } })));
  assert.equal(media.hasMedia, true);
  assert.equal(media.body, '');
  const invalidSender = parseFirestoreDocument(document(fakeEvent({ payload: { type: 'text', from: '<script>', text: { body: '<img src=x onerror=alert(1)>' } } })));
  assert.equal(invalidSender.canDraft, false);
  assert.equal(invalidSender.body, '<img src=x onerror=alert(1)>');
});
test('provider errors and unexpected responses fail closed', async () => {
  const h = harness({ storeResponse: Response.json({ documents: 'malformed' }) });
  assert.equal((await h.run()).statusCode, 503);
  const x = harness({ fetcher: async () => { throw Error('SECRET_VALUE_NEVER_LOG_THIS'); } });
  const res = await x.run();
  assert.equal(res.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(res), /SECRET_VALUE_NEVER_LOG_THIS/);
});


test('Firestore 401 uses only allowlisted owner-visible categories and never raw provider details', async () => {
  for (const [body, expected] of [
    [{ error: { status: 'UNAUTHENTICATED', message: 'SECRET_TOKEN_NEVER_EXPOSE', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', domain: 'googleapis.com', reason: 'ACCESS_TOKEN_EXPIRED', metadata: { secret: 'SECRET_TOKEN_NEVER_EXPOSE' } }] } }, 'access_token_expired'],
    [{ error: { status: 'UNAUTHENTICATED', message: 'SECRET_TOKEN_NEVER_EXPOSE', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', domain: 'googleapis.com', reason: 'SECRET_TOKEN_NEVER_EXPOSE' }] } }, 'google_unauthenticated'],
    [{ error: { details: [{ '@type': 'untrusted', domain: 'googleapis.com', reason: 'ACCESS_TOKEN_EXPIRED' }] } }, 'unclassified_upstream_401'],
    [{ error: { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', domain: 'untrusted', reason: 'ACCESS_TOKEN_EXPIRED' }] } }, 'unclassified_upstream_401'],
    [{ error: { details: 'malformed', message: 'SECRET_TOKEN_NEVER_EXPOSE' } }, 'unclassified_upstream_401']
  ]) {
    const h = harness({ storeResponse: Response.json(body, { status: 401 }) });
    const result = await h.run();
    assert.equal(result.statusCode, 503);
    assert.deepEqual(result.body, { ok: false, error: 'reader_token_rejected', reason: expected });
    assert.equal(h.verifyCount, 1);
    assert.doesNotMatch(JSON.stringify(result.body), /SECRET_TOKEN_NEVER_EXPOSE|metadata/);
  }
  const malformed = harness({ storeResponse: new Response('<private upstream failure>', { status: 401 }) });
  assert.equal((await malformed.run()).body.reason, 'unclassified_upstream_401');
});

test('owner-only diagnostic returns fixed Firestore categories without provider details', async () => {
  for (const [status, category] of [[200, 'FIRESTORE_200'], [401, 'FIRESTORE_401'], [403, 'IAM_OR_FIRESTORE_DENIAL'], [500, 'FIRESTORE_UPSTREAM_FAILURE']]) {
    const h = harness({ storeResponse: Response.json({ error: { message: 'SECRET_UPSTREAM_DETAIL' } }, { status }) });
    const result = await h.run({ url: '/api/tss-whatsapp-inbox?diagnostic=1' });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.diagnostic, true);
    assert.equal(result.body.category, category);
    assert.match(result.body.requestId, /^[0-9a-f-]{36}$/);
    assert.doesNotMatch(JSON.stringify(result.body), /SECRET_UPSTREAM_DETAIL|token|Authorization/i);
  }
  const denied = harness({ profile: { email: 'notowner@gmail.com', email_verified: true } });
  const result = await denied.run({ url: '/api/tss-whatsapp-inbox?diagnostic=1' });
  assert.equal(result.statusCode, 403);
  assert.equal(result.body.error, 'owner_only');
  assert.equal(denied.calls.length, 0);
});
