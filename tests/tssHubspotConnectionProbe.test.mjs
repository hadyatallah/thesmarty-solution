import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyConnectionProbe } from '../lib/tssHubspotEnquirySync.mjs';

const tables = {
  companies: [{ id: 'COM-8ee64d5e', name: 'TSS Internal Email QA' }],
  contacts: [{ id: 'CON-WEB-2026-0030', companyId: 'COM-8ee64d5e', email: 'thesmartysolution@gmail.com' }],
  tasks: [{ id: 'TSK-WEB-2026-0030', status: 'Done' }]
};
function fixture({ invalidCompany = false, invalidContact = false, linked = true } = {}) {
  const calls = [];
  const hub = {
    async search(type, property, value) {
      calls.push(['search', type, property, value]);
      if (type === 'companies') return [{ id: '451891239120',
        properties: { tss_company_id: invalidCompany ? 'OTHER' : 'COM-8ee64d5e' } }];
      if (type === 'contacts') return [{ id: '887125150939',
        properties: { email: invalidContact ? 'wrong@example.com' : 'thesmartysolution@gmail.com' } }];
      throw new Error('Unexpected search: ' + type);
    },
    async get(type, id, query) {
      calls.push(['get', type, id, query]);
      return { associations: { companies: { results: linked ? [{ id: '451891239120' }] : [] } } };
    },
    async defaultType(from, to) {
      calls.push(['defaultType', from, to]);
      return { 'tasks/companies': 192, 'tasks/contacts': 204, 'contacts/companies': 1 }[from + '/' + to];
    },
    async create() { throw new Error('Read-only connection test must never create objects'); }
  };
  return { hub, calls };
}
test('empty sync batch must verify both providers and three associations with zero writes', async () => {
  const { hub, calls } = fixture();
  const result = await verifyConnectionProbe(tables, hub);
  assert.deepEqual(result, {
    status: 'verified', sheets: 'read', hubspot: 'read',
    qaEvidence: 'matched', associationDefinitions: 'verified', writes: 0
  });
  assert.equal(calls.filter(x => x[0] === 'search').length, 2);
  assert.equal(calls.filter(x => x[0] === 'get').length, 1);
  assert.equal(calls.filter(x => x[0] === 'defaultType').length, 3);
});
test('completed source QA fixture required to avoid false positive', async () => {
  const { hub, calls } = fixture();
  const broken = { ...tables, tasks: [{ id: 'TSK-WEB-2026-0030', status: 'Open' }] };
  await assert.rejects(verifyConnectionProbe(broken, hub), /SOURCE_QA_EVIDENCE/);
  assert.equal(calls.length, 0);
});
test('HubSpot company mismatch stops before processing contacts', async () => {
  const { hub, calls } = fixture({ invalidCompany: true });
  await assert.rejects(verifyConnectionProbe(tables, hub), /HUBSPOT_QA_COMPANY_MISMATCH/);
  assert.equal(calls.length, 1);
});
test('HubSpot contact mismatch blocks preview', async () => {
  const { hub } = fixture({ invalidContact: true });
  await assert.rejects(verifyConnectionProbe(tables, hub), /HUBSPOT_QA_CONTACT_MISMATCH/);
});
test('HubSpot contact-company link is independently validated', async () => {
  const { hub } = fixture({ linked: false });
  await assert.rejects(verifyConnectionProbe(tables, hub), /HUBSPOT_QA_ASSOCIATION_MISMATCH/);
});
