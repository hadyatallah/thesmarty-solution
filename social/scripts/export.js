import fs from 'node:fs/promises';
import { renderCreative } from '../lib/render.js';
import { imageFingerprint, requireThat, sha256 } from '../lib/qa.js';

const input = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
requireThat(['feed', 'story'].includes(input.creative.format), 'Reels need a dedicated inspected MP4, not a still-image export');
const { buffer, layout } = await renderCreative(input.creative);
const hash = sha256(buffer), file = `social/assets/${hash}.png`;
await fs.mkdir('social/assets', { recursive: true });
await fs.writeFile(file, buffer);
const layoutText = JSON.stringify(layout, null, 2) + '\n';
await fs.writeFile(`${file}.layout.json`, layoutText);
input.asset = { path: file, sha256: hash, pixelHash: await imageFingerprint(buffer), layoutSha256: sha256(layoutText), width: layout.width, height: layout.height, originFormat: input.creative.format, commit: null };
input.creative.logoSha256 = layout.logoSha256;
input.status = 'draft';
delete input.review;
await fs.writeFile(process.argv[2], JSON.stringify(input, null, 2) + '\n');
console.log(JSON.stringify({ file, dimensions: `${layout.width}x${layout.height}`, reviewRequired: true }));
