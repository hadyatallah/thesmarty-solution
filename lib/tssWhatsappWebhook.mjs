import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const MAX_BODY_BYTES = 512 * 1024;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const timestamp = value => typeof value === 'string' && /^\d{1,16}$/.test(value);
export function secureEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = createHash('sha256').update(a).digest();
  const bb = createHash('sha256').update(b).digest();
  return timingSafeEqual(aa, bb);
}
export function validSignature(raw, signature, secret) {
  if (!Buffer.isBuffer(raw) || !secret || typeof signature !== 'string' || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature.slice(7), 'hex'), createHmac('sha256', secret).update(raw).digest());
}
export function parseEvents(payload, allowedPairs) {
  if (!object(payload) || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry) || !payload.entry.length) throw Error('INVALID_PAYLOAD');
  const events = [];
  for (const entry of payload.entry) {
    if (!object(entry) || !id(entry.id) || !Array.isArray(entry.changes) || !entry.changes.length) throw Error('INVALID_PAYLOAD');
    for (const change of entry.changes) {
      const countBefore = events.length;
      if (!object(change) || change.field !== 'messages' || !object(change.value)) throw Error('INVALID_PAYLOAD');
      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!id(phoneNumberId) || !allowedPairs.some(p => p.wabaId === entry.id && p.phoneNumberId === phoneNumberId)) throw Error('UNAUTHORIZED_ACCOUNT');
      if (value.messaging_product !== 'whatsapp') throw Error('INVALID_PAYLOAD');
      for (const kind of ['messages', 'statuses']) {
        if (value[kind] !== undefined && !Array.isArray(value[kind])) throw Error('INVALID_PAYLOAD');
        for (const item of value[kind] || []) {
          if (!object(item) || !id(item.id) || !timestamp(item.timestamp)) throw Error('INVALID_PAYLOAD');
          if (kind === 'messages' && (!id(item.from) || !id(item.type))) throw Error('INVALID_PAYLOAD');
          if (kind === 'statuses' && (!id(item.recipient_id) || !id(item.status))) throw Error('INVALID_PAYLOAD');
          const event = {
            provider: 'meta_whatsapp_cloud_api', kind: kind === 'messages' ? 'message' : 'status',
            wabaId: entry.id, phoneNumberId, messageId: item.id, timestamp: item.timestamp,
            status: kind === 'statuses' ? item.status : '',
            // Private inbox only. Never logged or copied into HubSpot by this receiver.
            payload: item
          };
          // Inbound message identity excludes timestamp: a replay cannot change its dedupe key.
          const identity = [event.provider, event.kind, event.wabaId, phoneNumberId, item.id];
          if (event.kind === 'status') identity.push(item.status, item.timestamp);
          event.eventKey = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
          events.push(event);
        }
      }
      if (events.length === countBefore && !(Array.isArray(value.errors) && value.errors.length)) throw Error('INVALID_PAYLOAD');
      if (Array.isArray(value.errors) && value.errors.length) {
        const event = { provider: 'meta_whatsapp_cloud_api', kind: 'provider_error', wabaId: entry.id, phoneNumberId, payload: value.errors };
        event.eventKey = createHash('sha256').update(JSON.stringify([entry.id, phoneNumberId, value.errors])).digest('hex');
        events.push(event);
      }
    }
  }
  if (events.length > 500) throw Error('INVALID_PAYLOAD');
  return events;
}

export async function readRawBody(req) {
  // A parsed body is never serialized back into bytes for signature validation.
  // Vercel exposes req.body through a lazy parsing getter. Never access that
  // getter: it can consume the original byte stream before HMAC validation.
  // An explicitly supplied *value* is accepted only when it is already bytes.
  const ownBody = Object.getOwnPropertyDescriptor(req, 'body');
  if (ownBody && 'value' in ownBody && ownBody.value != null) {
    if (!Buffer.isBuffer(ownBody.value)) throw Error('RAW_BODY_UNAVAILABLE');
    if (ownBody.value.length > MAX_BODY_BYTES) throw Error('BODY_TOO_LARGE');
    return ownBody.value;
  }
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > MAX_BODY_BYTES) throw Error('BODY_TOO_LARGE');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export function createWebhookHandler({ enabled, loadDependencies, audit = () => {} }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const reply = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(body); };
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return reply(405, 'Method not allowed'); }
    if (!enabled) return reply(503, 'Webhook inactive');
    try {
      const deps = await loadDependencies();
      if (!deps.verifyToken || !deps.appSecret || !deps.store || !deps.allowedPairs?.length) throw Error('CONFIGURATION_INCOMPLETE');
      if (req.method === 'GET') {
        const query = new URL(req.url, 'https://webhook.invalid').searchParams;
        const keys = ['hub.mode', 'hub.verify_token', 'hub.challenge'];
        if (keys.some(key => query.getAll(key).length !== 1)) return reply(400, 'Invalid challenge');
        if (query.get('hub.mode') !== 'subscribe' || !secureEqual(query.get('hub.verify_token'), deps.verifyToken)) return reply(403, 'Forbidden');
        const challenge = query.get('hub.challenge');
        if (!challenge || challenge.length > 1024) return reply(400, 'Invalid challenge');
        audit('challenge_verified');
        return reply(200, challenge);
      }
      const signature = req.headers['x-hub-signature-256'];
      if (typeof signature !== 'string' || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return reply(401, 'Invalid signature');
      const raw = await readRawBody(req);
      if (!validSignature(raw, signature, deps.appSecret)) { audit('signature_rejected'); return reply(401, 'Invalid signature'); }
      const events = parseEvents(JSON.parse(raw.toString('utf8')), deps.allowedPairs);
      let created = 0;
      // Atomic create stores the event and dedupe marker together, before ACK.
      // A partial failure returns 503. Retry skips committed events and resumes missing ones.
      for (const event of events) if (await deps.store.putIfAbsent(event)) created++;
      audit('inbox_committed', { created, duplicates: events.length - created });
      return reply(200, 'EVENT_RECEIVED');
    } catch (error) {
      const code = error.message;
      if (code === 'UNAUTHORIZED_ACCOUNT') return reply(403, 'Unauthorized account');
      if (code === 'BODY_TOO_LARGE') return reply(413, 'Payload too large');
      if (code === 'INVALID_PAYLOAD' || error instanceof SyntaxError) return reply(400, 'Invalid payload');
      // Never log provider responses, request URLs, bodies, headers, or error messages.
      // Only fixed categories are logged, never provider errors, tokens, URLs or payloads.
      const safeCategories = new Set(['CONFIGURATION_INCOMPLETE', 'VERCEL_OIDC_TOKEN_UNAVAILABLE', 'GOOGLE_WIF_UNAVAILABLE', 'GOOGLE_WIF_REJECTED', 'GOOGLE_PERMISSION_DENIED', 'SECRET_UNAVAILABLE', 'INBOX_UNAVAILABLE', 'TOKEN_UNAVAILABLE']);
      audit('dependency_unavailable', { category: safeCategories.has(code) ? code : 'UNCLASSIFIED' });
      res.setHeader('Retry-After', '30');
      return reply(503, 'Temporarily unavailable');
    }
  };
}
