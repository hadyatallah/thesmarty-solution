import { OAuth2Client } from 'google-auth-library';
import { keylessToken } from './tssWhatsappGoogle.mjs';
// WhatsApp owner inbox: a strictly read-only, owner-delegated Firestore view.
// No service-account key, refresh token, Firestore write, Graph send or CRM side effect.
const OWNER_EMAIL = 'thesmartysolution@gmail.com';
const PARENT = 'projects/tss-crm-508908/databases/(default)/documents';
const COLLECTION = 'tss_whatsapp_inbox';
const MAX_PAGE_TOKEN = 2000;
const MAX_RECORDS = 30;
const text = (v, max = 300) => typeof v === 'string' ? v.slice(0, max) : '';

function identityFailureCategory(error) {
  const message = String(error?.message || '').toLowerCase();
  if (/audience|incorrect.*aud|aud claim/.test(message)) return 'audience_mismatch';
  if (/expired|expiration|jwt.*exp/.test(message)) return 'expired_token';
  if (/issuer|iss claim|wrong.*issuer/.test(message)) return 'issuer_mismatch';
  if (/signature|certificate|public key|jwt signature/.test(message)) return 'invalid_signature';
  if (/malformed|format|decode|jwt/.test(message)) return 'malformed_token';
  return 'verification_failed';
}

// Only fixed, nonsecret categories may cross the authenticated owner boundary.
// Never return Google's free-form message, metadata, headers, URLs or tokens.
const READER_FAILURE_REASONS = new Set([
  'ACCESS_TOKEN_EXPIRED', 'ACCESS_TOKEN_TYPE_UNSUPPORTED',
  'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'AUTH_TOKEN_INVALID',
  'CREDENTIALS_MISSING', 'ACCOUNT_STATE_INVALID', 'SERVICE_DISABLED',
  'CONSUMER_INVALID'
]);
export async function readerFailureReason(response) {
  const body = await response.json().catch(() => null);
  const details = Array.isArray(body?.error?.details) ? body.error.details : [];
  for (const detail of details) {
    if (detail?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo' &&
        detail.domain === 'googleapis.com' && READER_FAILURE_REASONS.has(detail.reason))
      return detail.reason.toLowerCase();
  }
  if (body?.error?.status === 'UNAUTHENTICATED') return 'google_unauthenticated';
  return 'unclassified_upstream_401';
}

export function isOwnerProfile(profile, email = OWNER_EMAIL) {
  return Boolean(profile && (profile.email_verified === true || profile.email_verified === 'true')
    && typeof profile.email === 'string'
    && profile.email.toLowerCase() === email.toLowerCase());
}

export function parseBearer(value) {
  if (typeof value !== 'string') return '';
  const match = /^Bearer ([A-Za-z0-9._~-]{30,4096})$/.exec(value);
  return match ? match[1] : '';
}

export function parseInboxRequest(url) {
  const params = new URL(url || '/', 'https://inbox.invalid').searchParams;
  if ([...params.keys()].some(k => !['pageToken', 'diagnostic'].includes(k)) || params.getAll('pageToken').length > 1)
    throw Error('BAD_QUERY');
  const pageToken = params.get('pageToken') || '';
  // Google pagination tokens are opaque. Never concatenate them into a host/path.
  if (pageToken.length > MAX_PAGE_TOKEN || /[\u0000-\u001f\u007f]/.test(pageToken))
    throw Error('BAD_QUERY');
  return { pageToken, diagnostic: params.get('diagnostic') === '1' };
}

export function parseFirestoreDocument(document) {
  const match = /^projects\/tss-crm-508908\/databases\/\(default\)\/documents\/tss_whatsapp_inbox\/([a-f0-9]{64})$/.exec(document?.name || '');
  if (!match) return null;
  const fields = document.fields || {};
  let event;
  try { event = JSON.parse(fields.event?.stringValue || ''); } catch { return null; }
  if (!event || event.provider !== 'meta_whatsapp_cloud_api' || event.eventKey !== match[1]) return null;
  const item = event.payload;
  const kind = event.kind;
  const inbound = kind === 'message';
  const status = kind === 'status';
  const sender = inbound ? text(item?.from, 40) : status ? text(item?.recipient_id, 40) : '';
  const type = inbound ? text(item?.type, 35) : status ? text(item?.status, 35) : kind;
  const body = inbound ? text(item?.text?.body || item?.button?.text || item?.interactive?.button_reply?.title || item?.interactive?.list_reply?.title || item?.image?.caption || item?.video?.caption || item?.document?.caption || '', 6000) : '';
  const receivedAt = fields.receivedAt?.timestampValue || document.createTime || '';
  return {
    key: match[1], kind: text(kind, 30), state: text(fields.state?.stringValue, 40),
    receivedAt: text(receivedAt, 48), timestamp: text(event.timestamp, 25),
    wabaId: text(event.wabaId, 40), phoneNumberId: text(event.phoneNumberId, 40),
    messageId: text(event.messageId, 250), sender, type, body,
    hasMedia: inbound && ['image', 'video', 'audio', 'document', 'sticker'].includes(type),
    // The inbox does not fetch or share Meta-hosted media automatically.
    canDraft: inbound && /^\d{8,17}$/.test(sender)
  };
}

export function googleInboxUrl({ pageToken = '' } = {}) {
  const url = new URL('https://firestore.googleapis.com/v1/' + PARENT + '/' + COLLECTION);
  url.searchParams.set('pageSize', String(MAX_RECORDS));
  url.searchParams.set('orderBy', 'receivedAt desc');
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  return url.toString();
}

export function createInboxHandler({ enabled = false, fetcher = fetch, env = process.env, verifyIdentity, readerAccessToken } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, payload) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(payload));
    };
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return reply(405, { ok: false, error: 'method_not_allowed' }); }
    if (!enabled) return reply(503, { ok: false, error: 'inbox_not_enabled' });
    // Refuse unexpected project, missing owner pin, or permission scope drift.
    if (env.TSS_WHATSAPP_FIRESTORE_PARENT !== PARENT || env.TSS_WHATSAPP_OWNER_EMAIL !== OWNER_EMAIL)
      return reply(503, { ok: false, error: 'inbox_not_configured' });
    if (env.TSS_WHATSAPP_READER_AUTH_READY !== 'true' ||
        !/^tss-whatsapp-inbox-reader@tss-crm-508908\.iam\.gserviceaccount\.com$/.test(env.TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL || '') ||
        !/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(env.TSS_WHATSAPP_GOOGLE_CLIENT_ID || ''))
      return reply(503, { ok: false, error: 'scoped_reader_not_configured' });
    const bearer = parseBearer(req.headers?.authorization);
    if (!bearer) return reply(401, { ok: false, error: 'google_sign_in_required' });
    let parsed;
    try { parsed = parseInboxRequest(req.url); }
    catch { return reply(400, { ok: false, error: 'bad_query' }); }
    try {
      // Cryptographically verify Google's signed ID token and audience on each read.
      // A browser OAuth access token is never passed to Firestore.
      let profile;
      try {
        if (verifyIdentity) profile = await verifyIdentity(bearer, env.TSS_WHATSAPP_GOOGLE_CLIENT_ID);
        else {
          const verifier = new OAuth2Client(env.TSS_WHATSAPP_GOOGLE_CLIENT_ID);
          const ticket = await verifier.verifyIdToken({ idToken: bearer, audience: env.TSS_WHATSAPP_GOOGLE_CLIENT_ID });
          profile = ticket.getPayload();
        }
      } catch (error) {
        return reply(401, { ok: false, error: 'google_identity_invalid', reason: identityFailureCategory(error) });
      }
      if (!isOwnerProfile(profile, env.TSS_WHATSAPP_OWNER_EMAIL))
        return reply(403, { ok: false, error: 'owner_only' });
      let readerToken;
      try { readerToken = await (readerAccessToken ? readerAccessToken() : keylessToken(env, 'TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL')); }
      catch (error) {
        if (parsed.diagnostic) {
          const requestId = crypto.randomUUID();
          const code = error?.message === 'VERCEL_OIDC_TOKEN_UNAVAILABLE' ? 'OIDC_UNAVAILABLE'
            : error?.message === 'GOOGLE_WIF_REJECTED' ? 'STS_OR_WIF_REJECTED'
            : error?.message === 'GOOGLE_PERMISSION_DENIED' ? 'IMPERSONATION_DENIED'
            : error?.message === 'TOKEN_UNAVAILABLE' ? 'TOKEN_SHAPE_INVALID'
            : 'READER_TOKEN_UNAVAILABLE';
          return reply(200, { ok: false, diagnostic: true, requestId, category: code });
        }
        return reply(503, { ok: false, error: 'scoped_reader_unavailable' });
      }
      const store = await fetcher(googleInboxUrl(parsed), {
        method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000),
        headers: { Authorization: 'Bearer ' + readerToken }
      });
      if (parsed.diagnostic) {
        const requestId = crypto.randomUUID();
        const safeReason = store.status === 401 ? await readerFailureReason(store) : '';
        const category = store.status === 200 ? 'FIRESTORE_200'
          : store.status === 401 ? (safeReason === 'access_token_expired' ? 'TOKEN_EXPIRED'
            : safeReason === 'access_token_scope_insufficient' ? 'MISSING_SCOPE'
            : safeReason === 'access_token_type_unsupported' ? 'TOKEN_TYPE_INVALID'
            : 'FIRESTORE_401')
          : store.status === 403 ? 'IAM_OR_FIRESTORE_DENIAL' : 'FIRESTORE_UPSTREAM_FAILURE';
        return reply(200, { ok: store.status === 200, diagnostic: true, requestId, category, httpStatus: store.status });
      }
      if (store.status === 401) return reply(503, { ok: false, error: 'reader_token_rejected', reason: await readerFailureReason(store) });
      if (store.status === 403) return reply(403, { ok: false, error: 'firestore_permission_or_scope_denied' });
      if (!store.ok) return reply(503, { ok: false, error: 'inbox_storage_unavailable' });
      const data = await store.json();
      if (data.documents !== undefined && !Array.isArray(data.documents)) throw Error('BAD_STORAGE_RESPONSE');
      const records = (data.documents || []).slice(0, MAX_RECORDS).map(parseFirestoreDocument).filter(Boolean);
      return reply(200, {
        ok: true, records, nextPageToken: text(data.nextPageToken, MAX_PAGE_TOKEN),
        reviewOnly: true, sendingEnabled: false, automatedReplies: false,
        retentionPolicyApproved: false, source: 'google_firestore_keyless_scoped_reader'
      });
    } catch {
      // No tokens, private message contents, raw provider errors or user identities in logs.
      return reply(503, { ok: false, error: 'inbox_temporarily_unavailable' });
    }
  };
}

