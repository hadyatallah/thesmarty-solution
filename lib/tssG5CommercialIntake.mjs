// G5 direct website -> HubSpot commercial intake candidate.
// Disabled by default. Does not write legacy Google Sheets CRM records.
import { createHash, timingSafeEqual } from 'node:crypto';

const HUBSPOT_API = 'https://api.hubapi.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROUTES = new Set([
  'business-growth', 'market-entry', 'strategic-connections',
  'opportunity-development', 'business-systems', 'commercial-review', 'kiti'
]);
const REQUIRED_UNIQUE = {
  tickets: 'tss_enquiry_key',
  contacts: 'tss_contact_key',
  companies: 'tss_company_key'
};

export function authorized(candidate, secret) {
  if (!candidate || !secret) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(String(secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

function clean(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function textBlock(value, max = 6000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function key(prefix, value) {
  return prefix + '_' + createHash('sha256').update(String(value || '').toLowerCase()).digest('hex').slice(0, 32);
}

export function normalizeCommercialEnquiry(input = {}, now = new Date()) {
  const name = clean(input.name, 160);
  const email = clean(input.email, 254).toLowerCase();
  const company = clean(input.company || input.company_name, 180);
  const route = clean(input.route || input.interest || 'commercial-review', 80);
  const message = textBlock(input.message);
  const source = clean(input.source || input.page || '', 600);
  const nonce = clean(input.form_nonce || input.nonce || '', 160);
  const website = clean(input.company_website || input.website, 300);
  const phone = clean(input.phone, 80);
  const consent = input.marketing_consent === 'Yes' || input.marketing_consent === true ? 'Yes' : 'No';

  const errors = [];
  if (!name) errors.push('missing_name');
  if (!EMAIL_RE.test(email)) errors.push('invalid_email');
  if (!company) errors.push('missing_company');
  if (!ALLOWED_ROUTES.has(route)) errors.push('invalid_route');
  if (!message || message.length < 20) errors.push('message_too_short');
  if (!nonce || nonce.length < 10) errors.push('missing_nonce');
  if (!source.startsWith('https://www.thesmartysolution.com/') &&
      !source.startsWith('https://thesmartysolution.com/') &&
      !/https:\/\/thesmarty-solution-agent(?:-git-[a-z0-9-]+)?-tss21\.vercel\.app\//i.test(source)) {
    errors.push('invalid_source');
  }
  const receivedAt = now.toISOString();
  const enquiryKey = key('tss_g5_enquiry', [email, nonce, route, source].join('|'));
  return {
    valid: errors.length === 0,
    errors,
    enquiry: { name, email, company, route, message, source, nonce, website, phone, consent, receivedAt, enquiryKey,
      contactKey: key('tss_g5_contact', email),
      companyKey: key('tss_g5_company', company + '|' + website) }
  };
}

function assertHttp(res, body, service) {
  if (!res.ok) {
    const e = new Error(service + ': HTTP ' + res.status);
    e.status = res.status;
    e.body = body;
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

export function makeHubSpotClient(env, fetcher = fetch) {
  const headers = { Authorization: 'Bearer ' + env.TSS_HUBSPOT_SERVICE_KEY, 'Content-Type': 'application/json' };
  async function call(method, path, body) {
    return jsonFetch(HUBSPOT_API + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }, 'hubspot', fetcher);
  }
  return {
    async property(objectType, name) {
      return call('GET', '/crm/v3/properties/' + encodeURIComponent(objectType) + '/' + encodeURIComponent(name));
    },
    async create(objectType, properties) {
      return call('POST', '/crm/v3/objects/' + encodeURIComponent(objectType), { properties });
    },
    async pipeline(objectType, id) {
      return call('GET', '/crm/v3/pipelines/' + encodeURIComponent(objectType) + '/' + encodeURIComponent(id));
    },
    async batchUpsert(objectType, idProperty, id, properties) {
      return call('POST', '/crm/v3/objects/' + encodeURIComponent(objectType) + '/batch/upsert', {
        inputs: [{ idProperty, id, properties }]
      });
    },
    async search(objectType, propertyName, value, properties = []) {
      const data = await call('POST', '/crm/v3/objects/' + encodeURIComponent(objectType) + '/search', {
        filterGroups: [{ filters: [{ propertyName, operator: 'EQ', value }] }],
        properties,
        limit: 2
      });
      return data.results || [];
    },
    async associate(fromType, fromId, toType, toId) {
      return call('PUT', '/crm/v4/objects/' + encodeURIComponent(fromType) + '/' + encodeURIComponent(fromId) +
        '/associations/default/' + encodeURIComponent(toType) + '/' + encodeURIComponent(toId));
    },
    async associations(fromType, fromId, toType) {
      const data = await call('GET', '/crm/v4/objects/' + encodeURIComponent(fromType) + '/' +
        encodeURIComponent(fromId) + '/associations/' + encodeURIComponent(toType));
      return data.results || [];
    }
  };
}

export async function verifyG5HubSpotContract(hub, env = {}) {
  const checks = [];
  for (const [objectType, property] of Object.entries(REQUIRED_UNIQUE)) {
    const p = await hub.property(objectType, property);
    const unique = p && p.name === property && p.type === 'string' &&
      (p.hasUniqueValue === true || p.hasUniqueValue === 'true');
    checks.push({ objectType, property, unique: !!unique });
  }
  if (checks.some(c => !c.unique)) {
    const e = new Error('G5_UNIQUE_PROPERTY_CONTRACT_MISSING');
    e.checks = checks;
    throw e;
  }

  const pipelineId = String(env.TSS_G5_TICKET_PIPELINE_ID || '');
  const stageId = String(env.TSS_G5_TICKET_NEW_STAGE_ID || '');
  // The existing Support Pipeline is NOT a commercial enquiry destination.
  if (!pipelineId || pipelineId === '0' || !stageId) throw new Error('G5_DEDICATED_TICKET_PIPELINE_REQUIRED');
  const pipeline = await hub.pipeline('tickets', pipelineId);
  const stage = (pipeline?.stages || []).find(s => String(s.id) === stageId);
  if (String(pipeline?.id) !== pipelineId || !stage || stage.metadata?.state !== 'OPEN') {
    throw new Error('G5_TICKET_PIPELINE_STAGE_UNVERIFIED');
  }
  return checks;
}

function enquiryFingerprint(enquiry) {
  return createHash('sha256').update(JSON.stringify([
    enquiry.email, enquiry.name, enquiry.company, enquiry.route, enquiry.message,
    enquiry.source, enquiry.nonce, enquiry.website, enquiry.phone, enquiry.consent
  ])).digest('hex');
}

export function hubspotPropertiesFor(enquiry, env = {}) {
  const fingerprint = enquiryFingerprint(enquiry);
  const ticketBody = [
    'Source: TSS website direct commercial intake',
    'G5 Enquiry Key: ' + enquiry.enquiryKey,
    'Payload SHA256: ' + fingerprint,
    'Route: ' + enquiry.route,
    'Source page: ' + enquiry.source,
    'Received UTC: ' + enquiry.receivedAt,
    'Marketing consent: ' + enquiry.consent,
    '',
    enquiry.message
  ].join('\n');
  return {
    company: {
      name: enquiry.company,
      tss_company_key: enquiry.companyKey,
      tss_source_system: 'TSS Website G5 Direct Intake',
      ...(enquiry.website ? { domain: enquiry.website.replace(/^https?:\/\//i, '').replace(/\/.*$/, '') } : {})
    },
    contact: {
      email: enquiry.email,
      firstname: enquiry.name,
      phone: enquiry.phone,
      tss_contact_key: enquiry.contactKey,
      tss_source_system: 'TSS Website G5 Direct Intake'
    },
    ticket: {
      subject: 'Review website enquiry: ' + enquiry.company,
      content: ticketBody,
      hs_pipeline: String(env.TSS_G5_TICKET_PIPELINE_ID),
      hs_pipeline_stage: String(env.TSS_G5_TICKET_NEW_STAGE_ID),
      tss_enquiry_key: enquiry.enquiryKey,
      tss_source_system: 'TSS Website G5 Direct Intake'
    }
  };
}

function firstResultId(result) {
  return result?.results?.[0]?.id || result?.id || null;
}

function associationId(link) {
  return String(link?.toObjectId ?? link?.id ?? link?.to?.id ?? '');
}

function hasAssociation(links, expectedId) {
  return (links || []).some(link => associationId(link) === String(expectedId));
}

async function readUnique(hub, objectType, propertyName, value, properties) {
  const matches = await hub.search(objectType, propertyName, value, properties);
  if (matches.length !== 1) {
    const e = new Error('G5_' + objectType.toUpperCase() + '_READBACK_UNVERIFIED');
    e.matches = matches.length;
    throw e;
  }
  return matches[0];
}

async function verifyAssociations(hub, ids) {
  const [contactCompanies, ticketCompanies, ticketContacts] = await Promise.all([
    hub.associations('contacts', ids.contactId, 'companies'),
    hub.associations('tickets', ids.ticketId, 'companies'),
    hub.associations('tickets', ids.ticketId, 'contacts')
  ]);
  if (!hasAssociation(contactCompanies, ids.companyId)) throw new Error('G5_CONTACT_COMPANY_ASSOCIATION_UNVERIFIED');
  if (!hasAssociation(ticketCompanies, ids.companyId)) throw new Error('G5_TICKET_COMPANY_ASSOCIATION_UNVERIFIED');
  if (!hasAssociation(ticketContacts, ids.contactId)) throw new Error('G5_TICKET_CONTACT_ASSOCIATION_UNVERIFIED');
  return {
    contactCompanies: contactCompanies.length,
    ticketCompanies: ticketCompanies.length,
    ticketContacts: ticketContacts.length
  };
}

export async function processCommercialEnquiry(input, { env = process.env, fetcher = fetch, now = new Date() } = {}) {
  const normalized = normalizeCommercialEnquiry(input, now);
  if (!normalized.valid) return { status: 'rejected', errors: normalized.errors };
  if (!env.TSS_HUBSPOT_SERVICE_KEY) throw new Error('G5_NOT_CONFIGURED: TSS_HUBSPOT_SERVICE_KEY');
  const hub = makeHubSpotClient(env, fetcher);
  const contract = await verifyG5HubSpotContract(hub, env);
  const props = hubspotPropertiesFor(normalized.enquiry, env);
  if (env.TSS_G5_HUBSPOT_DIRECT_ENABLED !== 'true') {
    return { status: 'ready_dry_run', writes: 0, enquiryKey: normalized.enquiry.enquiryKey, contract };
  }

  // The unique Ticket is the sole durable enquiry receipt and human-review item.
  // Create (never upsert) so a replay cannot reset a reviewer-edited pipeline stage.
  // A provider conflict or timeout is ambiguous until exact-key readback succeeds.
  let createdTicket = null, createError = null;
  try {
    createdTicket = await hub.create('tickets', props.ticket);
  } catch (e) {
    createError = e;
  }

  let ticket;
  try {
    ticket = await readUnique(hub, 'tickets', REQUIRED_UNIQUE.tickets,
      normalized.enquiry.enquiryKey, ['tss_enquiry_key', 'content', 'hs_pipeline', 'hs_pipeline_stage']);
  } catch (e) {
    const hold = new Error('G5_TICKET_RECEIPT_UNVERIFIED');
    hold.cause = createError || e;
    throw hold;
  }
  if (!ticket?.id || (createdTicket?.id && String(createdTicket.id) !== String(ticket.id)) ||
      ticket.properties?.tss_enquiry_key !== normalized.enquiry.enquiryKey ||
      String(ticket.properties?.hs_pipeline) !== String(env.TSS_G5_TICKET_PIPELINE_ID) ||
      !String(ticket.properties?.content || '').includes('Payload SHA256: ' + enquiryFingerprint(normalized.enquiry))) {
    throw new Error('G5_TICKET_RECEIPT_IDENTITY_MISMATCH');
  }

  // Company and Contact are upserted by provider-enforced unique identifiers.
  // Uncertain downstream writes leave the durable Ticket available for manual review.
  let company, contact;
  try {
    company = await hub.batchUpsert('companies', REQUIRED_UNIQUE.companies,
      normalized.enquiry.companyKey, props.company);
    contact = await hub.batchUpsert('contacts', REQUIRED_UNIQUE.contacts,
      normalized.enquiry.contactKey, props.contact);
  } catch (e) {
    const hold = new Error('G5_IDENTITY_WRITE_UNCERTAIN');
    hold.cause = e;
    hold.ticketId = ticket.id;
    throw hold;
  }

  const ids = {
    companyId: firstResultId(company),
    contactId: firstResultId(contact),
    ticketId: ticket.id
  };
  if (!ids.companyId || !ids.contactId || !ids.ticketId) throw new Error('G5_WRITE_RESULT_MISSING_ID');
  try {
    await hub.associate('contacts', ids.contactId, 'companies', ids.companyId);
    await hub.associate('tickets', ids.ticketId, 'companies', ids.companyId);
    await hub.associate('tickets', ids.ticketId, 'contacts', ids.contactId);
  } catch (e) {
    const hold = new Error('G5_ASSOCIATION_WRITE_UNCERTAIN');
    hold.cause = e;
    hold.hubspot = ids;
    throw hold;
  }

  const [companyReadback, contactReadback, ticketReadback] = await Promise.all([
    readUnique(hub, 'companies', REQUIRED_UNIQUE.companies, normalized.enquiry.companyKey, ['tss_company_key', 'name']),
    readUnique(hub, 'contacts', REQUIRED_UNIQUE.contacts, normalized.enquiry.contactKey, ['tss_contact_key', 'email']),
    readUnique(hub, 'tickets', REQUIRED_UNIQUE.tickets, normalized.enquiry.enquiryKey, ['tss_enquiry_key', 'content', 'hs_pipeline'])
  ]);
  if (String(companyReadback.id) !== String(ids.companyId) ||
      String(contactReadback.id) !== String(ids.contactId) ||
      String(ticketReadback.id) !== String(ids.ticketId)) {
    throw new Error('G5_READBACK_ID_MISMATCH');
  }
  if (String(ticketReadback.properties?.hs_pipeline) !== String(env.TSS_G5_TICKET_PIPELINE_ID) ||
      !String(ticketReadback.properties?.content || '').includes('Payload SHA256: ' + enquiryFingerprint(normalized.enquiry))) {
    throw new Error('G5_TICKET_READBACK_MISMATCH');
  }
  const associations = await verifyAssociations(hub, ids);
  return {
    status: 'accepted_for_review',
    enquiryKey: normalized.enquiry.enquiryKey,
    hubspot: { ...ids, associations },
    audit: { readback: 'verified', writes: 'hubspot_only', qualification: 'manual_review_required' }
  };
}
