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

function mockFetcher({
  unique = true,
  taskReadback = true,
  companyReadback = true,
  contactReadback = true,
  failTask = false,
  failAssociation = false,
  missingTaskContactAssociation = false,
  duplicateCompany = false
} = {}) {
  const calls = [];
  const ids = { companies: 'company-1', contacts: 'contact-1', tasks: 'task-1' };
  const fetcher = async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes('/properties/')) return response({ hasUniqueValue: unique });
    if (url.includes('/tasks/batch/upsert') && failTask) return response({ category: 'CONFLICT' }, 409);
    if (url.includes('/companies/batch/upsert')) return response({ results: [{ id: ids.companies }] });
    if (url.includes('/contacts/batch/upsert')) return response({ results: [{ id: ids.contacts }] });
    if (url.includes('/tasks/batch/upsert')) return response({ results: [{ id: ids.tasks }] });
    if (url.includes('/associations/default/') && failAssociation) return response({ category: 'VALIDATION_ERROR' }, 400);
    if (url.includes('/associations/default/')) return response({ ok: true });
    if (url.includes('/contacts/contact-1/associations/companies')) return response({ results: [{ toObjectId: ids.companies }] });
    if (url.includes('/tasks/task-1/associations/companies')) return response({ results: [{ toObjectId: ids.companies }] });
    if (url.includes('/tasks/task-1/associations/contacts')) {
      return response({ results: missingTaskContactAssociation ? [] : [{ toObjectId: ids.contacts }] });
    }
    if (url.includes('/companies/search')) {
      return response({ results: duplicateCompany ? [{ id: ids.companies }, { id: 'company-2' }] :
        companyReadback ? [{ id: ids.companies, properties: { tss_company_key: 'x' } }] : [] });
    }
    if (url.includes('/contacts/search')) {
      return response({ results: contactReadback ? [{ id: ids.contacts, properties: { tss_contact_key: 'x' } }] : [] });
    }
    if (url.includes('/tasks/search')) {
      return response({ results: taskReadback ? [{ id: ids.tasks, properties: { tss_enquiry_key: 'x' } }] : [] });
    }
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

test('enabled mode uses unique-property upserts, associations and independent readback', async () => {
  const fetcher = mockFetcher();
  const r = await processCommercialEnquiry(valid, {
    env: { TSS_HUBSPOT_SERVICE_KEY: 'test', TSS_G5_HUBSPOT_DIRECT_ENABLED: 'true' }, fetcher
  });
  assert.equal(r.status, 'accepted_for_review');
  assert.equal(r.audit.qualification, 'manual_review_required');
  const upserts = fetcher.calls.filter(c => c.url.includes('/batch/upsert'));
  assert.deepEqual(upserts.map(c => c.body.inputs[0].idProperty), ['tss_company_key', 'tss_contact_key', 'tss_enquiry_key']);
  const associations = fetcher.calls.filter(c => c.url.includes('/associations/default/'));
  assert.deepEqual(associations.map(c => c.opts.method), ['PUT', 'PUT', 'PUT']);
  assert.equal(fetcher.calls.filter(c => c.url.includes('/search')).length, 3);
  assert.equal(fetcher.calls.filter(c => c.url.includes('sheets.googleapis.com')).length, 0);
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
  }), /G5_TASKS_READBACK_UNVERIFIED/);
});

test('duplicate company identity key is held instead of linked by name or email similarity', async () => {
  const fetcher = mockFetcher({ duplicateCompany: true });
  await assert.rejects(processCommercialEnquiry(valid, {
    env: { TSS_HUBSPOT_SERVICE_KEY: 'test', TSS_G5_HUBSPOT_DIRECT_ENABLED: 'true' }, fetcher
  }), /G5_COMPANIES_READBACK_UNVERIFIED/);
});

test('partial association write and missing association readback require review', async () => {
  const failedWrite = mockFetcher({ failAssociation: true });
  await assert.rejects(processCommercialEnquiry(valid, {
    env: { TSS_HUBSPOT_SERVICE_KEY: 'test', TSS_G5_HUBSPOT_DIRECT_ENABLED: 'true' }, fetcher: failedWrite
  }), /G5_ASSOCIATION_WRITE_UNCERTAIN/);

  const failedReadback = mockFetcher({ missingTaskContactAssociation: true });
  await assert.rejects(processCommercialEnquiry(valid, {
    env: { TSS_HUBSPOT_SERVICE_KEY: 'test', TSS_G5_HUBSPOT_DIRECT_ENABLED: 'true' }, fetcher: failedReadback
  }), /G5_TASK_CONTACT_ASSOCIATION_UNVERIFIED/);
});

test('concurrent identical enquiries converge on the same deterministic identifiers', async () => {
  const fetcher = mockFetcher();
  const env = { TSS_HUBSPOT_SERVICE_KEY: 'test', TSS_G5_HUBSPOT_DIRECT_ENABLED: 'true' };
  const results = await Promise.all([
    processCommercialEnquiry(valid, { env, fetcher }),
    processCommercialEnquiry(valid, { env, fetcher })
  ]);
  assert.equal(results[0].enquiryKey, results[1].enquiryKey);
  assert.deepEqual(results.map(r => r.hubspot.taskId), ['task-1', 'task-1']);
});

test('concurrent distinct enquiries use separate task identity keys without customer communication fields', async () => {
  const one = normalizeCommercialEnquiry(valid, new Date('2026-10-10T02:00:00Z')).enquiry;
  const two = normalizeCommercialEnquiry({ ...valid, form_nonce: 'nonce-distinct-12345' }, new Date('2026-10-10T02:00:00Z')).enquiry;
  assert.notEqual(one.enquiryKey, two.enquiryKey);
  assert.equal(one.contactKey, two.contactKey);
  const fetcher = mockFetcher();
  await processCommercialEnquiry(valid, {
    env: { TSS_HUBSPOT_SERVICE_KEY: 'test', TSS_G5_HUBSPOT_DIRECT_ENABLED: 'true' }, fetcher
  });
  const taskUpsert = fetcher.calls.find(c => c.url.includes('/tasks/batch/upsert'));
  assert.equal(taskUpsert.body.inputs[0].properties.hs_task_status, 'NOT_STARTED');
  assert.equal('hs_email_subject' in taskUpsert.body.inputs[0].properties, false);
});
