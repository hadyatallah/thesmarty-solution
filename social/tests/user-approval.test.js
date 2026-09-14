import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceUserApproval, sha256, sign, userApprovalBinding } from '../lib/qa.js';
import handler from '../../api/publish-instagram.js';

const item = () => ({ id: 'first-01', caption: 'Verified information', topic: 'Topic', format: 'feed', platforms: ['instagram'], asset: { sha256: sha256('image') }, creative: { format: 'feed' }, facts: { claims: [], sources: [] }, geography: { mode: 'no-location-imagery' }, publishAt: new Date().toISOString() });
const policy = () => ({ version: 1, requiredCount: 10, approver: 'Hady', firstPostIds: Array.from({ length: 10 }, (_, i) => `first-${String(i + 1).padStart(2, '0')}`), approvals: {} });
const approval = i => ({ approvedBy: 'Hady', approvedAt: new Date().toISOString(), contentSha256: userApprovalBinding(i), authorizationReference: 'Explicit approval in the TSS Work chat' });
test('QA approval cannot replace user approval and the eleventh post cannot bypass the initial ten', () => {
  const p = policy(), i = item();
  assert.throws(() => enforceUserApproval(i, p), /Explicit user approval/);
  assert.throws(() => enforceUserApproval({ ...i, id: 'later-post' }, p), /Explicit user approval/);
  p.approvals[i.id] = approval(i); enforceUserApproval(i, p);
  for (const id of p.firstPostIds) p.approvals[id] = approval({ ...i, id });
  enforceUserApproval({ ...i, id: 'later-post' }, p);
  p.approvals['first-05'].approvedBy = 'Automated QA';
  assert.throws(() => enforceUserApproval({ ...i, id: 'later-post' }, p), /Explicit user approval/);
});
test('rescheduling keeps approval while a caption, claim, format or final asset change requires a revision review', () => {
  const i = item(), p = policy(); p.approvals[i.id] = approval(i);
  enforceUserApproval({ ...i, publishAt: '2026-10-01T09:15:00+03:00' }, p);
  for (const change of [{ caption: 'Changed caption' }, { asset: { sha256: sha256('changed image') } }, { format: 'story' }, { facts: { claims: [{ text: 'New claim', sourceIds: ['source'] }], sources: [] } }]) {
    assert.throws(() => enforceUserApproval({ ...i, ...change }, p), /changed after user approval/);
  }
  assert.throws(() => enforceUserApproval(i, { ...p, firstPostIds: [] }), /invalid ten-post/);
});
test('the live API rejects an unreviewed post before any external request, including a correctly signed request', async () => {
  const oldKey = process.env.TSS_PUBLISHER_KEY, oldFetch = globalThis.fetch;
  process.env.TSS_PUBLISHER_KEY = 'test-only-key'; let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Unexpected external request'); };
  try {
    for (const action of ['prepare', 'publishInstagram', 'publishFacebook']) {
      let code, output;
      const payload = { action, item: item() };
      await handler({ method: 'POST', headers: { 'x-tss-publisher-key': 'test-only-key' }, body: { payload, signature: sign(payload, 'test-only-key') } }, { setHeader() {}, status(s) { code = s; return this; }, json(d) { output = d; } });
      assert.equal(code, 422); assert.match(output.error, /Explicit user approval/);
    }
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.TSS_PUBLISHER_KEY; else process.env.TSS_PUBLISHER_KEY = oldKey;
  }
});
