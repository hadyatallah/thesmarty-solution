import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('native HubSpot provider is the sole public website enquiry transport',()=>{
  const html=read('contact.html'),shared=read('script.js');
  assert.match(html,/class="hs-form-frame"/);
  assert.match(html,/d6b2a98a-ef6b-4a18-9c99-cf39ea2925e5/);
  assert.match(html,/js-eu1\.hsforms\.net\/forms\/embed\/149509919\.js/);
  assert.doesNotMatch(html,/data-tss-form|src="script\.js/);
  assert.doesNotMatch(shared,/TSS_FORM_ENDPOINT|submitTssEnquiry_|script\.google\.com|tssFormParams_/);
});
test('old CRM gateway remains isolated and Contact cannot invoke it',()=>{
  assert.equal(existsSync(new URL('../api/crm.js',import.meta.url)),true);
  const html=read('contact.html');
  assert.doesNotMatch(html,/\/api\/crm|script\.google\.com|submissions\/v3\/integration\/submit/);
});
