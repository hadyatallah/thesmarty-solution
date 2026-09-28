import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderCreative } from '../lib/render.js';
import { analyzeVideo, inspectVideo, verifyPublishedVideo } from '../lib/export-qa.js';
import { checkDuplicates, sha256 } from '../lib/qa.js';

test('real MP4 decoding accepts a dedicated vertical Reel and rejects a feed-sized video', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tss-video-test-'));
  try {
    const input = { format: 'reel', template: 'question-debate', text: { category: 'CYPRUS / BUSINESS', headline: 'WHAT WOULD YOU TEST FIRST?', body: 'Define the customer. Test the offer. Question the assumptions.', question: 'What could a small pilot prove?' } };
    const { buffer } = await renderCreative(input), frame = path.join(dir, 'frame.png');
    await fs.writeFile(frame, buffer);
    const file = path.join(dir, 'reel.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', frame, '-t', '6', '-r', '24', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { timeout: 60000, stdio: ['ignore', 'ignore', 'pipe'] });
    const bytes = await fs.readFile(file), hash = sha256(bytes);
    const i = { asset: { sha256: hash, videoQA: { sha256: hash, width: 1080, height: 1920, codec: 'h264', pixelFormat: 'yuv420p', duration: 6, fullDecodePassed: true } }, review: { fullVideoInspected: true, videoRightsVerified: true, inspectedFrameTimes: [0,3,5.8] } };
    const evidence = await analyzeVideo(bytes, true);
    i.asset.pixelHash = evidence.pixelHash; i.asset.videoVisual = evidence.videoVisual;
    assert.equal((await inspectVideo(i, bytes)).height, 1920);
    const originalPixelHash = i.asset.pixelHash; i.asset.pixelHash = '0'.repeat(64);
    await assert.rejects(inspectVideo(i, bytes), /actual decoded frames/); i.asset.pixelHash = originalPixelHash;
    assert.ok((await verifyPublishedVideo(bytes, bytes, i)).checkedFrames >= 6);
    const recompressed = path.join(dir, 'recompressed.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', recompressed], { timeout: 60000, stdio: ['ignore', 'ignore', 'pipe'] });
    const actual = await fs.readFile(recompressed), historical = await analyzeVideo(actual);
    assert.notEqual(sha256(actual), hash);
    i.id = 'new-name'; i.creativeKey = 'new-hook';
    assert.throws(() => checkDuplicates(i, [{ id: 'old-video', date: new Date(Date.now() - 90 * 86400000).toISOString(), videoVisual: historical.videoVisual }]), /already used/);
    const badFile = path.join(dir, 'feed-as-reel.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', 'scale=1080:1350', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', badFile], { timeout: 60000, stdio: ['ignore', 'ignore', 'pipe'] });
    const bad = await fs.readFile(badFile); i.asset.sha256 = sha256(bad); i.asset.videoQA.sha256 = i.asset.sha256;
    await assert.rejects(inspectVideo(i, bad), /1080x1920/);
    await assert.rejects(verifyPublishedVideo(bytes, bad, i), /cropped/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
