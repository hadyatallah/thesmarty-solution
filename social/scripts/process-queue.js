import fs from 'node:fs/promises';
import path from 'node:path';
import { ACCOUNT, QA_VERSION, automaticPublishingAuthorization, checkDuplicates, checkSources, enforceUserApproval, facebookCompletionEligible, imageFingerprint, immutableAssetUrl, normalize, requireThat, schedulerProof, sha256, sign, validateManifest, visualSignature } from '../lib/qa.js';
import { analyzeVideo, inspectExport, verifyPublishedImage, verifyPublishedVideo } from '../lib/export-qa.js';
import { Ledger } from '../lib/ledger.js';
import { enforceEditorialPolicy } from '../lib/editorial.js';
import { canonicalCaption, enforceResolvedHistory, PublicationRun } from '../lib/publication-run.js';
import { automationReadiness } from '../lib/automation-readiness.js';
import { enforcePublisherContract, publisherPolicyDigest } from '../lib/publisher-contract.js';

const [config, approvalPolicy, editorialIntelligence, audienceNeeds, editorialPolicy, proofRegistry, monthlyPlan] = await Promise.all([
  fs.readFile('social/publishing-config.json', 'utf8').then(JSON.parse),
  fs.readFile('social/user-approval-policy.json', 'utf8').then(JSON.parse),
  fs.readFile('social/editorial-intelligence.json', 'utf8').then(JSON.parse),
  fs.readFile('social/audience-needs.json', 'utf8').then(JSON.parse),
  fs.readFile('social/editorial-adoption-policy.json', 'utf8').then(JSON.parse),
  fs.readFile('social/social-proof-registry.json', 'utf8').then(JSON.parse),
  fs.readFile('social/monthly-content-plan.json', 'utf8').then(JSON.parse)
]);
const report = { qaVersion: QA_VERSION, checkedAt: new Date().toISOString(), schedulerAuthorized: config.schedulerEnabled === true, schedulerEnabled: false, secretReferences: { TSS_PUBLISHER_KEY: Boolean(process.env.TSS_PUBLISHER_KEY), GITHUB_TOKEN: Boolean(process.env.GITHUB_TOKEN) }, qa: [], published: [] };
const publicationRun = new PublicationRun(config.maxPostsPerRun);
const expectedPolicyDigest = publisherPolicyDigest({ approvalPolicy, editorialIntelligence, audienceNeeds, proofRegistry, editorialPolicy });
let currentHistory;
await fs.mkdir('social-results', { recursive: true });
const localDay = date => new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(date);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function call(body) {
  requireThat(process.env.TSS_PUBLISHER_KEY, 'Missing TSS_PUBLISHER_KEY Actions secret');
  requireThat(config.publisherUrl === 'https://thesmarty-solution-agent.vercel.app/api/publish-instagram', 'Unexpected publisher destination');
  const response = await fetch(config.publisherUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tss-publisher-key': process.env.TSS_PUBLISHER_KEY }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(55000) });
  const data = await response.json().catch(() => ({}));
  if (!(response.ok && data.ok)) {
    const error = new Error(data.error || `Publisher rejected request: HTTP ${response.status}`);
    error.safeMeta = data.meta;
    throw error;
  }
  return data;
}
const operation = (action, item, extra = {}) => { const payload = { action, item, ...extra }; return call({ payload, signature: sign(payload, process.env.TSS_PUBLISHER_KEY) }); };
async function download(url, video = false) {
  const u = new URL(url);
  requireThat(u.protocol === 'https:' && !u.username && !u.password, 'Invalid public media URL');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  requireThat(response.ok && (video || (response.headers.get('content-type') || '').startsWith('image/')), 'Media failed to load');
  const bytes = Buffer.from(await response.arrayBuffer());
  requireThat(bytes.length <= (video ? 64 : 16) * 1024 * 1024, 'Media exceeds the inspection download limit');
  return bytes;
}
async function verify(item, record, reference, ledger) {
  const checks = record.verification ||= {};
  for (const platform of item.platforms) {
    const result = await call(platform === 'instagram' ? { action: 'verifyInstagram', mediaId: record.instagram.mediaId } : { action: 'verifyFacebook', postId: record.facebook.postId });
    const m = result.media;
    if (item.format !== 'story') requireThat(canonicalCaption(platform === 'instagram' ? m.caption : m.message) === canonicalCaption(item.caption), 'Published caption does not match approved caption');
    const url = platform === 'instagram' ? m.media_url : m.attachments?.data?.[0]?.media?.image?.src;
    requireThat(url, 'No actual published image returned');
    const actual = await download(url, item.format === 'reel');
    const file = `social-results/${item.id}-${platform}.${item.format === 'reel' ? 'mp4' : 'png'}`;
    await fs.writeFile(file, actual);
    const validation = item.format === 'reel' ? await verifyPublishedVideo(reference, actual, item) : await verifyPublishedImage(reference, actual, item.asset.width / item.asset.height);
    checks[platform] = { ...validation, passed: true, id: String(m.id), sha256: sha256(actual), permalink: platform === 'instagram' ? m.permalink : m.permalink_url, downloadedAsset: file };
    const evidencePath = `social/published-assets/${sha256(actual)}.${item.format === 'reel' ? 'mp4' : 'jpg'}`;
    checks[platform].evidenceCommit = await ledger.writeFile(evidencePath, actual, `Save actual ${platform} published asset`);
    checks[platform].evidencePath = evidencePath;
    await ledger.save(`Save actual ${platform} asset verification ${item.id}`);
  }
  return checks;
}
try {
  let inspection;
  // Read-only wait while the existing Vercel Git deployment catches up with the push.
  for (let attempt = 0; attempt < 13; attempt++) {
    try {
      inspection = await call({ action: 'inspect' });
      requireThat(inspection.qaVersion === QA_VERSION, 'Publisher deployment has not reached the required QA version');
      enforcePublisherContract(inspection, expectedPolicyDigest);
      break;
    } catch (error) { if (attempt === 12) throw error; await delay(5000); }
  }
  report.publisherContract = { version: inspection.contractVersion, policyDigest: inspection.policyDigest, matched: true };
  report.accounts = { instagram: inspection.instagram, facebook: inspection.facebook, facebookConfigured: inspection.facebookConfigured };
  report.serverEnvironmentReferences = inspection.environmentReferences;
  report.userApprovalPolicy = inspection.userApprovalPolicy;
  report.recentInstagram = inspection.recent.map(m => ({ id: String(m.id), caption: m.caption || '', timestamp: m.timestamp, format: m.media_type, permalink: m.permalink }));
  await fs.writeFile('social-results/recent-instagram.json', JSON.stringify(report.recentInstagram, null, 2) + '\n');
  const queueFiles = (await fs.readdir('content-queue')).filter(f => f.endsWith('.json')).sort();
  const queue = await Promise.all(queueFiles.map(async f => JSON.parse(await fs.readFile(path.join('content-queue', f), 'utf8'))));
  const seeds = queue.filter(i => i.status === 'published').map(i => ({ id: i.id, date: i.publishedAt, topic: i.topic, topicKey: i.topicKey, headline: i.headline, creativeKey: i.creativeKey, format: i.format, platform: 'instagram', phase: 'legacy_published', instagram: { mediaId: i.mediaId }, legacyImageUrl: i.imageUrl }));
  const ledger = new Ledger(process.env.GITHUB_TOKEN, config.stateBranch, process.env.GITHUB_SHA);
  const history = currentHistory = await ledger.load(seeds);
  await ledger.writeFile('social/recent-instagram.json', JSON.stringify(report.recentInstagram, null, 2) + '\n', 'Save recent Instagram content for editorial duplicate review');
  const recentIds = new Set(history.items.map(i => i.instagram?.mediaId));
  let imported = 0;
  for (const m of inspection.recent) {
    if (recentIds.has(String(m.id))) continue;
    const hook = (m.caption || '').split('\n').find(l => l.trim()) || 'Previous Instagram creative';
    history.items.push({ id: `instagram-${m.id}`, date: m.timestamp, topic: hook, topicKey: normalize(hook), headline: hook, creativeKey: `instagram-${m.id}`, format: m.media_type === 'VIDEO' ? 'reel' : 'feed', platform: 'instagram', phase: 'legacy_published', instagram: { mediaId: String(m.id), permalink: m.permalink } }); imported++;
  }
  let fingerprinted = 0;
  // Inspect actual historical media, never its mutable source/generation URL.
  for (const m of inspection.recent) {
    const old = history.items.find(i => i.instagram?.mediaId === String(m.id));
    requireThat(old, 'Recent Instagram creative is missing from durable history');
    if (m.media_type === 'VIDEO') {
      if (old.videoVisual) continue;
      requireThat(m.media_url, 'Actual historical video is unavailable for duplicate review');
      const actual = await download(m.media_url, true), evidence = await analyzeVideo(actual);
      old.publishedAssetSha256 = sha256(actual);
      old.pixelHash = evidence.pixelHash;
      old.videoVisual = evidence.videoVisual;
      fingerprinted++;
      continue;
    }
    requireThat(['IMAGE', 'CAROUSEL_ALBUM'].includes(m.media_type), 'Recent media format cannot be checked for duplicates');
    if (old.visualSignature) continue;
    requireThat(m.media_url, 'Actual historical image is unavailable for duplicate review');
    const actual = await download(m.media_url);
    old.publishedAssetSha256 = sha256(actual);
    old.pixelHash = await imageFingerprint(actual);
    old.visualSignature = await visualSignature(actual);
    fingerprinted++;
  }
  if (imported || fingerprinted) await ledger.save('Import and fingerprint actual Instagram creatives for duplicate protection');
  report.legacyPublicationChecks = [];
  let recovered = 0;
  for (const old of history.items.filter(i => i.phase.startsWith('legacy') && !i.visualSignature && !i.videoVisual && i.instagram?.mediaId)) {
    try {
      const result = await call({ action: 'verifyInstagram', mediaId: old.instagram.mediaId });
      const m = result.media;
      requireThat(m.media_url, 'Earlier published asset is no longer retrievable');
      const actual = await download(m.media_url, m.media_type === 'VIDEO');
      old.publishedAssetSha256 = sha256(actual);
      if (m.media_type === 'VIDEO') {
        const evidence = await analyzeVideo(actual); old.pixelHash = evidence.pixelHash; old.videoVisual = evidence.videoVisual;
      } else { old.pixelHash = await imageFingerprint(actual); old.visualSignature = await visualSignature(actual); }
      old.instagram.permalink = m.permalink;
      old.archiveEvidencePath = `social/legacy-published-assets/${sha256(actual)}.${m.media_type === 'VIDEO' ? 'mp4' : 'jpg'}`;
      await ledger.writeFile(old.archiveEvidencePath, actual, `Archive actual earlier Instagram publication ${old.id}`);
      report.legacyPublicationChecks.push({ id: old.id, mediaId: old.instagram.mediaId, readable: true, permalink: m.permalink, archiveEvidencePath: old.archiveEvidencePath });
      recovered++;
    } catch (error) {
      report.legacyPublicationChecks.push({ id: old.id, mediaId: old.instagram.mediaId, readable: false, error: error.message, meta: error.safeMeta });
    }
  }
  if (recovered) await ledger.save('Recover actual earlier Instagram publication fingerprints');
  await ledger.writeFile('social/legacy-publication-checks.json', JSON.stringify(report.legacyPublicationChecks, null, 2) + '\n', 'Record read-only verification of earlier publisher media IDs');
  report.historyCount = history.items.length;
  const now = Date.now(), day = localDay(new Date(now)), month = day.slice(0, 7);
  report.automation = automationReadiness(config, approvalPolicy, queue, history.items, monthlyPlan, now);
  report.schedulerEnabled = config.schedulerEnabled === true && report.automation.ready;
  await ledger.writeFile('social/automation-status.json', JSON.stringify(report.automation, null, 2) + '\n', 'Record automatic publishing readiness');
  const due = queue.filter(i => i.status === 'approved').sort((a, b) => Date.parse(a.publishAt) - Date.parse(b.publishAt));
  const controlled = process.env.GITHUB_EVENT_NAME === 'schedule' ? null : config.controlledPublicationId;
  if (report.schedulerEnabled) {
    schedulerProof(config, history.items);
    enforceResolvedHistory(history.items);
  }
  for (const item of due) {
    if (!publicationRun.canAttempt) break;
    const existing = history.items.find(i => i.id === item.id);
    const completingFacebook = facebookCompletionEligible(item, existing, controlled);
    if (existing && !completingFacebook) { report.qa.push({ id: item.id, blocked: 'Already used or reserved. No automatic retry.' }); continue; }
    try {
      enforceEditorialPolicy(item, editorialIntelligence, audienceNeeds, editorialPolicy, proofRegistry, now);
      validateManifest(item, now);
      checkDuplicates(item, completingFacebook ? history.items.filter(i => i.id !== item.id) : history.items, now);
      await checkSources(item);
      const reference = await fs.readFile(item.asset.path);
      const validation = await inspectExport(item, reference);
      // Check the hosted bytes too, then make the endpoint repeat its own QA.
      const hosted = await download(immutableAssetUrl(item.asset), item.format === 'reel');
      requireThat(sha256(hosted) === item.asset.sha256, 'Hosted bytes differ from final inspected export');
      if (item.platforms.includes('facebook')) requireThat(inspection.facebookConfigured && String(inspection.facebook.id) === ACCOUNT.facebookId, 'Facebook credentials missing. Neither platform will publish');
      await operation('dryRun', item);
      report.qa.push({ id: item.id, passed: true, validation });
      const isControlled = controlled === item.id;
      if (isControlled && !config.verifiedLivePublication) requireThat(item.format === 'feed' && item.platforms.includes('instagram') && item.platforms.includes('facebook'), 'First controlled test must publish a feed image to both TSS accounts');
      if (isControlled && config.verifiedLivePublication) schedulerProof(config, history.items);
      if (completingFacebook) {
        enforceUserApproval(item, approvalPolicy, now);
        const record = existing;
        record.qaBoundSha256 = item.review.boundSha256;
        await publicationRun.attempt(record, async () => {
          try {
            record.phase = 'publishing_facebook'; await ledger.save(`Checkpoint Facebook completion ${item.id}`);
            const result = await operation('publishFacebook', item);
            record.facebook = { postId: result.postId, photoId: result.photoId };
            record.platform = item.platforms.join('+');
            record.phase = 'published'; await ledger.save(`Save Facebook completion ${item.id}`);
            record.verification = await verify(item, record, reference, ledger);
            record.phase = 'awaiting_published_visual_review'; await ledger.save(`Save completed platform asset checks ${item.id}`);
          } catch (error) {
            record.phase = 'needs_review'; record.lastError = error.message;
            await ledger.save(`Quarantine uncertain Facebook completion ${item.id}`);
            throw error;
          }
        });
        continue;
      }
      if (!isControlled && !report.schedulerEnabled) continue;
      if (Date.parse(item.publishAt) > now) continue;
      enforceUserApproval(item, approvalPolicy, now);
      if (!isControlled) {
        requireThat(config.approvedFormats.includes(item.format), 'Format is not enabled for scheduled publishing');
        requireThat(localDay(new Date(item.publishAt)) === day && now - Date.parse(item.publishAt) < 4 * 3600000, 'Stale post will not be published as backlog');
      }
      const today = history.items.filter(i => localDay(new Date(i.date)) === day);
      const thisMonth = history.items.filter(i => !(i.phase || '').startsWith('legacy') && localDay(new Date(i.date)).slice(0, 7) === month);
      requireThat(isControlled || thisMonth.length < config.monthlyPlan.calendarMonthCap, 'Monthly content asset cap reached');
      requireThat(isControlled || thisMonth.filter(i => i.format === item.format).length < config.monthlyPlan.formatCaps[item.format], 'Monthly format cap reached');
      requireThat(isControlled || item.facts.classification !== 'promotion' || thisMonth.filter(i => i.classification === 'promotion').length < config.monthlyPlan.promotionCap, 'Monthly direct-promotion cap reached');
      requireThat(isControlled || today.length < config.maxPostsPerDay, 'Daily publishing cap reached');
      requireThat(isControlled || today.filter(i => i.format === item.format).length < config.maxPerFormatPerDay[item.format], 'Daily format cap reached');
      const editorial = history.items.filter(i => !i.phase.startsWith('legacy') && now - Date.parse(i.date) < 30 * 86400000);
      const promotionShare = (editorial.filter(i => i.classification === 'promotion').length + (item.facts.classification === 'promotion' ? 1 : 0)) / (editorial.length + 1);
      requireThat(item.facts.classification !== 'promotion' || promotionShare <= config.maxDirectPromotionShare, 'Direct promotion would exceed 25% of content');
      const record = { id: item.id, date: new Date().toISOString(), topic: item.topic, topicKey: item.topicKey, headline: item.headline, creativeKey: item.creativeKey, assetSha256: item.asset.sha256, pixelHash: item.asset.pixelHash, visualSignature: item.asset.visualSignature, videoVisual: item.asset.videoVisual, format: item.format, platform: item.platforms.join('+'), classification: item.facts.classification, editorial: item.editorial ? { version: item.editorial.version, audienceNeedIds: item.editorial.audienceNeedIds, pillar: item.editorial.pillar, hookType: item.editorial.hook?.type, objective: item.editorial.objective, ctaId: item.editorial.cta?.id, contentFamilyId: item.editorial.contentFamilyId, editorialType: item.editorial.editorialType, repurposeSourceId: item.editorial.repurpose?.sourceId || null } : null, phase: 'reserved', qaBoundSha256: item.review.boundSha256, instagram: null, facebook: null };
      await publicationRun.attempt(record, async () => {
        history.items.push(record);
        // Every side effect has a durable checkpoint first. Failed saves stop the call.
        await ledger.save(`Reserve inspected social creative ${item.id}`);
        try {
          if (item.platforms.includes('instagram')) {
            record.phase = 'preparing_instagram'; await ledger.save(`Checkpoint container creation ${item.id}`);
            const prepared = await operation('prepare', item);
            record.instagram = { containerId: prepared.containerId };
            record.phase = 'prepared'; await ledger.save(`Save Instagram container ${item.id}`);
            record.phase = 'publishing_instagram'; await ledger.save(`Checkpoint Instagram publication ${item.id}`);
            const ticket = sign({ id: item.id, assetSha256: item.asset.sha256, containerId: prepared.containerId, format: item.format }, process.env.TSS_PUBLISHER_KEY);
            const result = await operation('publishInstagram', item, { containerId: prepared.containerId, ticket });
            record.instagram.mediaId = result.mediaId; record.phase = 'instagram_published'; await ledger.save(`Save Instagram publication ${item.id}`);
          }
          if (item.platforms.includes('facebook')) {
            record.phase = 'publishing_facebook'; await ledger.save(`Checkpoint Facebook publication ${item.id}`);
            const result = await operation('publishFacebook', item);
            record.facebook = { postId: result.postId, photoId: result.photoId }; record.phase = 'published'; await ledger.save(`Save Facebook publication ${item.id}`);
          }
          record.verification = await verify(item, record, reference, ledger);
          const needsVisualReview = isControlled || (!automaticPublishingAuthorization(approvalPolicy.automationAuthorization, now) && approvalPolicy.firstPostIds.includes(item.id));
          record.phase = needsVisualReview ? 'awaiting_published_visual_review' : 'automatically_verified';
          record.verificationMethod = 'published-asset-comparison';
          await ledger.save(`Save actual published asset checks ${item.id}`);
        } catch (error) {
          record.phase = 'needs_review'; record.lastError = error.message;
          await ledger.save(`Quarantine uncertain publication ${item.id}`);
          throw error;
        }
      });
    } catch (error) {
      report.qa.push({ id: item.id, passed: false, blocked: error.message });
      report.blocked = true;
    }
  }
  if (publicationRun.attempts.length) {
    report.automation = automationReadiness(config, approvalPolicy, queue, history.items, monthlyPlan);
    report.schedulerEnabled = config.schedulerEnabled === true && report.automation.ready;
    await ledger.writeFile('social/automation-status.json', JSON.stringify(report.automation, null, 2) + '\n', 'Refresh automatic publishing readiness after publication attempt');
  }
} catch (error) {
  report.blocked = true; report.error = error.message; report.meta = error.safeMeta || null;
  report.schedulerEnabled = false;
  if (report.automation) {
    report.automation.publishingEnabled = false;
    report.automation.mode = 'blocked';
    report.automation.runtimeError = error.message;
  }
} finally {
  if (currentHistory) await fs.writeFile('social-results/history.json', JSON.stringify(currentHistory, null, 2) + '\n');
  report.publicationAttempts = publicationRun.attempts;
  report.published = publicationRun.published;
  await fs.writeFile('social-results/report.json', JSON.stringify(report, null, 2) + '\n');
  const summary = [`TSS social QA v${QA_VERSION}`, `Scheduler authorized: ${report.schedulerAuthorized}`, `Publishing enabled after readiness checks: ${report.schedulerEnabled}`, ...(report.automation?.blockers || []), `Facebook configured: ${report.accounts?.facebookConfigured ?? 'not checked'}`, `Publishing attempts: ${report.publicationAttempts.length}`, `Posts confirmed on at least one platform: ${report.published.length}`, ...report.publicationAttempts.map(attempt => `${attempt.id}: Instagram=${attempt.instagramMediaId || 'not confirmed'}, Facebook=${attempt.facebookPostId || 'not confirmed'}, phase=${attempt.phase}${attempt.needsReview ? '; needs review, do not retry' : ''}`), ...report.qa.map(q => `${q.id}: ${q.passed ? 'QA passed' : q.blocked}`), ...(report.error ? [report.error] : [])].join('\n');
  console.log(summary);
  if (report.serverEnvironmentReferences) console.log('Server variable references (presence only): ' + JSON.stringify(report.serverEnvironmentReferences));
  if (report.userApprovalPolicy) console.log('User approval policy: ' + JSON.stringify(report.userApprovalPolicy));
  if (report.meta) console.log('Meta error codes (no credentials): ' + JSON.stringify(report.meta));
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  if (report.blocked) process.exitCode = 1;
}
