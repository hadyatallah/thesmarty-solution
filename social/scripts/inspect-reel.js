import fs from 'node:fs/promises';
import { analyzeVideo } from '../lib/export-qa.js';
import { requireThat, sha256 } from '../lib/qa.js';

const file = process.argv[2], source = process.argv[3];
requireThat(file && source, 'Usage: node social/scripts/inspect-reel.js <queue.json> <dedicated.mp4>');
const item = JSON.parse(await fs.readFile(file, 'utf8'));
requireThat(item.format === 'reel' && item.creative?.format === 'reel', 'Dedicated Reel manifest required');
const bytes = await fs.readFile(source), hash = sha256(bytes);
const evidence = await analyzeVideo(bytes, true);
const assetPath = `social/assets/${hash}.mp4`;
await fs.mkdir('social/assets', { recursive: true });
await fs.writeFile(assetPath, bytes);
item.asset = { path: assetPath, sha256: hash, pixelHash: evidence.pixelHash, videoVisual: evidence.videoVisual, width: evidence.width, height: evidence.height, originFormat: 'reel', commit: null, videoQA: { sha256: hash, width: evidence.width, height: evidence.height, duration: evidence.duration, codec: evidence.codec, pixelFormat: evidence.pixelFormat, fullDecodePassed: true } };
item.status = 'draft';
delete item.review;
await fs.writeFile(file, JSON.stringify(item, null, 2) + '\n');
console.log(JSON.stringify({ assetPath, width: evidence.width, height: evidence.height, duration: evidence.duration, fullVideoAndRightsReviewRequired: true }));
