import crypto from 'node:crypto';
import sharp from 'sharp';
import { repurposeAllowsSimilarity } from './editorial.js';

export const QA_VERSION = 2;
export const ACCOUNT = Object.freeze({ instagramId: '17841424595983267', username: 'thesmartysolution', facebookId: '177672945439622', facebookName: 'The Smarty Solution' });
export const LOGO_SHA = '1ca3fecb2dd2f53a78b208cac3426e3d0200552ad72afb3537a17ee93d361459';
export const CHECKS = ['dimensions', 'imageLoaded', 'noPlaceholders', 'noBlankPanels', 'readableText', 'validCharacters', 'noClippedText', 'correctLogo', 'brandPalette', 'safeMargins', 'visualHierarchy', 'factsVerified', 'sourcesChecked', 'geographyVerified', 'duplicatesChecked', 'hashtagLimit', 'finalExportInspected'];
const SHA = /^[a-f0-9]{64}$/;
const FORMATS = { feed: [1080, 1350], story: [1080, 1920], reel: [1080, 1920] };
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
export const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const hashtagCount = caption => (String(caption).match(/#[\p{L}\p{N}_]+/gu) || []).length;
export function requireThat(condition, message) { if (!condition) throw new Error(message); }
export function validTime(value) { return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)); }
export function cleanText(value) {
  requireThat(typeof value === 'string' && value.trim(), 'Empty creative text');
  requireThat(!/[\uFFFD\u25A0-\u25A3\u25A9\u25FB-\u25FE\u200B-\u200F\u202A-\u202E\x00-\x08\x0B\x0C\x0E-\x1F]/u.test(value), 'Corrupted or hidden characters');
  requireThat(!/\b(placeholder|lorem ipsum|insert (?:image|text)|image unavailable|image failed|your (?:headline|text) here|TBD|TODO)\b/i.test(value), 'Placeholder text');
  return value;
}
export function binding(item) {
  return sha256(JSON.stringify({ id: item.id, topic: item.topic, topicKey: item.topicKey, headline: item.headline, creativeKey: item.creativeKey, format: item.format, platforms: item.platforms, publishAt: item.publishAt, asset: item.asset, creative: item.creative, facts: item.facts, geography: item.geography, editorial: item.editorial, deliberateUpdate: item.deliberateUpdate, qaOnly: item.qaOnly === true }));
}
// A scheduling or freshness-only change does not ask the user to approve the same
// content again. Any change to the actual creative, claims or caption does.
export function userApprovalBinding(item) {
  return sha256(JSON.stringify({ id: item.id, topic: item.topic, topicKey: item.topicKey, headline: item.headline, creativeKey: item.creativeKey, format: item.format, platforms: item.platforms, caption: item.caption, assetSha256: item.asset?.sha256, creative: item.creative, claims: item.facts?.claims, sources: item.facts?.sources?.map(({ id, url, expectedText, additionalEvidence, reviewNote, authorityType }) => ({ id, url, expectedText, additionalEvidence, reviewNote, authorityType })), geography: item.geography, editorial: item.editorial }));
}
export function enforceUserApproval(item, policy, now = Date.now()) {
  requireThat(policy?.version === 1 && policy.requiredCount === 10 && policy.firstPostIds?.length === 10 && new Set(policy.firstPostIds).size === 10 && policy.approver, 'Missing or invalid ten-post user approval policy');
  const validApproval = a => a?.approvedBy === policy.approver && SHA.test(a.contentSha256 || '') && validTime(a.approvedAt) && Date.parse(a.approvedAt) <= now + 60000 && a.authorizationReference?.length >= 12;
  const approval = policy.approvals?.[item.id];
  if (policy.firstPostIds.includes(item.id) || !policy.firstPostIds.every(id => validApproval(policy.approvals?.[id]))) {
    requireThat(validApproval(approval), 'Explicit user approval required before publication');
    requireThat(approval.contentSha256 === userApprovalBinding(item), 'Content changed after user approval; review the revision');
  }
  return true;
}
// Caption is bound separately as well as in the transport signature.
export function sign(payload, key) { return crypto.createHmac('sha256', key).update(JSON.stringify(payload)).digest('hex'); }
export function verifySignature(payload, signature, key) {
  if (!SHA.test(signature || '') || !key) return false;
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(payload, key), 'hex'));
}
export function immutableAssetUrl(asset) {
  requireThat(/^[a-f0-9]{40}$/.test(asset?.commit || ''), 'Asset needs an immutable Git commit');
  requireThat(/^social\/assets\/[a-f0-9]{64}\.(png|jpg|mp4)$/.test(asset?.path || ''), 'Invalid content-addressed asset path');
  requireThat(asset.path.split('/').at(-1).split('.')[0] === asset.sha256, 'Asset filename must match its SHA-256');
  return `https://raw.githubusercontent.com/hadyatallah/thesmarty-solution/${asset.commit}/${asset.path}`;
}
export function validateManifest(item, now = Date.now()) {
  requireThat(item?.qaVersion === QA_VERSION && item.status === 'approved', 'Unapproved or legacy queue item');
  for (const key of ['id', 'topic', 'topicKey', 'headline', 'creativeKey']) cleanText(item[key]);
  requireThat(/^[a-z0-9][a-z0-9-]{3,100}$/.test(item.id), 'Invalid post identifier');
  requireThat(FORMATS[item.format], 'Unsupported format');
  requireThat(Array.isArray(item.platforms) && item.platforms.length > 0 && new Set(item.platforms).size === item.platforms.length && item.platforms.every(p => ['instagram', 'facebook'].includes(p)), 'Explicit valid platforms required');
  requireThat(!(item.platforms.includes('facebook') && item.format !== 'feed'), 'Facebook Story/Reel publishing awaits its own verified adapter');
  requireThat(validTime(item.publishAt), 'publishAt must have an explicit timezone');
  requireThat(typeof item.caption === 'string' && item.caption.trim() && item.caption.length <= (item.format === 'story' ? 119 : 2200), 'Invalid caption length');
  cleanText(item.caption);
  requireThat(hashtagCount(item.caption) <= 5, 'Maximum five hashtags');
  const [width, height] = FORMATS[item.format];
  requireThat(item.asset?.width === width && item.asset?.height === height && SHA.test(item.asset.sha256 || '') && SHA.test(item.asset.pixelHash || ''), 'Invalid asset dimensions or fingerprints');
  if (item.format !== 'reel') requireThat(/^rgb32:[A-Za-z0-9+/]{4096}$/.test(item.asset.visualSignature || ''), 'Final image needs visual duplicate evidence');
  immutableAssetUrl(item.asset);
  requireThat(item.asset.originFormat === item.format && item.creative?.format === item.format, 'Dedicated creatives required for each format');
  requireThat(item.creative?.logoSha256 === LOGO_SHA && ['insight-data', 'question-debate', 'place-opportunity'].includes(item.creative.template), 'Incorrect logo or unapproved template');
  requireThat(['editorial-opinion', 'factual', 'promotion'].includes(item.facts?.classification), 'Content classification required');
  requireThat(Array.isArray(item.facts.claims) && Array.isArray(item.facts.sources), 'Claim/source inventory required');
  if (item.facts.classification === 'factual' || /(?:\d\s*%|€\s*\d|\$\s*\d|\b\d{4}\b|\btax rate\b|\bguaranteed\b)/i.test([item.caption, ...Object.values(item.creative.text || {})].join(' '))) {
    requireThat(item.facts.claims.length > 0 && item.facts.sources.length > 0, 'Factual or numeric claims require verified evidence');
  }
  for (const claim of item.facts.claims) {
    requireThat(claim.text?.trim() && claim.sourceIds?.length && claim.sourceIds.every(id => item.facts.sources.some(s => s.id === id)), 'Unsupported factual claim');
  }
  for (const source of item.facts.sources) {
    const u = new URL(source.url);
    requireThat(u.protocol === 'https:' && source.expectedText?.length >= 12 && source.reviewNote?.trim(), 'Source needs HTTPS, evidence excerpt and review note');
    requireThat(source.additionalEvidence === undefined || (Array.isArray(source.additionalEvidence) && source.additionalEvidence.every(t => typeof t === 'string' && t.length >= 12)), 'Invalid additional fact evidence');
    requireThat(validTime(source.checkedAt) && validTime(source.validUntil) && Date.parse(source.checkedAt) <= now + 60000 && Date.parse(source.validUntil) > now, 'Expired or invalid source check');
  }
  requireThat(['no-location-imagery', 'verified-republic-location'].includes(item.geography?.mode), 'Geographic review required');
  if (item.geography.mode === 'verified-republic-location') {
    requireThat(item.geography.photoSha256 && item.geography.location && item.geography.evidenceUrl?.startsWith('https://') && item.geography.reviewNote && item.geography.republicControlled === true, 'Republic of Cyprus imagery evidence missing');
  }
  if (item.creative.template === 'place-opportunity') requireThat(item.geography.mode === 'verified-republic-location', 'Place template requires verified real photography');
  const review = item.review;
  requireThat(review?.reviewer && validTime(review.reviewedAt) && Date.parse(review.reviewedAt) <= now + 60000 && now - Date.parse(review.reviewedAt) <= 7 * 86400000, 'Missing, future or stale final review');
  requireThat(review.boundSha256 === binding(item) && review.captionSha256 === sha256(item.caption), 'Asset/content changed after inspection');
  requireThat(review.assetSha256 === item.asset.sha256 && CHECKS.every(k => review.checks?.[k] === true), 'Every final-export QA check must pass');
  if (item.format === 'reel') {
    const v = item.asset.videoVisual;
    requireThat(v?.method === 'sampled-rgb32-v1' && v.duration >= 6 && v.duration <= 60 && v.frames?.length === 6 && v.frames.every(f => /^rgb32:[A-Za-z0-9+/]{4096}$/.test(f)) && item.asset.pixelHash === sha256(JSON.stringify(v)), 'Reel needs actual decoded-frame duplicate evidence');
    requireThat(review.fullVideoInspected === true && review.videoRightsVerified === true && review.inspectedFrameTimes?.length >= 3, 'Reel needs full-video and rights review');
  }
  return item;
}

export async function imageFingerprint(buffer) {
  return sha256(await sharp(buffer).rotate().resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer());
}
export async function visualSignature(buffer) {
  const rgb = await sharp(buffer).rotate().toColourspace('srgb').resize(32, 32, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  requireThat(rgb.length === 32 * 32 * 3, 'Invalid visual duplicate evidence');
  return `rgb32:${rgb.toString('base64')}`;
}
export function sameVisual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a.startsWith('rgb32:') || !b.startsWith('rgb32:')) return false;
  const A = Buffer.from(a.slice(6), 'base64'), B = Buffer.from(b.slice(6), 'base64');
  requireThat(A.length === 3072 && B.length === 3072, 'Invalid visual duplicate evidence');
  let difference = 0, changed = 0;
  for (let i = 0; i < A.length; i++) { const d = Math.abs(A[i] - B[i]); difference += d; if (d > 12) changed++; }
  return difference / A.length <= 2 && changed / A.length <= 0.06;
}
export function sameVideoVisual(a, b) {
  if (!a || !b) return false;
  requireThat(a.method === 'sampled-rgb32-v1' && b.method === 'sampled-rgb32-v1' && a.frames?.length === 6 && b.frames?.length === 6, 'Invalid video duplicate evidence');
  return Math.abs(a.duration - b.duration) < 0.5 && a.frames.every((frame, i) => sameVisual(frame, b.frames[i]));
}
export async function validateImage(buffer, item) {
  requireThat(buffer.length > 1000 && buffer.length <= 8 * 1024 * 1024, 'Image is empty or exceeds the 8 MiB policy limit');
  const image = sharp(buffer, { failOn: 'warning', limitInputPixels: 1080 * 1920 * 2 });
  const m = await image.metadata();
  requireThat(['png', 'jpeg'].includes(m.format) && !m.pages && (!m.orientation || m.orientation === 1), 'Only upright still PNG/JPEG exports accepted');
  const expected = FORMATS[item.format];
  requireThat(expected && m.width === expected[0] && m.height === expected[1], `Actual export must be ${expected?.join('x')}`);
  const stats = await image.stats();
  requireThat(stats.isOpaque && stats.entropy > 0.2 && stats.channels.some(c => c.stdev > 8), 'Blank or transparent export');
  requireThat(sha256(buffer) === item.asset.sha256 && await imageFingerprint(buffer) === item.asset.pixelHash, 'Export differs from the inspected asset');
  requireThat(await visualSignature(buffer) === item.asset.visualSignature, 'Visual duplicate evidence does not match the export');
  return { width: m.width, height: m.height, format: m.format, sha256: item.asset.sha256 };
}
function similarity(a, b) {
  const A = new Set(normalize(a).split(' ').filter(w => w.length > 2)), B = new Set(normalize(b).split(' ').filter(w => w.length > 2));
  const union = new Set([...A, ...B]);
  return union.size ? [...A].filter(w => B.has(w)).length / union.size : 0;
}
const topic = value => normalize(value).replace(/\b(?:19|20)\d{2}\b|\b\d{1,2}\b/g, '').replace(/\s+/g, ' ').trim();
export function checkDuplicates(item, history, now = Date.now()) {
  for (const old of history) {
    const exact = old.creativeKey === item.creativeKey || old.assetSha256 === item.asset.sha256 || old.pixelHash === item.asset.pixelHash || old.id === item.id || sameVisual(old.visualSignature, item.asset.visualSignature) || sameVideoVisual(old.videoVisual, item.asset.videoVisual);
    requireThat(!exact, `Creative already used or reserved: ${old.id}`);
    const date = Date.parse(old.date || old.publishedAt || old.reservedAt);
    requireThat(Number.isFinite(date), 'Invalid history date blocks publishing');
    if (now - date > 30 * 86400000) continue;
    const similar = topic(old.topicKey) === topic(item.topicKey) || normalize(old.headline) === normalize(item.headline) || similarity(old.headline, item.headline) >= 0.68 || similarity(old.topic, item.topic) >= 0.8;
    if (similar) {
      const update = item.deliberateUpdate;
      const validUpdate = update?.of === old.id && update.reason?.trim() && update.newAngle?.trim() && update.visualDifference?.trim();
      const validRepurpose = repurposeAllowsSimilarity(item, old);
      requireThat(validUpdate || validRepurpose, `Topic/headline too similar within 30 days: ${old.id}`);
    }
  }
}
export async function checkSources(item) {
  for (const s of item.facts.sources) {
    let html;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(s.url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
        if (!response.ok) {
          if (attempt === 0 && (response.status === 429 || response.status >= 500)) { await new Promise(resolve => setTimeout(resolve, 500)); continue; }
          throw new Error(`Source unavailable: ${s.id}`);
        }
        html = await response.text(); break;
      } catch (error) {
        if (attempt === 1 || error.message?.startsWith('Source unavailable:')) throw new Error(`Source unavailable: ${s.id}`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    requireThat(typeof html === 'string', `Source unavailable: ${s.id}`);
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
    for (const evidence of [s.expectedText, ...(s.additionalEvidence || [])]) {
      requireThat(normalize(text).includes(normalize(evidence)), `Verified evidence no longer found: ${s.id}`);
    }
  }
}
export function schedulerProof(config, history) {
  const first = history.find(i => i.id === config.verifiedLivePublication);
  requireThat(first?.phase === 'verified' && first.format === 'feed' && first.instagram?.mediaId && first.facebook?.postId, 'Scheduler needs a verified dual-platform feed test');
  for (const p of ['instagram', 'facebook']) {
    requireThat(first.publishedReview?.[p]?.passed === true && first.publishedReview[p].reviewer && first.publishedReview[p].assetSha256 === first.verification?.[p]?.sha256, 'Actual live images need inspection before scheduling');
  }
  for (const format of config.approvedFormats) {
    const proof = history.find(i => i.id === config.formatVerifications?.[format]);
    requireThat(proof?.phase === 'verified' && proof.format === format && proof.publishedReview?.instagram?.passed === true, `No controlled live verification for ${format}`);
  }
  return first;
}
