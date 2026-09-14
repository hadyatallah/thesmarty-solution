import { renderCreative } from '../social/lib/render.js';

// Preview only. Publishing uses immutable, inspected exports.
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).send('Method not allowed'); }
  try {
    const q = req.query || {};
    const result = await renderCreative({ format: q.format || 'feed', template: q.template, photoKey: q.photoKey, text: { category: q.category, headline: [q.headline, q.subheadline].filter(Boolean).join(' '), body: q.body, question: q.callout } });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-TSS-Design-System', '2');
    res.setHeader('X-TSS-Canvas', `${result.layout.width}x${result.layout.height}`);
    return res.status(200).send(result.buffer);
  } catch {
    return res.status(422).json({ ok: false, error: 'Creative rejected. Check format, copy length and approved photography.' });
  }
}
