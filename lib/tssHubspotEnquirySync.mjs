// TSS website -> HubSpot commercial follow-up bridge. No browser or customer messaging.
import { createSign } from 'node:crypto';

export const SHEET_RANGES = ['Tasks!A:K', 'Companies!A:T', 'Contacts!A:N'];
const HUBSPOT_API = 'https://api.hubapi.com';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function records(rows) {
  const [headers = [], ...body] = rows || [];
  return body.filter(row => row[0]).map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] == null ? '' : String(row[i])])));
}

export function classifyWebsiteTask(task, company, startAt) {
  if (!/^TSK-WEB-\d{4}-\d+$/.test(task.id || '')) return 'not_website';
  if (!/Source:\s*Website\b/i.test(task.notes || '')) return 'not_website';
  if (!task.createdAt || !Number.isFinite(Date.parse(task.createdAt))) return 'invalid_date';
  if (!startAt || !Number.isFinite(Date.parse(startAt))) return 'missing_cutoff';
  if (Date.parse(task.createdAt) < Date.parse(startAt)) return 'before_cutoff';
  if (!company || !company.id || !company.name) return 'missing_company';
  const payload = [task.name, task.notes, company.name, company.notes].join(' ');
  if (company.id === 'COM-8ee64d5e' || /\bTSS INTERNAL (EMAIL )?QA\b|TSS-WEB-HS-QA-|NOT A CUSTOMER ENQUIRY/i.test(payload)) return 'internal_qa';
  if (task.status !== 'Open') return 'not_open';
  if (!ISO_DATE.test(task.dueDate || '') || !Number.isFinite(Date.parse(task.dueDate))) return 'invalid_due_date';
  if (!task.notes || !task.notes.includes(task.id.replace(/^TSK-WEB-/, ''))) return 'missing_reference';
  return 'eligible';
}

export function matchSourceContact(task, sourceContacts) {
  const m = (task.notes || '').match(/Reply\s+to\s*:?\s*([^\s,;]+)/i);
  const email = m && m[1].trim().replace(/[.,;:]+$/, '').toLowerCase();
  if (!EMAIL_RE.test(email || '')) return { error: 'no_valid_contact_email' };
  const candidates = sourceContacts.filter(c => (c.companyId || '') === task.companyId && (c.email || '').trim().toLowerCase() === email);
  const sourceReference = task.id.replace(/^TSK-WEB-/, '');
  const specificallyMatched = candidates.filter(c => (c.notes || '').includes(sourceReference));
  const matches = specificallyMatched.length ? specificallyMatched : candidates;
  if (matches.length !== 1) return { error: 'contact_ambiguous_or_missing' };
  return { email, sourceContact: matches[0] };
}

export function nicosiaDueTimestamp(dueDate) {
  if (!ISO_DATE.test(dueDate || '') || Number.isNaN(Date.parse(dueDate))) throw new Error('Invalid due date');
  // 12:00 UTC safely avoids DST transitions; due time is 17:00 locally.
  const atNoon = new Date(dueDate + 'T12:00:00Z');
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Nicosia', timeZoneName: 'shortOffset' })
    .formatToParts(atNoon).find(p => p.type === 'timeZoneName');
  const match = /^GMT\+(\d{1,2})(?::(\d{2}))?$/.exec(part?.value || '');
  if (!match) throw new Error('Could not determine Cyprus timezone');
  return dueDate + 'T17:00:00+' + match[1].padStart(2, '0') + ':' + (match[2] || '00');
}

function assertHttp(res, body, service) {
  if (!res.ok) {
    const reason = body?.category || body?.status || 'request_failed';
    const e = new Error(service + ': HTTP ' + res.status + ' (' + reason + ')');
    e.status = res.status;
    throw e;
  }
  return body;
}

async function jsonFetch(url, opts, service, fetcher = fetch) {
  const res = await fetcher(url, opts);
  let body;
  try { body = await res.json(); } catch { body = null; }
  return assertHttp(res, body, service);
}

async function googleAccessToken(serviceAccount, fetcher) {
  if (!serviceAccount.client_email || !serviceAccount.private_key) throw new Error('Incomplete Google service account');
  const now = Math.floor(Date.now() / 1000);
  const encoded = val => Buffer.from(JSON.stringify(val)).toString('base64url');
  const unsigned = encoded({ alg: 'RS256', typ: 'JWT' }) + '.' + encoded({
    iss: serviceAccount.client_email,
    scope: GOOGLE_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3000
  });
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const assertion = unsigned + '.' + sign.sign(serviceAccount.private_key, 'base64url');
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
  const token = await jsonFetch('https://oauth2.googleapis.com/token',
    { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() },
    'google_oauth', fetcher);
  if (!token.access_token) throw new Error('Google token was not issued');
  return token.access_token;
}

export async function readSourceTables(env, fetcher = fetch) {
  const account = JSON.parse(env.TSS_GOOGLE_SERVICE_ACCOUNT_JSON);
  const token = await googleAccessToken(account, fetcher);
  const url = new URL('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(env.TSS_MASTER_SPREADSHEET_ID) + '/values:batchGet');
  for (const range of SHEET_RANGES) url.searchParams.append('ranges', range);
  url.searchParams.set('valueRenderOption', 'FORMATTED_VALUE');
  const response = await jsonFetch(url.toString(), { headers: { Authorization: 'Bearer ' + token } }, 'sheets', fetcher);
  if (!Array.isArray(response.valueRanges) || response.valueRanges.length !== 3) throw new Error('Incomplete source workbook read');
  const [tasks, companies, contacts] = response.valueRanges.map(item => records(item.values));
  return { tasks, companies, contacts };
}

export function makeHubSpot(env, fetcher = fetch) {
  const auth = { Authorization: 'Bearer ' + env.TSS_HUBSPOT_SERVICE_KEY, 'Content-Type': 'application/json' };
  async function call(method, path, body) {
    return jsonFetch(HUBSPOT_API + path, { method, headers: auth, ...(body ? { body: JSON.stringify(body) } : {}) }, 'hubspot', fetcher);
  }
  const root = '/crm/objects/2026-09/';
  return {
    async search(type, field, value, properties = []) {
      const data = await call('POST', root + type + '/search', {
        filterGroups: [{ filters: [{ propertyName: field, operator: 'EQ', value }] }], properties, limit: 3
      });
      return data.results || [];
    },
    async get(type, id, query = '') { return call('GET', root + type + '/' + encodeURIComponent(id) + query); },
    async create(type, properties, associations = []) {
      return call('POST', root + type, { properties, associations });
    },
    async defaultType(from, to) {
      const data = await call('GET', '/crm/associations/2026-09/' + from + '/' + to + '/labels');
      const match = (data.results || []).find(x => x.category === 'HUBSPOT_DEFINED' && x.label == null && Number.isInteger(Number(x.typeId)));
      if (!match) throw new Error('No default association for ' + from + '/' + to);
      return Number(match.typeId);
    }
  };
}

function association(id, typeId) {
  return { to: { id: String(id) }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: typeId }] };
}

async function uniqueSearch(hub, type, property, value, properties = []) {
  const matches = await hub.search(type, property, value, properties);
  if (matches.length > 1) throw new Error('Ambiguous ' + type + ' match');
  return matches[0] || null;
}

// Write authorization requires a server-owned exclusive lease before any
// check-then-create operation. No lease provider ships with this Preview:
// Production stays fail-closed until a durable, tested adapter is approved.
export async function syncOne(entry, context) {
  if (!context.write) return syncOneWithLease(entry, context);
  if (!context.writeLease || typeof context.writeLease.acquire !== 'function') {
    throw new Error('DURABLE_WRITE_LEASE_REQUIRED');
  }
  const lease = await context.writeLease.acquire(entry.task.id);
  if (!lease || typeof lease.release !== 'function') {
    throw new Error('DURABLE_WRITE_LEASE_UNAVAILABLE');
  }
  let outcome = { status: 'review_required' };
  try {
    const result = await syncOneWithLease(entry, context);
    // A reservation can be committed only after exact provider readback.
    outcome = { status: 'verified', operation: result.status,
      taskId: result.hubspotTaskId || null };
    return result;
  } finally {
    // A failed or uncertain provider request stays reserved for manual review.
    // Never implicitly delete an exclusive reservation in this path.
    await lease.release(outcome);
  }
}

async function syncOneWithLease(entry, context) {
  const { task, company, sourceContact } = entry;
  const { hub, write, ownerId } = context;
  const enquiryId = task.id.replace(/^TSK-WEB-/, '');
  const existingTask = await uniqueSearch(hub, 'tasks', 'hs_task_subject', task.name, ['hs_task_subject', 'hs_task_body', 'hs_task_status']);
  if (existingTask) {
    const marker = 'TSS Task ID: ' + task.id;
    const bodyLines = String(existingTask.properties?.hs_task_body || '').split(/\r?\n/);
    if (!bodyLines.some(line => line.trim() === marker)) {
      throw new Error('Task subject collision');
    }
    // A matching subject and marker are not sufficient: after an uncertain
    // response, verify the persisted task has the exact expected associations.
    const expectedCompany = await uniqueSearch(hub, 'companies', 'tss_company_id', company.id,
      ['tss_company_id']);
    const expectedContact = await uniqueSearch(hub, 'contacts', 'email', sourceContact.email,
      ['email', 'tss_contact_id', 'tss_source_system']);
    if (!expectedCompany || !expectedContact ||
        expectedCompany.properties?.tss_company_id !== company.id ||
        (expectedContact.properties?.email || '').toLowerCase() !== sourceContact.email.toLowerCase() ||
        expectedContact.properties?.tss_contact_id !== sourceContact.id ||
        (expectedContact.properties?.tss_source_system || '').trim().toLowerCase() === 'personal - android import') {
      throw new Error('Existing task identity requires manual review');
    }
    const current = await hub.get('tasks', existingTask.id, '?associations=companies,contacts');
    const linkedCompanies = current.associations?.companies?.results || [];
    const linkedContacts = current.associations?.contacts?.results || [];
    if (linkedCompanies.length !== 1 || linkedContacts.length !== 1 ||
        String(linkedCompanies[0].id) !== String(expectedCompany.id) ||
        String(linkedContacts[0].id) !== String(expectedContact.id)) {
      throw new Error('Existing task associations require manual review');
    }
    if (!/^[0-9]{1,20}$/.test(String(existingTask.id || ''))) {
      throw new Error('Existing task provider ID requires manual review');
    }
    return { reference: enquiryId, status: 'already_synced',
      hubspotTaskId: String(existingTask.id) };
  }
  // No writes before all matches and association types have been validated.
  const existingCompany = await uniqueSearch(hub, 'companies', 'tss_company_id', company.id, ['name', 'tss_company_id']);
  if (existingCompany && (existingCompany.properties?.tss_company_id || '') !== company.id) throw new Error('Company ID mismatch');
  if (!existingCompany) {
    const sameName = await hub.search('companies', 'name', company.name, ['name', 'tss_company_id']);
    if (sameName.length) throw new Error('Company name already exists without canonical ID');
  }
  const existingContact = await uniqueSearch(hub, 'contacts', 'email', sourceContact.email, ['email', 'tss_contact_id', 'tss_source_system']);
  if (existingContact && (existingContact.properties?.email || '').toLowerCase() !== sourceContact.email.toLowerCase()) {
    throw new Error('Non-exact contact email match');
  }
  if (existingContact) {
    // Never reuse personal Android imports or contacts mapped to a different
    // canonical source identity, even if an email address is identical.
    if ((existingContact.properties?.tss_source_system || '').trim().toLowerCase() === 'personal - android import') {
      throw new Error('Personal contact cannot be reused for commercial enquiry');
    }
    // An unmapped existing email may belong to another business or personal
    // import. Require the exact authoritative source Contact ID before reuse.
    if (!existingContact.properties?.tss_contact_id ||
        existingContact.properties.tss_contact_id !== sourceContact.id) {
      throw new Error('Contact TSS identity mismatch or missing');
    }
    const detailed = await hub.get('contacts', existingContact.id, '?associations=companies');
    const companyLinks = detailed.associations?.companies?.results || [];
    // Do not silently relink an imported contact or leave it unassociated.
    if (!companyLinks.length || !existingCompany ||
        companyLinks.some(link => String(link.id) !== String(existingCompany.id))) {
      throw new Error('Existing contact/company association requires manual review');
    }
  }
  const relationIds = await Promise.all([
    hub.defaultType('tasks', 'companies'), hub.defaultType('tasks', 'contacts'),
    hub.defaultType('contacts', 'companies')
  ]);
  const taskProperties = {
    hs_task_subject: task.name,
    hs_task_status: 'NOT_STARTED',
    hs_task_type: 'TODO',
    hs_timestamp: nicosiaDueTimestamp(task.dueDate),
    hubspot_owner_id: String(ownerId),
    hs_task_body: 'Source: TSS Master Workbook / Website\nTSS Task ID: ' + task.id +
      '\nTSS Enquiry ID: ' + enquiryId + '\nSource created (UTC): ' + task.createdAt +
      '\nCommercial review only, no automatic customer outreach.\n\n' + task.notes
  };
  if (taskProperties.hs_task_body.length > 16000) throw new Error('Enquiry notes exceed safe size');
  if (!write) return { reference: enquiryId, status: 'ready_dry_run', company: existingCompany ? 'reuse' : 'create', contact: existingContact ? 'reuse' : 'create' };
  let companyId = existingCompany?.id;
  if (!companyId) {
    const created = await hub.create('companies', {
      name: company.name, tss_company_id: company.id,
      tss_source_system: 'TSS CRM - Master Workbook',
      ...(EMAIL_RE.test(company.email || '') ? { tss_business_email: company.email } : {})
    });
    companyId = created.id;
  }
  let contactId = existingContact?.id;
  if (!contactId) {
    const created = await hub.create('contacts', {
      email: sourceContact.email,
      firstname: sourceContact.name || company.name,
      ...(sourceContact.id ? { tss_contact_id: sourceContact.id } : {})
    }, [association(companyId, relationIds[2])]);
    contactId = created.id;
  }
  // A single task creation with BOTH associations is the idempotency anchor.
  const createdTask = await hub.create('tasks', taskProperties, [
    association(companyId, relationIds[0]), association(contactId, relationIds[1])
  ]);
  if (!createdTask?.id) throw new Error('CREATED_TASK_ID_UNVERIFIED');
  // Never mark the durable reservation committed on a create acknowledgement
  // alone. Independently read back both persisted task associations.
  const verify = await hub.get('tasks', createdTask.id, '?associations=companies,contacts');
  const verifyCompanies = verify.associations?.companies?.results || [];
  const verifyContacts = verify.associations?.contacts?.results || [];
  if (verifyCompanies.length !== 1 || verifyContacts.length !== 1 ||
      String(verifyCompanies[0].id) !== String(companyId) ||
      String(verifyContacts[0].id) !== String(contactId)) {
    throw new Error('CREATED_TASK_ASSOCIATIONS_UNVERIFIED');
  }
  return { reference: enquiryId, status: 'created', hubspotTaskId: createdTask.id };
}

// Explicit READ-ONLY verification, even with zero eligible enquiries. Never creates records.
export async function verifyConnectionProbe(tables, hub) {
  const qaCompany = tables.companies.find(c => c.id === 'COM-8ee64d5e');
  const qaContact = tables.contacts.find(c =>
    c.companyId === 'COM-8ee64d5e' &&
    (c.email || '').toLowerCase() === 'thesmartysolution@gmail.com');
  const qaTask = tables.tasks.find(t => t.id === 'TSK-WEB-2026-0030');
  if (!qaCompany || !qaContact || !qaTask || qaTask.status !== 'Done') {
    throw new Error('SOURCE_QA_EVIDENCE_NOT_FOUND');
  }
  const companies = await hub.search('companies', 'tss_company_id', qaCompany.id,
    ['name', 'tss_company_id']);
  if (companies.length !== 1 || companies[0].properties?.tss_company_id !== qaCompany.id) {
    throw new Error('HUBSPOT_QA_COMPANY_MISMATCH');
  }
  const contacts = await hub.search('contacts', 'email', qaContact.email,
    ['email']);
  if (contacts.length !== 1 ||
    (contacts[0].properties?.email || '').toLowerCase() !== qaContact.email.toLowerCase()) {
    throw new Error('HUBSPOT_QA_CONTACT_MISMATCH');
  }
  const linked = await hub.get('contacts', contacts[0].id, '?associations=companies');
  const associations = linked.associations?.companies?.results || [];
  if (!associations.some(a => String(a.id) === String(companies[0].id))) {
    throw new Error('HUBSPOT_QA_ASSOCIATION_MISMATCH');
  }
  for (const [from, to] of [
    ['tasks', 'companies'], ['tasks', 'contacts'], ['contacts', 'companies']
  ]) {
    const id = await hub.defaultType(from, to);
    if (!Number.isInteger(id) || id < 1) throw new Error('HUBSPOT_ASSOCIATION_TYPE_MISSING');
  }
  return { status: 'verified', sheets: 'read', hubspot: 'read', qaEvidence: 'matched',
    associationDefinitions: 'verified', writes: 0 };
}

// Pure preflight for read-only review and isolated negative tests. No network.
export function collectWebsiteCandidates(tables, startAt) {
  const companyById = new Map(tables.companies.map(c => [c.id, c]));
  const candidates = [], blocked = [], ignored = {};
  for (const task of tables.tasks) {
    const company = companyById.get(task.companyId);
    const classification = classifyWebsiteTask(task, company, startAt);
    if (classification !== 'eligible') {
      // Potential post-cutoff website intake corruption must not disappear
      // into a successful zero-candidate run. Only deliberate exclusions
      // (non-website, older, completed, internal QA) may be ignored.
      const reviewRequired = new Set([
        'invalid_date', 'missing_cutoff', 'missing_company',
        'invalid_due_date', 'missing_reference'
      ]);
      if (reviewRequired.has(classification)) {
        blocked.push({
          reference: task.id.replace(/^TSK-WEB-/, ''),
          status: 'blocked', error: classification
        });
      } else {
        ignored[classification] = (ignored[classification] || 0) + 1;
      }
      continue;
    }
    const matched = matchSourceContact(task, tables.contacts);
    if (matched.error) {
      blocked.push({
        reference: task.id.replace(/^TSK-WEB-/, ''), status: 'blocked',
        error: matched.error
      });
      continue;
    }
    candidates.push({ task, company, sourceContact: matched.sourceContact });
  }
  candidates.sort((a, b) => a.task.createdAt.localeCompare(b.task.createdAt));
  return { candidates, blocked, ignored };
}

export async function runSync(env, options = {}, fetcher = fetch) {
  const required = ['TSS_GOOGLE_SERVICE_ACCOUNT_JSON', 'TSS_MASTER_SPREADSHEET_ID',
    'TSS_HUBSPOT_SERVICE_KEY', 'TSS_HUBSPOT_SYNC_START_AT', 'TSS_HUBSPOT_OWNER_ID'];
  const missing = required.filter(k => !env[k]);
  if (missing.length) throw new Error('Bridge not configured: ' + missing.join(', '));
  if (!Number.isFinite(Date.parse(env.TSS_HUBSPOT_SYNC_START_AT))) throw new Error('Invalid sync cutoff');
  const write = options.write === true && env.TSS_HUBSPOT_SYNC_ENABLED === 'true';
  if (options.write === true && !write) throw new Error('Production writes remain disabled');
  // No real durable lease adapter has been deployed. Even if the write flag is
  // changed, refuse every commit rather than risk simultaneous duplicate tasks.
  if (write && (!options.writeLease || typeof options.writeLease.acquire !== 'function')) {
    throw new Error('DURABLE_WRITE_LEASE_REQUIRED');
  }
  const tables = await readSourceTables(env, fetcher);
  const { candidates, ignored, blocked } =
    collectWebsiteCandidates(tables, env.TSS_HUBSPOT_SYNC_START_AT);
  if (candidates.length + blocked.length > 10) {
    throw new Error('Manual review required: batch exceeds 10 new enquiries');
  }
  const hub = makeHubSpot(env, fetcher);
  const connection = !write ? await verifyConnectionProbe(tables, hub) : null;
  // An otherwise eligible source enquiry missing a canonical Contact must
  // never disappear into "ignored" and return a false green acceptance.
  // Block the ENTIRE batch before any HubSpot write, not just that enquiry.
  if (blocked.length) return {
    mode: write ? 'write' : 'dry_run', connection,
    considered: candidates.length + blocked.length, ignored, results: blocked
  };
  const results = [];
  for (const entry of candidates) {
    try {
      results.push(await syncOne(entry, { hub, write, ownerId: env.TSS_HUBSPOT_OWNER_ID, writeLease: options.writeLease }));
    } catch (e) {
      // Stop on partial write/error; avoid advancing past an unresolved enquiry.
      results.push({ reference: entry.task.id.replace(/^TSK-WEB-/, ''), status: 'blocked', error: e.message });
      break;
    }
  }
  return { mode: write ? 'write' : 'dry_run', connection, considered: candidates.length, ignored, results };
}
