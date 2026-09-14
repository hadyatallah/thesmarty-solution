import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderCreative } from '../lib/render.js';
import { ACCOUNT, CHECKS, LOGO_SHA, binding, checkDuplicates, imageFingerprint, sha256, sign, validateImage, validateManifest, verifySignature } from '../lib/qa.js';
import { verifyPublishedImage } from '../lib/export-qa.js';
import handler from '../../api/publish-instagram.js';

const creative = format => ({ format, template: 'question-debate', logoSha256: LOGO_SHA, text: { category: 'CYPRUS / LEBANON', headline: "A CONNECTION ISN'T A BUSINESS MODEL.", body: 'Start with a customer problem. Validate demand. Build a route to market.', question: 'What problem would you solve across Cyprus and Lebanon?' } });
async function fixture(format = 'feed') {
  const { buffer, layout } = await renderCreative(creative(format)), hash = sha256(buffer);
  const i = { qaVersion: 2, id: 'test-cyprus-lebanon-connections', status: 'approved', topic: 'Cross-border customer problem validation', topicKey: 'cyprus-lebanon-customer-validation', headline: creative(format).text.headline, creativeKey: 'connections-customer-validation', format, platforms: ['instagram'], publishAt: new Date().toISOString(), caption: format === 'story' ? 'What customer problem would you solve across Cyprus and Lebanon?' : 'A connection is only the start. What customer problem would you solve? #Cyprus #Lebanon', creative: creative(format), asset: { width: layout.width, height: layout.height, sha256: hash, pixelHash: await imageFingerprint(buffer), originFormat: format, path: `social/assets/${hash}.png`, commit: 'a'.repeat(40) }, facts: { classification: 'editorial-opinion', claims: [], sources: [] }, geography: { mode: 'no-location-imagery' } };
  approve(i); return { i, buffer };
}
function approve(i) { i.review = { reviewer: 'Test QA', reviewedAt: new Date().toISOString(), boundSha256: binding(i), captionSha256: sha256(i.caption), assetSha256: i.asset.sha256, checks: Object.fromEntries(CHECKS.map(k => [k, true])) }; }
test('feed and dedicated Story exports have exact dimensions and complete manifest binding', async () => {
  for (const format of ['feed', 'story']) { const { i, buffer } = await fixture(format); validateManifest(i); const result = await validateImage(buffer, i); assert.equal(result.height, format === 'feed' ? 1350 : 1920); }
});
test('declared dimensions cannot disguise a wrongly exported image or feed reused as Story', async () => {
  const { i, buffer } = await fixture();
  const square = await sharp(buffer).resize(1080, 1080).png().toBuffer();
  await assert.rejects(validateImage(square, i), /Actual export/);
  i.format = 'story'; i.asset.width = 1080; i.asset.height = 1920; approve(i);
  assert.throws(() => validateManifest(i), /Dedicated/);
});
test('corrupt, empty, blank and transparent exports are blocked', async () => {
  const { i } = await fixture();
  await assert.rejects(validateImage(Buffer.from('failed image'), i));
  const blank = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#f6f1e8' } }).png().toBuffer();
  i.asset.sha256 = sha256(blank); await assert.rejects(validateImage(blank, i), /Blank/);
  const transparent = await sharp({ create: { width: 1080, height: 1350, channels: 4, background: '#00000000' } }).png().toBuffer();
  i.asset.sha256 = sha256(transparent); await assert.rejects(validateImage(transparent, i), /Blank/);
});
test('changing the caption, final file or review gates requires a fresh inspection', async () => {
  const { i, buffer } = await fixture(); i.caption += ' Changed'; assert.throws(() => validateManifest(i), /changed after/);
  approve(i); i.review.checks.finalExportInspected = false; assert.throws(() => validateManifest(i), /Every final/);
  const different = await sharp(buffer).removeAlpha().negate().png().toBuffer(); await assert.rejects(validateImage(different, i), /differs/);
});
test('invalid dates, excess hashtags, unverified figures and wrong logo are blocked', async () => {
  const { i } = await fixture();
  i.publishAt = 'invalid'; approve(i); assert.throws(() => validateManifest(i), /timezone/);
  i.publishAt = new Date().toISOString(); i.caption = '#a #b #c #d #e,#f'; approve(i); assert.throws(() => validateManifest(i), /five hashtags/);
  i.caption = 'A 15% tax rate'; approve(i); assert.throws(() => validateManifest(i), /verified evidence/);
  i.caption = 'Customer problem first'; i.creative.logoSha256 = 'wrong'; approve(i); assert.throws(() => validateManifest(i), /Incorrect logo/);
});
test('an identical creative stays blocked after 30 days and topic dates cannot defeat the recent-topic guard', async () => {
  const { i } = await fixture();
  assert.throws(() => checkDuplicates(i, [{ id: 'old', date: new Date(Date.now() - 90 * 86400000).toISOString(), assetSha256: i.asset.sha256 }]), /already used/);
  assert.throws(() => checkDuplicates(i, [{ id: 'old', date: new Date().toISOString(), topicKey: 'cyprus-lebanon-customer-validation-2026-09-13', headline: 'Different hook', topic: 'Different' }]), /30 days/);
});
test('renderer rejects long copy, missing/unverified photos, placeholders and broken characters', async () => {
  const c = creative('feed'); c.text.headline = 'investment '.repeat(100); await assert.rejects(renderCreative(c), /too long/);
  c.text.headline = 'TITLE □'; await assert.rejects(renderCreative(c), /Corrupted/);
  c.text.headline = 'INSERT IMAGE HERE'; await assert.rejects(renderCreative(c), /Placeholder/);
  c.text.headline = 'LARNACA'; c.template = 'place-opportunity'; await assert.rejects(renderCreative(c), /no approved/);
  c.photoKey = 'unverified-cyprus-label'; await assert.rejects(renderCreative(c), /geographic QA/);
});
test('published-image check accepts compression and rejects cropping or a different final creative', async () => {
  const { buffer } = await fixture();
  await verifyPublishedImage(buffer, await sharp(buffer).jpeg({ quality: 85 }).toBuffer(), 4 / 5);
  await assert.rejects(verifyPublishedImage(buffer, await sharp(buffer).resize(1080, 1080).toBuffer(), 4 / 5), /cropped/);
  await assert.rejects(verifyPublishedImage(buffer, await sharp(buffer).negate().toBuffer(), 4 / 5), /differs materially/);
});
test('transport signatures reject altered content', () => {
  const payload = { action: 'prepare', item: { caption: 'approved' } }, key = 'test-only-key';
  const signature = sign(payload, key); assert.equal(verifySignature(payload, signature, key), true);
  payload.item.caption = 'changed'; assert.equal(verifySignature(payload, signature, key), false);
});
test('legacy API calls cannot reach Meta even with an authorized publisher key', async () => {
  const original = process.env.TSS_PUBLISHER_KEY; process.env.TSS_PUBLISHER_KEY = 'test-only-key';
  let status, response;
  try { await handler({ method: 'POST', headers: { 'x-tss-publisher-key': 'test-only-key' }, body: { imageUrl: 'https://example.com/image.png', caption: 'test' } }, { setHeader() {}, status(s) { status = s; return this; }, json(d) { response = d; } }); }
  finally { if (original === undefined) delete process.env.TSS_PUBLISHER_KEY; else process.env.TSS_PUBLISHER_KEY = original; }
  assert.equal(status, 422); assert.match(response.error, /Signed QA manifest/);
});
test('missing Facebook credentials prevent any Meta publish/container side effect on both accounts', async () => {
  const { i } = await fixture(); i.platforms = ['instagram', 'facebook']; approve(i);
  const names = ['TSS_PUBLISHER_KEY', 'INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_USER_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_TOKEN', 'FACEBOOK_PAGE_ID'];
  const old = Object.fromEntries(names.map(n => [n, process.env[n]])), oldFetch = globalThis.fetch;
  let posts = 0, status, output;
  try {
    for (const n of names) delete process.env[n];
    process.env.TSS_PUBLISHER_KEY = 'test-only-key'; process.env.INSTAGRAM_ACCESS_TOKEN = 'test-only-ig-token'; process.env.INSTAGRAM_USER_ID = ACCOUNT.instagramId;
    globalThis.fetch = async (url, options) => { if (options.method === 'POST') posts++; return new Response(JSON.stringify({ id: ACCOUNT.instagramId, username: ACCOUNT.username }), { status: 200 }); };
    const payload = { action: 'prepare', item: i };
    await handler({ method: 'POST', headers: { 'x-tss-publisher-key': 'test-only-key' }, body: { payload, signature: sign(payload, 'test-only-key') } }, { setHeader() {}, status(s) { status = s; return this; }, json(d) { output = d; } });
  } finally { globalThis.fetch = oldFetch; for (const n of names) { if (old[n] === undefined) delete process.env[n]; else process.env[n] = old[n]; } }
  assert.equal(status, 422); assert.match(output.error, /Facebook.*not configured/); assert.equal(posts, 0);
});
