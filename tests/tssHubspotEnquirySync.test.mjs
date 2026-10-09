import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWebsiteTask, matchSourceContact, nicosiaDueTimestamp, records, syncOne, runSync, collectWebsiteCandidates } from '../lib/tssHubspotEnquirySync.mjs';

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
// Test-only, process-local lease. NOT a production lock implementation.
function mockLease() {
  const held = new Set();
  return {
    async acquire(key) {
      if (held.has(key)) throw new Error('WRITE_LEASE_BUSY');
      held.add(key);
      return { async release() { held.delete(key); } };
    },
    active() { return held.size; }
  };
}
function mockHub({ existingTask = null, companyFound = null, contactFound = null,
  taskAssociationsOverride = null } = {}) {
  const created = [];
  const findCreated = (type, prop, value) => created.find(c =>
    c.type === type && c.props[prop] === value);
  const hub = {
    async search(type, field, value) {
      if (type === 'tasks') return existingTask ? [existingTask] :
        created.filter(c => c.type === 'tasks' && c.props.hs_task_subject === value)
          .map(c => ({ id: c.id, properties: { hs_task_body: c.props.hs_task_body } }));
      if (type === 'companies' && field === 'tss_company_id') {
        const made = findCreated('companies', 'tss_company_id', value);
        return companyFound ? [companyFound] : made ? [{ id: made.id, properties: made.props }] : [];
      }
      if (type === 'contacts') {
        const made = findCreated('contacts', 'email', value);
        return contactFound ? [contactFound] : made ? [{ id: made.id, properties: made.props }] : [];
      }
      return [];
    },
    async get(type, id) {
      if (type === 'tasks') {
        if (taskAssociationsOverride) return { associations: taskAssociationsOverride };
        const taskRow = created.find(c => c.type === 'tasks' && c.id === String(id));
        if (taskRow) return { associations: {
          companies: { results: [{ id: taskRow.associations[0].to.id }] },
          contacts: { results: [{ id: taskRow.associations[1].to.id }] }
        } };
        return { associations: {
          companies: { results: companyFound ? [{ id: companyFound.id }] : [] },
          contacts: { results: contactFound ? [{ id: contactFound.id }] : [] }
        } };
      }
      if (type === 'contacts') {
        const row = created.find(c => c.type === 'contacts' && c.id === String(id));
        return { associations: { companies: { results:
          row ? [{ id: row.associations[0].to.id }] :
            companyFound ? [{ id: companyFound.id }] : [] } } };
      }
      return { associations: {} };
    },
    async defaultType(from, to) {
      return { 'tasks/companies': 192, 'tasks/contacts': 204, 'contacts/companies': 1 }[from + '/' + to];
    },
    async create(type, props, associations) {
      created.push({ type, props, associations, id: String(created.length + 1) });
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
  const result = await syncOne(entry, { hub, write: true, writeLease: mockLease(), ownerId: '100713372' });
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
  const a = mockHub({
    existingTask: { id: '123', properties: { hs_task_body: 'TSS Task ID: TSK-WEB-2026-0031' } },
    companyFound: { id: '101', properties: { tss_company_id: company.id } },
    contactFound: { id: '102', properties: { email: contact.email, tss_contact_id: contact.id } }
  });
  assert.equal((await syncOne(entry, { hub: a.hub, write: true, writeLease: mockLease(), ownerId: '1' })).status, 'already_synced');
  assert.equal(a.created.length, 0);
  const b = mockHub({ existingTask: { id: '123', properties: { hs_task_body: 'Other task' } } });
  await assert.rejects(syncOne(entry, { hub: b.hub, write: true, writeLease: mockLease(), ownerId: '1' }), /collision/);
  assert.equal(b.created.length, 0);
});
test('existing company and contact are reused without altering their properties', async () => {
  const x = mockHub({
    companyFound: { id: '101', properties: { tss_company_id: company.id } },
    contactFound: { id: '102', properties: { email: contact.email, tss_contact_id: contact.id } }
  });
  await syncOne(entry, { hub: x.hub, write: true, writeLease: mockLease(), ownerId: '100713372' });
  assert.deepEqual(x.created.map(c => c.type), ['tasks']);
  assert.deepEqual(x.created[0].associations.map(a => a.to.id), ['101', '102']);
});

test('existing unassociated contact blocks rather than silently linking to a company', async () => {
  const x = mockHub({ contactFound: { id: '102', properties: { email: contact.email, tss_contact_id: contact.id } } });
  await assert.rejects(syncOne(entry, { hub: x.hub, write: true, writeLease: mockLease(), ownerId: '1' }), /association requires manual review/);
  assert.equal(x.created.length, 0);
});

test('G4 stays fail-closed when no server-owned exclusive write lease exists', async () => {
  const x = mockHub();
  await assert.rejects(syncOne(entry, { hub: x.hub, write: true, ownerId: '1' }),
    /DURABLE_WRITE_LEASE_REQUIRED/);
  assert.equal(x.created.length, 0);
});

test('a busy lease refuses a second concurrent writer without provider writes', async () => {
  const lock = mockLease();
  const held = await lock.acquire(task.id);
  const x = mockHub();
  await assert.rejects(syncOne(entry, { hub: x.hub, write: true, writeLease: lock, ownerId: '1' }),
    /WRITE_LEASE_BUSY/);
  assert.equal(x.created.length, 0);
  await held.release();
  assert.equal((await syncOne(entry, { hub: x.hub, write: true, writeLease: lock, ownerId: '1' })).status, 'created');
  assert.equal(x.created.filter(x => x.type === 'tasks').length, 1);
  assert.equal(lock.active(), 0);
});

test('mock lease releases after provider failure and retry rechecks existing task', async () => {
  const x = mockHub();
  const lock = mockLease();
  const create = x.hub.create;
  let failAfterCreate = true;
  x.hub.create = async (...args) => {
    const result = await create(...args);
    if (args[0] === 'tasks' && failAfterCreate) {
      failAfterCreate = false;
      throw new Error('PROVIDER_ACK_UNCERTAIN');
    }
    return result;
  };
  await assert.rejects(syncOne(entry, { hub: x.hub, write: true, writeLease: lock, ownerId: '1' }),
    /PROVIDER_ACK_UNCERTAIN/);
  assert.equal(lock.active(), 0);
  // The first task already exists; a retry must not create a second.
  const second = await syncOne(entry, { hub: x.hub, write: true, writeLease: lock, ownerId: '1' });
  assert.equal(second.status, 'already_synced');
  assert.equal(x.created.filter(c => c.type === 'tasks').length, 1);
});

test('personal Android contacts are never silently reused for commercial enquiries', async () => {
  const x = mockHub({
    companyFound: { id: '101', properties: { tss_company_id: company.id } },
    contactFound: { id: '102', properties: {
      email: contact.email, tss_source_system: 'Personal - Android Import'
    } }
  });
  await assert.rejects(syncOne(entry, { hub: x.hub, write: true, writeLease: mockLease(), ownerId: '1' }),
    /Personal contact cannot be reused/);
  assert.equal(x.created.length, 0);
});

test('mismatched canonical contact IDs fail before any write', async () => {
  const x = mockHub({
    companyFound: { id: '101', properties: { tss_company_id: company.id } },
    contactFound: { id: '102', properties: {
      email: contact.email, tss_contact_id: 'OTHER-TSS-CONTACT'
    } }
  });
  await assert.rejects(syncOne(entry, { hub: x.hub, write: true, writeLease: mockLease(), ownerId: '1' }),
    /Contact TSS identity mismatch/);
  assert.equal(x.created.length, 0);
});

test('enabled Production flag alone cannot bypass missing durable lease or reach providers', async () => {
  const env = {
    TSS_HUBSPOT_SYNC_ENABLED: 'true',
    TSS_GOOGLE_SERVICE_ACCOUNT_JSON: 'test-only-placeholder',
    TSS_MASTER_SPREADSHEET_ID: 'test-workbook',
    TSS_HUBSPOT_SERVICE_KEY: 'test-only-placeholder',
    TSS_HUBSPOT_SYNC_START_AT: '2026-10-09T00:00:00Z',
    TSS_HUBSPOT_OWNER_ID: '100713372'
  };
  let providerCalls = 0;
  await assert.rejects(runSync(env, { write: true }, async () => {
    providerCalls++;
    throw new Error('Unexpected provider access');
  }), /DURABLE_WRITE_LEASE_REQUIRED/);
  assert.equal(providerCalls, 0);
});

test('existing task without exact Company and Contact links must not count as synced', async () => {
  const x = mockHub({
    existingTask: { id: '123', properties: { hs_task_body: 'TSS Task ID: TSK-WEB-2026-0031' } },
    companyFound: { id: '101', properties: { tss_company_id: company.id } },
    contactFound: { id: '102', properties: { email: contact.email, tss_contact_id: contact.id } },
    taskAssociationsOverride: {
      companies: { results: [{ id: '101' }] }, contacts: { results: [] }
    }
  });
  await assert.rejects(syncOne(entry, { hub: x.hub, write: true, writeLease: mockLease(), ownerId: '1' }),
    /Existing task associations require manual review/);
  assert.equal(x.created.length, 0);
});

test('website preflight flags eligible enquiry missing a matching source Contact', () => {
  const read = collectWebsiteCandidates(
    { tasks: [task], companies: [company], contacts: [] }, '2026-10-09T00:00:00Z');
  assert.equal(read.candidates.length, 0);
  assert.deepEqual(read.blocked, [{
    reference: '2026-0031', status: 'blocked', error: 'contact_ambiguous_or_missing'
  }]);
  assert.equal(Object.keys(read.ignored).length, 0);
});

test('website preflight retains a good enquiry but blocks ambiguous identity', () => {
  const second = { ...task, id: 'TSK-WEB-2026-0032', name: 'Review Website enquiry TSS-2026-0032',
    notes: 'Website enquiry TSS-2026-0032 | Source: Website | Reply to prospect@example.com' };
  const read = collectWebsiteCandidates(
    { tasks: [task, second], companies: [company],
      contacts: [{ ...contact, notes: 'TSS-2026-0031' }, { ...contact, id:'CON-0032', notes:'TSS-2026-0032' }] },
    '2026-10-09T00:00:00Z');
  assert.equal(read.blocked.length, 0);
  assert.equal(read.candidates.length, 2);
  const ambiguous = collectWebsiteCandidates(
    { tasks: [task], companies: [company], contacts: [contact, { ...contact, id:'CON-DUPLICATE' }] },
    '2026-10-09T00:00:00Z');
  assert.equal(ambiguous.blocked.length, 1);
  assert.equal(ambiguous.candidates.length, 0);
});

test('existing HubSpot contact missing canonical source ID fails without writes', async () => {
  const x = mockHub({
    companyFound: { id: '101', properties: { tss_company_id: company.id } },
    contactFound: { id: '102', properties: { email: contact.email } }
  });
  await assert.rejects(
    syncOne(entry, { hub: x.hub, write: true, writeLease: mockLease(), ownerId: '1' }),
    /Contact TSS identity mismatch or missing/);
  assert.equal(x.created.length, 0);
});

test('website preflight excludes completed internal QA without blocking batch', () => {
  const qaTask = { ...task, id: 'TSK-WEB-2026-0030', companyId: 'COM-8ee64d5e',
    status: 'Done', notes: 'Website enquiry TSS-2026-0030 | Source: Website | Reply to thesmartysolution@gmail.com' };
  const qaCo = { id: 'COM-8ee64d5e', name: 'TSS Internal Email QA' };
  const read = collectWebsiteCandidates(
    { tasks: [qaTask], companies: [qaCo], contacts: [] }, '2026-10-09T00:00:00Z');
  assert.equal(read.blocked.length, 0);
  assert.equal(read.candidates.length, 0);
  assert.equal(read.ignored.internal_qa, 1);
});

test('new task requires persisted Company and Contact readback before lease is committed', async () => {
  const x = mockHub({
    taskAssociationsOverride: {
      companies: { results: [{ id: '1' }] }, contacts: { results: [] }
    }
  });
  const outcomes = [];
  const lease = { async acquire() { return {
    async release(outcome) { outcomes.push(outcome); }
  }; } };
  await assert.rejects(
    syncOne(entry, { hub: x.hub, write: true, writeLease: lease, ownerId: '1' }),
    /CREATED_TASK_ASSOCIATIONS_UNVERIFIED/);
  assert.equal(x.created.filter(z => z.type === 'tasks').length, 1);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].status, 'review_required');
});

test('verified created task settles reservation only after provider readback', async () => {
  const x = mockHub();
  const outcomes = [];
  const lease = { async acquire() { return {
    async release(outcome) { outcomes.push(outcome); }
  }; } };
  const result = await syncOne(entry, {
    hub: x.hub, write: true, writeLease: lease, ownerId: '1'
  });
  assert.equal(result.status, 'created');
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].status, 'verified');
  assert.equal(outcomes[0].taskId, result.hubspotTaskId);
});

test('existing verified task supplies numeric HubSpot ID for durable settlement', async () => {
  const x = mockHub({
    existingTask: { id: '123456', properties: {
      hs_task_body: 'Historical import\nTSS Task ID: TSK-WEB-2026-0031\nSource preserved'
    } },
    companyFound: { id: '101', properties: { tss_company_id: company.id } },
    contactFound: { id: '102', properties: {
      email: contact.email, tss_contact_id: contact.id
    } }
  });
  const outcomes = [];
  const lease = { async acquire() { return { async release(o) { outcomes.push(o); } }; } };
  const result = await syncOne(entry, {
    hub: x.hub, write: true, writeLease: lease, ownerId: '1'
  });
  assert.equal(result.status, 'already_synced');
  assert.equal(result.hubspotTaskId, '123456');
  assert.deepEqual(outcomes, [{
    status: 'verified', operation: 'already_synced', taskId: '123456'
  }]);
  assert.equal(x.created.length, 0);
});

test('similar task ID substring is not accepted as an exact activity marker', async () => {
  const x = mockHub({
    existingTask: { id: '123456', properties: {
      hs_task_body: 'TSS Task ID: TSK-WEB-2026-00310'
    } }
  });
  await assert.rejects(syncOne(entry, {
    hub: x.hub, write: true, writeLease: mockLease(), ownerId: '1'
  }), /Task subject collision/);
  assert.equal(x.created.length, 0);
});

test('legacy task with invalid provider ID cannot be committed as synced', async () => {
  const x = mockHub({
    existingTask: { id: 'not-a-task-id', properties: {
      hs_task_body: 'TSS Task ID: TSK-WEB-2026-0031'
    } },
    companyFound: { id: '101', properties: { tss_company_id: company.id } },
    contactFound: { id: '102', properties: { email: contact.email,
      tss_contact_id: contact.id } }
  });
  const outcomes = [];
  const lease = { async acquire() { return { async release(o) { outcomes.push(o); } }; } };
  await assert.rejects(syncOne(entry, {
    hub: x.hub, write: true, writeLease: lease, ownerId: '1'
  }), /Existing task provider ID requires manual review/);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].status, 'review_required');
  assert.equal(x.created.length, 0);
});
