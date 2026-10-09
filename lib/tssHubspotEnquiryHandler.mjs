// Private TSS-to-HubSpot bridge endpoint. Disabled unless explicitly configured.
import { timingSafeEqual } from 'node:crypto';
import { runSync } from './tssHubspotEnquirySync.mjs';

function authorized(candidate, secret) {
  if (!candidate || !secret) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function makeSyncHandler(run = runSync, env = process.env) {
  return async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const cron = req.method === 'GET';
  if (!cron && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ status: 'method_not_allowed' });
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  // GET may be invoked only with Vercel's CRON_SECRET. No unauthenticated preview.
  const secret = cron ? env.CRON_SECRET : env.TSS_SYNC_RUN_SECRET;
  if (!authorized(token, secret)) return res.status(401).json({ status: 'unauthorized' });
  // Daily Vercel Cron is read-only until separately authorized by the write flag.
  // With the flag OFF this probes both services even when zero enquiries are eligible.
  const writeRequested = (cron && env.TSS_HUBSPOT_SYNC_ENABLED === 'true') ||
    (!cron && req.body?.mode === 'commit');
  try {
    const result = await run(env, { write: writeRequested });
    const blocked = result.results.find(r => r.status === 'blocked');
    console.info(JSON.stringify({
      component: 'tss-hubspot-bridge', event: 'sync_check',
      mode: result.mode, connection: result.connection?.status || 'skipped',
      candidateCount: result.considered, blocked: !!blocked
    }));
    return res.status(blocked ? 409 : 200).json({
      status: blocked ? 'requires_review' : 'ok',
      ...result
    });
  } catch (e) {
    // Do not return credential payloads, email addresses, or enquiry bodies.
    const unconfigured = /^Bridge not configured|^Production writes remain disabled/.test(e.message);
    console.warn(JSON.stringify({
      component: 'tss-hubspot-bridge', event: 'sync_check_failed',
      category: unconfigured ? 'configuration' : 'verification',
      httpStatus: Number.isInteger(e.status) ? e.status : null
    }));
    return res.status(unconfigured ? 503 : 422).json({
      status: unconfigured ? 'not_configured_or_disabled' : 'requires_review'
    });
  }
  };
}

export default makeSyncHandler();
