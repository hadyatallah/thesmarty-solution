// WhatsApp owner inbox: a strictly read-only, owner-delegated Firestore view.
// No service-account key, refresh token, Firestore write, Graph send or CRM side effect.
const OWNER_EMAIL = 'thesmartysolution@gmail.com';
const PARENT = 'projects/tss-crm-508908/databases/(default)/documents';
const COLLECTION = 'tss_whatsapp_inbox';
const MAX_PAGE_TOKEN = 2000;
const MAX_RECORDS = 30;
const text = (v, max = 300) => typeof v === 'string' ? v.slice(0, max) : '';

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
  if ([...params.keys()].some(k => k !== 'pageToken') || params.getAll('pageToken').length > 1)
    throw Error('BAD_QUERY');
  const pageToken = params.get('pageToken') || '';
  // Google pagination tokens are opaque. Never concatenate them into a host/path.
  if (pageToken.length > MAX_PAGE_TOKEN || /[\u0000-\u001f\u007f]/.test(pageToken))
    throw Error('BAD_QUERY');
  return { pageToken };
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

export function createInboxHandler({ enabled = false, fetcher = fetch, env = process.env } = {}) {
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
    const bearer = parseBearer(req.headers?.authorization);
    if (!bearer) return reply(401, { ok: false, error: 'google_sign_in_required' });
    let parsed;
    try { parsed = parseInboxRequest(req.url); }
    catch { return reply(400, { ok: false, error: 'bad_query' }); }
    try {
      // Provider identity check on EVERY request, not merely client-side email hints.
      const who = await fetcher('https://www.googleapis.com/oauth2/v3/userinfo', {
        method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(9000),
        headers: { Authorization: 'Bearer ' + bearer }
      });
      if (!who.ok) return reply(401, { ok: false, error: 'google_session_expired' });
      const profile = await who.json();
      if (!isOwnerProfile(profile, env.TSS_WHATSAPP_OWNER_EMAIL))
        return reply(403, { ok: false, error: 'owner_only' });
      const store = await fetcher(googleInboxUrl(parsed), {
        method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000),
        headers: { Authorization: 'Bearer ' + bearer }
      });
      if (store.status === 401) return reply(401, { ok: false, error: 'google_session_expired' });
      if (store.status === 403) return reply(403, { ok: false, error: 'firestore_permission_or_scope_denied' });
      if (!store.ok) return reply(503, { ok: false, error: 'inbox_storage_unavailable' });
      const data = await store.json();
      if (data.documents !== undefined && !Array.isArray(data.documents)) throw Error('BAD_STORAGE_RESPONSE');
      const records = (data.documents || []).slice(0, MAX_RECORDS).map(parseFirestoreDocument).filter(Boolean);
      return reply(200, {
        ok: true, records, nextPageToken: text(data.nextPageToken, MAX_PAGE_TOKEN),
        reviewOnly: true, sendingEnabled: false, automatedReplies: false,
        retentionPolicyApproved: false, source: 'google_firestore_owner_delegated'
      });
    } catch {
      // No tokens, private message contents, raw provider errors or user identities in logs.
      return reply(503, { ok: false, error: 'inbox_temporarily_unavailable' });
    }
  };
}
