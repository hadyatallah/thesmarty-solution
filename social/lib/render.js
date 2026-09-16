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
  requireThat(input.compositionReady !== false, 'Draft needs its dedicated composition before export');
  if (input.designVersion === 2 && input.visualStyle === 'reference-checklist-editorial') return renderReferenceChecklistEditorial(input);
  if (input.designVersion === 2 && input.visualStyle === 'reference-data-editorial') return renderReferenceDataEditorial(input);
  if (input.designVersion === 2 && input.visualStyle === 'reference-integrated-editorial') return renderReferenceIntegratedEditorial(input);
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

// Practical checklist layout based on the user-selected TSS GDP reference.
// It keeps the same strong headline, compact right-hand facts and full-width
// landmark photograph, while replacing a numeric market claim with a short
// decision checklist for service and investor-readiness content.
async function renderReferenceChecklistEditorial(input) {
  requireThat(input.format === 'feed', 'Reference checklist editorial is currently approved for feed only');
  requireThat(input.template === 'place-opportunity', 'Reference checklist editorial requires the place/opportunity template');
  const width = 1080, height = 1350, top = 48, bottom = 1320;
  const colors = { ...C, cream: '#fbfaf6', white: '#ffffff' }, layers = [], regions = [];
  function svgLayer(svg, x = 0, y = 0) {
    layers.push({ input: Buffer.from(svg), left: x, top: y });
  }
  async function block(text, x, y, size, lineHeight, maxLines, color = C.navy, bold = true, w = 936, inverse = false) {
    const lines = await wrap(text, size, bold, w, maxLines);
    for (let i = 0; i < lines.length; i++) {
      const r = await textImage(lines[i], size, bold, color), yy = y + i * lineHeight;
      requireThat(x >= 48 && x + r.info.width <= 1032 && yy >= top && yy + r.info.height <= bottom, 'Text outside safe margins');
      layers.push({ input: r.data, left: x, top: yy });
      regions.push({ text: lines[i], x, y: yy, width: r.info.width, height: r.info.height, size, inverse });
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
  // Begin the photograph behind the lower editorial copy, then wash its upper
  // edge back to cream. This avoids a hard panel boundary and lets the palette
  // and landmark merge in the same way as the approved visual reference.
  const photoTop = 650;
  const photoTransition = { y: photoTop, height: 250, mode: 'cream-to-photo-fade' };
  const background = await oriented.resize(width, height - photoTop, { fit: 'cover', position: p.cropPosition || 'centre' }).modulate({ brightness: 0.92, saturation: 0.92 }).jpeg({ quality: 90 }).toBuffer();
  layers.push({ input: background, left: 0, top: photoTop });
  svgLayer(`<svg width="1080" height="250" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="merge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colors.cream}" stop-opacity="1"/><stop offset="0.22" stop-color="${colors.cream}" stop-opacity="0.96"/><stop offset="0.55" stop-color="${colors.cream}" stop-opacity="0.72"/><stop offset="0.82" stop-color="${colors.cream}" stop-opacity="0.24"/><stop offset="1" stop-color="${colors.cream}" stop-opacity="0"/></linearGradient></defs><rect width="1080" height="250" fill="url(#merge)"/></svg>`, 0, photoTop);
  svgLayer(`<svg width="1080" height="260" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#082746" stop-opacity="0.02"/><stop offset="0.32" stop-color="#082746" stop-opacity="0.35"/><stop offset="1" stop-color="#04182b" stop-opacity="0.96"/></linearGradient></defs><rect width="1080" height="260" fill="url(#shade)"/><rect y="105" width="1080" height="155" fill="#04182b" fill-opacity="0.9"/></svg>`, 0, 1090);

  const logo = await fs.readFile(path.join(ROOT, '..', 'logo-mark.png'));
  requireThat(sha256(logo) === LOGO_SHA, 'Logo bytes do not match the approved TSS mark');
  const logoImage = await sharp(logo).trim().resize({ width: 180 }).png().toBuffer({ resolveWithObject: true });
  const logoRegion = { x: 832, y: 46, width: logoImage.info.width, height: logoImage.info.height };
  layers.push({ input: logoImage.data, left: logoRegion.x, top: logoRegion.y });

  const t = input.text || {};
  await block(t.category, 60, 62, 20, 27, 1, C.slate, true, 470);
  const name = await textImage('The Smarty Solution', 21, false, C.navy);
  const tagline = await textImage('Connect · Develop · Invest', 15, false, C.slate);
  const nameX = 1012 - name.info.width, taglineX = 1012 - tagline.info.width;
  layers.push({ input: name.data, left: nameX, top: 124 });
  regions.push({ text: 'The Smarty Solution', x: nameX, y: 124, width: name.info.width, height: name.info.height, size: 21 });
  layers.push({ input: tagline.data, left: taglineX, top: 158 });
  regions.push({ text: 'Connect · Develop · Invest', x: taglineX, y: 158, width: tagline.info.width, height: tagline.info.height, size: 15 });

  let y = await block(t.headline, 60, 162, 51, 59, 3, C.navy, true, 520);
  y += 10;
  y = await block(t.metric, 60, y, 88, 98, 1, C.teal, true, 520);
  y = await block(t.metricLabel, 60, y - 3, 21, 28, 2, C.navy, true, 500);
  y += 18;
  await block(t.intro, 60, y, 22, 31, 3, C.navy, false, 500);

  async function fact(number, label, body, y0, accent) {
    svgLayer(`<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="31" fill="${accent}"/><text x="32" y="39" text-anchor="middle" font-family="DejaVu Sans" font-size="20" font-weight="700" fill="#fff">${number}</text></svg>`, 612, y0);
    await block(label, 702, y0, 20, 27, 1, C.navy, true, 316);
    await block(body, 702, y0 + 29, 16, 22, 3, C.navy, false, 316);
  }
  await fact('01', t.fact1Label, t.fact1Body, 230, C.teal);
  await fact('02', t.fact2Label, t.fact2Body, 348, C.navy);
  await fact('03', t.fact3Label, t.fact3Body, 466, C.teal);
  await fact('04', t.fact4Label, t.fact4Body, 584, C.navy);

  svgLayer(`<svg width="7" height="38" xmlns="http://www.w3.org/2000/svg"><rect width="7" height="38" rx="3.5" fill="${C.teal}"/></svg>`, 60, 712);
  await block(t.question, 84, 715, 20, 27, 1, C.navy, true, 920);

  await block(t.location, 60, 1190, 19, 26, 1, colors.white, true, 470, true);
  await block(t.source, 60, 1254, 15, 21, 1, colors.white, false, 580, true);
  const footerTagline = await textImage('CONNECT · DEVELOP · INVEST', 17, false, colors.white);
  const footerSite = await textImage('THESMARTYSOLUTION.COM', 18, true, colors.white);
  const footerTaglineX = 1020 - footerTagline.info.width, footerSiteX = 1020 - footerSite.info.width;
  layers.push({ input: footerTagline.data, left: footerTaglineX, top: 1190 });
  regions.push({ text: 'CONNECT · DEVELOP · INVEST', x: footerTaglineX, y: 1190, width: footerTagline.info.width, height: footerTagline.info.height, size: 17, inverse: true });
  layers.push({ input: footerSite.data, left: footerSiteX, top: 1254 });
  regions.push({ text: 'THESMARTYSOLUTION.COM', x: footerSiteX, y: 1254, width: footerSite.info.width, height: footerSite.info.height, size: 18, inverse: true });

  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    const a = regions[i], b = regions[j];
    requireThat(!(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y), 'Text regions overlap');
  }
  for (const r of regions) requireThat(!(r.x < logoRegion.x + logoRegion.width && r.x + r.width > logoRegion.x && r.y < logoRegion.y + logoRegion.height && r.y + r.height > logoRegion.y), 'Text overlaps the TSS logo');
  const buffer = await sharp({ create: { width, height, channels: 3, background: colors.cream } })
    .composite(layers)
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
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
      categoryRule: false,
      photoRegion: { x: 0, y: 780, width, height: 360 },
      photoTransition,
      safeArea: { left: 48, right: 1032, top, bottom }
    }
  };
}

// Data-led feed layout based on the approved TSS GDP reference. The upper
// section carries one clear figure and short supporting facts. Verified real
// photography runs full-width across the lower section, without UI cards.
async function renderReferenceDataEditorial(input) {
  requireThat(input.format === 'feed', 'Reference data editorial is currently approved for feed only');
  requireThat(input.template === 'insight-data', 'Reference data editorial requires the insight/data template');
  const width = 1080, height = 1350, top = 48, bottom = 1320;
  const colors = { ...C, cream: '#fbfaf6', white: '#ffffff' }, layers = [], regions = [];
  function svgLayer(svg, x = 0, y = 0) {
    layers.push({ input: Buffer.from(svg), left: x, top: y });
  }
  async function block(text, x, y, size, lineHeight, maxLines, color = C.navy, bold = true, w = 936) {
    const lines = await wrap(text, size, bold, w, maxLines);
    for (let i = 0; i < lines.length; i++) {
      const r = await textImage(lines[i], size, bold, color), yy = y + i * lineHeight;
      requireThat(x >= 48 && x + r.info.width <= 1032 && yy >= top && yy + r.info.height <= bottom, 'Text outside safe margins');
      layers.push({ input: r.data, left: x, top: yy });
      regions.push({ text: lines[i], x, y: yy, width: r.info.width, height: r.info.height, size, inverse: color === colors.white });
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
  const photoTop = 760;
  const photoTransition = { y: photoTop, height: 220, mode: 'cream-to-photo-fade' };
  const background = await oriented.resize(width, height - photoTop, { fit: 'cover', position: p.cropPosition || 'centre' }).modulate({ brightness: 0.94, saturation: 0.92 }).jpeg({ quality: 90 }).toBuffer();
  layers.push({ input: background, left: 0, top: photoTop });
  svgLayer(`<svg width="1080" height="220" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="merge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colors.cream}" stop-opacity="1"/><stop offset="0.2" stop-color="${colors.cream}" stop-opacity="0.97"/><stop offset="0.55" stop-color="${colors.cream}" stop-opacity="0.7"/><stop offset="0.82" stop-color="${colors.cream}" stop-opacity="0.2"/><stop offset="1" stop-color="${colors.cream}" stop-opacity="0"/></linearGradient></defs><rect width="1080" height="220" fill="url(#merge)"/></svg>`, 0, photoTop);
  svgLayer(`<svg width="1080" height="310" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#082746" stop-opacity="0.08"/><stop offset="0.38" stop-color="#082746" stop-opacity="0.48"/><stop offset="1" stop-color="#04182b" stop-opacity="0.96"/></linearGradient></defs><rect width="1080" height="310" fill="url(#shade)"/><rect y="110" width="1080" height="200" fill="#04182b" fill-opacity="0.9"/></svg>`, 0, 1040);

  const logo = await fs.readFile(path.join(ROOT, '..', 'logo-mark.png'));
  requireThat(sha256(logo) === LOGO_SHA, 'Logo bytes do not match the approved TSS mark');
  const logoImage = await sharp(logo).trim().resize({ width: 180 }).png().toBuffer({ resolveWithObject: true });
  const logoRegion = { x: 832, y: 46, width: logoImage.info.width, height: logoImage.info.height };
  layers.push({ input: logoImage.data, left: logoRegion.x, top: logoRegion.y });

  const t = input.text || {};
  await block(t.category, 60, 62, 20, 27, 1, C.slate, true, 470);
  const name = await textImage('The Smarty Solution', 21, false, C.navy);
  const tagline = await textImage('Connect · Develop · Invest', 15, false, C.slate);
  const nameX = 1012 - name.info.width, taglineX = 1012 - tagline.info.width;
  layers.push({ input: name.data, left: nameX, top: 124 });
  regions.push({ text: 'The Smarty Solution', x: nameX, y: 124, width: name.info.width, height: name.info.height, size: 21 });
  layers.push({ input: tagline.data, left: taglineX, top: 158 });
  regions.push({ text: 'Connect · Develop · Invest', x: taglineX, y: 158, width: tagline.info.width, height: tagline.info.height, size: 15 });

  let y = await block(t.headline, 60, 162, 52, 60, 3, C.navy, true, 530);
  y += 12;
  y = await block(t.metric, 60, y, 112, 120, 1, C.teal, true, 520);
  y = await block(t.metricLabel, 60, y - 4, 21, 28, 2, C.navy, true, 500);
  y += 18;
  await block(t.body, 60, y, 23, 32, 3, C.navy, false, 500);

  async function fact(icon, label, body, y0) {
    const symbols = {
      receipt: '<path d="M24 16h26v40l-5-4-4 4-4-4-4 4-4-4-5 4z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M30 27h14M30 36h14" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
      percent: '<circle cx="27" cy="27" r="6" fill="#fff"/><circle cx="45" cy="45" r="6" fill="#fff"/><path d="M25 49L47 23" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
      people: '<circle cx="29" cy="27" r="8" fill="none" stroke="#fff" stroke-width="4"/><circle cx="47" cy="30" r="6" fill="none" stroke="#fff" stroke-width="4"/><path d="M15 53c2-10 8-15 15-15s13 5 15 15M41 42c8 0 13 4 15 12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
      evidence: '<path d="M18 18h36v38H18z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M26 29h20M26 38h20M26 47h12" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="51" cy="50" r="8" fill="#082746" stroke="#fff" stroke-width="4"/><path d="M57 56l6 6" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'
    };
    const symbol = symbols[icon];
    requireThat(symbol, 'Unknown reference-data fact icon');
    svgLayer(`<svg width="72" height="72" xmlns="http://www.w3.org/2000/svg"><circle cx="36" cy="36" r="35" fill="${C.navy}"/>${symbol}</svg>`, 614, y0);
    await block(label, 714, y0 + 3, 21, 28, 1, C.navy, true, 300);
    await block(body, 714, y0 + 34, 18, 25, 4, C.navy, false, 300);
  }
  await fact(t.fact1Icon || 'receipt', t.fact1Label, t.fact1Body, 272);
  await fact(t.fact2Icon || 'percent', t.fact2Label, t.fact2Body, 474);

  svgLayer(`<svg width="7" height="38" xmlns="http://www.w3.org/2000/svg"><rect width="7" height="38" rx="3.5" fill="${C.teal}"/></svg>`, 60, 733);
  await block(t.question, 84, 736, 20, 27, 1, C.navy, true, 920);

  await block(t.location, 60, 1190, 20, 27, 1, colors.white, true, 470);
  await block(t.source, 60, 1260, 16, 22, 1, colors.white, false, 540);
  const footerTagline = await textImage('CONNECT · DEVELOP · INVEST', 17, false, colors.white);
  const footerSite = await textImage('THESMARTYSOLUTION.COM', 18, true, colors.white);
  const footerTaglineX = 1020 - footerTagline.info.width, footerSiteX = 1020 - footerSite.info.width;
  layers.push({ input: footerTagline.data, left: footerTaglineX, top: 1190 });
  regions.push({ text: 'CONNECT · DEVELOP · INVEST', x: footerTaglineX, y: 1190, width: footerTagline.info.width, height: footerTagline.info.height, size: 17, inverse: true });
  layers.push({ input: footerSite.data, left: footerSiteX, top: 1261 });
  regions.push({ text: 'THESMARTYSOLUTION.COM', x: footerSiteX, y: 1261, width: footerSite.info.width, height: footerSite.info.height, size: 18, inverse: true });

  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    const a = regions[i], b = regions[j];
    requireThat(!(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y), 'Text regions overlap');
  }
  for (const r of regions) requireThat(!(r.x < logoRegion.x + logoRegion.width && r.x + r.width > logoRegion.x && r.y < logoRegion.y + logoRegion.height && r.y + r.height > logoRegion.y), 'Text overlaps the TSS logo');
  const buffer = await sharp({ create: { width, height, channels: 3, background: colors.cream } })
    .composite(layers)
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
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
      categoryRule: false,
      photoRegion: { x: 0, y: 820, width, height: 330 },
      photoTransition,
      safeArea: { left: 48, right: 1032, top, bottom }
    }
  };
}

// Image-led editorial layout based on the approved September 2026 references.
// The photograph remains full-frame. A borderless tonal fade creates natural
// negative space for the copy without turning the design into a UI card.
async function renderReferenceIntegratedEditorial(input) {
  requireThat(input.format === 'feed', 'Reference integrated editorial is currently approved for feed only');
  requireThat(input.template === 'question-debate', 'Reference integrated editorial requires the question/debate template');
  const width = 1080, height = 1350, top = 48, bottom = 1302;
  const colors = { ...C, cream: '#fbf8f1' }, layers = [], regions = [];
  function svgLayer(svg, x = 0, y = 0) {
    layers.push({ input: Buffer.from(svg), left: x, top: y });
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
  svgLayer(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf8f1" stop-opacity="0.78"/><stop offset="1" stop-color="#fbf8f1" stop-opacity="0"/></linearGradient><linearGradient id="bottom" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fbf8f1" stop-opacity="0.99"/><stop offset="0.45" stop-color="#fbf8f1" stop-opacity="0.96"/><stop offset="0.75" stop-color="#fbf8f1" stop-opacity="0.8"/><stop offset="1" stop-color="#fbf8f1" stop-opacity="0.08"/></linearGradient></defs><rect width="1080" height="250" fill="url(#top)"/><rect y="350" width="1080" height="1000" fill="url(#bottom)"/></svg>`);

  const logo = await fs.readFile(path.join(ROOT, '..', 'logo-mark.png'));
  requireThat(sha256(logo) === LOGO_SHA, 'Logo bytes do not match the approved TSS mark');
  const logoImage = await sharp(logo).trim().resize({ width: 138 }).png().toBuffer({ resolveWithObject: true });
  const logoRegion = { x: 842, y: 62, width: logoImage.info.width, height: logoImage.info.height };
  layers.push({ input: logoImage.data, left: logoRegion.x, top: logoRegion.y });

  const t = input.text || {};
  await block('The Smarty Solution', 72, 62, 23, 30, 1, C.navy, true, 430);
  await block(t.category, 72, 628, 20, 27, 1, C.teal, true, 850);
  svgLayer(`<svg width="172" height="12" xmlns="http://www.w3.org/2000/svg"><path d="M3 7 C46 2, 104 11, 169 4" fill="none" stroke="${C.teal}" stroke-width="7" stroke-linecap="round"/></svg>`, 72, 666);
  let y = 696;
  y = await block(t.headline, 72, y, 57, 68, 3, C.navy, true, 914) + 8;
  if (t.highlight) y = await block(t.highlight, 72, y, 65, 74, 1, C.teal, true, 914) + 14;
  if (t.body) y = await block(t.body, 72, y, 27, 38, 3, C.navy, false, 914) + 20;
  if (t.question) {
    svgLayer(`<svg width="8" height="34" xmlns="http://www.w3.org/2000/svg"><rect width="8" height="34" rx="4" fill="${C.teal}"/></svg>`, 72, y + 1);
    await block(t.question, 98, y, 23, 30, 1, C.navy, true, 875);
    y += 58;
  }
  requireThat(y <= 1172, 'Copy overlaps the footer. Shorten it before exporting');
  svgLayer(`<svg width="936" height="2" xmlns="http://www.w3.org/2000/svg"><rect width="936" height="2" fill="${C.navy}" fill-opacity="0.24"/></svg>`, 72, 1188);
  await block(t.location, 72, 1210, 18, 25, 1, C.slate, true, 520);
  await block(t.source, 72, 1246, 16, 23, 1, C.slate, false, 610);
  const website = await textImage('THESMARTYSOLUTION.COM', 18, true, C.navy);
  const websiteX = 1008 - website.info.width;
  layers.push({ input: website.data, left: websiteX, top: 1246 });
  regions.push({ text: 'THESMARTYSOLUTION.COM', x: websiteX, y: 1246, width: website.info.width, height: website.info.height, size: 18 });

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
      photoRegion: { x: 250, y: 170, width: 758, height: 430 },
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
  const projected = await oriented.resize(width, photoHeight, { fit: 'cover', position: p.cropPosition || 'centre' }).png().toBuffer();
  layers.push({ input: projected, left: 0, top: photoTop });
  const fadeHeight = 160, bottomFadeHeight = 80;
  layers.push({ input: Buffer.from(`<svg width="${width}" height="${photoHeight}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="photo-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colors.cream}" stop-opacity="1"/><stop offset="0.35" stop-color="${colors.cream}" stop-opacity="0.86"/><stop offset="1" stop-color="${colors.cream}" stop-opacity="0"/></linearGradient><linearGradient id="photo-out" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colors.cream}" stop-opacity="0"/><stop offset="1" stop-color="${colors.cream}" stop-opacity="1"/></linearGradient></defs><rect width="${width}" height="${fadeHeight}" fill="url(#photo-in)"/><rect y="${photoHeight - bottomFadeHeight}" width="${width}" height="${bottomFadeHeight}" fill="url(#photo-out)"/></svg>`), left: 0, top: photoTop });
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
  return { buffer, layout: { designVersion: 2, format: input.format, width, height, textRegions: regions, logoSha256: LOGO_SHA, logoRegion, photoSha256, palette: colors, categoryRule: false, photoTransition: { y: photoTop, height: fadeHeight, mode: 'cream-to-photo-fade' }, photoRegion: { x: 0, y: photoTop + fadeHeight, width, height: photoHeight - fadeHeight - bottomFadeHeight }, safeArea: { left: 72, right: 1008, top, bottom } } };
}
