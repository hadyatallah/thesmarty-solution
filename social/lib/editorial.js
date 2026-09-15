const ISO_WITH_ZONE = /(?:Z|[+-]\d{2}:\d{2})$/;

const normalise = value => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

const requireEditorial = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const editorialWordCount = value => normalise(value).split(' ').filter(Boolean).length;

const hasBlockedTerm = (value, blockedTerms = []) => {
  const text = normalise(value);
  return blockedTerms.find(term => text.includes(normalise(term)));
};

const validTime = value => typeof value === 'string'
  && ISO_WITH_ZONE.test(value)
  && Number.isFinite(Date.parse(value));

export function validateEditorialConfiguration(intelligence, needs, feedback, trends, proofRegistry) {
  requireEditorial(intelligence?.version === 1 && intelligence.status === 'active', 'Invalid editorial intelligence configuration');
  requireEditorial(Number.isInteger(intelligence.hookPolicy?.maxWords) && intelligence.hookPolicy.maxWords >= 6, 'Invalid hook word limit');
  requireEditorial(Array.isArray(intelligence.hookPolicy.preferredTypes) && intelligence.hookPolicy.preferredTypes.length >= 3, 'Missing hook types');
  requireEditorial(Array.isArray(intelligence.hookPolicy.blockedTerms), 'Missing blocked hook language');
  requireEditorial(Array.isArray(intelligence.objectives) && intelligence.objectives.length >= 3, 'Missing editorial objectives');
  requireEditorial(Array.isArray(intelligence.ctaLibrary) && intelligence.ctaLibrary.length >= 5, 'Missing CTA library');
  requireEditorial(new Set(intelligence.ctaLibrary.map(item => item.id)).size === intelligence.ctaLibrary.length, 'Duplicate CTA identifier');
  requireEditorial(intelligence.ctaLibrary.every(item => item.id && item.objective && item.text && editorialWordCount(item.text) <= 15 && Array.isArray(item.formats)), 'Invalid CTA library entry');
  requireEditorial(intelligence.carouselPolicy?.editorialEnabled === true && intelligence.carouselPolicy?.publishingEnabled === false, 'Carousel publishing must remain disabled pending verification');
  requireEditorial(intelligence.socialProofPolicy?.defaultStatus === 'blocked', 'Social proof must fail closed');
  requireEditorial(intelligence.trendPolicy?.sourceGated === true && intelligence.trendPolicy?.automaticClaimsAllowed === false, 'Trend claims must be source gated');
  requireEditorial(Array.isArray(needs?.needs) && needs.needs.length >= 10, 'Audience decision-needs bank is incomplete');
  requireEditorial(new Set(needs.needs.map(item => item.id)).size === needs.needs.length, 'Duplicate audience-need identifier');
  requireEditorial(needs.needs.every(item => item.id && item.audience && item.decisionProblem && item.pillars?.length), 'Invalid audience decision need');
  requireEditorial(feedback?.version === 1 && Array.isArray(feedback.records) && Array.isArray(feedback.approvedLearnings), 'Invalid performance feedback file');
  const performanceRecords = new Map(feedback.records.map(item => [item.id, item]));
  const ctaIds = new Set(intelligence.ctaLibrary.map(item => item.id));
  for (const learning of feedback.approvedLearnings) {
    requireEditorial(learning?.status === 'approved' && learning.id && learning.format && learning.objective && validTime(learning.approvedAt), 'Performance learning is not explicitly approved');
    requireEditorial(Array.isArray(learning.basedOnPostIds) && learning.basedOnPostIds.length >= intelligence.performancePolicy.minimumComparablePosts, 'Performance learning needs enough comparable posts');
    const compared = learning.basedOnPostIds.map(id => performanceRecords.get(id));
    requireEditorial(compared.every(record => record && record.format === learning.format && record.objective === learning.objective && record.measuredAfterDays >= intelligence.performancePolicy.minimumAgeDays), 'Performance learning mixes incomparable or immature results');
    requireEditorial([...(learning.preferCtaIds || []), ...(learning.retireCtaIds || [])].every(id => ctaIds.has(id)), 'Performance learning references an unknown CTA');
  }
  requireEditorial(trends?.version === 1 && Array.isArray(trends.items), 'Invalid trend candidate file');
  requireEditorial(proofRegistry?.version === 1 && Array.isArray(proofRegistry.records), 'Invalid social-proof registry');
  return true;
}

export function validateTrendCandidate(candidate, intelligence, needs, now = Date.now()) {
  requireEditorial(candidate?.status === 'source-reviewed', 'Trend candidate is not source reviewed');
  requireEditorial(candidate.editorialType === 'trend', 'Trend candidate needs an explicit editorial type');
  requireEditorial(candidate.facts?.classification === 'factual' && candidate.facts.claims?.length > 0 && candidate.facts.sources?.length > 0, 'Trend candidate needs factual claims and sources');
  requireEditorial(validTime(candidate.reviewedAt) && Date.parse(candidate.reviewedAt) <= now + 60000 && now - Date.parse(candidate.reviewedAt) <= intelligence.trendPolicy.maxCandidateAgeDays * 86400000, 'Trend candidate review is stale or invalid');
  requireEditorial(candidate.facts.sources.every(source => ['primary', 'official-statistics', 'original-market-study'].includes(source.authorityType)), 'Trend candidate must use primary, official or original-study evidence');
  requireEditorial(candidate.facts.sources.every(source => validTime(source.checkedAt) && Date.parse(source.checkedAt) <= now + 60000 && validTime(source.validUntil) && Date.parse(source.validUntil) > now), 'Trend candidate source check is stale or invalid');
  validateBrief(candidate, intelligence, needs);
  return true;
}

export function validateBrief(brief, intelligence, needs) {
  const needIds = new Set(needs.needs.map(item => item.id));
  const objectiveIds = new Set(intelligence.objectives.map(item => item.id));
  requireEditorial(brief?.id && brief.topic && brief.headline && brief.body && brief.question, 'Incomplete editorial brief');
  requireEditorial(Array.isArray(brief.audienceNeedIds) && brief.audienceNeedIds.length > 0 && brief.audienceNeedIds.every(id => needIds.has(id)), 'Editorial brief needs valid audience decisions');
  requireEditorial(brief.audienceNeedIds.some(id => needs.needs.find(item => item.id === id)?.pillars.includes(brief.pillar)), 'Editorial brief pillar does not match its audience decision');
  requireEditorial(intelligence.hookPolicy.preferredTypes.includes(brief.hookType), 'Editorial brief uses an unapproved hook type');
  requireEditorial(editorialWordCount(brief.headline) <= intelligence.hookPolicy.maxWords, 'Editorial hook exceeds the word limit');
  requireEditorial(!hasBlockedTerm(brief.headline, intelligence.hookPolicy.blockedTerms), 'Editorial hook uses blocked hype language');
  requireEditorial(objectiveIds.has(brief.objective), 'Editorial brief needs a valid objective');
  requireEditorial(Array.isArray(brief.formatCandidates) && brief.formatCandidates.length > 0 && brief.formatCandidates.every(format => ['feed', 'story', 'reel'].includes(format)), 'Editorial brief has unsupported format candidates');
  requireEditorial(['editorial-opinion', 'factual', 'promotion'].includes(brief.classification), 'Editorial brief needs a valid classification');
  requireEditorial(!brief.hashtags || (Array.isArray(brief.hashtags) && brief.hashtags.length <= 5 && brief.hashtags.every(tag => /^#[\p{L}\p{N}_]+$/u.test(tag))), 'Editorial brief hashtags are invalid');
  return true;
}

export function pickCta(brief, format, intelligence, feedback, existing = []) {
  const retired = new Set(feedback.approvedLearnings.flatMap(item => item.retireCtaIds || []));
  const preferred = new Set(feedback.approvedLearnings.flatMap(item => item.preferCtaIds || []));
  const usage = new Map();
  for (const item of existing) {
    const id = item.editorial?.cta?.id;
    if (id) usage.set(id, (usage.get(id) || 0) + 1);
  }
  const compatible = intelligence.ctaLibrary
    .filter(item => item.objective === brief.objective && item.formats.includes(format) && !retired.has(item.id))
    .sort((a, b) => Number(preferred.has(b.id)) - Number(preferred.has(a.id)) || (usage.get(a.id) || 0) - (usage.get(b.id) || 0) || a.id.localeCompare(b.id));
  requireEditorial(compatible.length > 0, `No approved CTA for ${brief.objective}/${format}`);
  return compatible[0];
}

export function buildEditorialMetadata(brief, format, cta) {
  const metadata = {
    version: 1,
    audienceNeedIds: brief.audienceNeedIds,
    pillar: brief.pillar,
    hook: {
      type: brief.hookType,
      text: brief.headline,
      wordCount: editorialWordCount(brief.headline)
    },
    objective: brief.objective,
    cta: { id: cta.id, text: cta.text },
    contentFamilyId: brief.contentFamilyId || brief.id,
    editorialType: brief.editorialType || (brief.repurpose ? 'repurpose' : 'evergreen'),
    repurpose: brief.repurpose || null,
    socialProofId: brief.socialProofId || null
  };
  if (metadata.editorialType === 'trend') {
    metadata.trend = { candidateId: brief.id, reviewedAt: brief.reviewedAt };
  }
  if (format === 'reel') {
    metadata.reelScript = {
      durationSeconds: 20,
      hook: brief.headline,
      beats: String(brief.body).split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 3),
      close: cta.text
    };
  }
  return metadata;
}

export function validateEditorialMetadata(item, intelligence, needs, proofRegistry, now = Date.now()) {
  const editorial = item?.editorial;
  const needIds = new Set(needs.needs.map(entry => entry.id));
  requireEditorial(editorial?.version === 1, 'New content requires editorial intelligence metadata');
  requireEditorial(Array.isArray(editorial.audienceNeedIds) && editorial.audienceNeedIds.length > 0 && editorial.audienceNeedIds.every(id => needIds.has(id)), 'Content needs a valid audience decision mapping');
  requireEditorial(editorial.audienceNeedIds.some(id => needs.needs.find(entry => entry.id === id)?.pillars.includes(editorial.pillar)), 'Content pillar does not match its audience decision');
  requireEditorial(intelligence.hookPolicy.preferredTypes.includes(editorial.hook?.type), 'Content uses an unapproved hook type');
  requireEditorial(editorial.hook.text === item.headline && editorial.hook.wordCount === editorialWordCount(item.headline) && editorial.hook.wordCount <= intelligence.hookPolicy.maxWords, 'Hook metadata or length is invalid');
  requireEditorial(!hasBlockedTerm(item.headline, intelligence.hookPolicy.blockedTerms), 'Hook uses blocked hype or unsupported certainty');
  const cta = intelligence.ctaLibrary.find(entry => entry.id === editorial.cta?.id);
  requireEditorial(cta && cta.text === editorial.cta.text && cta.objective === editorial.objective && cta.formats.includes(item.format), 'CTA is not approved for this content objective and format');
  requireEditorial(editorial.contentFamilyId && editorial.pillar, 'Content family and pillar are required');
  requireEditorial(['evergreen', 'trend', 'social-proof', 'repurpose'].includes(editorial.editorialType), 'Invalid editorial type');
  if (editorial.editorialType === 'trend') {
    requireEditorial(editorial.trend?.candidateId && validTime(editorial.trend.reviewedAt) && Date.parse(editorial.trend.reviewedAt) <= now + 60000 && now - Date.parse(editorial.trend.reviewedAt) <= intelligence.trendPolicy.maxCandidateAgeDays * 86400000, 'Trend candidate review is missing or stale');
    requireEditorial(item.facts?.classification === 'factual' && item.facts.claims?.length > 0 && item.facts.sources?.length > 0, 'Trend content requires verified factual evidence');
    requireEditorial(item.facts.sources.every(source => ['primary', 'official-statistics', 'original-market-study'].includes(source.authorityType)), 'Trend content source authority is insufficient');
  }
  if (editorial.editorialType === 'social-proof') {
    const proof = proofRegistry.records.find(entry => entry.id === editorial.socialProofId);
    requireEditorial(proof?.status === 'approved' && proof.permissionStatus === 'approved' && proof.confidentialityReviewed === true, 'Social proof lacks approved permission or confidentiality review');
    requireEditorial(validTime(proof.approvedAt) && (!proof.validUntil || (validTime(proof.validUntil) && Date.parse(proof.validUntil) > now)), 'Social-proof approval is stale or invalid');
    requireEditorial(item.facts?.claims?.some(claim => claim.sourceIds?.includes(proof.evidenceSourceId)), 'Social-proof result is not tied to its approved evidence');
  }
  if (editorial.editorialType === 'repurpose') requireEditorial(editorial.repurpose, 'Repurposed content needs explicit source metadata');
  if (editorial.repurpose) requireEditorial(editorial.editorialType === 'repurpose', 'Repurpose metadata needs the repurpose editorial type');
  if (item.format === 'reel') {
    requireEditorial(editorial.reelScript?.durationSeconds >= 15 && editorial.reelScript.durationSeconds <= 30, 'Reel script must target 15 to 30 seconds');
    requireEditorial(editorial.reelScript.hook === item.headline && editorial.reelScript.beats?.length >= 1 && editorial.reelScript.beats.length <= 3 && editorial.reelScript.close === editorial.cta.text, 'Reel script structure is invalid');
  }
  if (editorial.repurpose) validateRepurposeMetadata(item, editorial.repurpose);
  return true;
}

export function enforceEditorialPolicy(item, intelligence, needs, policy, proofRegistry, now = Date.now()) {
  requireEditorial(policy?.version === 1 && Array.isArray(policy.grandfatheredContentIds), 'Invalid editorial adoption policy');
  if (!item.editorial && policy.grandfatheredContentIds.includes(item.id)) return true;
  return validateEditorialMetadata(item, intelligence, needs, proofRegistry, now);
}

export function validateRepurposeMetadata(item, repurpose) {
  requireEditorial(repurpose?.sourceId && repurpose.newAngle?.trim() && repurpose.audienceValue?.trim() && repurpose.visualDifference?.trim(), 'Repurposed content needs a source, new angle, audience value and visual difference');
  requireEditorial(repurpose.sourceId !== item.id, 'Content cannot repurpose itself');
  return true;
}

export function repurposeAllowsSimilarity(item, old) {
  const repurpose = item.editorial?.repurpose;
  if (!repurpose || repurpose.sourceId !== old.id) return false;
  validateRepurposeMetadata(item, repurpose);
  requireEditorial(old.format && item.format !== old.format, 'Repurposing requires a genuinely different format');
  requireEditorial(item.creativeKey !== old.creativeKey, 'Repurposing requires a new creative');
  requireEditorial(normalise(item.headline) !== normalise(old.headline), 'Repurposing requires a different hook');
  return true;
}
