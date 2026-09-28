import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { monthlyDraftUsage, planDrafts } from '../lib/draft-planner.js';
import { renderCreative } from '../lib/render.js';

const read = path => fs.readFile(path, 'utf8').then(JSON.parse);
const [plan, config, bank, intelligence, needs, feedback, catalog] = await Promise.all([
  read('social/monthly-content-plan.json'), read('social/publishing-config.json'), read('social/editorial-bank.json'),
  read('social/editorial-intelligence.json'), read('social/audience-needs.json'), read('social/performance-feedback.json'), read('social/photo-catalog.json')
]);
const now = Date.parse('2026-09-16T12:00:00Z');
const smallPlan = () => ({
  ...structuredClone(plan),
  targets: { ...plan.targets, contentAssets: 2, usefulAssets: 2, tssPromotionalAssets: 0 },
  formats: { feed: { ...plan.formats.feed, monthlyTarget: 1 }, story: { ...plan.formats.story, monthlyTarget: 1 }, reel: { ...plan.formats.reel, monthlyTarget: 0 } },
  topicPillars: [{ id: 'cyprus-economy-business', classification: 'useful', monthlyTarget: 2, formats: { feed: 1, story: 1, reel: 0 } }]
});
const selectedBank = () => structuredClone(bank.filter(item => ['small-test', 'partner-fit', 'downside-plan'].includes(item.id)));
const params = changes => ({ date: '2026-09-16', plan: smallPlan(), config, bank: selectedBank(), trends: { items: [] }, intelligence, needs, feedback, catalog, queue: [], history: [], now, ...changes });
const used = changes => ({ id: 'previous-post', date: '2026-09-15T12:00:00Z', format: 'feed', phase: 'verified', classification: 'editorial-opinion', topic: 'A distinct old topic', headline: 'A distinct old headline', editorial: { pillar: 'cyprus-economy-business' }, ...changes });

test('draft planning respects monthly format and pillar budgets rather than three daily slots', () => {
  const { drafts, report } = planDrafts(params());
  assert.equal(drafts.length, 2);
  assert.deepEqual(drafts.map(item => item.format).sort(), ['feed', 'story']);
  assert.equal(report.usage.total, 2);
  assert.equal(report.gaps.length, 0);
  for (const draft of drafts) {
    assert.equal(draft.status, 'draft');
    assert.equal(draft.publishAt, null);
    assert.equal(draft.review, undefined);
    assert.equal(draft.asset, undefined);
    assert.equal(draft.creative.designVersion, 2);
    assert.ok(draft.creative.visualStyle.startsWith('reference-'));
    assert.equal(draft.geography.mode, 'verified-republic-location');
  }
  const feed = drafts.find(item => item.format === 'feed');
  assert.equal(feed.creative.compositionReady, false);
  assert.match(feed.caption, /Photo:.*(?:CC|Public domain)/);
  const story = drafts.find(item => item.format === 'story');
  assert.ok(['CC0', 'Public domain'].includes(catalog.photos[story.creative.photoKey].licence));
});

test('the same publication in the queue and state history consumes one monthly slot', () => {
  const history = [used()];
  const queue = [{ ...used(), status: 'approved', publishAt: '2026-09-15T15:00:00+03:00' }];
  const { drafts, report } = planDrafts(params({ history, queue }));
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].format, 'story');
  assert.equal(report.usage.total, 2);
});

test('recent published topics are excluded even when the publication is absent from the queue', () => {
  const brief = selectedBank()[0];
  const { drafts, report } = planDrafts(params({ bank: [brief], history: [used({ phase: 'legacy_published', topic: brief.topic, headline: brief.headline, topicKey: brief.id })] }));
  assert.equal(drafts.length, 0);
  assert.equal(report.contentBankExhausted, true);
  assert.match(report.skipped[0].reason, /used recently/);
  assert.equal(report.gaps.length, 2);
});

test('ineligible trend candidates do not stop safe evergreen planning', () => {
  const { drafts, report } = planDrafts(params({ trends: { items: [{ ...selectedBank()[0], id: 'unreviewed-trend', status: 'draft', editorialType: 'trend' }] } }));
  assert.equal(drafts.length, 2);
  assert.match(report.skipped[0].reason, /not source reviewed/);
});

test('month boundaries use Cyprus time and a history snapshot is mandatory', () => {
  const record = used({ date: '2026-08-31T22:30:00Z' });
  assert.equal(monthlyDraftUsage(smallPlan(), [], [record], '2026-09', 'Asia/Nicosia').total, 1);
  assert.throws(() => planDrafts(params({ history: undefined })), /history snapshot/);
  assert.throws(() => planDrafts(params({ history: [used({ editorial: undefined })] })), /explicit topic pillar/);
});

test('a missing verified photo blocks composition instead of falling back to old cards', async () => {
  const { drafts } = planDrafts(params({ catalog: { photos: {} } }));
  for (const draft of drafts) {
    assert.equal(draft.creative.compositionReady, false);
    assert.equal(draft.planning.requiresPhotoSelection, true);
    await assert.rejects(renderCreative(draft.creative), /dedicated composition/);
  }
});

test('new vertical renders use full-width blended photos and no category rule', async () => {
  const item = await read('content-queue/tss-review-09-property-title-checks-story.json');
  const { buffer, layout } = await renderCreative(item.creative);
  const metadata = await sharp(buffer).metadata();
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1920);
  assert.equal(layout.categoryRule, false);
  assert.equal(layout.photoRegion.x, 0);
  assert.equal(layout.photoRegion.width, 1080);
  assert.equal(layout.photoTransition.mode, 'cream-to-photo-fade');
  // The top of the photo must actually match the cream palette, rather than
  // relying only on a declarative transition flag in the layout metadata.
  const pixel = await sharp(buffer).extract({ left: 0, top: layout.photoTransition.y, width: 1080, height: 1 }).removeAlpha().raw().toBuffer();
  for (let i = 0; i < pixel.length; i += 3) {
    assert.ok(Math.abs(pixel[i] - 250) <= 2 && Math.abs(pixel[i + 1] - 248) <= 2 && Math.abs(pixel[i + 2] - 243) <= 2);
  }
});
