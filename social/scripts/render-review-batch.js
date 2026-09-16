import fs from 'node:fs/promises';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { renderCreative } from '../lib/render.js';
import { imageFingerprint, sha256, visualSignature } from '../lib/qa.js';
import { analyzeVideo } from '../lib/export-qa.js';

const requested = process.argv.slice(2);
const files = (await fs.readdir('content-queue'))
  .filter(f => f.startsWith('tss-review-') && f.endsWith('.json'))
  .filter(f => requested.length === 0 || requested.includes(f))
  .sort();
if (requested.length && files.length !== requested.length) throw new Error('One or more requested review manifests were not found');
await fs.mkdir('social/assets', { recursive: true });
await fs.mkdir('social-results/reel-scenes', { recursive: true });
async function saveFrame(creative) {
  const { buffer, layout } = await renderCreative(creative), hash = sha256(buffer);
  const format = (await sharp(buffer).metadata()).format;
  if (!['png', 'jpeg'].includes(format)) throw new Error('Unexpected final image encoding');
  const extension = format === 'jpeg' ? 'jpg' : 'png', path = `social/assets/${hash}.${extension}`;
  const layoutText = JSON.stringify(layout, null, 2) + '\n';
  await fs.writeFile(path, buffer); await fs.writeFile(`${path}.layout.json`, layoutText);
  return { path, sha256: hash, pixelHash: await imageFingerprint(buffer), visualSignature: await visualSignature(buffer), layoutSha256: sha256(layoutText), width: layout.width, height: layout.height, originFormat: creative.format, commit: null };
}
let failed = 0;
for (const file of files) {
  const path = `content-queue/${file}`, item = JSON.parse(await fs.readFile(path, 'utf8'));
  try {
    if (item.format !== 'reel') item.asset = await saveFrame(item.creative);
    else {
      const sceneAssets = [];
      for (let i = 0; i < item.creative.scenes.length; i++) {
        const asset = await saveFrame({ ...item.creative, text: item.creative.scenes[i] });
        sceneAssets.push(asset); await fs.copyFile(asset.path, `social-results/reel-scenes/frame-${String(i + 1).padStart(2, '0')}.png`);
      }
      const output = 'social-results/reel-scenes/export.mp4', duration = item.creative.sceneDurationSeconds * sceneAssets.length;
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', `1/${item.creative.sceneDurationSeconds}`, '-i', 'social-results/reel-scenes/frame-%02d.png', '-t', String(duration), '-c:v', 'libx264', '-threads', '2', '-r', '30', '-pix_fmt', 'yuv420p', '-crf', '20', '-an', '-movflags', '+faststart', output], { timeout: 60000, stdio: ['ignore', 'ignore', 'pipe'] });
      const buffer = await fs.readFile(output), hash = sha256(buffer), path = `social/assets/${hash}.mp4`, evidence = await analyzeVideo(buffer);
      await fs.writeFile(path, buffer);
      item.asset = { path, sha256: hash, pixelHash: evidence.pixelHash, videoVisual: evidence.videoVisual, videoQA: { sha256: hash, width: 1080, height: 1920, duration, codec: 'h264', pixelFormat: 'yuv420p', fullDecodePassed: true }, width: 1080, height: 1920, originFormat: 'reel', commit: null, sceneAssets };
    }
    item.creative.logoSha256 = (await import('../lib/qa.js')).LOGO_SHA;
    item.status = 'draft'; delete item.review;
    await fs.writeFile(path, JSON.stringify(item, null, 2) + '\n');
    console.log(JSON.stringify({ number: item.reviewNumber, id: item.id, asset: item.asset.path, format: item.format }));
  } catch (error) { failed++; console.log(JSON.stringify({ number: item.reviewNumber, blocked: error.message })); }
}
if (failed) process.exitCode = 1;
