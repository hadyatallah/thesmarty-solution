import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { checkDuplicates } from '../lib/qa.js';
import {
  buildEditorialMetadata,
  enforceEditorialPolicy,
  pickCta,
  validateBrief,
  validateEditorialConfiguration,
  validateEditorialMetadata,
  validateTrendCandidate
} from '../lib/editorial.js';

const read = file => fs.readFile(file, 'utf8').then(JSON.parse);
const [intelligence, needs, feedback, trends, proofRegistry, policy, bank] = await Promise.all([
  read('social/editorial-intelligence.json'),
  read('social/audience-needs.json'),
  read('social/performance-feedback.json'),
  read('social/trend-candidates.json'),
  read('social/social-proof-registry.json'),
  read('social/editorial-adoption-policy.json'),
  read('social/editorial-bank.json')
]);

const brief = () => ({ ...bank.find(item => item.id === 'small-test') });
const generatedItem = (format = 'feed') => {
  const source = brief();
  const cta = pickCta(source, format, intelligence, feedback, []);
  return {
    id: `new-${format}-item`,
    topic: source.topic,
    topicKey: source.id,
    headline: source.headline,
    creativeKey: `new-${format}-creative`,
    format,
    facts: { classification: source.classification, claims: [], sources: [] },
    editorial: buildEditorialMetadata(source, format, cta),
    asset: { sha256: '1'.repeat(64), pixelHash: '2'.repeat(64), visualSignature: `rgb32:${Buffer.alloc(3072, 1).toString('base64')}` }
  };
};

test('editorial intelligence files and curated briefs are internally valid', () => {
  validateEditorialConfiguration(intelligence, needs, feedback, trends, proofRegistry);
  assert.ok(needs.needs.length >= 10);
  for (const item of bank) validateBrief(item, intelligence, needs);
  assert.equal(intelligence.carouselPolicy.publishingEnabled, false);
  assert.equal(proofRegistry.records.length, 0);
});

test('new content receives an audience need, approved CTA and structured Reel script', () => {
  const item = generatedItem('reel');
  validateEditorialMetadata(item, intelligence, needs, proofRegistry);
  assert.equal(item.editorial.reelScript.durationSeconds, 20);
  assert.ok(item.editorial.reelScript.beats.length >= 1);
  assert.equal(item.editorial.reelScript.close, item.editorial.cta.text);

  const source = brief();
  const first = pickCta(source, 'feed', intelligence, feedback, []);
  const second = pickCta(source, 'feed', intelligence, feedback, [{ editorial: { cta: { id: first.id } } }]);
  assert.notEqual(first.id, second.id);
});

test('hype hooks and unreviewed trend claims fail closed', () => {
  const unsafe = brief();
  unsafe.headline = 'THE GUARANTEED VIRAL CYPRUS INVESTMENT';
  assert.throws(() => validateBrief(unsafe, intelligence, needs), /blocked hype/);

  const now = Date.now();
  const trend = {
    ...brief(),
    id: 'reviewed-trend',
    editorialType: 'trend',
    classification: 'factual',
    status: 'draft',
    reviewedAt: new Date(now).toISOString(),
    facts: {
      classification: 'factual',
      claims: [{ text: 'Example checked measure', sourceIds: ['official'] }],
      sources: [{ id: 'official', authorityType: 'official-statistics', checkedAt: new Date(now).toISOString(), validUntil: new Date(now + 86400000).toISOString() }]
    }
  };
  assert.throws(() => validateTrendCandidate(trend, intelligence, needs, now), /not source reviewed/);
  trend.status = 'source-reviewed';
  validateTrendCandidate(trend, intelligence, needs, now);
  const cta = pickCta(trend, 'feed', intelligence, feedback, []);
  const item = {
    ...generatedItem(),
    headline: trend.headline,
    format: 'feed',
    facts: trend.facts,
    editorial: buildEditorialMetadata(trend, 'feed', cta)
  };
  validateEditorialMetadata(item, intelligence, needs, proofRegistry, now);
  assert.equal(item.editorial.trend.candidateId, trend.id);
});

test('editorial policy preserves the existing queue but requires metadata for every later ID', () => {
  enforceEditorialPolicy({ id: policy.grandfatheredContentIds[0] }, intelligence, needs, policy, proofRegistry);
  assert.throws(() => enforceEditorialPolicy({ id: 'future-item' }, intelligence, needs, policy, proofRegistry), /requires editorial intelligence metadata/);
  enforceEditorialPolicy(generatedItem(), intelligence, needs, policy, proofRegistry);
});

test('social proof stays blocked until permission, confidentiality and evidence are registered', () => {
  const item = generatedItem();
  item.editorial.editorialType = 'social-proof';
  item.editorial.socialProofId = 'case-1';
  item.facts = { classification: 'factual', claims: [{ text: 'Measured result', sourceIds: ['case-source'] }], sources: [] };
  assert.throws(() => validateEditorialMetadata(item, intelligence, needs, proofRegistry), /permission or confidentiality/);

  const approved = {
    version: 1,
    records: [{ id: 'case-1', status: 'approved', permissionStatus: 'approved', confidentialityReviewed: true, evidenceSourceId: 'case-source', approvedAt: new Date().toISOString() }]
  };
  validateEditorialMetadata(item, intelligence, needs, approved);
});

test('controlled repurposing allows a related subject only in a different format with a new hook and visual', () => {
  const now = Date.now();
  const old = {
    id: 'source-feed',
    date: new Date(now).toISOString(),
    topic: 'Testing a business opportunity through a small pilot',
    topicKey: 'small-test',
    headline: 'WHAT COULD A SMALL TEST PROVE?',
    creativeKey: 'source-creative',
    format: 'feed',
    assetSha256: '3'.repeat(64),
    pixelHash: '4'.repeat(64),
    visualSignature: `rgb32:${Buffer.alloc(3072, 100).toString('base64')}`
  };
  const item = generatedItem('story');
  item.headline = 'WHICH ASSUMPTION SHOULD YOUR PILOT TEST?';
  item.editorial.hook.text = item.headline;
  item.editorial.hook.wordCount = 6;
  item.editorial.repurpose = {
    sourceId: old.id,
    newAngle: 'Turn the general pilot idea into an assumption checklist.',
    audienceValue: 'Helps founders choose the first measurable test.',
    visualDifference: 'Dedicated vertical checklist rather than the original Feed composition.'
  };
  item.editorial.editorialType = 'repurpose';
  checkDuplicates(item, [old], now);
  item.format = 'feed';
  assert.throws(() => checkDuplicates(item, [old], now), /different format/);
});
