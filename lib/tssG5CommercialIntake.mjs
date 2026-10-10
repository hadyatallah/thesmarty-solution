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
  tasks: 'tss_enquiry_key',
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
    }
  };
}

export async function verifyG5HubSpotContract(hub) {
  const checks = [];
  for (const [objectType, property] of Object.entries(REQUIRED_UNIQUE)) {
    const p = await hub.property(objectType, property);
    const unique = p && (p.hasUniqueValue === true || p.hasUniqueValue === 'true');
    checks.push({ objectType, property, unique });
  }
  const failed = checks.filter(c => !c.unique);
  if (failed.length) {
    const e = new Error('G5_UNIQUE_PROPERTY_CONTRACT_MISSING');
    e.checks = checks;
    throw e;
  }
  return checks;
}

export function hubspotPropertiesFor(enquiry) {
  const taskBody = [
    'Source: TSS website direct commercial intake',
    'G5 Enquiry Key: ' + enquiry.enquiryKey,
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
    task: {
      hs_task_subject: 'Review website enquiry: ' + enquiry.company,
      hs_task_body: taskBody,
      hs_task_status: 'NOT_STARTED',
      hs_task_type: 'TODO',
      tss_enquiry_key: enquiry.enquiryKey,
      tss_source_system: 'TSS Website G5 Direct Intake'
    }
  };
}

export async function processCommercialEnquiry(input, { env = process.env, fetcher = fetch, now = new Date() } = {}) {
  const normalized = normalizeCommercialEnquiry(input, now);
  if (!normalized.valid) return { status: 'rejected', errors: normalized.errors };
  const required = ['TSS_HUBSPOT_SERVICE_KEY'];
  const missing = required.filter(k => !env[k]);
  if (missing.length) throw new Error('G5_NOT_CONFIGURED: ' + missing.join(', '));
  const hub = makeHubSpotClient(env, fetcher);
  const contract = await verifyG5HubSpotContract(hub);
  const props = hubspotPropertiesFor(normalized.enquiry);
  if (env.TSS_G5_HUBSPOT_DIRECT_ENABLED !== 'true') {
    return { status: 'ready_dry_run', writes: 0, enquiryKey: normalized.enquiry.enquiryKey, contract };
  }

  // These upserts rely on pre-existing HubSpot unique-value properties.
  // Without that portal contract this function fails before any write.
  const company = await hub.batchUpsert('companies', REQUIRED_UNIQUE.companies, normalized.enquiry.companyKey, props.company);
  const contact = await hub.batchUpsert('contacts', REQUIRED_UNIQUE.contacts, normalized.enquiry.contactKey, props.contact);
  let task;
  try {
    task = await hub.batchUpsert('tasks', REQUIRED_UNIQUE.tasks, normalized.enquiry.enquiryKey, props.task);
  } catch (e) {
    e.message = 'G5_TASK_UPSERT_UNCERTAIN';
    e.company = company;
    e.contact = contact;
    throw e;
  }
  const readback = await hub.search('tasks', REQUIRED_UNIQUE.tasks, normalized.enquiry.enquiryKey, ['tss_enquiry_key', 'hs_task_subject']);
  if (readback.length !== 1) throw new Error('G5_TASK_READBACK_UNVERIFIED');
  return {
    status: 'accepted_for_review',
    enquiryKey: normalized.enquiry.enquiryKey,
    hubspot: {
      companyId: company.results?.[0]?.id || null,
      contactId: contact.results?.[0]?.id || null,
      taskId: task.results?.[0]?.id || readback[0].id || null
    }
  };
}
