import sharp from 'sharp';

const WIDTH = 1080;
const HEIGHT = 1350;

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function lines(value, max = 34, maxLines = 4) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  const out = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      out.push(current);
      current = word;
      if (out.length >= maxLines - 1) break;
    } else {
      current = next;
    }
  }
  if (current && out.length < maxLines) out.push(current);
  return out.slice(0, maxLines);
}

function textBlock(items, x, y, size, lineHeight, fill, weight = 700) {
  return items.map((line, i) => `<text x="${x}" y="${y + i * lineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(line)}</text>`).join('');
}

async function fetchImageData(url) {
  if (!url || !/^https:\/\//i.test(url)) return null;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Photo fetch failed: HTTP ${response.status}`);
  const type = response.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${type};base64,${buffer.toString('base64')}`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).send('Method not allowed');
    }

    const q = req.query || {};
    const template = q.template || 'place-opportunity';
    const category = q.category || 'SMARTY INSIGHT / CYPRUS';
    const headline = q.headline || 'LARNACA';
    const subheadline = q.subheadline || 'WHY INVESTORS SHOULD LOOK CLOSER';
    const body = q.body || 'Connectivity, infrastructure and development momentum are changing the investment conversation.';
    const callout = q.callout || 'WHAT WOULD MAKE YOU INVEST EARLY?';
    const location = q.location || 'LARNACA, CYPRUS';
    const credit = q.credit || '';
    const photo = q.photo || '';

    const headlineLines = lines(headline, 18, 2);
    const subLines = lines(subheadline, 25, 3);
    const bodyLines = lines(body, 47, 5);
    const calloutLines = lines(callout, 30, 3);

    let photoData = null;
    if (template === 'place-opportunity' && photo) {
      photoData = await fetchImageData(photo);
    }

    const NAVY = '#082746';
    const BLUE = '#5b8cab';
    const TEAL = '#21a6ad';
    const CREAM = '#f6f1e8';
    const PALE = '#e6eef1';

    const imagePanel = photoData
      ? `<defs><clipPath id="photoClip"><rect x="545" y="190" width="485" height="1000" rx="28" ry="28"/></clipPath></defs>
         <image href="${photoData}" x="545" y="190" width="485" height="1000" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)"/>
         <rect x="545" y="190" width="485" height="1000" rx="28" ry="28" fill="none" stroke="${NAVY}" stroke-width="2" opacity="0.18"/>`
      : `<rect x="545" y="190" width="485" height="1000" rx="28" ry="28" fill="${PALE}"/>
         <circle cx="790" cy="660" r="170" fill="${BLUE}" opacity="0.16"/>
         <circle cx="790" cy="660" r="105" fill="${TEAL}" opacity="0.18"/>`;

    const svg = `
      <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="1080" height="1350" fill="${CREAM}"/>
        <rect x="48" y="40" width="984" height="2" fill="${NAVY}"/>
        <text x="48" y="82" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="600" letter-spacing="4" fill="${NAVY}">${esc(category)}</text>
        <line x1="470" y1="76" x2="695" y2="76" stroke="${NAVY}" stroke-width="2"/>
        <text x="850" y="82" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="800" fill="${NAVY}">TSS</text>
        <rect x="895" y="55" width="34" height="8" fill="${TEAL}"/>
        <text x="818" y="110" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="600" fill="${NAVY}">THE SMARTY SOLUTION</text>

        ${textBlock(headlineLines, 48, 210, 82, 82, NAVY, 800)}
        ${textBlock(subLines, 48, 380, 40, 46, BLUE, 800)}
        ${textBlock(bodyLines, 50, 560, 24, 34, NAVY, 400)}

        <rect x="48" y="820" width="450" height="230" rx="26" ry="26" fill="${PALE}"/>
        <rect x="48" y="820" width="12" height="230" rx="6" ry="6" fill="${TEAL}"/>
        <text x="82" y="866" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" letter-spacing="2" fill="${BLUE}">SMARTY QUESTION</text>
        ${textBlock(calloutLines, 82, 925, 34, 42, NAVY, 800)}

        ${imagePanel}

        <rect x="48" y="1210" width="984" height="2" fill="${NAVY}"/>
        <text x="48" y="1260" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" letter-spacing="3" fill="${NAVY}">THE SMARTY SOLUTION · CONNECT · DEVELOP · INVEST</text>
        <text x="780" y="1260" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="600" fill="${NAVY}">${esc(location)}</text>
        ${credit ? `<text x="48" y="1305" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="${NAVY}" opacity="0.65">${esc(credit)}</text>` : ''}
      </svg>`;

    const png = await sharp(Buffer.from(svg))
      .png({ quality: 95, compressionLevel: 8 })
      .toBuffer();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.setHeader('X-TSS-Design-System', '1');
    res.setHeader('X-TSS-Canvas', '1080x1350');
    return res.status(200).send(png);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message || 'Creative rendering failed' });
  }
}
