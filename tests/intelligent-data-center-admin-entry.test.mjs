import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const cfg=JSON.parse(read('vercel.json'));
const privateDoc='https://docs.google.com/document/d/1CqVTdI6I402HFvJtTT0y3QfhL7T09Ku1bjex9Ac6CGI/edit';

test('admin access routes to one Google-permission-controlled Data Center workspace',()=>{
  for(const source of ['/admin','/admin/']){
    const matches=cfg.redirects.filter(x=>x.source===source);
    assert.equal(matches.length,1);
    assert.equal(matches[0].destination,privateDoc);
    assert.equal(matches[0].permanent,false);
  }
  assert.ok(!cfg.redirects.some(x=>x.source==='/crm/'||x.source==='/crm'));
});

test('all public pages carry one secure Admin login entry without the old CRM endpoint',()=>{
 const pages=['index.html','contact.html','divisions.html','how-we-work.html','about.html','opportunities.html','opportunity-kiti.html','privacy.html'];
 for(const path of pages){
  const html=read(path);
  assert.match(html,/href="\/admin"[^>]*>Admin login<\/a>/);
  assert.doesNotMatch(html,/href="\/crm\/"|href="\/analytics\/"/);
 }
 const shared=read('script.js');
 assert.match(shared,/href="\/admin"[^>]*>Admin login<\/a>/);
});

test('public website does not expose restricted spreadsheet contents or private credential gates',()=>{
 const html=read('index.html')+read('contact.html');
 assert.doesNotMatch(html,/script\.google\.com|\/api\/crm|TSS_FORM_ENDPOINT/);
 assert.doesNotMatch(html,/tss-hubspot-enquiry-sync/);
 assert.match(read('contact.html'),/data-form-id="d6b2a98a-ef6b-4a18-9c99-cf39ea2925e5"/);
});
