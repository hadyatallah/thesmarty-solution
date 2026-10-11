import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const contact = read('contact.html');
const shell = read('contact-site.js');
const kiti = read('kiti-enquiry.html');
const config = JSON.parse(read('vercel.json'));

test('Contact page has exactly one updated-editor native HubSpot embed', () => {
  assert.equal((contact.match(/data-form-id=/g) || []).length, 1);
  assert.match(contact, /class="hs-form-frame" data-region="eu1" data-portal-id="149509919" data-form-id="d6b2a98a-ef6b-4a18-9c99-cf39ea2925e5"/);
  assert.match(contact, /src="https:\/\/js-eu1\.hsforms\.net\/forms\/embed\/149509919\.js"/);
  assert.match(contact, /contact-site\.js/);
  assert.doesNotMatch(contact, /src="script\.js|hubspot-native-forms\.js|anti-spam\.js|data-tss-form=|script\.google\.com|<form\b/i);
});

test('Contact page uses neither a custom submitter nor legacy CRM script', () => {
  assert.doesNotMatch(contact, /submissions\/v3\/integration\/submit|\/api\/crm|tss-hubspot-enquiry-sync/);
  assert.doesNotMatch(shell, /fetch\(|script\.google\.com|tssForm|session|crm\/|api\/crm/gi);
  assert.match(shell, /aria-expanded/);
  assert.match(shell, /data-year/);
});

test('old Kiti URL redirects to standard Contact with no special preselection', () => {
  assert.match(kiti, /url=contact\.html/);
  assert.doesNotMatch(kiti, /enquiry=kiti|data-tss-form|data-hs-form-id/);
});

test('legacy HubSpot enquiry cron and gateway rewrite are absent', () => {
  assert.ok(!config.crons?.some(job => String(job.path).includes('tss-hubspot-enquiry-sync')));
  assert.ok(!config.rewrites?.some(item => String(item.source).includes('tss-hubspot-enquiry-sync')));
});
