import fs from 'node:fs/promises';
import path from 'node:path';
import { ACCOUNT, QA_VERSION, checkDuplicates, checkSources, immutableAssetUrl, normalize, requireThat, sha256, sign, validateManifest } from '../lib/qa.js';
import { inspectExport, verifyPublishedImage } from '../lib/export-qa.js';
import { Ledger } from '../lib/ledger.js';

const config = JSON.parse(await fs.readFile('social/publishing-config.json', 'utf8'));
const report = { qaVersion: QA_VERSION, checkedAt: new Date().toISOString(), schedulerEnabled: config.schedulerEnabled, secretReferences: { TSS_PUBLISHER_KEY: Boolean(process.env.TSS_PUBLISHER_KEY), GITHUB_TOKEN: Boolean(process.env.GITHUB_TOKEN) }, qa: [], published: [] };
await fs.mkdir('social-results', { recursive: true });
const localDay = date => new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(date);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function call(body) {
  requireThat(process.env.TSS_PUBLISHER_KEY, 'Missing TSS_PUBLISHER_KEY Actions secret');
  requireThat(config.publisherUrl === 'https://thesmarty-solution-agent.vercel.app/api/publish-instagram', 'Unexpected publisher destination');
  const response = await fetch(config.publisherUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tss-publisher-key': process.env.TSS_PUBLISHER_KEY }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(55000) });
  const data = await response.json().catch(() => ({}));
  requireThat(response.ok && data.ok, data.error || `Publisher rejected request: HTTP ${response.status}`);
  return data;
}
const operation = (action, item, extra = {}) => { const payload = { action, item, ...extra }; return call({ payload, signature: sign(payload, process.env.TSS_PUBLISHER_KEY) }); };
async function download(url, video = false) {
  const u = new URL(url);
  requireThat(u.protocol === 'https:' && !u.username && !u.password, 'Invalid public media URL');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  requireThat(response.ok && (video || (response.headers.get('content-type') || '').startsWith('image/')), 'Media failed to load');
  return Buffer.from(await response.arrayBuffer());
}
async function verify(item, record, reference) {
  const checks = {};
  for (const platform of item.platforms) {
    const result = await call(platform === 'instagram' ? { action: 'verifyInstagram', mediaId: record.instagram.mediaId } : { action: 'verifyFacebook', postId: record.facebook.postId });
    const m = result.media;
    if (item.format !== 'story') requireThat(normalize(platform === 'instagram' ? m.caption : m.message) === normalize(item.caption), 'Published caption does not match approved caption');
    const url = platform === 'instagram' ? m.media_url : m.attachments?.data?.[0]?.media?.image?.src;
    requireThat(url, 'No actual published image returned');
    const actual = await download(url, item.format === 'reel');
    const file = `social-results/${item.id}-${platform}.${item.format === 'reel' ? 'mp4' : 'png'}`;
    await fs.writeFile(file, actual);
    // Meta transcodes Reels. Keep them disabled in the scheduler until a dedicated
    // published-video comparison and live review have passed.
    requireThat(item.format !== 'reel', 'Published Reel requires full-video comparison and live review before scheduler use');
    checks[platform] = { ...await verifyPublishedImage(reference, actual, item.asset.width / item.asset.height), id: String(m.id), permalink: platform === 'instagram' ? m.permalink : m.permalink_url, downloadedAsset: file };
  }
  return checks;
}
try {
  let inspection;
  // Read-only wait while the existing Vercel Git deployment catches up with the push.
  for (let attempt = 0; attempt < 6; attempt++) {
    try { inspection = await call({ action: 'inspect' }); requireThat(inspection.qaVersion === QA_VERSION, 'Publisher deployment has not reached QA version 2'); break; }
    catch (error) { if (attempt === 5) throw error; await delay(5000); }
  }
  report.accounts = { instagram: inspection.instagram, facebook: inspection.facebook, facebookConfigured: inspection.facebookConfigured };
  report.recentInstagram = inspection.recent.map(m => ({ id: String(m.id), caption: m.caption || '', timestamp: m.timestamp, format: m.media_type, permalink: m.permalink }));
  await fs.writeFile('social-results/recent-instagram.json', JSON.stringify(report.recentInstagram, null, 2) + '\n');
  const queueFiles = (await fs.readdir('content-queue')).filter(f => f.endsWith('.json')).sort();
  const queue = await Promise.all(queueFiles.map(async f => JSON.parse(await fs.readFile(path.join('content-queue', f), 'utf8'))));
  const seeds = queue.filter(i => i.status === 'published').map(i => ({ id: i.id, date: i.publishedAt, topic: i.topic, topicKey: i.topicKey, headline: i.headline, creativeKey: i.creativeKey, format: i.format, platform: 'instagram', phase: 'legacy_published', instagram: { mediaId: i.mediaId }, legacyImageUrl: i.imageUrl }));
  const ledger = new Ledger(process.env.GITHUB_TOKEN, config.stateBranch, process.env.GITHUB_SHA);
  const history = await ledger.load(seeds);
  const recentIds = new Set(history.items.map(i => i.instagram?.mediaId));
  let imported = 0;
  for (const m of inspection.recent) {
    if (recentIds.has(String(m.id))) continue;
    const hook = (m.caption || '').split('\n').find(l => l.trim()) || 'Previous Instagram creative';
    history.items.push({ id: `instagram-${m.id}`, date: m.timestamp, topic: hook, topicKey: normalize(hook), headline: hook, creativeKey: `instagram-${m.id}`, format: m.media_type === 'VIDEO' ? 'reel' : 'feed', platform: 'instagram', phase: 'legacy_published', instagram: { mediaId: String(m.id), permalink: m.permalink } }); imported++;
  }
  if (imported) await ledger.save('Import recent Instagram content for duplicate protection');
  report.historyCount = history.items.length;
  const now = Date.now(), day = localDay(new Date(now));
  const due = queue.filter(i => i.status === 'approved').sort((a, b) => Date.parse(a.publishAt) - Date.parse(b.publishAt));
  const controlled = config.controlledPublicationId;
  if (config.schedulerEnabled) {
    const proof = history.items.find(i => i.id === config.verifiedLivePublication);
    requireThat(proof?.phase === 'verified' && proof.publishedReview?.instagram && proof.publishedReview?.facebook, 'Scheduler needs a fully inspected live Instagram/Facebook publication');
    requireThat(proof.instagram?.mediaId && proof.facebook?.postId, 'Live publication identifiers missing');
  }
  let sent = 0;
  for (const item of due) {
    if (history.items.some(i => i.id === item.id)) { report.qa.push({ id: item.id, blocked: 'Already used or reserved. No automatic retry.' }); continue; }
    try {
      validateManifest(item, now);
      checkDuplicates(item, history.items, now);
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
      if (isControlled) requireThat(item.format === 'feed' && item.platforms.includes('instagram') && item.platforms.includes('facebook'), 'Controlled test must publish a feed image to both TSS accounts');
      if (!isControlled && !config.schedulerEnabled) continue;
      if (Date.parse(item.publishAt) > now) continue;
      if (!isControlled) {
        requireThat(config.approvedFormats.includes(item.format), 'Format has not passed a controlled live verification');
        requireThat(localDay(new Date(item.publishAt)) === day && now - Date.parse(item.publishAt) < 4 * 3600000, 'Stale post will not be published as backlog');
      }
      const today = history.items.filter(i => !i.phase.startsWith('legacy') && localDay(new Date(i.date)) === day);
      requireThat(today.length < config.maxPostsPerDay && sent < config.maxPostsPerRun, 'Daily/run publishing cap reached');
      const editorial = history.items.filter(i => !i.phase.startsWith('legacy') && now - Date.parse(i.date) < 30 * 86400000);
      const promotionShare = (editorial.filter(i => i.classification === 'promotion').length + (item.facts.classification === 'promotion' ? 1 : 0)) / (editorial.length + 1);
      requireThat(item.facts.classification !== 'promotion' || promotionShare <= config.maxDirectPromotionShare, 'Direct promotion would exceed 25% of content');
      const record = { id: item.id, date: new Date().toISOString(), topic: item.topic, topicKey: item.topicKey, headline: item.headline, creativeKey: item.creativeKey, assetSha256: item.asset.sha256, pixelHash: item.asset.pixelHash, format: item.format, platform: item.platforms.join('+'), classification: item.facts.classification, phase: 'reserved', qaBoundSha256: item.review.boundSha256, instagram: null, facebook: null };
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
        record.verification = await verify(item, record, reference);
        record.phase = 'awaiting_published_visual_review'; await ledger.save(`Save actual published asset checks ${item.id}`);
        report.published.push({ id: item.id, verification: record.verification, requiresFinalPublishedVisualReview: true });
        sent++;
      } catch (error) {
        record.phase = 'needs_review'; record.lastError = error.message;
        await ledger.save(`Quarantine uncertain publication ${item.id}`);
        throw error;
      }
    } catch (error) {
      report.qa.push({ id: item.id, passed: false, blocked: error.message });
      report.blocked = true;
    }
    if (sent >= config.maxPostsPerRun) break;
  }
} catch (error) {
  report.blocked = true; report.error = error.message;
} finally {
  await fs.writeFile('social-results/report.json', JSON.stringify(report, null, 2) + '\n');
  const summary = [`TSS social QA v${QA_VERSION}`, `Scheduler enabled: ${report.schedulerEnabled}`, `Facebook configured: ${report.accounts?.facebookConfigured ?? 'not checked'}`, `Published: ${report.published.length}`, ...report.qa.map(q => `${q.id}: ${q.passed ? 'QA passed' : q.blocked}`), ...(report.error ? [report.error] : [])].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  if (report.blocked) process.exitCode = 1;
}
