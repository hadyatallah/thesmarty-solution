import fs from 'node:fs/promises';
import path from 'node:path';
import { automaticPublishingAuthorization, binding, checkDuplicates, checkSources, enforceUserApproval, immutableAssetUrl, requireThat, sha256, userApprovalBinding, validateManifest } from '../lib/qa.js';
import { inspectExport } from '../lib/export-qa.js';
import { Ledger } from '../lib/ledger.js';
import { enforceEditorialPolicy } from '../lib/editorial.js';
import { unresolvedPublications } from '../lib/publication-run.js';

// Review files are never handed to a live publishing action or reserved in history.
// An in-memory status change allows the same fail-closed QA validator to run.
const config = JSON.parse(await fs.readFile('social/publishing-config.json', 'utf8'));
const approvalPolicy = JSON.parse(await fs.readFile('social/user-approval-policy.json', 'utf8'));
const automatic = automaticPublishingAuthorization(approvalPolicy.automationAuthorization);
requireThat(JSON.stringify(automatic) === JSON.stringify(automaticPublishingAuthorization(config.automationAuthorization)), 'Review and scheduler automation authorizations do not match');
const [editorialIntelligence, audienceNeeds, editorialPolicy, proofRegistry] = await Promise.all([
  fs.readFile('social/editorial-intelligence.json', 'utf8').then(JSON.parse),
  fs.readFile('social/audience-needs.json', 'utf8').then(JSON.parse),
  fs.readFile('social/editorial-adoption-policy.json', 'utf8').then(JSON.parse),
  fs.readFile('social/social-proof-registry.json', 'utf8').then(JSON.parse)
]);
const history = process.env.TSS_REVIEW_HISTORY_FILE
  ? JSON.parse(await fs.readFile(process.env.TSS_REVIEW_HISTORY_FILE, 'utf8'))
  : await new Ledger(process.env.GITHUB_TOKEN, config.stateBranch, process.env.GITHUB_SHA).load([]);
const comparisons = structuredClone(history.items), results = [];
for (const directory of (await fs.readdir('social/review-batches').catch(e => { if (e.code === 'ENOENT') return []; throw e; })).sort()) {
  const index = JSON.parse(await fs.readFile(path.join('social/review-batches', directory, 'index.json'), 'utf8'));
  requireThat(index.version === 1 && Array.isArray(index.posts), 'Invalid review batch index');
  for (const entry of index.posts.filter(p => p.status === 'awaiting_user_approval' || (automatic && p.status === 'approved'))) {
    requireThat(/^content-queue\/tss-[a-z0-9-]+\.json$/.test(entry.manifestPath), 'Invalid review manifest path');
    const original = JSON.parse(await fs.readFile(entry.manifestPath, 'utf8'));
    requireThat(original.status === entry.status && original.id === entry.id && entry.contentSha256 === userApprovalBinding(original), 'Review index does not match the final content');
    const existing = history.items.find(old => old.id === original.id);
    if (existing) {
      requireThat(['verified', 'automatically_verified'].includes(existing.phase) && !unresolvedPublications([existing]).length,
        'Existing publication is unresolved; do not treat it as an unpublished review');
      requireThat(existing.assetSha256 === original.asset.sha256, 'Published post ID cannot be reused for a changed review export');
      results.push({ id: original.id, status: existing.phase, published: true, skipped: 'Already published and verified in durable history' });
      continue;
    }
    // Never fabricate a fresh inspection date for an expired review.
    if (Date.now() - Date.parse(original.review?.reviewedAt) > 7 * 86400000) {
      results.push({ id: original.id, status: 'needs_fresh_inspection', published: false }); continue;
    }
    const item = structuredClone(original); item.status = 'approved';
    if (original.status === 'approved') enforceUserApproval(item, approvalPolicy);
    requireThat(item.review?.boundSha256 === binding(item), 'Final review seal missing');
    enforceEditorialPolicy(item, editorialIntelligence, audienceNeeds, editorialPolicy, proofRegistry);
    validateManifest(item); checkDuplicates(item, comparisons); await checkSources(item);
    const validation = await inspectExport(item, await fs.readFile(item.asset.path));
    for (const asset of [item.asset, ...(item.asset.sceneAssets || [])]) {
      const hosted = await fetch(immutableAssetUrl(asset), { redirect: 'error', signal: AbortSignal.timeout(20000) });
      requireThat(hosted.ok && sha256(Buffer.from(await hosted.arrayBuffer())) === asset.sha256, 'Hosted review asset differs from the actual inspected export');
    }
    results.push({ id: item.id, validation, sourcesChecked: item.facts.sources.length, status: original.status, publishingAuthorization: original.status === 'approved' ? 'automatic_after_qa' : 'individual_approval_pending', published: false });
    comparisons.push({ id: item.id, date: item.review.reviewedAt, topic: item.topic, topicKey: item.topicKey, headline: item.headline, creativeKey: item.creativeKey, assetSha256: item.asset.sha256, pixelHash: item.asset.pixelHash, visualSignature: item.asset.visualSignature, videoVisual: item.asset.videoVisual, format: item.format, editorial: item.editorial });
    console.log(`${item.id}: final export, sources, history and immutable hosting passed; ${original.status === 'approved' ? 'eligible for the authorized automatic queue' : 'individual approval still pending'}; this check does not publish`);
  }
}
await fs.mkdir('social-results', { recursive: true });
await fs.writeFile('social-results/review-batch-qa.json', JSON.stringify({ checkedAt: new Date().toISOString(), historyCount: history.items.length, published: false, results }, null, 2) + '\n');
