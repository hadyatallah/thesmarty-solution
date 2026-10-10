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

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function mockFetcher({ unique = true, taskReadback = true, failTask = false } = {}) {
  const calls = [];
  const fetcher = async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes('/properties/')) return response({ hasUniqueValue: unique });
    if (url.includes('/tasks/batch/upsert') && failTask) return response({ category: 'CONFLICT' }, 409);
    if (url.includes('/batch/upsert')) return response({ results: [{ id: String(calls.length) }] });
    if (url.includes('/search')) return response({ results: taskReadback ? [{ id: 'task-1', properties: { tss_enquiry_key: 'x' } }] : [] });
    throw new Error('unexpected call ' + url);
  };
  fetcher.calls = calls;
  return fetcher;
}

test('normalizes a valid commercial enquiry into deterministic keys without qualification', () => {
  const r = normalizeCommercialEnquiry(valid, new Date('2026-10-10T02:00:00Z'));
  assert.equal(r.valid, true);
  assert.match(r.enquiry.enquiryKey, /^tss_g5_enquiry_/);
  assert.equal(r.enquiry.consent, 'No');
  assert.equal(r.enquiry.route, 'business-growth');
});

test('rejects missing proof fields and invalid source before provider calls', async () => {
  const fetcher = mockFetcher();
  const r = await processCommercialEnquiry({ ...valid, source: 'https://attacker.test/', form_nonce: '' }, {
    env: { TSS_HUBSPOT_SERVICE_KEY: 'test' }, fetcher
  });
  assert.equal(r.status, 'rejected');
  assert.deepEqual(fetcher.calls, []);
  assert.ok(r.errors.includes('invalid_source'));
  assert.ok(r.errors.includes('missing_nonce'));
});

test('fails closed when HubSpot unique-value properties are not verified', async () => {
  const hub = { property: async (objectType, property) => ({ name: property, objectType, hasUniqueValue: property !== 'tss_enquiry_key' }) };
  await assert.rejects(verifyG5HubSpotContract(hub), /G5_UNIQUE_PROPERTY_CONTRACT_MISSING/);
});

test('dry run verifies HubSpot contract but performs no writes', async () => {
  const fetcher = mockFetcher();
  const r = await processCommercialEnquiry(valid, {
    env: { TSS_HUBSPOT_SERVICE_KEY: 'test', TSS_G5_HUBSPOT_DIRECT_ENABLED: 'false' }, fetcher
  });
  assert.equal(r.status, 'ready_dry_run');
  assert.equal(r.writes, 0);
  assert.equal(fetcher.calls.filter(c => c.url.includes('/batch/upsert')).length, 0);
});

test('enabled mode uses unique-property upserts and readback as the duplicate anchor', async () => {
  const fetcher = mockFetcher();
  const r = await processCommercialEnquiry(valid, {
    env: { TSS_HUBSPOT_SERVICE_KEY: 'test', TSS_G5_HUBSPOT_DIRECT_ENABLED: 'true' }, fetcher
  });
  assert.equal(r.status, 'accepted_for_review');
  const upserts = fetcher.calls.filter(c => c.url.includes('/batch/upsert'));
  assert.deepEqual(upserts.map(c => c.body.inputs[0].idProperty), ['tss_company_key', 'tss_contact_key', 'tss_enquiry_key']);
  assert.equal(fetcher.calls.some(c => c.url.includes('/search')), true);
});

test('uncertain task write blocks replay instead of pretending acceptance', async () => {
  const fetcher = mockFetcher({ failTask: true });
  await assert.rejects(processCommercialEnquiry(valid, {
    env: { TSS_HUBSPOT_SERVICE_KEY: 'test', TSS_G5_HUBSPOT_DIRECT_ENABLED: 'true' }, fetcher
  }), /G5_TASK_UPSERT_UNCERTAIN/);
});

test('unverified task readback is held for review', async () => {
  const fetcher = mockFetcher({ taskReadback: false });
  await assert.rejects(processCommercialEnquiry(valid, {
    env: { TSS_HUBSPOT_SERVICE_KEY: 'test', TSS_G5_HUBSPOT_DIRECT_ENABLED: 'true' }, fetcher
  }), /G5_TASK_READBACK_UNVERIFIED/);
});
