import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareResearchHandoff} from '../research-request.mjs';

const company={id:'TSS-CY-001',name:'Synthetic Developer'};
const existing=[
 {companyId:'TSS-CY-001',evidenceId:'EV-SYN-1',attributePath:'developmentActivity',
  displayValue:'Existing synthetic observation',sourceRef:'https://example.invalid/old',
  observedAt:'2026-10-09'},
 {companyId:'TSS-CY-002',evidenceId:'EV-SYN-2',attributePath:'developmentActivity',
  displayValue:'Different company',sourceRef:'https://example.invalid/another',
  observedAt:'2026-10-09'}
];
const inputs={
 attributePath:'developerRoles',displayValue:'Synthetic Developer',
 sourceRef:'https://example.invalid/projects',observedAt:'2026-10-11',
 verificationStatus:'UNVERIFIED',freshnessStatus:'Review Due',
 informationClass:'Reusable TSS Intelligence',reviewNotes:'Published business page — synthetic test'
};
const prepare=(change={},ctx={})=>prepareResearchHandoff(company,existing,{...inputs,...change},
 {today:'2026-10-11',...ctx});
test('a reviewed draft is ready to copy but NOT a write',()=>{
 const x=prepare();
 assert.equal(x.status,'READY_TO_COPY');
 assert.equal(x.writesPerformed,0);
 assert.match(x.handoffText,/TSS RESEARCH REVIEW REQUEST/);
 assert.match(x.handoffText,/TSS-CY-001/);
 assert.match(x.handoffText,/Synthetic Developer/);
 assert.match(x.handoffText,/https:\/\/example\.invalid\/projects/);
 assert.match(x.handoffText,/NOT YET APPROVED FOR A WRITE/);
 assert.match(x.handoffText,/DO NOT write to Google Sheets/);
 assert.doesNotMatch(x.handoffText,/client_secret|access_token|private_key/);
});

test('no input to production sources or duplicate identity creation is permitted',()=>{
 const x=prepareResearchHandoff(null,existing,inputs,{today:'2026-10-11'});
 assert.equal(x.status,'BLOCKED');
 assert.equal(x.handoffText,'');
 assert.match(x.errors.join(' '),/canonical Company/);
});

test('exact duplicate source/date/value is BLOCKED',()=>{
 const x=prepare({
  attributePath:'developmentActivity',
  displayValue:'Existing synthetic observation',
  sourceRef:'https://example.invalid/old',observedAt:'2026-10-09'
 });
 assert.equal(x.status,'BLOCKED');
 assert.equal(x.handoffText,'');
 assert.match(x.errors.join(' '),/Equivalent dated observation/);
});

test('conflicting fact is reviewed, never automatically merged or approved',()=>{
 const x=prepare({attributePath:'developmentActivity',displayValue:'Updated synthetic observation'});
 assert.equal(x.status,'REVIEW_REQUIRED');
 assert.match(x.warnings.join(' '),/Existing evidence differs/);
 assert.match(x.handoffText,/Existing fact conflict: YES/);
 assert.equal(existing[0].displayValue,'Existing synthetic observation');
});

test('invalid URL, future date, taxonomy or blank values do not prepare handoff text',()=>{
 const x=prepare({sourceRef:'javascript:alert(1)',observedAt:'2026-10-12',
  verificationStatus:'VERIFIED',freshnessStatus:'Fresh',displayValue:''});
 assert.equal(x.status,'BLOCKED');
 assert.equal(x.handoffText,'');
 assert.ok(x.errors.length>=4);
});

test('confidential information cannot be prepared into browser-to-ChatGPT clipboard',()=>{
 for(const informationClass of ['Mandate Confidential','Highly Restricted']){
  const x=prepare({informationClass});
  assert.equal(x.status,'BLOCKED');
  assert.equal(x.handoffText,'');
 }
 assert.equal(prepare({informationClass:'TSS Restricted Intelligence'}).status,'REVIEW_REQUIRED');
});

test('new source module has no provider calls, state storage or writer capabilities',()=>{
 const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
 const app=read('data-center/app.js'),sw=read('data-center/sw.js');
 const module=read('data-center/research-request.mjs');
 const cfg=read('data-center/config.js');
 assert.doesNotMatch(module,/fetch\s*\(|localStorage|sessionStorage|XMLHttpRequest|sendBeacon|\/api\/crm|spreadsheets\.write/);
 assert.doesNotMatch(app,/spreadsheets\.write|\/api\/crm|app\.hubspot\.com\/api|localStorage|sessionStorage/);
 assert.match(app,/prepareResearchHandoff/);
 assert.match(app,/Copy request/);
 assert.match(app,/Paste it into ChatGPT/);
 assert.match(cfg,/readOnly:\s*true/);
 assert.match(sw,/\/data-center\/research-request\.mjs/);
 assert.match(sw,/tss-idc-public-shell-v2/);
 assert.ok(!app.includes('qa-gateway.mjs'));
});
