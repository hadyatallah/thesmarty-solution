import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { cleanText, LOGO_SHA, requireThat, sha256 } from './qa.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const resolve = createRequire(import.meta.url).resolve;
const FONTS = { regular: resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'), bold: resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf') };
const C = { cream: '#f6f1e8', navy: '#082746', teal: '#14848b', slate: '#456f8a', pale: '#e6eef1' };
const esc = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
async function textImage(text, size, bold, color) {
  cleanText(text);
  requireThat(/^[\x20-\x7E\n·’“”↔]+$/.test(text), 'Creative text must use the approved English glyph set');
  return sharp({ text: { text: `<span foreground="${color}">${esc(text)}</span>`, font: `DejaVu Sans ${bold ? 'Bold ' : ''}${size}`, fontfile: bold ? FONTS.bold : FONTS.regular, rgba: true, dpi: 72 } }).png().toBuffer({ resolveWithObject: true });
}
async function wrap(text, size, bold, width, maxLines) {
  const words = cleanText(text).trim().split(/\s+/), lines = [];
  let line = '';
  for (const word of words) {
    requireThat((await textImage(word, size, bold, C.navy)).info.width <= width, 'A word exceeds its text region');
    const next = line ? `${line} ${word}` : word;
    if ((await textImage(next, size, bold, C.navy)).info.width > width) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  requireThat(lines.length <= maxLines, 'Copy is too long. Shorten it before rendering');
  return lines;
}
export async function renderCreative(input) {
  const format = input.format;
  requireThat(['feed', 'story', 'reel'].includes(format), 'Explicit format is required');
  const width = 1080, height = format === 'feed' ? 1350 : 1920;
  requireThat(['insight-data', 'question-debate', 'place-opportunity'].includes(input.template), 'Unknown template');
  const vertical = format !== 'feed', top = vertical ? 220 : 72, bottom = vertical ? 1620 : 1285;
  const layers = [], regions = [];
  function box(x, y, w, h, color) {
    layers.push({ input: Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="${color}"/></svg>`), left: x, top: y });
  }
  async function block(text, x, y, size, lineHeight, maxLines, color = C.navy, bold = true, w = 936) {
    const lines = await wrap(text, size, bold, w, maxLines);
    let end = y;
    for (let i = 0; i < lines.length; i++) {
      const result = await textImage(lines[i], size, bold, color), yy = y + i * lineHeight;
      requireThat(x >= 72 && x + result.info.width <= 1008 && yy >= top && yy + result.info.height <= bottom, 'Text outside safe margins');
      layers.push({ input: result.data, left: x, top: yy });
      regions.push({ text: lines[i], x, y: yy, width: result.info.width, height: result.info.height, size });
      end = yy + lineHeight;
    }
    return end;
  }
  const logo = await fs.readFile(path.join(ROOT, '..', 'logo-mark.png'));
  requireThat(sha256(logo) === LOGO_SHA, 'Logo bytes do not match the approved TSS mark');
  layers.push({ input: await sharp(logo).trim().resize({ width: 146 }).png().toBuffer(), left: 860, top });
  const t = input.text || {};
  await block(t.category, 72, top + 10, 22, 28, 1, C.slate, true, 720);
  box(72, top + 104, 936, 2, C.navy);
  let y = top + (vertical ? 195 : 170), photoSha256 = null;
  if (input.template === 'place-opportunity') {
    requireThat(input.photoKey, 'Photo template has no approved photograph');
    const catalog = JSON.parse(await fs.readFile(path.join(ROOT, 'photo-catalog.json'), 'utf8')), p = catalog.photos[input.photoKey];
    requireThat(p?.approved === true && p.republicControlled === true && p.evidenceUrl && p.reviewNote, 'Photograph has not passed geographic QA');
    requireThat(/^[a-zA-Z0-9._/-]+$/.test(p.path) && !p.path.includes('..'), 'Invalid photo path');
    const photo = await fs.readFile(path.join(ROOT, '..', p.path));
    photoSha256 = sha256(photo);
    requireThat(photoSha256 === p.sha256, 'Approved photograph changed');
    const stats = await sharp(photo).stats();
    requireThat(stats.entropy > 1 && stats.channels.some(c => c.stdev > 12), 'Blank or failed photograph');
    const photoHeight = vertical ? 490 : 360;
    layers.push({ input: await sharp(photo).resize(936, photoHeight, { fit: 'cover' }).png().toBuffer(), left: 72, top: y });
    y += photoHeight + 40;
  }
  const titleSize = input.template === 'place-opportunity' ? 48 : 64;
  y = await block(t.headline, 72, y, titleSize, titleSize + 12, input.template === 'place-opportunity' ? 3 : 4) + 30;
  if (t.body) y = await block(t.body, 72, y, 30, 42, 4, C.navy, false) + 30;
  if (t.question) {
    const qLines = await wrap(t.question, 34, true, 880, 3), qHeight = qLines.length * 46 + 42;
    requireThat(y + qHeight < bottom - 110, 'Question would overlap the footer');
    box(72, y, 936, qHeight, C.pale); box(72, y, 8, qHeight, C.teal);
    await block(t.question, 100, y + 22, 34, 46, 3, C.navy, true, 880);
  }
  const footerY = bottom - 57;
  box(72, footerY - 26, 936, 2, C.navy);
  await block('CONNECT · DEVELOP · INVEST', 72, footerY, 22, 28, 1, C.slate, false);
  const footer = await textImage('THE SMARTY SOLUTION', 20, true, C.navy);
  layers.push({ input: footer.data, left: 1008 - footer.info.width, top: footerY });
  regions.push({ text: 'THE SMARTY SOLUTION', x: 1008 - footer.info.width, y: footerY, width: footer.info.width, height: footer.info.height, size: 20 });
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    const a = regions[i], b = regions[j];
    requireThat(!(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y), 'Text regions overlap');
  }
  const buffer = await sharp({ create: { width, height, channels: 3, background: C.cream } }).composite(layers).png().toBuffer();
  return { buffer, layout: { format, width, height, textRegions: regions, logoSha256: LOGO_SHA, photoSha256, palette: C, safeArea: { left: 72, right: 1008, top, bottom } } };
}
