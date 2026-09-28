import test from 'node:test';
import assert from 'node:assert/strict';
import { enforcePublisherContract, PUBLISHER_CONTRACT_VERSION, publisherPolicyDigest } from '../lib/publisher-contract.js';

const policies = () => ({
  approvalPolicy: { requiredCount: 10, approvals: { first: { contentSha256: 'a'.repeat(64) } } },
  editorialIntelligence: { version: 1, hookLimit: 10 },
  audienceNeeds: { needs: [{ id: 'property-costs' }] },
  proofRegistry: { approved: [] },
  editorialPolicy: { requireVerifiedSources: true }
});

test('policy freshness accepts the matching deployment and rejects the previous API contract', () => {
  const digest = publisherPolicyDigest(policies());
  enforcePublisherContract({ contractVersion: PUBLISHER_CONTRACT_VERSION, policyDigest: digest }, digest);
  for (const stale of [{ qaVersion: 2 }, { contractVersion: 2, policyDigest: digest }, { contractVersion: PUBLISHER_CONTRACT_VERSION, policyDigest: 'b'.repeat(64) }]) {
    assert.throws(() => enforcePublisherContract(stale, digest), /No publication was reserved/);
  }
});

test('any changed publishing policy blocks the stale deployment before reservation', () => {
  const baseline = policies(), deployedDigest = publisherPolicyDigest(baseline);
  for (const name of Object.keys(baseline)) {
    const changed = structuredClone(baseline);
    changed[name].revision = 'new policy';
    const requiredDigest = publisherPolicyDigest(changed);
    assert.notEqual(requiredDigest, deployedDigest, name);
    assert.throws(() => enforcePublisherContract({ contractVersion: PUBLISHER_CONTRACT_VERSION, policyDigest: deployedDigest }, requiredDigest), /policies are stale/);
  }
});

test('object insertion order cannot cause false deployment mismatch, while nested approvals remain bound', () => {
  const original = policies();
  const reordered = Object.fromEntries(Object.entries(original).reverse().map(([name, policy]) => [name, Object.fromEntries(Object.entries(policy).reverse())]));
  assert.equal(publisherPolicyDigest(original), publisherPolicyDigest(reordered));
  reordered.approvalPolicy = structuredClone(reordered.approvalPolicy);
  reordered.approvalPolicy.approvals.first.contentSha256 = 'c'.repeat(64);
  assert.notEqual(publisherPolicyDigest(original), publisherPolicyDigest(reordered));
  assert.throws(() => publisherPolicyDigest({ ...original, proofRegistry: null }), /Missing publisher policy/);
});
