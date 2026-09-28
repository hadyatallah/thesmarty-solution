import { normalize, requireThat } from './qa.js';
import { buildEditorialMetadata, pickCta, validateBrief, validateTrendCandidate } from './editorial.js';

const FORMATS = ['feed', 'story', 'reel'];
const INACTIVE = new Set(['rejected', 'cancelled', 'archived']);
// These are the known rollout topics, not inferred claims about legacy posts.
const ROLLOUT_PILLARS = {
  'tss-review-01-cyprus-property-seasonality-feed': 'cyprus-property',
  'tss-review-02-property-transfer-fees-feed': 'cyprus-property',
  'tss-review-03-housing-income-share-feed': 'europe-comparisons',
  'tss-review-04-investor-brief-feed': 'tss-positioning',
  'tss-review-05-british-emigration-feed': 'tax-relocation',
  'tss-review-06-ireland-tax-residency-feed': 'tax-relocation',
  'tss-review-07-europe-property-cycles-feed': 'europe-comparisons',
  'tss-review-08-europe-living-costs-story': 'europe-comparisons',
  'tss-review-09-property-title-checks-story': 'cyprus-property',
  'tss-review-10-cyprus-relocation-priorities-reel': 'tss-positioning',
  '2026-09-14-cyprus-lebanon-customer-problem': 'cyprus-lebanon'
};

function monthOf(value, timezone) {
  const time = Date.parse(value);
  requireThat(Number.isFinite(time), 'Draft planning needs valid history and queue dates');
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit' }).format(new Date(time));
}
const classification = item => item.classification || item.facts?.classification;
const pillarOf = item => item.editorial?.pillar || item.planning?.pillar || ROLLOUT_PILLARS[item.id];

export function monthlyDraftUsage(plan, queue, history, month, timezone) {
  requireThat(Array.isArray(history), 'A current state-branch history snapshot is required');
  const records = new Map();
  for (const item of queue) {
    if (INACTIVE.has(item.status) || item.status === 'published' || item.qaOnly) continue;
    const itemMonth = item.planning?.month || (item.publishAt ? monthOf(item.publishAt, timezone) : item.id?.match(/^\d{4}-\d{2}/)?.[0]);
    if (itemMonth === month) records.set(item.id, item);
  }
  for (const item of history) {
    requireThat(item?.id && Number.isFinite(Date.parse(item.date || item.publishedAt || item.reservedAt)), 'Invalid history record blocks draft planning');
    // Same scope as the publisher's monthly caps: imported pre-system history
    // still protects against duplicates, but does not consume the new plan.
    if ((item.phase || '').startsWith('legacy')) continue;
    if (monthOf(item.date || item.publishedAt || item.reservedAt, timezone) === month) records.set(item.id, item);
  }
  const usage = { total: records.size, promotion: 0, formats: Object.fromEntries(FORMATS.map(f => [f, 0])), pillars: {} };
  for (const pillar of plan.topicPillars) usage.pillars[pillar.id] = { total: 0, ...Object.fromEntries(FORMATS.map(f => [f, 0])) };
  for (const item of records.values()) {
    requireThat(FORMATS.includes(item.format), 'Unknown format in monthly draft inventory');
    const pillar = pillarOf(item);
    requireThat(usage.pillars[pillar], `Monthly item needs an explicit topic pillar: ${item.id}`);
    usage.formats[item.format]++;
    usage.pillars[pillar].total++;
    usage.pillars[pillar][item.format]++;
    if (classification(item) === 'promotion' || plan.topicPillars.find(p => p.id === pillar).classification === 'promotion') usage.promotion++;
  }
  return usage;
}

function similarity(a, b) {
  const A = new Set(normalize(a).split(' ').filter(w => w.length > 2)), B = new Set(normalize(b).split(' ').filter(w => w.length > 2));
  const union = new Set([...A, ...B]);
  return union.size ? [...A].filter(w => B.has(w)).length / union.size : 0;
}
function sameTopic(brief, old) {
  return normalize(brief.id) === normalize(old.topicKey)
    || normalize(brief.topic) === normalize(old.topic)
    || normalize(brief.headline) === normalize(old.headline)
    || similarity(brief.topic, old.topic) >= 0.8
    || similarity(brief.headline, old.headline) >= 0.68
    || Boolean(brief.contentFamilyId && brief.contentFamilyId === old.editorial?.contentFamilyId);
}

function verifiedPhoto(catalog, brief, format, existing) {
  const eligible = Object.entries(catalog.photos || {}).filter(([key, photo]) =>
    (!brief.photoKey || brief.photoKey === key)
    && photo.approved === true && photo.republicControlled === true
    // Story caption metadata is not displayed by Instagram. Choose a public
    // domain/CC0 photograph until visible attribution is deliberately composed.
    && (format !== 'story' || ['CC0', 'Public domain'].includes(photo.licence))
    && /^[a-f0-9]{64}$/.test(photo.sha256 || '') && photo.location && photo.reviewNote
    && photo.evidenceUrl?.startsWith('https://') && photo.licence && photo.licenceUrl && photo.artist);
  const uses = key => existing.filter(item => item.creative?.photoKey === key).length;
  return eligible.sort(([a], [b]) => uses(a) - uses(b) || a.localeCompare(b))[0];
}

export function buildPlannedDraft(brief, format, date, plan, config, intelligence, feedback, catalog, existing) {
  const cta = pickCta(brief, format, intelligence, feedback, existing);
  const editorial = buildEditorialMetadata(brief, format, cta);
  const selected = verifiedPhoto(catalog, brief, format, existing), [photoKey, photo] = selected || [];
  const facts = structuredClone(brief.facts || { classification: brief.classification, claims: [], sources: [] });
  requireThat(Array.isArray(facts.claims) && Array.isArray(facts.sources), `Brief needs a claim/source inventory: ${brief.id}`);
  const sources = facts.sources.map(source => `${source.title || source.id}\n${source.url}`).join('\n');
  const photoCredit = photo ? `Photo: ${photo.location}, ${photo.artist}, ${photo.licence} (cropped).\n${photo.evidenceUrl}\n${photo.licenceUrl}` : '';
  const hashtags = (brief.hashtags || []).join(' ');
  const caption = format === 'story' ? cta.text
    : [brief.headline, brief.body, cta.text, sources && `Sources:\n${sources}`, photoCredit, hashtags].filter(Boolean).join('\n\n');
  const sourceLabel = brief.sourceLabel || (facts.classification === 'editorial-opinion' ? 'EDITORIAL VIEW / NOT A FORECAST' : null);
  // Feed needs an actual concise data/checklist composition. A generic brief
  // must never fall through to the rejected legacy renderer or invent figures.
  const compositionReady = format === 'story' && Boolean(photo && sourceLabel);
  const item = {
    qaVersion: 2,
    id: `${date}-${brief.id}-${format}`,
    status: 'draft',
    topic: brief.topic,
    topicKey: brief.id,
    headline: brief.headline,
    creativeKey: `${brief.id}-${format}-landmark-v2`,
    format,
    platforms: [...plan.formats[format].platforms],
    publishAt: null,
    requestedLocalSlot: config.slots[FORMATS.indexOf(format)],
    planning: {
      month: date.slice(0, 7), pillar: brief.pillar, briefId: brief.id,
      requiresComposition: !compositionReady,
      requiresPhotoSelection: !photo,
      requiresSourceLabel: !sourceLabel,
      requiresFinalExportReview: true,
      note: 'Draft only. No publication time, final export, QA approval or user approval is inferred.'
    },
    caption,
    creative: {
      designVersion: 2,
      visualStyle: format === 'feed' ? 'reference-checklist-editorial' : 'reference-landmark-editorial',
      compositionReady,
      assetFormat: format === 'feed' ? 'jpg' : 'png',
      format,
      template: format === 'feed' ? 'place-opportunity' : 'question-debate',
      ...(photoKey ? { photoKey } : {}),
      text: {
        category: brief.category, headline: brief.headline, body: brief.body, question: cta.text,
        ...(photo ? { location: photo.location.toUpperCase() } : {}),
        ...(sourceLabel ? { source: sourceLabel } : {})
      }
    },
    facts,
    geography: photo ? {
      mode: 'verified-republic-location', location: photo.location, photoSha256: photo.sha256,
      evidenceUrl: photo.evidenceUrl, republicControlled: true, reviewNote: photo.reviewNote
    } : { mode: 'pending-photo-selection' },
    editorial
  };
  return item;
}

export function planDrafts({ date, plan, config, bank, trends, intelligence, needs, feedback, catalog, queue, history, now = Date.now() }) {
  requireThat(/^\d{4}-\d{2}-\d{2}$/.test(date || '') && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date, 'Pass a valid calendar date as YYYY-MM-DD');
  const month = date.slice(0, 7), usage = monthlyDraftUsage(plan, queue, history, month, config.timezone);
  const skipped = [], briefs = [];
  for (const brief of bank) { validateBrief(brief, intelligence, needs); briefs.push(brief); }
  for (const trend of trends.items) {
    try { validateTrendCandidate(trend, intelligence, needs, now); briefs.push(trend); }
    catch (error) { skipped.push({ id: trend.id, reason: error.message }); }
  }
  const activeQueue = queue.filter(item => !INACTIVE.has(item.status));
  const recentHistory = history.filter(item => now - Date.parse(item.date || item.publishedAt || item.reservedAt) <= 30 * 86400000);
  const unused = briefs.filter(brief => {
    const duplicate = activeQueue.find(item => item.planning?.briefId === brief.id || sameTopic(brief, item))
      || recentHistory.find(item => sameTopic(brief, item));
    if (duplicate) skipped.push({ id: brief.id, reason: `Topic already queued or used recently: ${duplicate.id}` });
    return !duplicate;
  });
  const drafts = [];
  while (usage.total < plan.targets.contentAssets) {
    const options = [];
    for (const brief of unused) {
      if (drafts.some(item => item.planning.briefId === brief.id)) continue;
      const pillar = plan.topicPillars.find(item => item.id === brief.pillar);
      requireThat(pillar, `Unknown monthly pillar: ${brief.pillar}`);
      requireThat((brief.classification === 'promotion') === (pillar.classification === 'promotion'), `Classification does not match monthly pillar: ${brief.id}`);
      if (usage.pillars[pillar.id].total >= pillar.monthlyTarget) continue;
      if (brief.classification === 'promotion' && usage.promotion >= plan.targets.tssPromotionalAssets) continue;
      for (const format of brief.formatCandidates) {
        const target = pillar.formats[format];
        if (!target || usage.formats[format] >= plan.formats[format].monthlyTarget || usage.pillars[pillar.id][format] >= target) continue;
        const deficit = (target - usage.pillars[pillar.id][format]) / target;
        const formatDeficit = (plan.formats[format].monthlyTarget - usage.formats[format]) / plan.formats[format].monthlyTarget;
        options.push({ brief, format, priority: deficit + formatDeficit });
      }
    }
    options.sort((a, b) => b.priority - a.priority || Number(b.brief.editorialType === 'trend') - Number(a.brief.editorialType === 'trend') || a.brief.id.localeCompare(b.brief.id) || FORMATS.indexOf(a.format) - FORMATS.indexOf(b.format));
    if (!options.length) break;
    const { brief, format } = options[0];
    const draft = buildPlannedDraft(brief, format, date, plan, config, intelligence, feedback, catalog, [...queue, ...drafts]);
    drafts.push(draft);
    usage.total++; usage.formats[format]++; usage.pillars[brief.pillar].total++; usage.pillars[brief.pillar][format]++;
    if (brief.classification === 'promotion') usage.promotion++;
  }
  const gaps = [];
  for (const pillar of plan.topicPillars) for (const format of FORMATS) {
    const remaining = Math.min(pillar.formats[format] - usage.pillars[pillar.id][format], plan.formats[format].monthlyTarget - usage.formats[format], plan.targets.contentAssets - usage.total);
    if (remaining > 0) gaps.push({ pillar: pillar.id, format, remaining });
  }
  return { drafts, report: { month, created: drafts.length, usage, skipped, gaps, contentBankExhausted: gaps.length > 0, requiresReviewedBriefs: gaps.length > 0 } };
}
