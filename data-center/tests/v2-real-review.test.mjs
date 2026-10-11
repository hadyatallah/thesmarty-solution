import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRealProposal} from '../v2/real-review.mjs';
const companies=[{id:'TSS-CY-001',name:'Synthetic Test Company'}, {id:'TSS-CY-002',name:'Other Test'}];
const evidence=[
 {evidenceId:'EV-001',companyId:'TSS-CY-001',attributePath:'developerRoles',
  displayValue:'Residential Developer',sourceRef:'https://example.invalid/projects',
  observedAt:'2026-09-27',verificationStatus:'SOURCE SUPPORTED',freshnessStatus:'Review Due'},
 {evidenceId:'EV-002',companyId:'TSS-CY-002',attributePath:'developerRoles',
  displayValue:'Contractor',sourceRef:'https://example.invalid/about',
  observedAt:'2026-09-27'},
 {evidenceId:'EV-PREV-0001',companyId:'TSS-CY-001',attributePath:'developerRoles',
  displayValue:'Preview only',sourceRef:'synthetic://phase3/evidence',observedAt:'2026-09-27'}
];
const proposal={companyId:'TSS-CY-001',factType:'Developer Role',attributePath:'developerRoles',
 displayValue:'Residential Developer',sourceRef:'https://example.invalid/projects',
 observedAt:'2026-10-11',verificationStatus:'SOURCE SUPPORTED',freshnessStatus:'Current',
 informationClass:'Reusable TSS Intelligence',reviewNotes:'Official developer projects page'};
const ctx={companies,evidence,sourceVerified:true,today:'2026-10-11'};
const check=(p={},c={})=>evaluateRealProposal({...proposal,...p},{...ctx,...c});
test('canonical research proposal uses exact, unique Company IDs and is never an automatic write',()=>{
 const r=check();assert.equal(r.status,'READY_FOR_OWNER_REVIEW');
 assert.equal(r.writesPerformed,0);
 assert.equal(r.existingEvidenceCount,1);
 assert.equal(r.existingFacts.length,1);
 assert.equal(r.existingFacts[0].evidenceId,'EV-001');
 assert.match(r.nextAction,/explicit owner review/);
});
test('real Company identity cannot be inferred from Company name, prefix or alias',()=>{
 for(const id of ['Other Test','TSS-CY-999','tss-cy-001','TSS-CY-001 ']){
  const r=check({companyId:id});if(id==='TSS-CY-001 ')continue;
  assert.equal(r.status,'BLOCKED',id);
 }
 const dup=check({}, {companies:[...companies,{...companies[0]}]});
 assert.equal(dup.status,'BLOCKED');
});
test('equivalent dated observation is blocked without overwriting archive',()=>{
 const r=check({observedAt:'2026-09-27',freshnessStatus:'Review Due'});
 assert.equal(r.status,'BLOCKED');
 assert.match(r.errors.join(' '),/Equivalent evidence/);
 assert.equal(evidence[0].displayValue,'Residential Developer');
});
test('changed source fact requires human review while preserving original records',()=>{
 const r=check({displayValue:'Commercial Developer'});
 assert.equal(r.status,'REQUIRES_HUMAN_REVIEW');
 assert.match(r.warnings.join(' '),/human conflict/);
 assert.equal(evidence[0].displayValue,'Residential Developer');
});
test('direct confirmations and sensitive facts always require more review',()=>{
 const r=check({verificationStatus:'DIRECTLY CONFIRMED',
  informationClass:'Highly Restricted'});
 assert.equal(r.status,'REQUIRES_HUMAN_REVIEW');
 assert.match(r.warnings.join(' '),/Direct confirmation/);
 assert.match(r.warnings.join(' '),/Restricted data/);
});
test('malicious or missing citations, unsupported classifications and future facts are refused',()=>{
 const p=check({sourceRef:'javascript:alert(1)',observedAt:'2026-10-12',
  verificationStatus:'Verified!',freshnessStatus:'Fresh',informationClass:'Public'});
 assert.equal(p.status,'BLOCKED');
 assert.ok(p.errors.length>=5);
 const noOwner=check({}, {sourceVerified:false});
 assert.equal(noOwner.status,'BLOCKED');
 const noSources=check({},{companies:null,evidence:null});
 assert.equal(noSources.status,'BLOCKED');
});
