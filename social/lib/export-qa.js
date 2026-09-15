import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { imageFingerprint, normalize, requireThat, sha256, validateImage, visualSignature } from './qa.js';

async function videoEvidenceAtFile(file, info) {
  const v = info.streams.find(s => s.codec_type === 'video'), duration = Number(info.format.duration);
  requireThat(v && Number.isFinite(duration) && duration >= 1 && duration <= 600, 'Video duplicate history cannot be inspected');
  const frames = [];
  for (const t of [Math.min(0.1, duration / 10), duration * 0.2, duration * 0.4, duration * 0.6, duration * 0.8, duration - 0.2]) {
    const png = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { timeout: 10000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    frames.push(await visualSignature(png));
  }
  const videoVisual = { method: 'sampled-rgb32-v1', duration: Number(duration.toFixed(3)), frames };
  return { width: v.width, height: v.height, duration, codec: v.codec_name, pixelFormat: v.pix_fmt, videoVisual, pixelHash: sha256(JSON.stringify(videoVisual)) };
}
export async function analyzeVideo(buffer, enforcePublishingPolicy = false) {
  requireThat(buffer.length > 10000 && buffer.length <= 64 * 1024 * 1024, 'Video is missing or exceeds the inspection limit');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tss-video-evidence-'));
  try {
    const file = path.join(dir, 'actual.mp4'); await fs.writeFile(file, buffer);
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] }));
    const v = info.streams.find(s => s.codec_type === 'video'), duration = Number(info.format.duration);
    if (enforcePublishingPolicy) requireThat(buffer.length <= 32 * 1024 * 1024 && v?.width === 1080 && v?.height === 1920 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && duration >= 6 && duration <= 60 && !(v.tags?.rotate || v.side_data_list?.some(s => s.rotation)), 'Dedicated Reel export must satisfy the 1080x1920 H.264, 6-60 second policy');
    execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { timeout: 60000, stdio: ['ignore', 'ignore', 'pipe'] });
    return { ...await videoEvidenceAtFile(file, info), fullDecodePassed: true };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

export async function inspectExport(item, buffer) {
  if (item.format === 'reel') return inspectVideo(item, buffer);
  return inspectRenderedImage(item, buffer);
}

// Dedicated Reel scene PNGs get the same text/photo inspection before encoding.
// The live Reel path still requires the actual inspected MP4.
export async function inspectRenderedImage(item, buffer) {
  const result = await validateImage(buffer, item);
  const layoutBytes = await fs.readFile(`${item.asset.path}.layout.json`);
  requireThat(sha256(layoutBytes) === item.asset.layoutSha256, 'Layout evidence changed');
  const layout = JSON.parse(layoutBytes);
  requireThat(layout.format === item.format && layout.width === item.asset.width && layout.height === item.asset.height && layout.logoSha256 === item.creative.logoSha256, 'Incorrect layout evidence');
  const creativeText = Object.values(item.creative.text);
  const expectedText = item.creative.designVersion === 2
    ? item.creative.visualStyle === 'reference-data-editorial'
      ? [
          creativeText[0],
          'The Smarty Solution',
          'Connect · Develop · Invest',
          ...creativeText.slice(1),
          'CONNECT · DEVELOP · INVEST',
          'THESMARTYSOLUTION.COM'
        ]
      : [
          'The Smarty Solution',
          ...(item.creative.visualStyle === 'reference-integrated-editorial' ? [] : ['Connect · Develop · Invest']),
          ...creativeText,
          'THESMARTYSOLUTION.COM'
        ]
    : [...Object.values(item.creative.text), 'CONNECT · DEVELOP · INVEST', 'THE SMARTY SOLUTION'];
  requireThat(layout.designVersion === item.creative.designVersion, 'Incorrect design version evidence');
  requireThat(normalize(layout.textRegions.map(r => r.text).join(' ')) === normalize(expectedText.filter(Boolean).join(' ')), 'Creative text is missing from the final layout');
  if (layout.designVersion === 2) {
    requireThat(layout.logoRegion && layout.photoRegion, 'Logo/photo bounds required');
    for (const r of layout.textRegions) for (const b of [layout.logoRegion, layout.photoRegion]) {
      requireThat(!(r.x < b.x + b.width && r.x + r.width > b.x && r.y < b.y + b.height && r.y + r.height > b.y), 'Final text overlaps the logo or photograph');
    }
  }
  if (item.geography.mode === 'verified-republic-location') requireThat(layout.photoSha256 === item.geography.photoSha256, 'Photo does not match geographic evidence');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tss-ocr-'));
  try {
    for (let i = 0; i < layout.textRegions.length; i++) {
      const r = layout.textRegions[i], a = layout.safeArea;
      requireThat(r.x >= a.left && r.y >= a.top && r.x + r.width <= a.right && r.y + r.height <= a.bottom, 'Text outside format safe margins');
      const file = path.join(dir, `${i}.png`);
      // Padding lets OCR read glyphs at their actual exported bounds.
      const inverse = r.inverse === true, padding = inverse ? 18 : 12, scale = inverse ? 3 : 2;
      await sharp(buffer)
        .extract({ left: r.x, top: r.y, width: r.width, height: r.height })
        .extend({ top: padding, bottom: padding, left: padding, right: padding, background: inverse ? '#04182b' : '#f6f1e8' })
        .resize({ width: (r.width + padding * 2) * scale })
        .png()
        .toFile(file);
      const output = execFileSync('tesseract', [file, 'stdout', '--psm', '7', '-l', 'eng'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });
      requireThat(normalize(output) === normalize(r.text), `Export text could not be verified by OCR in region ${i}`);
    }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
  return { ...result, ocrPassed: true, checkedTextRegions: layout.textRegions.length };
}
export async function inspectVideo(item, buffer) {
  requireThat(sha256(buffer) === item.asset.sha256 && buffer.length > 10000 && buffer.length <= 32 * 1024 * 1024, 'Invalid inspected Reel export');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tss-video-'));
  try {
    const file = path.join(dir, 'reel.mp4'); await fs.writeFile(file, buffer);
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] }));
    const v = info.streams.find(s => s.codec_type === 'video'), duration = Number(info.format.duration);
    requireThat(v?.width === 1080 && v?.height === 1920 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && duration >= 6 && duration <= 60, 'Reel must satisfy the 1080x1920 H.264, 6-60 second policy');
    requireThat(!(v.tags?.rotate || v.side_data_list?.some(s => s.rotation)), 'Rotated video export');
    execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { timeout: 60000, stdio: ['ignore', 'ignore', 'pipe'] });
    const q = item.asset.videoQA;
    requireThat(q?.sha256 === item.asset.sha256 && q.width === v.width && q.height === v.height && q.codec === v.codec_name && q.pixelFormat === v.pix_fmt && Math.abs(q.duration - duration) < 0.05, 'Video QA evidence does not match actual export');
    requireThat(item.review.fullVideoInspected && item.review.videoRightsVerified && item.review.inspectedFrameTimes.length >= 3 && item.review.inspectedFrameTimes.every(t => Number.isFinite(t) && t >= 0 && t < duration), 'Full-video review missing');
    const evidence = await videoEvidenceAtFile(file, info);
    requireThat(item.asset.pixelHash === evidence.pixelHash && JSON.stringify(item.asset.videoVisual) === JSON.stringify(evidence.videoVisual), 'Video duplicate evidence does not match actual decoded frames');
    const sceneChecks = item.creative?.designVersion === 2 ? await inspectEncodedScenes(item, file, duration) : null;
    return { width: v.width, height: v.height, duration, codec: v.codec_name, fullDecodePassed: true, pixelHash: evidence.pixelHash, checkedDuplicateFrames: evidence.videoVisual.frames.length, sceneChecks };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
async function inspectEncodedScenes(item, file, duration) {
  const scenes = item.creative.scenes, assets = item.asset.sceneAssets, seconds = item.creative.sceneDurationSeconds;
  requireThat(Array.isArray(scenes) && scenes.length >= 1 && scenes.length <= 6 && assets?.length === scenes.length && Number.isFinite(seconds) && seconds >= 3 && Math.abs(scenes.length * seconds - duration) < 0.05, 'Reel scene evidence or timing is incomplete');
  const references = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = structuredClone(item); scene.creative.text = scenes[i]; scene.asset = assets[i];
    const bytes = await fs.readFile(scene.asset.path);
    await inspectRenderedImage(scene, bytes);
    references.push(bytes);
    const actual = execFileSync('ffmpeg', ['-v', 'error', '-ss', String((i + 0.5) * seconds), '-i', file, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { timeout: 10000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    await verifyPublishedImage(bytes, actual, 9 / 16);
    // OCR the actual encoded video frame, retaining the inspected scene layout.
    scene.asset = { ...scene.asset, sha256: sha256(actual), pixelHash: await imageFingerprint(actual), visualSignature: await visualSignature(actual) };
    await inspectRenderedImage(scene, actual);
  }
  const times = [...new Set([0.1, ...Array.from({ length: Math.floor(duration) }, (_, i) => i + 0.1).filter(t => t < duration - 0.1), ...scenes.slice(1).flatMap((_, i) => [(i + 1) * seconds - 0.1, (i + 1) * seconds + 0.1]), duration - 0.2])];
  for (const t of times) {
    const frame = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { timeout: 10000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    await verifyPublishedImage(references[Math.min(scenes.length - 1, Math.floor(t / seconds))], frame, 9 / 16);
  }
  return { ocrCheckedScenes: scenes.length, checkedFrames: times.length, transitionsAndEndingChecked: true };
}
export async function verifyPublishedImage(reference, actual, expectedRatio) {
  const m = await sharp(actual).metadata();
  requireThat(m.width >= 540 && Math.abs(m.width / m.height - expectedRatio) < 0.012, 'Published asset is cropped or too small');
  const a = await sharp(reference).resize(128, 128, { fit: 'fill' }).removeAlpha().raw().toBuffer(), b = await sharp(actual).resize(128, 128, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference += Math.abs(a[i] - b[i]);
  difference /= a.length;
  requireThat(difference < 12, 'Published image differs materially from the inspected export');
  return { width: m.width, height: m.height, meanPixelDifference: Number(difference.toFixed(3)) };
}
export async function verifyPublishedVideo(reference, actual, item) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tss-published-video-'));
  try {
    const files = [path.join(dir, 'approved.mp4'), path.join(dir, 'published.mp4')];
    await fs.writeFile(files[0], reference); await fs.writeFile(files[1], actual);
    const info = files.map(file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] })));
    const v = info[1].streams.find(s => s.codec_type === 'video'), duration = Number(info[1].format.duration), expected = Number(info[0].format.duration);
    requireThat(v?.width >= 540 && Math.abs(v.width / v.height - 9 / 16) < 0.01 && Math.abs(duration - expected) < 0.5, 'Published Reel is cropped, truncated or too small');
    execFileSync('ffmpeg', ['-v', 'error', '-i', files[1], '-f', 'null', '-'], { timeout: 60000, stdio: ['ignore', 'ignore', 'pipe'] });
    const frameChecks = [];
    // Compare every second of the actual transcoded video, including its end.
    const times = [...new Set([0.1, ...Array.from({ length: Math.floor(expected) }, (_, i) => i + 0.1).filter(t => t < Math.min(expected, duration) - 0.1), Math.min(expected, duration) - 0.2])];
    for (const t of times) {
      const frames = [];
      for (let i = 0; i < 2; i++) {
        const file = path.join(dir, `frame-${i}.png`);
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', files[i], '-frames:v', '1', file], { timeout: 10000, stdio: ['ignore', 'ignore', 'pipe'] });
        frames.push(await fs.readFile(file));
      }
      frameChecks.push({ time: t, ...await verifyPublishedImage(frames[0], frames[1], 9 / 16) });
    }
    return { width: v.width, height: v.height, duration, checkedFrames: frameChecks.length, frameChecks, fullDecodePassed: true };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
