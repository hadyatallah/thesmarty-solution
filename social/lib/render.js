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
  if (input.designVersion === 2 && input.visualStyle === 'reference-photo-editorial') return renderReferencePhotoEditorial(input);
  if (input.designVersion === 2) return renderLandmarkCreative(input);
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

// Photo-led editorial layout based on the approved September 2026 references.
// It keeps the landmark dominant while placing all copy on opaque editorial
// cards so the photograph and text remain independently legible.
async function renderReferencePhotoEditorial(input) {
  requireThat(input.format === 'feed', 'Reference photo editorial is currently approved for feed only');
  requireThat(input.template === 'question-debate', 'Reference photo editorial requires the question/debate template');
  const width = 1080, height = 1350, top = 48, bottom = 1302;
  const colors = { ...C, cream: '#fbf8f1', sky: '#e5f0f2' }, layers = [], regions = [];
  function svgLayer(svg, x = 0, y = 0) {
    layers.push({ input: Buffer.from(svg), left: x, top: y });
  }
  function roundedBox(x, y, w, h, radius, color, opacity = 1) {
    svgLayer(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" rx="${radius}" fill="${color}" fill-opacity="${opacity}"/></svg>`, x, y);
  }
  async function block(text, x, y, size, lineHeight, maxLines, color = C.navy, bold = true, w = 904) {
    const lines = await wrap(text, size, bold, w, maxLines);
    for (let i = 0; i < lines.length; i++) {
      const r = await textImage(lines[i], size, bold, color), yy = y + i * lineHeight;
      requireThat(x >= 72 && x + r.info.width <= 1008 && yy >= top && yy + r.info.height <= bottom, 'Text outside safe margins');
      layers.push({ input: r.data, left: x, top: yy });
      regions.push({ text: lines[i], x, y: yy, width: r.info.width, height: r.info.height, size });
    }
    return y + lines.length * lineHeight;
  }

  const catalog = JSON.parse(await fs.readFile(path.join(ROOT, 'photo-catalog.json'), 'utf8')), p = catalog.photos[input.photoKey];
  requireThat(p?.approved === true && p.republicControlled === true && p.evidenceUrl && p.reviewNote && p.licence && p.licenceUrl, 'Photograph lacks geographic or rights QA');
  requireThat(/^[a-zA-Z0-9._/-]+$/.test(p.path) && !p.path.includes('..'), 'Invalid photo path');
  const photo = await fs.readFile(path.join(ROOT, '..', p.path)), photoSha256 = sha256(photo);
  requireThat(photoSha256 === p.sha256, 'Approved photograph changed');
  const oriented = sharp(photo, { failOn: 'warning' }).rotate(), stats = await oriented.stats();
  requireThat(stats.entropy > 1 && stats.channels.some(c => c.stdev > 12), 'Blank or failed photograph');
  const background = await oriented.resize(width, height, { fit: 'cover', position: p.cropPosition || 'centre' }).modulate({ brightness: 0.94, saturation: 0.9 }).png().toBuffer();
  layers.push({ input: background, left: 0, top: 0 });
  svgLayer(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#082746" stop-opacity="0.12"/><stop offset="0.47" stop-color="#082746" stop-opacity="0.02"/><stop offset="1" stop-color="#082746" stop-opacity="0.2"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/></svg>`);

  roundedBox(48, 48, 984, 142, 28, colors.cream, 0.97);
  roundedBox(48, 625, 984, 677, 34, colors.cream, 0.975);

  const logo = await fs.readFile(path.join(ROOT, '..', 'logo-mark.png'));
  requireThat(sha256(logo) === LOGO_SHA, 'Logo bytes do not match the approved TSS mark');
  const logoImage = await sharp(logo).trim().resize({ width: 142 }).png().toBuffer({ resolveWithObject: true });
  const logoRegion = { x: 850, y: 72, width: logoImage.info.width, height: logoImage.info.height };
  layers.push({ input: logoImage.data, left: logoRegion.x, top: logoRegion.y });

  const t = input.text || {};
  await block('The Smarty Solution', 78, 78, 25, 31, 1, C.navy, true, 430);
  await block('Connect · Develop · Invest', 78, 122, 18, 24, 1, C.slate, false, 430);
  await block(t.category, 78, 658, 19, 26, 1, C.teal, true, 820);
  svgLayer(`<svg width="150" height="12" xmlns="http://www.w3.org/2000/svg"><path d="M3 7 C40 2, 92 11, 147 4" fill="none" stroke="${C.teal}" stroke-width="7" stroke-linecap="round"/></svg>`, 78, 696);
  let y = 726;
  y = await block(t.headline, 78, y, 58, 69, 4, C.navy, true, 904) + 18;
  if (t.body) y = await block(t.body, 78, y, 27, 38, 3, C.navy, false, 904) + 24;
  if (t.question) {
    roundedBox(78, y, 904, 74, 18, colors.sky, 1);
    svgLayer(`<svg width="8" height="42" xmlns="http://www.w3.org/2000/svg"><rect width="8" height="42" rx="4" fill="${C.teal}"/></svg>`, 98, y + 16);
    await block(t.question, 126, y + 21, 24, 31, 1, C.navy, true, 830);
    y += 96;
  }
  requireThat(y <= 1178, 'Copy overlaps the footer. Shorten it before exporting');
  await block(t.location, 78, 1194, 18, 25, 1, C.slate, true, 520);
  await block(t.source, 78, 1230, 16, 23, 1, C.slate, false, 610);
  const website = await textImage('THESMARTYSOLUTION.COM', 18, true, C.navy);
  const websiteX = 982 - website.info.width;
  layers.push({ input: website.data, left: websiteX, top: 1230 });
  regions.push({ text: 'THESMARTYSOLUTION.COM', x: websiteX, y: 1230, width: website.info.width, height: website.info.height, size: 18 });

  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    const a = regions[i], b = regions[j];
    requireThat(!(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y), 'Text regions overlap');
  }
  for (const r of regions) requireThat(!(r.x < logoRegion.x + logoRegion.width && r.x + r.width > logoRegion.x && r.y < logoRegion.y + logoRegion.height && r.y + r.height > logoRegion.y), 'Text overlaps the TSS logo');
  const buffer = await sharp({ create: { width, height, channels: 3, background: colors.cream } })
    .composite(layers)
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();
  return {
    buffer,
    layout: {
      designVersion: 2,
      visualStyle: input.visualStyle,
      format: input.format,
      width,
      height,
      textRegions: regions,
      logoSha256: LOGO_SHA,
      logoRegion,
      photoSha256,
      palette: colors,
      photoRegion: { x: 0, y: 190, width: 1080, height: 435 },
      safeArea: { left: 72, right: 1008, top, bottom }
    }
  };
}

// The same renderer and template family now support the approved photo-led
// references. Legacy diagnostic exports retain their existing rendering.
async function renderLandmarkCreative(input) {
  requireThat(['feed', 'story', 'reel'].includes(input.format), 'Explicit format is required');
  requireThat(['insight-data', 'question-debate', 'place-opportunity'].includes(input.template), 'Unknown template');
  const width = 1080, height = input.format === 'feed' ? 1350 : 1920, vertical = input.format !== 'feed';
  const top = vertical ? 220 : 64, bottom = vertical ? 1620 : 1298;
  const photoTop = vertical ? 1040 : 720, photoHeight = vertical ? 430 : 455;
  const colors = { ...C, cream: '#faf8f3', sky: '#e9f1f7' }, layers = [], regions = [];
  function box(x, y, w, h, color) {
    layers.push({ input: Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="${color}"/></svg>`), left: x, top: y });
  }
  async function block(text, x, y, size, lineHeight, maxLines, color = C.navy, bold = true, w = 936) {
    const lines = await wrap(text, size, bold, w, maxLines);
    for (let i = 0; i < lines.length; i++) {
      const r = await textImage(lines[i], size, bold, color), yy = y + i * lineHeight;
      requireThat(x >= 72 && x + r.info.width <= 1008 && yy >= top && yy + r.info.height <= bottom, 'Text outside safe margins');
      layers.push({ input: r.data, left: x, top: yy });
      regions.push({ text: lines[i], x, y: yy, width: r.info.width, height: r.info.height, size });
    }
    return y + lines.length * lineHeight;
  }
  const logo = await fs.readFile(path.join(ROOT, '..', 'logo-mark.png'));
  requireThat(sha256(logo) === LOGO_SHA, 'Logo bytes do not match the approved TSS mark');
  const logoImage = await sharp(logo).trim().resize({ width: 230 }).png().toBuffer({ resolveWithObject: true });
  const logoRegion = { x: 774, y: top, width: logoImage.info.width, height: logoImage.info.height };
  layers.push({ input: logoImage.data, left: logoRegion.x, top });
  const name = await textImage('The Smarty Solution', 24, false, C.navy), tagline = await textImage('Connect · Develop · Invest', 18, false, C.slate);
  await block('The Smarty Solution', 1008 - name.info.width, top + 104, 24, 30, 1, C.navy, false, 300);
  await block('Connect · Develop · Invest', 1008 - tagline.info.width, top + 144, 18, 25, 1, C.slate, false, 280);
  const t = input.text || {};
  await block(t.category, 72, top + 18, 20, 27, 1, C.slate, true, 560);
  box(72, top + 61, 534, 2, C.navy);
  let y = top + 178;
  y = await block(t.headline, 72, y, 62, 74, 3) + 22;
  if (t.highlight) y = await block(t.highlight, 72, y, 68, 80, 2, C.teal) + 20;
  if (t.body) y = await block(t.body, 72, y, 28, 38, 3, C.navy, false) + 22;
  if (t.question) { box(72, y, 7, 34, C.teal); y = await block(t.question, 97, y, 26, 35, 2, C.navy, true, 910); }
  requireThat(y <= photoTop - 24, 'Copy overlaps the photo. Shorten it before exporting');
  const catalog = JSON.parse(await fs.readFile(path.join(ROOT, 'photo-catalog.json'), 'utf8')), p = catalog.photos[input.photoKey];
  requireThat(p?.approved === true && p.republicControlled === true && p.evidenceUrl && p.reviewNote && p.licence && p.licenceUrl, 'Photograph lacks geographic or rights QA');
  requireThat(/^[a-zA-Z0-9._/-]+$/.test(p.path) && !p.path.includes('..'), 'Invalid photo path');
  const photo = await fs.readFile(path.join(ROOT, '..', p.path)), photoSha256 = sha256(photo);
  requireThat(photoSha256 === p.sha256, 'Approved photograph changed');
  const oriented = sharp(photo, { failOn: 'warning' }).rotate(), stats = await oriented.stats();
  requireThat(stats.entropy > 1 && stats.channels.some(c => c.stdev > 12), 'Blank or failed photograph');
  const projected = await oriented.resize(936, photoHeight, { fit: 'cover', position: p.cropPosition || 'centre' }).png().toBuffer();
  layers.push({ input: projected, left: 72, top: photoTop });
  await block(t.location, 72, photoTop + photoHeight + 18, 20, 27, 1, C.slate, true);
  await block(t.source, 72, photoTop + photoHeight + 57, 18, 25, 2, C.slate, false);
  await block('THESMARTYSOLUTION.COM', 72, bottom - 28, 20, 28, 1, C.navy, true);
  box(610, bottom - 20, 398, 2, C.teal);
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    const a = regions[i], b = regions[j];
    requireThat(!(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y), 'Text regions overlap');
  }
  for (const r of regions) requireThat(!(r.x < logoRegion.x + logoRegion.width && r.x + r.width > logoRegion.x && r.y < logoRegion.y + logoRegion.height && r.y + r.height > logoRegion.y), 'Text overlaps the TSS logo');
  const buffer = await sharp({ create: { width, height, channels: 3, background: colors.cream } }).composite(layers).png().toBuffer();
  return { buffer, layout: { designVersion: 2, format: input.format, width, height, textRegions: regions, logoSha256: LOGO_SHA, logoRegion, photoSha256, palette: colors, photoRegion: { x: 72, y: photoTop, width: 936, height: photoHeight }, safeArea: { left: 72, right: 1008, top, bottom } } };
}
