import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCommercialEnquiry, processCommercialEnquiry, verifyG5HubSpotContract } from '../lib/tssG5CommercialIntake.mjs';

const valid = {
  name: 'Example Owner',
  email: 'owner@example.test',
  company: 'Example Commercial Ltd',
  route: 'business-growth',
  message: 'Synthetic commercial enquiry with enough detail for review only.',
  source: 'https://www.thesmartysolution.com/contact.html?source=whatsapp',
  form_nonce: 'nonce-1234567890',
  marketing_consent: 'No'
};
const activeEnv = {
  TSS_HUBSPOT_SERVICE_KEY: 'test', TSS_G5_HUBSPOT_DIRECT_ENABLED: 'true',
  TSS_G5_TICKET_PIPELINE_ID: 'commercial-pipeline', TSS_G5_TICKET_NEW_STAGE_ID: 'new-enquiry'
};
const dryEnv = { ...activeEnv, TSS_G5_HUBSPOT_DIRECT_ENABLED: 'false' };
function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function mockFetcher({
  unique = true, ticketReadback = true, companyReadback = true, contactReadback = true,
  failTicket = false, failAssociation = false, missingTicketContactAssociation = false,
  duplicateCompany = false, wrongPipeline = false, invalidStage = false, replayPayloadMismatch = false
} = {}) {
  const calls = [], receipts = new Map();
  const ids = { companies: 'company-1', contacts: 'contact-1' };
  const fetcher = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url, opts, body });
    if (url.includes('/properties/')) {
      const name = url.split('/').pop();
      return response({ name, type: 'string', hasUniqueValue: unique });
    }
    if (url.includes('/pipelines/tickets/')) return response({
      id: wrongPipeline ? 'support-pipeline' : 'commercial-pipeline',
      stages: [{ id: 'new-enquiry', metadata: { state: invalidStage ? 'CLOSED' : 'OPEN' } }]
    });
    if (url.endsWith('/objects/tickets') && opts.method === 'POST') {
      if (failTicket) return response({ category: 'CONFLICT' }, 409);
      const props = body.properties, key = props.tss_enquiry_key;
      if (receipts.has(key)) return response({ category: 'CONFLICT' }, 409);
      const ticket = { id: 'ticket-' + (receipts.size + 1), properties: props };
      receipts.set(key, ticket);
      return response({ id: ticket.id });
    }
    if (url.includes('/companies/batch/upsert')) return response({ results: [{ id: ids.companies }] });
    if (url.includes('/contacts/batch/upsert')) return response({ results: [{ id: ids.contacts }] });
    if (url.includes('/associations/default/') && failAssociation) return response({ category: 'VALIDATION_ERROR' }, 400);
    if (url.includes('/associations/default/')) return response({ ok: true });
    if (url.includes('/contacts/contact-1/associations/companies')) return response({ results: [{ toObjectId: ids.companies }] });
    if (url.includes('/tickets/ticket-1/associations/companies')) return response({ results: [{ toObjectId: ids.companies }] });
    if (url.includes('/tickets/ticket-1/associations/contacts')) {
      return response({ results: missingTicketContactAssociation ? [] : [{ toObjectId: ids.contacts }] });
    }
    if (url.includes('/companies/search')) {
      return response({ results: duplicateCompany ? [{ id: ids.companies }, { id: 'company-2' }] :
        companyReadback ? [{ id: ids.companies, properties: { tss_company_key: 'x' } }] : [] });
    }
    if (url.includes('/contacts/search')) {
      return response({ results: contactReadback ? [{ id: ids.contacts, properties: { tss_contact_key: 'x' } }] : [] });
    }
    if (url.includes('/tickets/search')) {
      const key = body?.filterGroups?.[0]?.filters?.[0]?.value;
      const found = receipts.get(key);
      return response({ results: ticketReadback && found ? [{
        id: found.id,
        properties: {
          ...found.properties,
          ...(replayPayloadMismatch ? { content: 'different customer data' } : {})
        }
      }] : [] });
    }
    throw new Error('unexpected call ' + url);
  };
  fetcher.calls = calls;
  fetcher.receipts = receipts;
  return fetcher;
}

test('normalizes a valid commercial enquiry into deterministic keys without qualification', () => {
  const r = normalizeCommercialEnquiry(valid, new Date('2026-10-10T02:00:00Z'));
  assert.equal(r.valid, true);
  assert.match(r.enquiry.enquiryKey, /^tss_g5_enquiry_/);
  assert.equal(r.enquiry.consent, 'No');
});

test('rejects invalid origin and nonce before any provider calls', async () => {
  const fetcher = mockFetcher();
  const r = await processCommercialEnquiry({ ...valid, source: 'https://attacker.test/', form_nonce: '' }, {
    env: activeEnv, fetcher
  });
  assert.equal(r.status, 'rejected');
  assert.deepEqual(fetcher.calls, []);
});

test('fails closed for nonunique Ticket contract', async () => {
  const hub = { property: async (objectType, property) => ({ name: property, type: 'string', hasUniqueValue: objectType !== 'tickets' }) };
  await assert.rejects(verifyG5HubSpotContract(hub, activeEnv), /G5_UNIQUE_PROPERTY_CONTRACT_MISSING/);
});

test('fails closed if dedicated pipeline is missing or existing Support Pipeline is selected', async () => {
  const fetcher = mockFetcher();
  await assert.rejects(processCommercialEnquiry(valid, {
    env: { ...activeEnv, TSS_G5_TICKET_PIPELINE_ID: '0' }, fetcher
  }), /G5_DEDICATED_TICKET_PIPELINE_REQUIRED/);
  assert.equal(fetcher.calls.some(c => c.url.includes('/objects/tickets') && c.opts.method === 'POST'), false);
});

test('rejects unknown or closed ticket pipeline stage', async () => {
  const fetcher = mockFetcher({ invalidStage: true });
  await assert.rejects(processCommercialEnquiry(valid, { env: activeEnv, fetcher }), /G5_TICKET_PIPELINE_STAGE_UNVERIFIED/);
  assert.equal(fetcher.calls.some(c => c.opts.method === 'POST' && c.url.endsWith('/objects/tickets')), false);
});

test('dry-run checks unique contract and dedicated pipeline but performs no writes', async () => {
  const fetcher = mockFetcher();
  const r = await processCommercialEnquiry(valid, { env: dryEnv, fetcher });
  assert.equal(r.status, 'ready_dry_run');
  assert.equal(r.writes, 0);
  assert.equal(fetcher.calls.some(c => c.opts.method === 'POST'), false);
});

test('enabled mode creates one Ticket receipt, upserts identities and verifies associations', async () => {
  const fetcher = mockFetcher();
  const r = await processCommercialEnquiry(valid, { env: activeEnv, fetcher });
  assert.equal(r.status, 'accepted_for_review');
  assert.equal(r.audit.qualification, 'manual_review_required');
  assert.equal(r.hubspot.ticketId, 'ticket-1');
  const creates = fetcher.calls.filter(c => c.url.endsWith('/objects/tickets') && c.opts.method === 'POST');
  assert.equal(creates.length, 1);
  assert.equal(creates[0].body.properties.hs_pipeline, 'commercial-pipeline');
  assert.equal(creates[0].body.properties.hs_pipeline_stage, 'new-enquiry');
  assert.equal('hs_task_subject' in creates[0].body.properties, false);
  const upserts = fetcher.calls.filter(c => c.url.includes('/batch/upsert'));
  assert.deepEqual(upserts.map(c => c.body.inputs[0].idProperty), ['tss_company_key', 'tss_contact_key']);
  assert.deepEqual(fetcher.calls.filter(c => c.url.includes('/associations/default/')).map(c => c.opts.method), ['PUT', 'PUT', 'PUT']);
  assert.equal(fetcher.calls.some(c => c.url.includes('sheets.googleapis.com')), false);
});

test('unknown ticket creation result is held, never counted as success', async () => {
  const fetcher = mockFetcher({ failTicket: true });
  await assert.rejects(processCommercialEnquiry(valid, { env: activeEnv, fetcher }), /G5_TICKET_RECEIPT_UNVERIFIED/);
  assert.equal(fetcher.calls.some(c => c.url.includes('/batch/upsert')), false);
});

test('ticket creation with failed readback is held before identities are written', async () => {
  const fetcher = mockFetcher({ ticketReadback: false });
  await assert.rejects(processCommercialEnquiry(valid, { env: activeEnv, fetcher }), /G5_TICKET_RECEIPT_UNVERIFIED/);
  assert.equal(fetcher.calls.some(c => c.url.includes('/batch/upsert')), false);
});

test('duplicate company key readback is held instead of linked by name similarity', async () => {
  const fetcher = mockFetcher({ duplicateCompany: true });
  await assert.rejects(processCommercialEnquiry(valid, { env: activeEnv, fetcher }), /G5_COMPANIES_READBACK_UNVERIFIED/);
});

test('association failure and missing Ticket-to-Contact link require review', async () => {
  const failedWrite = mockFetcher({ failAssociation: true });
  await assert.rejects(processCommercialEnquiry(valid, { env: activeEnv, fetcher: failedWrite }), /G5_ASSOCIATION_WRITE_UNCERTAIN/);
  const failedReadback = mockFetcher({ missingTicketContactAssociation: true });
  await assert.rejects(processCommercialEnquiry(valid, { env: activeEnv, fetcher: failedReadback }), /G5_TICKET_CONTACT_ASSOCIATION_UNVERIFIED/);
});

test('identical concurrent submissions converge on a unique Ticket receipt', async () => {
  const fetcher = mockFetcher();
  const results = await Promise.all([
    processCommercialEnquiry(valid, { env: activeEnv, fetcher }),
    processCommercialEnquiry(valid, { env: activeEnv, fetcher })
  ]);
  assert.equal(results[0].enquiryKey, results[1].enquiryKey);
  assert.deepEqual(results.map(r => r.hubspot.ticketId), ['ticket-1', 'ticket-1']);
  assert.equal(fetcher.receipts.size, 1);
});

test('replaying a Ticket does not reset its reviewer-edited stage', async () => {
  const fetcher = mockFetcher();
  await processCommercialEnquiry(valid, { env: activeEnv, fetcher });
  const ticket = [...fetcher.receipts.values()][0];
  ticket.properties.hs_pipeline_stage = 'review-in-progress';
  await processCommercialEnquiry(valid, { env: activeEnv, fetcher });
  assert.equal(ticket.properties.hs_pipeline_stage, 'review-in-progress');
  assert.equal(fetcher.receipts.size, 1);
});

test('changed customer payload with reused nonce is held rather than associated', async () => {
  const fetcher = mockFetcher();
  await processCommercialEnquiry(valid, { env: activeEnv, fetcher });
  await assert.rejects(processCommercialEnquiry({ ...valid, message: valid.message + ' altered' }, {
    env: activeEnv, fetcher
  }), /G5_TICKET_RECEIPT_IDENTITY_MISMATCH/);
});

test('different nonce yields a different Ticket but the same Contact identity', () => {
  const one = normalizeCommercialEnquiry(valid).enquiry;
  const two = normalizeCommercialEnquiry({ ...valid, form_nonce: 'nonce-distinct-12345' }).enquiry;
  assert.notEqual(one.enquiryKey, two.enquiryKey);
  assert.equal(one.contactKey, two.contactKey);
});
