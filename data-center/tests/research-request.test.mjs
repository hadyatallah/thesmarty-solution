import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareCompanyNameForChatGPT} from '../research-request.mjs';

const company={id:'TSS-CY-001',name:'Synthetic Developer Ltd',district:'Larnaca',category:'Developer'};

test('the only handoff payload is the exact Company name',()=>{
 const result=prepareCompanyNameForChatGPT(company);
 assert.equal(result.status,'READY_TO_COPY');
 assert.equal(result.companyName,'Synthetic Developer Ltd');
 assert.equal(result.writesPerformed,0);
 assert.ok(!result.companyName.includes('TSS-CY-001'));
 assert.ok(!result.companyName.includes('Larnaca'));
 assert.ok(!result.companyName.includes('Developer Role'));
});

test('no user question, source, date or research classifications are required',()=>{
 const result=prepareCompanyNameForChatGPT(company);
 assert.deepEqual(result.errors,[]);
 assert.equal(result.companyName,company.name);
});

test('a Company must already be selected in the authenticated canonical directory',()=>{
 for(const bad of [null,{}, {id:'TSS-CY-001'},{name:'Unknown'}, {id:'TSS-CY-001',name:' '}]) {
  const result=prepareCompanyNameForChatGPT(bad);
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.companyName,'');
 }
});

test('helper does not send requests, store tokens, or create another browser writer',()=>{
 const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
 const app=read('data-center/app.js'),helper=read('data-center/research-request.mjs'),cfg=read('data-center/config.js');
 assert.doesNotMatch(helper,/\bfetch\s*\(|localStorage|sessionStorage|XMLHttpRequest|sendBeacon|\/api\/crm/);
 assert.doesNotMatch(app,/spreadsheets\.write|\/api\/crm|localStorage|sessionStorage/);
 assert.match(app,/prepareCompanyNameForChatGPT/);
 assert.match(app,/Copy Company name/);
 assert.doesNotMatch(app,/quick-request\x27|Attribute \/ research field|Date observed|Verification status/);
 assert.match(cfg,/readOnly:\s*true/);
});
