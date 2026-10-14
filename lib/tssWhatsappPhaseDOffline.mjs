import { createHmac, timingSafeEqual } from 'node:crypto';

const TEXT_TYPES = new Set(['text', 'button', 'interactive']);
const TEMPLATE_CATEGORIES = new Set(['UTILITY', 'MARKETING', 'AUTHENTICATION']);

function asString(value) {
  return value == null ? '' : String(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort()
      .map(key => JSON.stringify(key) + ':' + stableJson(value[key]))
      .join(',') + '}';
  }
  return JSON.stringify(value);
}

export function verifyMetaSignature(rawBody, appSecret, signatureHeader) {
  if (!appSecret || !signatureHeader) return false;
  const header = signatureHeader.trim();
  const [algo, digest] = header.includes('=') ? header.split('=', 2) : ['sha1', header];
  const normalizedAlgo = algo.toLowerCase();
  if (!['sha1', 'sha256'].includes(normalizedAlgo) || !/^[a-f0-9]+$/i.test(digest || '')) return false;
  const expected = createHmac(normalizedAlgo, appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(digest, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeMetaWebhook(payload) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const envelopes = [];
  for (const entry of entries) {
    const wabaId = asString(entry.id);
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      const phoneNumberId = asString(value.metadata?.phone_number_id);
      const displayPhoneNumber = asString(value.metadata?.display_phone_number);
      const contactsByWaId = new Map((value.contacts || []).map(contact => [
        asString(contact.wa_id),
        { waId: asString(contact.wa_id), profileName: asString(contact.profile?.name) }
      ]));
      for (const message of value.messages || []) {
        const waId = asString(message.from);
        envelopes.push({
          kind: 'message',
          provider: 'meta_whatsapp_cloud_api',
          wabaId,
          phoneNumberId,
          displayPhoneNumber,
          messageId: asString(message.id),
          contactWaId: waId,
          contactProfileName: contactsByWaId.get(waId)?.profileName || '',
          timestamp: asString(message.timestamp),
          type: asString(message.type),
          text: extractText(message),
          raw: message
        });
      }
      for (const status of value.statuses || []) {
        envelopes.push({
          kind: 'status',
          provider: 'meta_whatsapp_cloud_api',
          wabaId,
          phoneNumberId,
          displayPhoneNumber,
          messageId: asString(status.id),
          recipientWaId: asString(status.recipient_id),
          status: asString(status.status),
          timestamp: asString(status.timestamp),
          conversationId: asString(status.conversation?.id),
          pricingCategory: asString(status.pricing?.category),
          raw: status
        });
      }
    }
  }
  return envelopes;
}

function extractText(message) {
  if (message.type === 'text') return asString(message.text?.body).trim();
  if (message.type === 'button') return asString(message.button?.text).trim();
  if (message.type === 'interactive') {
    return asString(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title).trim();
  }
  return '';
}

export function eventKey(envelope) {
  const base = [
    envelope.provider,
    envelope.kind,
    envelope.wabaId,
    envelope.phoneNumberId,
    envelope.messageId,
    envelope.status || '',
    envelope.timestamp || ''
  ].join(':');
  return createHmac('sha256', 'tss-phase-d-offline-event-key').update(base).digest('hex');
}

export function applyIdempotency(envelopes, seenKeys = new Set()) {
  return envelopes.map(envelope => {
    const key = eventKey(envelope);
    if (seenKeys.has(key)) return { ...envelope, eventKey: key, duplicate: true, action: 'ignore_duplicate' };
    seenKeys.add(key);
    return { ...envelope, eventKey: key, duplicate: false, action: 'process' };
  });
}

export function classifyInboundMessage(envelope) {
  if (envelope.kind !== 'message') return { route: 'status_only', confidence: 'exact' };
  if (!TEXT_TYPES.has(envelope.type)) return { route: 'human_review', confidence: 'low', reason: 'unsupported_message_type' };
  const text = envelope.text.toLowerCase();
  if (/\bstop\b|unsubscribe|opt[- ]?out/.test(text)) return { route: 'suppression_request', confidence: 'high' };
  if (/kiti|residential development|opportunity/.test(text)) return { route: 'kiti_opportunity', confidence: 'medium' };
  if (/price|proposal|invest|developer|owner|partnership|relocation|business/.test(text)) {
    return { route: 'commercial_enquiry', confidence: 'medium' };
  }
  return { route: 'general_enquiry', confidence: 'low' };
}

export function resolveIdentity(envelope, contacts = [], companies = []) {
  const waMatches = contacts.filter(contact => asString(contact.whatsappWaId) === envelope.contactWaId);
  if (waMatches.length === 1) {
    const companyMatches = companies.filter(company => asString(company.id) === asString(waMatches[0].companyId));
    return {
      status: companyMatches.length === 1 ? 'matched' : 'contact_only',
      contactId: waMatches[0].id,
      companyId: companyMatches[0]?.id || '',
      reviewRequired: companyMatches.length !== 1
    };
  }
  if (waMatches.length > 1) return { status: 'ambiguous', reviewRequired: true };
  return { status: 'unknown', reviewRequired: true };
}

export function enforceConsentAndSuppression(envelope, policy = {}) {
  const suppressed = new Set(policy.suppressedWaIds || []);
  if (suppressed.has(envelope.contactWaId)) return { allowed: false, reason: 'suppressed' };
  if (classifyInboundMessage(envelope).route === 'suppression_request') return { allowed: false, reason: 'opt_out_request' };
  return { allowed: true, reason: 'inbound_customer_service_context' };
}

export function nextApprovalState(current, event) {
  const state = current || 'draft';
  const transitions = {
    draft: { prepare: 'pending_owner_review', reject: 'rejected' },
    pending_owner_review: { approve: 'approved_to_send', reject: 'rejected', revise: 'draft' },
    approved_to_send: { mark_sent: 'sent', fail: 'send_failed' },
    send_failed: { retry_hold: 'failure_hold', revise: 'draft' },
    failure_hold: { revise: 'draft' },
    sent: { close: 'closed', follow_up: 'follow_up_required' },
    follow_up_required: { close: 'closed', prepare: 'pending_owner_review' }
  };
  const next = transitions[state]?.[event];
  if (!next) throw new Error('Invalid approval transition: ' + state + ' -> ' + event);
  return next;
}

export function validateOutboundPayload(payload, context = {}) {
  const errors = [];
  if (context.ownerApproved !== true) errors.push('owner_approval_required');
  if (!payload || payload.messaging_product !== 'whatsapp') errors.push('invalid_messaging_product');
  if (!payload?.to) errors.push('recipient_required');
  if (payload?.type === 'template') {
    const category = asString(context.templateCategory).toUpperCase();
    if (!TEMPLATE_CATEGORIES.has(category)) errors.push('template_category_required');
    if (!payload.template?.name) errors.push('template_name_required');
  } else if (context.customerServiceWindowOpen !== true) {
    errors.push('customer_service_window_or_template_required');
  }
  if (context.suppressed === true) errors.push('recipient_suppressed');
  return { ok: errors.length === 0, errors };
}

export function buildHubSpotDraft(envelope, identity, classification) {
  const route = classification.route === 'kiti_opportunity'
    ? 'Kiti Residential Development Opportunity'
    : 'WhatsApp Business Enquiry';
  return {
    source: 'meta_whatsapp_cloud_api',
    route,
    messageId: envelope.messageId,
    wabaId: envelope.wabaId,
    phoneNumberId: envelope.phoneNumberId,
    contactWaId: envelope.contactWaId,
    contactId: identity.contactId || '',
    companyId: identity.companyId || '',
    reviewRequired: identity.reviewRequired || classification.confidence !== 'high',
    ticketPipeline: 'TSS Commercial Enquiries',
    supportPipelineAction: 'do_not_use_support_pipeline',
    summary: envelope.text.slice(0, 500)
  };
}

export function simulateRetry(events, processor) {
  const attempts = [];
  for (const event of events) {
    try {
      attempts.push({ eventKey: event.eventKey || eventKey(event), status: 'ok', result: processor(event) });
    } catch (error) {
      attempts.push({ eventKey: event.eventKey || eventKey(event), status: 'failure_hold', error: error.message });
    }
  }
  return attempts;
}

export function commandRegistry() {
  return [
    ['show_new_whatsapp_enquiries', 'READ-ONLY'],
    ['summarize_whatsapp_enquiry', 'READ-ONLY'],
    ['identify_unresolved_whatsapp_messages', 'READ-ONLY'],
    ['show_related_hubspot_contacts_and_tickets', 'READ-ONLY'],
    ['prepare_whatsapp_reply', 'DRAFT-ONLY'],
    ['approve_whatsapp_reply', 'REQUIRES OWNER APPROVAL'],
    ['reject_whatsapp_reply', 'REQUIRES OWNER APPROVAL'],
    ['show_message_delivery_status', 'READ-ONLY'],
    ['show_whatsapp_followups_requiring_attention', 'READ-ONLY'],
    ['report_whatsapp_integration_failures', 'READ-ONLY'],
    ['show_whatsapp_usage_and_costs', 'READ-ONLY'],
    ['autonomous_customer_messaging', 'FUTURE UNSUPPORTED']
  ].map(([command, mode]) => ({ command, mode }));
}

export function redactForAudit(value) {
  const json = stableJson(value);
  return json
    .replace(/\+?\d{7,15}/g, '[redacted-phone]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]');
}
