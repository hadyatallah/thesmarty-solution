import fs from 'node:fs/promises';
import path from 'node:path';
import { binding, checkDuplicates, checkSources, immutableAssetUrl, requireThat, sha256, sign, validateManifest } from '../lib/qa.js';
import { inspectExport } from '../lib/export-qa.js';
import { Ledger } from '../lib/ledger.js';

const config = JSON.parse(await fs.readFile('social/publishing-config.json', 'utf8'));
requireThat(config.publisherUrl === 'https://thesmarty-solution-agent.vercel.app/api/publish-instagram', 'Unexpected publisher destination');
requireThat(process.env.TSS_PUBLISHER_KEY, 'Missing publisher key');
const history = await new Ledger(process.env.GITHUB_TOKEN, config.stateBranch, process.env.GITHUB_SHA).load([]);
const results = [];
for (const file of (await fs.readdir('social/qa-samples')).filter(f => f.endsWith('.json'))) {
  const item = JSON.parse(await fs.readFile(path.join('social/qa-samples', file), 'utf8'));
  requireThat(item.qaOnly === true && item.review?.boundSha256 === binding(item), 'Samples must be inspected and permanently QA-only');
  // Retain the original inspection date. Never refresh a review automatically.
  if (Date.now() - Date.parse(item.review.reviewedAt) > 7 * 86400000) { results.push({ id: item.id, skipped: 'Original sample review expired' }); continue; }
  if (history.items.some(old => old.assetSha256 === item.asset.sha256 || old.pixelHash === item.asset.pixelHash || old.creativeKey === item.creativeKey)) {
    results.push({ id: item.id, skipped: 'Sample creative is already reserved or published; live duplicate protection remains in force' }); continue;
  }
  validateManifest(item);
  checkDuplicates(item, history.items);
  await checkSources(item);
  const bytes = await fs.readFile(item.asset.path);
  const exportQA = await inspectExport(item, bytes);
  const hosted = await fetch(immutableAssetUrl(item.asset), { redirect: 'error', signal: AbortSignal.timeout(20000) });
  requireThat(hosted.ok && sha256(Buffer.from(await hosted.arrayBuffer())) === item.asset.sha256, 'Hosted sample differs from the inspected file');
  const payload = { action: 'dryRun', item };
  const response = await fetch(config.publisherUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tss-publisher-key': process.env.TSS_PUBLISHER_KEY }, body: JSON.stringify({ payload, signature: sign(payload, process.env.TSS_PUBLISHER_KEY) }), redirect: 'error', signal: AbortSignal.timeout(55000) });
  const data = await response.json().catch(() => ({}));
  requireThat(response.ok && data.ok && data.dryRun === true && data.assetSha256 === item.asset.sha256, data.error || 'Meta sample dry run failed');
  results.push({ id: item.id, qaOnly: true, exportQA, instagram: data.accounts.instagram, published: false });
}
await fs.mkdir('social-results', { recursive: true });
await fs.writeFile('social-results/inspected-samples.json', JSON.stringify(results, null, 2) + '\n');
for (const result of results) console.log(`${result.id}: ${result.skipped || 'Final-export OCR, hosted asset and signed Meta dry run passed; publishing disabled'}`);
