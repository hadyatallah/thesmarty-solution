import { authorized, processCommercialEnquiry } from '../lib/tssG5CommercialIntake.mjs';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' });
  }
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!authorized(token, process.env.TSS_G5_INTAKE_SECRET)) {
    return res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
  }
  try {
    const result = await processCommercialEnquiry(req.body || {});
    if (result.status === 'rejected') return res.status(400).json({ ok: false, code: 'INVALID_ENQUIRY', errors: result.errors });
    return res.status(result.status === 'ready_dry_run' ? 202 : 200).json({ ok: true, ...result });
  } catch (e) {
    const disabled = /^G5_NOT_CONFIGURED/.test(e.message) || e.message === 'G5_UNIQUE_PROPERTY_CONTRACT_MISSING';
    console.warn(JSON.stringify({
      component: 'tss-g5-commercial-intake',
      event: 'intake_failed',
      category: disabled ? 'configuration' : 'provider_uncertain',
      status: Number.isInteger(e.status) ? e.status : null
    }));
    return res.status(disabled ? 503 : 409).json({ ok: false, code: disabled ? 'NOT_CONFIGURED_OR_DISABLED' : 'REQUIRES_REVIEW' });
  }
}
