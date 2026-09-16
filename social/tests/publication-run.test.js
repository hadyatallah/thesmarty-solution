import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalCaption, enforceResolvedHistory, PublicationRun } from '../lib/publication-run.js';
import { Ledger } from '../lib/ledger.js';

test('a partial dual-platform publication consumes the run and retains the live Instagram ID', async () => {
  const run = new PublicationRun(1);
  const record = { id: 'partial-post', phase: 'reserved' };
  let calls = 0;
  await assert.rejects(run.attempt(record, async () => {
    calls++;
    record.instagram = { mediaId: '123' };
    record.phase = 'needs_review';
    throw new Error('Facebook request timed out');
  }), /timed out/);
  await assert.rejects(run.attempt({ id: 'another-post' }, async () => { calls++; }), /Run publishing cap/);
  assert.equal(calls, 1);
  assert.equal(run.published.length, 1);
  assert.equal(run.published[0].instagramMediaId, '123');
  assert.equal(run.published[0].facebookPostId, null);
  assert.equal(run.published[0].needsReview, true);
});

test('a failed post-publication comparison is reported as published and halts even a larger run', async () => {
  const run = new PublicationRun(3);
  const record = { id: 'published-post', phase: 'reserved' };
  await assert.rejects(run.attempt(record, async () => {
    record.instagram = { mediaId: '123' };
    record.facebook = { postId: '456_789' };
    record.phase = 'needs_review';
    throw new Error('Published caption does not match approved caption');
  }), /caption/);
  assert.equal(run.canAttempt, false);
  assert.equal(run.attempts.length, 1);
  assert.equal(run.published[0].facebookPostId, '456_789');
});

test('an uncertain response with no returned IDs never implies that nothing was posted', async () => {
  const run = new PublicationRun(1);
  const record = { id: 'timeout-post', phase: 'publishing_instagram' };
  await assert.rejects(run.attempt(record, async () => { throw new Error('Request timed out'); }));
  assert.equal(run.attempts[0].phase, 'publishing_instagram');
  assert.equal(run.attempts[0].needsReview, true);
  assert.equal(run.published.length, 0);
  assert.equal(run.canAttempt, false);
});

test('a verified successful attempt also enforces the one-post run allowance', async () => {
  const run = new PublicationRun(1);
  const record = { id: 'good-post', phase: 'reserved' };
  await run.attempt(record, async () => {
    record.instagram = { mediaId: '123' };
    record.phase = 'awaiting_published_visual_review';
  });
  assert.equal(run.canAttempt, false);
  assert.equal(run.published[0].needsReview, false);
});

test('unresolved durable records block automatic publishing until reconciled', () => {
  const good = { id: 'prior-post', platform: 'instagram+facebook', phase: 'verified', instagram: { mediaId: '123' }, facebook: { postId: '456' }, verification: { instagram: { sha256: 'a'.repeat(64) }, facebook: { sha256: 'b'.repeat(64) } } };
  enforceResolvedHistory([good, { phase: 'legacy_published', id: 'legacy' }]);
  for (const phase of ['reserved', 'prepared', 'publishing_instagram', 'instagram_published', 'published', 'needs_review']) {
    assert.throws(() => enforceResolvedHistory([{ ...good, phase }]), /Unresolved publication/);
  }
  assert.throws(() => enforceResolvedHistory([{ ...good, phase: 'awaiting_published_visual_review', facebook: null }]), /Unresolved publication/);
  assert.throws(() => enforceResolvedHistory([{ ...good, verification: { instagram: good.verification.instagram } }]), /Unresolved publication/);
  assert.throws(() => enforceResolvedHistory([{ ...good, phase: 'awaiting_published_visual_review' }]), /Unresolved publication/);
});

test('later automatic success requires complete, immutable per-platform comparison evidence', () => {
  const evidence = id => ({ id, passed: true, sha256: 'a'.repeat(64), evidenceCommit: 'b'.repeat(40), evidencePath: `social/published-assets/${'a'.repeat(64)}.jpg` });
  const good = { id: 'later-post', format: 'feed', platform: 'instagram+facebook', phase: 'automatically_verified', verificationMethod: 'published-asset-comparison', instagram: { mediaId: '123' }, facebook: { postId: '456' }, verification: { instagram: evidence('123'), facebook: evidence('456') } };
  enforceResolvedHistory([good]);
  for (const change of [{ passed: false }, { evidenceCommit: null }, { id: 'wrong-post' }, { evidencePath: 'expired-artifact' }]) {
    assert.throws(() => enforceResolvedHistory([{ ...good, verification: { ...good.verification, facebook: { ...good.verification.facebook, ...change } } }]), /Unresolved publication/);
  }
  assert.throws(() => enforceResolvedHistory([{ ...good, verificationMethod: null }]), /Unresolved publication/);
});

test('reusing identical archived bytes still returns an immutable evidence commit', async () => {
  const ledger = new Ledger('test-only', 'test-state', 'a'.repeat(40));
  const requests = [], bytes = Buffer.from('same published asset');
  ledger.api = async (route, method) => {
    requests.push({ route, method });
    if (route.startsWith('/contents/')) return { content: bytes.toString('base64') };
    if (route === '/git/ref/heads/test-state') return { object: { sha: 'b'.repeat(40) } };
    throw new Error('Unexpected write');
  };
  assert.equal(await ledger.writeFile('social/published-assets/test.jpg', bytes, 'Archive'), 'b'.repeat(40));
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => !request.method || request.method === 'GET'));
});

test('caption comparison preserves signs, punctuation, digits and case while accepting presentation whitespace', () => {
  assert.equal(canonicalCaption('Cafe\u0301\r\n\r\n+3.3%'), canonicalCaption('Café +3.3%'));
  for (const changed of ['Café -3.3%', 'Café +33%', 'Café +3,3%', 'café +3.3%', 'Café 3.3%']) {
    assert.notEqual(canonicalCaption('Café +3.3%'), canonicalCaption(changed));
  }
});
