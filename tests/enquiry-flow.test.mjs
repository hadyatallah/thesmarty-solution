import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('public Contact page has one updated-editor HubSpot embed and no old form workflow',()=>{
  const html=read('contact.html');
  assert.equal((html.match(/data-form-id=/g)||[]).length,1);
  assert.match(html,/class="hs-form-frame"/);
  assert.doesNotMatch(html,/<form\b|data-tss-form|anti-spam\.js/);
});
test('old Kiti URL simply redirects to Contact with no preselection',()=>{
  const html=read('kiti-enquiry.html');
  assert.match(html,/url=contact\.html/);
  assert.doesNotMatch(html,/enquiry=kiti|data-tss-form/);
});
test('legacy enquiries and assistant are no longer bound in shared site code',()=>{
  const js=read('script.js');
  assert.doesNotMatch(js,/submitTssEnquiry_|tss-agent-launch|tssBuildCommercialEnquiryMessage_|TSS_FORM_ENDPOINT/);
});
