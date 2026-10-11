import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const contact = read('contact.html');
const adapter = read('hubspot-native-forms.js');
const shell = read('contact-site.js');
const kiti = read('kiti-enquiry.html');
const config = JSON.parse(read('vercel.json'));

test('Contact page loads one native form only, without legacy CRM or Apps Script', () => {
  assert.equal((contact.match(/data-hs-form-id=/g) || []).length, 1);
  assert.match(contact, /data-hs-form-id="d6b2a98a-ef6b-4a18-9c99-cf39ea2925e5"/);
  assert.match(contact, /hubspot-native-forms\.js/);
  assert.match(contact, /contact-site\.js/);
  assert.doesNotMatch(contact, /src="script\.js|anti-spam\.js|data-tss-form=|script\.google\.com|<form\b/i);
});

test('native embed uses HubSpot script, not a home-grown POST handler', () => {
  assert.match(adapter, /https:\/\/js-eu1\.hsforms\.net\/forms\/embed\/149509919\.js/);
  assert.match(adapter, /d6b2a98a-ef6b-4a18-9c99-cf39ea2925e5/);
  assert.doesNotMatch(adapter, /fetch\(|XMLHttpRequest|submissions\/v3\/integration\/submit/);
});

test('Contact page shell has no old CRM submission or token logic', () => {
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
