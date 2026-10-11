import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const contact = read('contact.html');
const script = read('script.js');
const redirect = read('kiti-enquiry.html');
const opportunity = read('opportunity-kiti.html');

const FORM_ID = 'd571803e-7777-4f28-94ea-b24df852245c';
const KITI_VALUE = 'Kiti Residential Development Opportunity';

test('direct native HubSpot Forms endpoint is the single contact transport', () => {
  assert.match(script, /const TSS_HUBSPOT_PORTAL_ID = '149509919'/);
  assert.match(script, new RegExp(`const TSS_HUBSPOT_FORM_ID = '${FORM_ID}'`));
  assert.match(script, /https:\/\/api-eu1\.hsforms\.com\/submissions\/v3\/integration\/submit\//);
  assert.doesNotMatch(script, /script\.google\.com\/macros\/s\//);
  assert.doesNotMatch(contact, /script\.google\.com\/macros\/s\//);
});

test('Contact page keeps one visible form and no native iframe fallback', () => {
  const siteForms = [...contact.matchAll(/<form\b[^>]*data-tss-form="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(siteForms, ['contact']);
  assert.doesNotMatch(contact, /data-tss-hubspot-form/);
  assert.match(contact, /<select id="interest" name="interest" required>/);
  assert.match(contact, /data-route="kiti">Kiti Residential Development Opportunity/);
});

test('old Kiti URL routes into the same contact form with Kiti preselected', () => {
  assert.match(redirect, /contact\.html\?enquiry=kiti/);
  assert.doesNotMatch(redirect, /data-tss-form="kiti"/);
  assert.doesNotMatch(opportunity, /data-tss-form="kiti"/);
  assert.match(script, /kiti:\s*'kiti'/);
});

test('HubSpot payload contains route, privacy acknowledgement and optional marketing consent', () => {
  for (const property of [
    'tss_enquiry_route',
    'tss_business_objective',
    'tss_desired_timing',
    'tss_route_details',
    'tss_privacy_acknowledgement',
    'tss_marketing_consent'
  ]) {
    assert.match(script, new RegExp(`\\['${property}',`));
  }
  assert.match(script, /marketing_consent'\) === 'Yes'\s*\?\s*'true'\s*:\s*'false'/);
  assert.match(script, /privacy_ack'\) \|\| data\.get\('privacy_consent'\)\s*\?\s*'true'\s*:\s*'false'/);
});

test('legacy Kiti value is preserved for HubSpot route identification', () => {
  assert.match(contact, new RegExp(`<option value="${KITI_VALUE}" data-route="kiti">${KITI_VALUE}</option>`));
});
