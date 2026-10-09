// Private TSS-to-HubSpot bridge endpoint. Disabled unless explicitly configured.
import { timingSafeEqual } from 'node:crypto';
import { runSync } from './tssHubspotEnquirySync.mjs';

function authorized(candidate, secret) {
  if (!candidate || !secret) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const cron = req.method === 'GET';
  if (!cron && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ status: 'method_not_allowed' });
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  // GET reserved for a future Vercel Cron invocation (not scheduled by this change).
  const secret = cron ? process.env.CRON_SECRET : process.env.TSS_SYNC_RUN_SECRET;
  if (!authorized(token, secret)) return res.status(401).json({ status: 'unauthorized' });
  if (cron && process.env.TSS_HUBSPOT_SYNC_ENABLED !== 'true') {
    return res.status(503).json({ status: 'disabled' });
  }
  const writeRequested = cron || req.body?.mode === 'commit';
  try {
    const result = await runSync(process.env, { write: writeRequested });
    const blocked = result.results.find(r => r.status === 'blocked');
    return res.status(blocked ? 409 : 200).json({
      status: blocked ? 'requires_review' : 'ok',
      ...result
    });
  } catch (e) {
    // Do not return credential payloads, email addresses, or enquiry bodies.
    const unconfigured = /^Bridge not configured|^Production writes remain disabled/.test(e.message);
    return res.status(unconfigured ? 503 : 422).json({
      status: unconfigured ? 'not_configured_or_disabled' : 'requires_review'
    });
  }
}
