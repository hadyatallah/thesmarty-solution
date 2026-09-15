import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const plan = JSON.parse(await fs.readFile('social/monthly-content-plan.json', 'utf8'));
const formats = ['feed', 'story', 'reel'];

test('monthly content plan totals are internally consistent', () => {
  const formatTotal = formats.reduce((sum, format) => sum + plan.formats[format].monthlyTarget, 0);
  const pillarTotal = plan.topicPillars.reduce((sum, pillar) => sum + pillar.monthlyTarget, 0);
  const usefulTotal = plan.topicPillars
    .filter(pillar => pillar.classification === 'useful')
    .reduce((sum, pillar) => sum + pillar.monthlyTarget, 0);
  const promotionTotal = plan.topicPillars
    .filter(pillar => pillar.classification === 'promotion')
    .reduce((sum, pillar) => sum + pillar.monthlyTarget, 0);

  assert.equal(formatTotal, plan.targets.contentAssets);
  assert.equal(pillarTotal, plan.targets.contentAssets);
  assert.equal(usefulTotal, plan.targets.usefulAssets);
  assert.equal(promotionTotal, plan.targets.tssPromotionalAssets);
});

test('pillar format allocations match both pillar and format targets', () => {
  for (const pillar of plan.topicPillars) {
    const allocated = formats.reduce((sum, format) => sum + pillar.formats[format], 0);
    assert.equal(allocated, pillar.monthlyTarget, pillar.id);
  }

  for (const format of formats) {
    const allocated = plan.topicPillars.reduce((sum, pillar) => sum + pillar.formats[format], 0);
    assert.equal(allocated, plan.formats[format].monthlyTarget, format);
  }
});

test('current adapter publication count is correct', () => {
  const platformPublications = formats.reduce(
    (sum, format) => sum + plan.formats[format].monthlyTarget * plan.formats[format].platforms.length,
    0
  );
  assert.equal(platformPublications, plan.targets.platformPublicationsWithCurrentAdapters);
});

test('strategy cannot approve or activate publishing', () => {
  assert.equal(plan.controls.schedulerEnabledByThisFile, false);
  assert.equal(plan.controls.strategyApprovalIsNotPostApproval, true);
  assert.equal(plan.controls.initialPostsRequireIndividualApproval, 10);
  assert.equal(plan.controls.requireControlledLiveVerificationPerFormat, true);
  assert.equal(plan.controls.publishFewerWhenQaFails, true);
  assert.equal(plan.controls.backfillMissedSlots, false);
});
