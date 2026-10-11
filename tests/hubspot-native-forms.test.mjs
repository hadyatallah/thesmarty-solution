import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const contact = read('contact.html');
const redirect = read('kiti-enquiry.html');
const shell = read('contact-site.js');
const oldAdapter = read('hubspot-native-forms.js');

test('new official HubSpot embed is the only Contact submission surface', () => {
  assert.match(contact, /class="hs-form-frame"/);
  assert.equal((contact.match(/data-form-id="/g) || []).length, 1);
  assert.match(contact, /data-form-id="d6b2a98a-ef6b-4a18-9c99-cf39ea2925e5"/);
  assert.match(contact, /src="https:\/\/js-eu1\.hsforms\.net\/forms\/embed\/149509919\.js"/);
  assert.doesNotMatch(contact, /data-tss-hubspot-form|data-tss-form|script\.js\?|hubspot-native-forms\.js|anti-spam\.js/);
});

test('old form IDs and custom submit API cannot be loaded from Contact page', () => {
  assert.doesNotMatch(contact, /d571803e-7777-4f28-94ea-b24df852245c|905f1307-a4f8-4dd1-a299-4caefd5aae01/);
  assert.doesNotMatch(contact, /submissions\/v3\/integration\/submit|script\.google\.com|TSS_FORM_ENDPOINT/);
  assert.doesNotMatch(shell, /fetch\(|XMLHttpRequest|script\.google\.com|\/api\/crm/);
});

test('legacy Kiti URL sends visitor to ordinary Contact, no preselection', () => {
  assert.match(redirect, /url=contact\.html/);
  assert.doesNotMatch(redirect, /enquiry=kiti|data-tss-form/);
});

test('historical form adapter cannot run on the new Contact page', () => {
  assert.doesNotMatch(contact, /src="hubspot-native-forms\.js/);
  assert.ok(oldAdapter.length > 0, 'historical adapter remains unchanged pending wider retirement');
});

test('admin login sends to owner-private ChatGPT-first Data Center, not retired CRM',()=>{
 const cfg=JSON.parse(read('vercel.json'));
 for(const route of ['/admin','/admin/']){
  const items=(cfg.redirects||[]).filter(r=>r.source===route);
  assert.equal(items.length,1);
  assert.equal(items[0].permanent,false);
  assert.equal(items[0].destination,'https://docs.google.com/document/d/1CqVTdI6I402HFvJtTT0y3QfhL7T09Ku1bjex9Ac6CGI/edit');
 }
 assert.match(read('index.html'), /href="\/admin"/);
 assert.match(contact, /href="\/admin"/);
 assert.match(read('script.js'), /href="\/admin"/);
 assert.equal((cfg.redirects||[]).some(r=>['/crm','/crm/'].includes(r.source)),false);
});
