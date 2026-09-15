import fs from 'node:fs/promises';
import { normalize, requireThat } from '../lib/qa.js';
import { buildEditorialMetadata, pickCta, validateBrief, validateEditorialConfiguration, validateTrendCandidate } from '../lib/editorial.js';

// Free curated generation. New facts and creative angles are added through the
// reviewed editorial bank or source-gated trend candidates. This script never
// invents market figures or marks generated files as inspected/approved.
const date = process.argv[2];
requireThat(/^\d{4}-\d{2}-\d{2}$/.test(date || ''), 'Pass a date as YYYY-MM-DD');
const [bank, config, intelligence, needs, feedback, trends, proofRegistry] = await Promise.all([
  fs.readFile('social/editorial-bank.json', 'utf8').then(JSON.parse),
  fs.readFile('social/publishing-config.json', 'utf8').then(JSON.parse),
  fs.readFile('social/editorial-intelligence.json', 'utf8').then(JSON.parse),
  fs.readFile('social/audience-needs.json', 'utf8').then(JSON.parse),
  fs.readFile('social/performance-feedback.json', 'utf8').then(JSON.parse),
  fs.readFile('social/trend-candidates.json', 'utf8').then(JSON.parse),
  fs.readFile('social/social-proof-registry.json', 'utf8').then(JSON.parse)
]);
validateEditorialConfiguration(intelligence, needs, feedback, trends, proofRegistry);
for (const brief of bank) validateBrief(brief, intelligence, needs);
const reviewedTrends = trends.items.filter(candidate => {
  validateTrendCandidate(candidate, intelligence, needs);
  return true;
});
const existing = await Promise.all((await fs.readdir('content-queue')).filter(f => f.endsWith('.json')).map(async f => JSON.parse(await fs.readFile(`content-queue/${f}`, 'utf8'))));
const briefs = [...reviewedTrends, ...bank];
const usedBriefIds = new Set();
const existingNeedUse = new Map();
const existingHookUse = new Map();
for (const item of existing) {
  for (const id of item.editorial?.audienceNeedIds || []) existingNeedUse.set(id, (existingNeedUse.get(id) || 0) + 1);
  const hook = item.editorial?.hook?.type;
  if (hook) existingHookUse.set(hook, (existingHookUse.get(hook) || 0) + 1);
}
const score = brief => {
  const needUse = brief.audienceNeedIds.reduce((sum, id) => sum + (existingNeedUse.get(id) || 0), 0);
  const hookUse = existingHookUse.get(brief.hookType) || 0;
  const freshnessPriority = brief.editorialType === 'trend' ? -1000 : 0;
  return freshnessPriority + needUse * 10 + hookUse;
};
const formats = ['feed', 'story', 'reel'];
let count = 0;
for (const format of formats) {
  const brief = briefs
    .filter(candidate => !usedBriefIds.has(candidate.id))
    .filter(candidate => candidate.formatCandidates.includes(format))
    .filter(candidate => !existing.some(item => normalize(item.topic) === normalize(candidate.topic)))
    .sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))[0];
  if (!brief) continue;
  usedBriefIds.add(brief.id);
  const cta = pickCta(brief, format, intelligence, feedback, existing);
  const editorial = buildEditorialMetadata(brief, format, cta);
  const id = `${date}-${brief.id}`;
  const hashtags = (brief.hashtags || []).slice(0, 5).join(' ');
  const caption = format === 'story'
    ? cta.text
    : `${brief.headline}\n\n${brief.body}\n\n${cta.text}${hashtags ? `\n\n${hashtags}` : ''}`;
  const item = {
    qaVersion: 2,
    id,
    status: 'draft',
    topic: brief.topic,
    topicKey: brief.id,
    headline: brief.headline,
    creativeKey: `${brief.id}-${format}-editorial-v3`,
    format,
    platforms: format === 'feed' ? ['instagram', 'facebook'] : ['instagram'],
    publishAt: null,
    caption,
    creative: {
      format,
      template: 'question-debate',
      text: { category: brief.category, headline: brief.headline, body: brief.body, question: cta.text }
    },
    facts: brief.facts || { classification: brief.classification, claims: [], sources: [] },
    geography: brief.geography || { mode: 'no-location-imagery' },
    editorial
  };
  // A timezone offset is intentionally not inferred from a month. The editor
  // sets publishAt for Asia/Nicosia before the final content binding is signed.
  item.publishAt = null;
  item.requestedLocalSlot = config.slots[count];
  await fs.writeFile(`content-queue/${id}.json`, JSON.stringify(item, null, 2) + '\n');
  existing.push(item);
  count++;
}
console.log(`Created ${count} evidence-led draft(s). Final export, source checks and visual inspection are required.`);
