import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { buildEditorialMetadata, enforceEditorialPolicy, pickCta } from '../lib/editorial.js';

const read = file => fs.readFile(file, 'utf8').then(JSON.parse);
const [intelligence, needs, feedback, registry, policy, bank] = await Promise.all([
  read('social/editorial-intelligence.json'),
  read('social/audience-needs.json'),
  read('social/performance-feedback.json'),
  read('social/social-proof-registry.json'),
  read('social/editorial-adoption-policy.json'),
  read('social/editorial-bank.json')
]);
const brief = bank.find(item => item.id === 'small-test');
const item = (format = 'feed') => ({
  id: `new-${format}-regression`,
  headline: brief.headline,
  format,
  facts: { classification: 'editorial-opinion', claims: [], sources: [] },
  editorial: buildEditorialMetadata(brief, format, pickCta(brief, format, intelligence, feedback))
});
const enforce = content => enforceEditorialPolicy(content, intelligence, needs, policy, registry);

test('CTA learnings affect only approved results for the same format and objective', () => {
  const first = pickCta(brief, 'feed', intelligence, feedback).id;
  const alternative = intelligence.ctaLibrary.find(cta => cta.objective === brief.objective && cta.formats.includes('feed') && cta.id !== first).id;
  for (const learning of [
    { status: 'approved', format: 'story', objective: brief.objective },
    { status: 'approved', format: 'feed', objective: 'compare' },
    { status: 'draft', format: 'feed', objective: brief.objective }
  ]) {
    const proposed = { ...feedback, approvedLearnings: [{ ...learning, retireCtaIds: [first], preferCtaIds: [alternative] }] };
    assert.equal(pickCta(brief, 'feed', intelligence, proposed).id, first);
  }
  const matched = { status: 'approved', format: 'feed', objective: brief.objective };
  assert.equal(pickCta(brief, 'feed', intelligence, { ...feedback, approvedLearnings: [{ ...matched, preferCtaIds: [alternative] }] }).id, alternative);
  assert.equal(pickCta(brief, 'feed', intelligence, { ...feedback, approvedLearnings: [{ ...matched, retireCtaIds: [first] }] }).id, alternative);
});

test('new factual posts need evidence authority even outside the trend workflow', () => {
  const content = item();
  content.facts = { classification: 'factual', claims: [{ text: 'Checked result', sourceIds: ['source'] }], sources: [{ id: 'source' }] };
  assert.throws(() => enforce(content), /authority metadata/);
  content.facts.sources[0].authorityType = 'news-summary';
  assert.throws(() => enforce(content), /authority metadata/);
  for (const authorityType of ['primary', 'official-statistics', 'original-market-study']) {
    content.facts.sources[0].authorityType = authorityType;
    assert.equal(enforce(content), true);
  }
  content.facts.classification = 'editorial-opinion';
  delete content.facts.sources[0].authorityType;
  assert.throws(() => enforce(content), /authority metadata/);
});

test('existing first-ten manifests keep their grandfathered evidence contracts', async () => {
  const files = (await fs.readdir('content-queue')).filter(file => /^tss-review-\d\d-.*\.json$/.test(file));
  assert.equal(files.length, 10);
  for (const file of files) assert.equal(enforce(await read(`content-queue/${file}`)), true, file);
});

test('encoded Reel duration follows its script while unexported drafts remain valid', () => {
  const content = item('reel');
  assert.equal(enforce(content), true);
  content.asset = { videoQA: { duration: 6 } };
  assert.throws(() => enforce(content), /duration must match/);
  content.asset.videoQA.duration = 24;
  assert.throws(() => enforce(content), /duration must match/);
  content.asset.videoQA.duration = 20.033;
  assert.equal(enforce(content), true);
});

test('still-image exports use the actual encoded media type for the hosted extension', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tss-export-type-'));
  try {
    const exportScript = fileURLToPath(new URL('../scripts/export.js', import.meta.url));
    const feed = await read('content-queue/tss-review-05-british-emigration-feed.json');
    const story = {
      creative: { format: 'story', template: 'question-debate', text: { category: 'CYPRUS / BUSINESS', headline: 'WHAT WOULD YOU TEST FIRST?', body: 'Define the customer. Test the offer.', question: 'What could a small pilot prove?' } }
    };
    for (const [input, expectedFormat, expectedExtension] of [[feed, 'jpeg', '.jpg'], [story, 'png', '.png']]) {
      const manifestPath = path.join(directory, `${input.creative.format}.json`);
      await fs.writeFile(manifestPath, JSON.stringify(input));
      execFileSync(process.execPath, [exportScript, manifestPath], { cwd: directory, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
      const exported = await read(manifestPath);
      const bytes = await fs.readFile(path.join(directory, exported.asset.path));
      assert.equal((await sharp(bytes).metadata()).format, expectedFormat);
      assert.equal(path.extname(exported.asset.path), expectedExtension);
      assert.equal(exported.status, 'draft');
      assert.equal(exported.review, undefined);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
