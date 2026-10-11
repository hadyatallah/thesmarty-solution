import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = name => readFileSync(new URL('../' + name, import.meta.url),'utf8');

test('all public pages using shared script are free of old Apps Script and agent transports', () => {
  const script=read('script.js');
  for(const term of ['script.google.com','TSS_FORM_ENDPOINT','submitTssEnquiry_','/api/tss-agent','data-tss-form','tss-agent-launch']){
    assert.equal(script.includes(term),false,term);
  }
  assert.equal(existsSync(new URL('../api/tss-agent.js', import.meta.url)),false);
  assert.match(script, /window\.tssTrackEvent_/);
  assert.match(script, /tss_analytics_consent_v1/);
  assert.match(script, /footer-socials/);
  assert.match(script, /menuButton/);
});

test('new contact intake remains native HubSpot, without old shared JS', () => {
 const html=read('contact.html');
 assert.match(html,/data-form-id="d6b2a98a-ef6b-4a18-9c99-cf39ea2925e5"/);
 assert.match(html,/js-eu1\.hsforms\.net\/forms\/embed\/149509919\.js/);
 assert.doesNotMatch(html,/src="script\.js|script\.google\.com|data-tss-form/);
});
test('no obsolete CRM cron; Outlook pending backend retirement remains isolated', () => {
 const config=JSON.parse(read('vercel.json'));
 assert.equal(config.crons?.length||0,0);
 assert.equal(existsSync(new URL('../api/crm.js',import.meta.url)),true);
 assert.equal(existsSync(new URL('../api/outlook/_lib.js',import.meta.url)),true);
});
