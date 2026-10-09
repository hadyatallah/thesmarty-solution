import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWebsiteTask, matchSourceContact, nicosiaDueTimestamp, records, syncOne } from '../lib/tssHubspotEnquirySync.mjs';

const task = {
  id: 'TSK-WEB-2026-0031', name: 'Review Website enquiry TSS-2026-0031',
  companyId: 'COM-NEW-TEST', status: 'Open', dueDate: '2026-10-13',
  createdAt: '2026-10-09T06:05:00Z',
  notes: 'Website enquiry TSS-2026-0031 | Source: Website | Reply to prospect@example.com. No marketing consent'
};
const company = { id: 'COM-NEW-TEST', name: 'Example Business', email: 'prospect@example.com' };
const contact = { id: 'CON-0031', name: 'Example Contact', companyId: company.id, email: 'prospect@example.com' };
const entry = { task, company, sourceContact: contact };

test('read source rows without treating empty rows as records', () => {
  assert.deepEqual(records([['id', 'status'], ['A', 'Open'], [], ['B', 'Done']]), [
    { id: 'A', status: 'Open' }, { id: 'B', status: 'Done' }
  ]);
});
test('new website enquiries are eligible after the explicit cutoff', () => {
  assert.equal(classifyWebsiteTask(task, company, '2026-10-09T00:00:00Z'), 'eligible');
  assert.equal(classifyWebsiteTask({ ...task, notes: task.notes.replace('Source: Website', 'Source: WhatsApp') }, company, '2026-10-09T00:00:00Z'), 'not_website');
  assert.equal(classifyWebsiteTask(task, company, '2026-10-10T00:00:00Z'), 'before_cutoff');
  assert.equal(classifyWebsiteTask({ ...task, status: 'Done' }, company, '2026-10-09T00:00:00Z'), 'not_open');
});
test('internal QA and test submission are excluded even when open', () => {
  assert.equal(classifyWebsiteTask({ ...task, companyId: 'COM-8ee64d5e' }, { ...company, id: 'COM-8ee64d5e' }, '2026-10-09T00:00:00Z'), 'internal_qa');
  assert.equal(classifyWebsiteTask({ ...task, notes: task.notes + ' TSS-WEB-HS-QA-20261009-A' }, company, '2026-10-09T00:00:00Z'), 'internal_qa');
});
test('matching requires unique source contact and the correct company', () => {
  assert.equal(matchSourceContact(task, [contact]).email, 'prospect@example.com');
  const colonVariant = { ...task, notes: task.notes.replace('Reply to prospect@example.com', 'Reply to: prospect@example.com') };
  assert.equal(matchSourceContact(colonVariant, [contact]).email, 'prospect@example.com');
  assert.equal(matchSourceContact(task, [contact, contact]).error, 'contact_ambiguous_or_missing');
  const sourceCopy = { ...contact, id: 'OTHER-ID', notes: 'Unrelated prior interaction' };
  const exactCopy = { ...contact, notes: 'Inbound enquiry TSS-2026-0031' };
  assert.equal(matchSourceContact(task, [sourceCopy, exactCopy]).sourceContact.id, 'CON-0031');
  assert.equal(matchSourceContact(task, [{ ...contact, companyId: 'OTHER' }]).error, 'contact_ambiguous_or_missing');
});
test('due time uses Asia/Nicosia summer and winter offsets', () => {
  assert.equal(nicosiaDueTimestamp('2026-10-13'), '2026-10-13T17:00:00+03:00');
  assert.equal(nicosiaDueTimestamp('2026-11-02'), '2026-11-02T17:00:00+02:00');
});
function mockHub({ existingTask = null, companyFound = null, contactFound = null } = {}) {
  const created = [];
  const hub = {
    async search(type, field, value) {
      if (type === 'tasks') return existingTask ? [existingTask] : [];
      if (type === 'companies' && field === 'tss_company_id') return companyFound ? [companyFound] : [];
      if (type === 'contacts') return contactFound ? [contactFound] : [];
      return [];
    },
    async get() { return { associations: { companies: { results: companyFound ? [{ id: companyFound.id }] : [] } } }; },
    async defaultType(from, to) {
      return { 'tasks/companies': 192, 'tasks/contacts': 204, 'contacts/companies': 1 }[from + '/' + to];
    },
    async create(type, props, associations) {
      created.push({ type, props, associations });
      return { id: String(created.length) };
    }
  };
  return { hub, created };
}
test('dry run resolves but does not create or modify any CRM records', async () => {
  const { hub, created } = mockHub();
  const result = await syncOne(entry, { hub, write: false, ownerId: '100713372' });
  assert.equal(result.status, 'ready_dry_run');
  assert.equal(created.length, 0);
});
test('new enquiry creates only company, contact and internal task with both associations', async () => {
  const { hub, created } = mockHub();
  const result = await syncOne(entry, { hub, write: true, ownerId: '100713372' });
  assert.equal(result.status, 'created');
  assert.deepEqual(created.map(c => c.type), ['companies', 'contacts', 'tasks']);
  const written = created[2];
  assert.equal(written.props.hs_task_status, 'NOT_STARTED');
  assert.equal(written.props.hs_timestamp, '2026-10-13T17:00:00+03:00');
  assert.ok(written.props.hs_task_body.includes('TSS Task ID: TSK-WEB-2026-0031'));
  assert.deepEqual(written.associations.map(a => a.to.id), ['1', '2']);
  assert.equal(written.associations.length, 2);
});
test('existing task is idempotent; unverified subject collision must fail', async () => {
  const a = mockHub({ existingTask: { id: '123', properties: { hs_task_body: 'TSS Task ID: TSK-WEB-2026-0031' } } });
  assert.equal((await syncOne(entry, { hub: a.hub, write: true, ownerId: '1' })).status, 'already_synced');
  assert.equal(a.created.length, 0);
  const b = mockHub({ existingTask: { id: '123', properties: { hs_task_body: 'Other task' } } });
  await assert.rejects(syncOne(entry, { hub: b.hub, write: true, ownerId: '1' }), /collision/);
  assert.equal(b.created.length, 0);
});
test('existing company and contact are reused without altering their properties', async () => {
  const x = mockHub({
    companyFound: { id: '101', properties: { tss_company_id: company.id } },
    contactFound: { id: '102', properties: { email: contact.email } }
  });
  await syncOne(entry, { hub: x.hub, write: true, ownerId: '100713372' });
  assert.deepEqual(x.created.map(c => c.type), ['tasks']);
  assert.deepEqual(x.created[0].associations.map(a => a.to.id), ['101', '102']);
});

test('existing unassociated contact blocks rather than silently linking to a company', async () => {
  const x = mockHub({ contactFound: { id: '102', properties: { email: contact.email } } });
  await assert.rejects(syncOne(entry, { hub: x.hub, write: true, ownerId: '1' }), /association requires manual review/);
  assert.equal(x.created.length, 0);
});
