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

test('legacy Kiti URL routes to the single native Contact form with its enquiry context', () => {
  assert.match(redirect, /url=contact\.html\?enquiry=kiti/);
  assert.match(redirect, /tss_enquiry_route=Kiti%20Residential%20Development/);
  assert.doesNotMatch(redirect, /data-tss-form|data-form-id|<form\b/);
});

test('historical form adapter cannot run on the new Contact page', () => {
  assert.doesNotMatch(contact, /src="hubspot-native-forms\.js/);
  assert.ok(oldAdapter.length > 0, 'historical adapter remains unchanged pending wider retirement');
});

test('admin resolves to owner-private Data Center, never the retired CRM',()=>{
 const cfg=JSON.parse(read('vercel.json'));
 for(const route of ['/admin','/admin/']){
  const items=(cfg.redirects||[]).filter(r=>r.source===route);
  assert.equal(items.length,1);
  assert.equal(items[0].permanent,false);
  assert.equal(items[0].destination,'/data-center/');
 }
 assert.ok(read('data-center/index.html').includes('TSS'), 'current private Data Center exists');
 for(const publicPage of ['index.html','contact.html']){
  assert.doesNotMatch(read(publicPage), /href="\/crm\//);
 }
 assert.doesNotMatch(read('script.js'), /href="\/crm\//);
 assert.equal((cfg.redirects||[]).some(r=>['/crm','/crm/'].includes(r.source)),false);
});
