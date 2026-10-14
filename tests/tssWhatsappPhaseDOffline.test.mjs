import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  applyIdempotency,
  buildHubSpotDraft,
  classifyInboundMessage,
  commandRegistry,
  enforceConsentAndSuppression,
  eventKey,
  nextApprovalState,
  normalizeMetaWebhook,
  redactForAudit,
  resolveIdentity,
  simulateRetry,
  validateOutboundPayload,
  verifyMetaSignature
} from '../lib/tssWhatsappPhaseDOffline.mjs';

const rawBody = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{
    id: 'waba_123',
    changes: [{
      field: 'messages',
      value: {
        metadata: { display_phone_number: '15550001111', phone_number_id: 'phone_123' },
        contacts: [{ wa_id: '35799000001', profile: { name: 'QA Sender' } }],
        messages: [{
          from: '35799000001',
          id: 'wamid.qa.1',
          timestamp: '1790000000',
          type: 'text',
          text: { body: 'Interested in the Kiti opportunity' }
        }],
        statuses: [{
          id: 'wamid.qa.out.1',
          recipient_id: '35799000001',
          status: 'delivered',
          timestamp: '1790000001',
          conversation: { id: 'conv_1' },
          pricing: { category: 'service' }
        }]
      }
    }]
  }]
});

test('verifies Meta webhook signatures with synthetic credentials only', () => {
  const digest = createHmac('sha256', 'test-secret').update(rawBody).digest('hex');
  assert.equal(verifyMetaSignature(rawBody, 'test-secret', 'sha256=' + digest), true);
  assert.equal(verifyMetaSignature(rawBody, 'wrong-secret', 'sha256=' + digest), false);
  assert.equal(verifyMetaSignature(rawBody, 'test-secret', 'sha512=' + digest), false);
});

test('normalizes inbound message and status envelopes without sending anything', () => {
  const envelopes = normalizeMetaWebhook(JSON.parse(rawBody));
  assert.equal(envelopes.length, 2);
  assert.deepEqual(envelopes.map(e => e.kind), ['message', 'status']);
  assert.equal(envelopes[0].messageId, 'wamid.qa.1');
  assert.equal(envelopes[0].contactWaId, '35799000001');
  assert.equal(envelopes[0].text, 'Interested in the Kiti opportunity');
  assert.equal(envelopes[1].conversationId, 'conv_1');
});

test('deduplicates repeated webhook deliveries by durable event key', () => {
  const [message] = normalizeMetaWebhook(JSON.parse(rawBody));
  const seen = new Set();
  const first = applyIdempotency([message], seen)[0];
  const second = applyIdempotency([message], seen)[0];
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.eventKey, eventKey(message));
});

test('classifies inbound route and preserves uncertain identities for review', () => {
  const [message] = normalizeMetaWebhook(JSON.parse(rawBody));
  assert.deepEqual(classifyInboundMessage(message), { route: 'kiti_opportunity', confidence: 'medium' });
  assert.deepEqual(resolveIdentity(message, [], []), { status: 'unknown', reviewRequired: true });
  assert.deepEqual(
    resolveIdentity(message, [{ id: 'C-1', companyId: 'COM-1', whatsappWaId: '35799000001' }], [{ id: 'COM-1' }]),
    { status: 'matched', contactId: 'C-1', companyId: 'COM-1', reviewRequired: false }
  );
});

test('enforces consent, suppression and opt-out before outbound consideration', () => {
  const [message] = normalizeMetaWebhook(JSON.parse(rawBody));
  assert.deepEqual(enforceConsentAndSuppression(message, {}), {
    allowed: true,
    reason: 'inbound_customer_service_context'
  });
  assert.deepEqual(enforceConsentAndSuppression(message, { suppressedWaIds: ['35799000001'] }), {
    allowed: false,
    reason: 'suppressed'
  });
  const stop = { ...message, text: 'STOP please' };
  assert.deepEqual(enforceConsentAndSuppression(stop, {}), { allowed: false, reason: 'opt_out_request' });
});

test('approval state machine blocks invalid and unapproved send paths', () => {
  assert.equal(nextApprovalState('draft', 'prepare'), 'pending_owner_review');
  assert.equal(nextApprovalState('pending_owner_review', 'approve'), 'approved_to_send');
  assert.equal(nextApprovalState('approved_to_send', 'mark_sent'), 'sent');
  assert.throws(() => nextApprovalState('draft', 'mark_sent'), /Invalid approval transition/);
});

test('validates outbound payloads without calling Meta', () => {
  const payload = {
    messaging_product: 'whatsapp',
    to: '35799000001',
    type: 'text',
    text: { body: 'Draft reply only' }
  };
  assert.deepEqual(validateOutboundPayload(payload, { ownerApproved: false, customerServiceWindowOpen: true }), {
    ok: false,
    errors: ['owner_approval_required']
  });
  assert.deepEqual(validateOutboundPayload(payload, { ownerApproved: true, customerServiceWindowOpen: true }), {
    ok: true,
    errors: []
  });
  assert.deepEqual(
    validateOutboundPayload({ messaging_product: 'whatsapp', to: '35799000001', type: 'template', template: { name: 'follow_up' } },
      { ownerApproved: true, templateCategory: 'UTILITY' }),
    { ok: true, errors: [] }
  );
});

test('builds HubSpot draft contract for commercial pipeline only', () => {
  const [message] = normalizeMetaWebhook(JSON.parse(rawBody));
  const draft = buildHubSpotDraft(
    message,
    { status: 'unknown', reviewRequired: true },
    classifyInboundMessage(message)
  );
  assert.equal(draft.ticketPipeline, 'TSS Commercial Enquiries');
  assert.equal(draft.supportPipelineAction, 'do_not_use_support_pipeline');
  assert.equal(draft.route, 'Kiti Residential Development Opportunity');
  assert.equal(draft.reviewRequired, true);
});

test('captures retry failures into holds and redacts audit output', () => {
  const [message] = applyIdempotency(normalizeMetaWebhook(JSON.parse(rawBody))).filter(e => e.kind === 'message');
  const attempts = simulateRetry([message], () => { throw new Error('synthetic downstream failure'); });
  assert.equal(attempts[0].status, 'failure_hold');
  const redacted = redactForAudit({ phone: '+35799000001', email: 'qa@example.com', message: message.text });
  assert.match(redacted, /\[redacted-phone\]/);
  assert.match(redacted, /\[redacted-email\]/);
  assert.doesNotMatch(redacted, /35799000001|qa@example\.com/);
});

test('ChatGPT command registry classifies operational authority boundaries', () => {
  const commands = commandRegistry();
  assert.equal(commands.find(c => c.command === 'prepare_whatsapp_reply').mode, 'DRAFT-ONLY');
  assert.equal(commands.find(c => c.command === 'approve_whatsapp_reply').mode, 'REQUIRES OWNER APPROVAL');
  assert.equal(commands.find(c => c.command === 'autonomous_customer_messaging').mode, 'FUTURE UNSUPPORTED');
});
