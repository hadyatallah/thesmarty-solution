import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 VERIFICATION_STATES,FRESHNESS_STATES,INFORMATION_CLASSES,
 preflightQaProposal,buildQaAppendRows,inspectRealSourceCitation
} from '../v2/review.mjs';

const base=Object.freeze({
 requestId:'QA-IDC-V2-REQ-0001',
 evidenceId:'EV-QA-V2-0001',
 auditId:'AUD-QA-V2-0001',
 companyId:'QA-COMPANY-001',
 candidateId:'',
 factType:'Development Activity',
 attributePath:'developmentActivity',
 valueJson:'"Synthetic Status"',
 displayValue:'Synthetic Status',
 sourceId:'QA-SRC-001',
 sourceRef:'synthetic://tss-idc/v2/provenance-001',
 observedAt:'2026-10-11',
 verificationStatus:'UNVERIFIED',
 freshnessStatus:'Review Due',
 informationClass:'Internal QA Only',
 conflictGroupId:'',
 reviewNotes:'Synthetic proposal only',
 actor:'Internal QA',
 auditDate:'2026-10-11'
});
const context=Object.freeze({
 knownCompanyIds:['QA-COMPANY-001'],
 knownCandidateIds:['QA-CANDIDATE-001'],
 existingEvidence:[],
 existingAudits:[]
});
const examine=(p={},c={})=>preflightQaProposal({...base,...p},{...context,...c});

test('approval taxonomies match TSS approved Playbook and existing stored evidence labels',()=>{
 assert.deepEqual(VERIFICATION_STATES,[
  'UNVERIFIED','SOURCE SUPPORTED','DIRECTLY CONFIRMED','CONFLICTING / REVIEW REQUIRED'
 ]);
 assert.deepEqual(FRESHNESS_STATES,['Current','Review Due','Stale']);
 assert.deepEqual(INFORMATION_CLASSES,[
  'Reusable TSS Intelligence','TSS Restricted Intelligence','Mandate Confidential','Highly Restricted'
 ]);
});

test('synthetic proposal passes QA preflight without writing',()=>{
 const check=examine();
 assert.equal(check.status,'QA_READY');
 assert.equal(check.writesPerformed,0);
 assert.equal(check.errors.length,0);
 assert.equal(check.target,'ISOLATED_SYNTHETIC_QA_ONLY');
 const prepared=buildQaAppendRows(check);
 assert.equal(prepared.writesPerformed,0);
 assert.equal(prepared.evidenceTab,'Evidence QA');
 assert.equal(prepared.auditTab,'Audit QA');
 assert.equal(prepared.evidenceRow.length,16);
 assert.equal(prepared.auditRow.length,12);
 assert.equal(prepared.evidenceRow[14],base.requestId);
 assert.equal(prepared.auditRow[6],base.requestId);
 assert.equal(prepared.auditRow[9],'PREPARED');
 assert.equal(prepared.evidenceRow[15],'1');
 assert.equal(prepared.auditRow[7],'0');
 assert.equal(prepared.auditRow[8],'1');
 assert.throws(()=>{prepared.evidenceRow[0]='changed';},TypeError);
});

test('no canonical Company or real research Candidate identifiers can be staged',()=>{
 for(const p of [{companyId:'TSS-CY-001'},{companyId:'',candidateId:'RC-P3-0001'},
  {companyId:'',candidateId:''},{candidateId:'QA-CANDIDATE-001'}]){
  const check=examine(p);
  assert.equal(check.status,'BLOCKED');
  assert.throws(()=>buildQaAppendRows(check));
 }
});

test('candidate-only synthetic proposal is allowed for known QA candidate',()=>{
 const check=examine({companyId:'',candidateId:'QA-CANDIDATE-001'},
  {knownCompanyIds:['QA-COMPANY-001']});
 assert.equal(check.status,'QA_READY');
});

test('duplicate request IDs in either QA sheet must not replay',()=>{
 for(const c of [
  {existingEvidence:[{requestId:base.requestId,evidenceId:'EV-QA-SEED-X'}]},
  {existingAudits:[{requestId:base.requestId,auditId:'AUD-QA-SEED-X'}]}
 ]) {
  const result=examine({},c);
  assert.equal(result.status,'BLOCKED');
  assert.match(result.errors.join(' '),/never retry/);
 }
});

test('duplicate evidence and audit IDs block an append',()=>{
 const x=examine({},{
  existingEvidence:[{evidenceId:base.evidenceId}],
  existingAudits:[{auditId:base.auditId}]
 });
 assert.equal(x.status,'BLOCKED');
 assert.match(x.errors.join(' '),/already present/);
});

test('same dated fact from same source cannot be duplicated',()=>{
 const check=examine({},{
  existingEvidence:[{companyId:base.companyId,candidateId:'',attributePath:base.attributePath,
   displayValue:base.displayValue,sourceRef:base.sourceRef,observedAt:base.observedAt}]
 });
 assert.equal(check.status,'BLOCKED');
 assert.match(check.errors.join(' '),/equivalent source observation/);
});

test('conflicting value forces human review without overwriting existing observation',()=>{
 const old={companyId:base.companyId,candidateId:'',attributePath:base.attributePath,
  displayValue:'Old synthetic fact',sourceRef:'synthetic://tss-idc/v2/earlier'};
 const check=examine({verificationStatus:'SOURCE SUPPORTED'},{existingEvidence:[old]});
 assert.equal(check.status,'REVIEW_REQUIRED');
 assert.match(check.warnings.join(' '),/human conflict review/);
 assert.throws(()=>buildQaAppendRows(check),/not QA_READY/);
 assert.equal(old.displayValue,'Old synthetic fact');
});

test('invalid taxonomy, malformed JSON, date, provenance and missing snapshots fail closed',()=>{
 const check=examine({
  verificationStatus:'Automatically Verified',freshnessStatus:'False',
  informationClass:'Public',valueJson:'not-json',observedAt:'2026-02-30',
  sourceRef:'https://realcompany.invalid/proof',actor:'Somebody Else'
 },{existingAudits:null,existingEvidence:null});
 assert.equal(check.status,'BLOCKED');
 assert.ok(check.errors.length>=6);
});

test('a conflicting-status proposal must identify its unresolved group before approval',()=>{
 const x=examine({verificationStatus:'CONFLICTING / REVIEW REQUIRED'});
 assert.equal(x.status,'REVIEW_REQUIRED');
 assert.match(x.warnings.join(' '),/conflictGroupId/);
});

test('real citations are HTTP(S) only; input cannot be converted into write permissions',()=>{
 assert.equal(inspectRealSourceCitation('https://example.com/cited-source').valid,true);
 assert.equal(inspectRealSourceCitation('javascript:alert(1)').valid,false);
 assert.equal(inspectRealSourceCitation('synthetic://tss-idc/v2/fixture').valid,false);
 const file=readFileSync(new URL('../v2/review.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(file,/fetch\s*\(|localStorage|sessionStorage|gapi|spreadsheets\.write|oauth2|hubspot\.com\/api/i);
 assert.doesNotMatch(file,/script\.google\.com\/macros/i);
 assert.match(file,/writesPerformed:0/);
});
