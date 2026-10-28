// Offline evidence intake for the existing ChatGPT researcher. No search API,
// storage, CRM adapter, message sender, or authority is created here.
import { normalizeName, normalizeDomain } from './tssIrcResearch.mjs';

export const PROSPECT_TARGET = 'SOLO_AGENTS_SMALL_OWNER_LED_AGENCIES';
export const PROSPECT_SOURCE = 'EXISTING_CHATGPT_WEB_RESEARCH';
export function discoveryRoute(purpose) {
  if (purpose === 'TSS_CLIENT_PROSPECTS') return {
    purpose, target: PROSPECT_TARGET, source: PROSPECT_SOURCE,
    outcome: 'EXTERNAL_RESEARCH_REQUIRED', serverDiscoveryAvailable: false,
    instruction: 'Use the existing ChatGPT research task with public first-party evidence. Do not substitute developer listings or create another scheduler.',
    sendsAuthorized: false, crmWritesAuthorized: false
  };
  if (purpose === 'REFERRAL_PARTNERS') return {
    purpose, source: 'INDEX_AGENT_API', target: 'PROPERTY_DEVELOPERS',
    outcome: 'REFERRAL_RESEARCH_ONLY', serverDiscoveryAvailable: true,
    sendsAuthorized: false, crmWritesAuthorized: false
  };
  return { outcome: 'PURPOSE_REQUIRED', serverDiscoveryAvailable: false };
}

const safeURL = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; }
  catch { return false; }
};
// CRM website identities may be bare domains or historical HTTP URLs. Evidence
// still requires HTTPS, but that must not hide an existing identity match.
const identityDomain = value => {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const raw = value.trim();
    const u = new URL(raw.includes('://') ? raw : 'https://' + raw);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password ||
        !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]+$/i.test(u.hostname)) return '';
    return normalizeDomain(u.href);
  } catch { return ''; }
};
const identityKeys = c => [
  ...[c.name, ...(c.aliases || [])].map(normalizeName).filter(Boolean).map(x => 'name:' + x),
  ...(identityDomain(c.website) ? ['domain:' + identityDomain(c.website)] : [])
];

// Evidence assertions are made by the trusted researcher after reading the source,
// never by website text or an LLM-generated confidence score. Links alone do not
// verify claims. Unknown size/ownership routes to enrichment, not blanket rejection.
export function qualifyProspectBatch(batch = {}) {
  const now = Date.parse(batch.observedAt);
  if (!Number.isFinite(now) || batch.source !== PROSPECT_SOURCE || batch.target !== PROSPECT_TARGET ||
      !Array.isArray(batch.candidates) || batch.candidates.length > 100 ||
      !Array.isArray(batch.existingRecords)) throw Error('INVALID_PROSPECT_BATCH');
  const seen = new Set(batch.existingRecords.flatMap(identityKeys));
  const results = batch.candidates.map(c => {
    const keys = identityKeys(c);
    const duplicate = keys.some(k => seen.has(k));
    keys.forEach(k => seen.add(k));
    const evidence = Array.isArray(c.evidence) ? c.evidence : [];
    const supported = (claim, value) => evidence.some(e => e.claim === claim && e.value === value &&
      e.reviewed === true && e.sourceType === 'FIRST_PARTY' && safeURL(e.url) &&
      normalizeDomain(e.url) === normalizeDomain(c.website) &&
      typeof e.observation === 'string' && e.observation.trim().length > 0 &&
      Number.isFinite(Date.parse(e.observedAt)) && Date.parse(e.observedAt) <= now);
    const required = ['realEstateAgency', 'cyprusOperations', 'smallOrSolo', 'ownerLed'];
    const missing = required.filter(claim => !supported(claim, 'SUPPORTED'));
    const conflicts = required.filter(claim => supported(claim, 'SUPPORTED') && supported(claim, 'CONTRADICTED'));
    const excluded = required.filter(claim => supported(claim, 'CONTRADICTED'));
    let outcome = 'QUALIFIED_FOR_REVIEW', reasons = [];
    if (c.recordType && c.recordType !== 'TSS_CLIENT_PROSPECT') {
      outcome = 'EXCLUDED'; reasons = ['WRONG_RECORD_PURPOSE_PRESERVE_ORIGINAL'];
    } else if (duplicate) { outcome = 'DUPLICATE_HOLD'; reasons = ['RECONCILE_EXISTING_IDENTITY']; }
    else if (c.identityConflict === true || conflicts.length) { outcome = 'IDENTITY_HOLD'; reasons = ['CONFLICTING_EVIDENCE', ...conflicts]; }
    else if (excluded.length) { outcome = 'EXCLUDED'; reasons = excluded; }
    else if (!c.name || !safeURL(c.website) || missing.length) { outcome = 'ENRICHMENT_REQUIRED'; reasons = ['MISSING_VERIFIED_EVIDENCE', ...missing]; }
    const operationalHolds = [...new Set([
      ...(batch.screeningComplete !== true ? ['DUPLICATE_SUPPRESSION_HOLD_SCREENING_INCOMPLETE'] : []),
      ...(c.suppressed === true ? ['SUPPRESSED'] : []),
      ...(Array.isArray(c.holds) ? c.holds.map(String) : []),
      'ACCEPTANCE_ONLY', 'INTERNAL_QA_LOGGING_HOLD'
    ])];
    return {
      name: c.name || '', website: c.website || '', outcome, reasons,
      evidence, researchReady: outcome === 'QUALIFIED_FOR_REVIEW',
      commercialOutcome: 'HELD', operationalHolds,
      buyingIntent: 'UNKNOWN', contactConsent: 'NOT_ESTABLISHED',
      sendsAuthorized: false, crmWritesAuthorized: false,
      nextAction: outcome === 'QUALIFIED_FOR_REVIEW'
        ? 'Review actual TSS fit and reconcile existing identity, history, suppressions and holds in the existing consumer; no message or CRM write.'
        : outcome === 'ENRICHMENT_REQUIRED' ? 'Research the missing claims; retain unknowns without inventing headcount, ownership or buying intent.'
        : 'Preserve the record and resolve the stated disposition; do not create, merge, release or contact it.'
    };
  });
  const qualified = results.filter(r => r.researchReady).length;
  return {
    source: batch.source, target: batch.target, observedAt: batch.observedAt,
    outcome: !results.length ? 'NO_CANDIDATES' : qualified ? 'RESEARCH_REVIEW_REQUIRED' : 'NO_QUALIFIED_CANDIDATES',
    inspected: results.length, qualifiedForReview: qualified,
    outreachReady: 0, messagesSent: 0, crmWrites: 0, results
  };
}
