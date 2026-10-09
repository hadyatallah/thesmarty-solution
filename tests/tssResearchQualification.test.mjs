import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessCompany,rankResearchReview,sourceRowsToCompanies,
  RESEARCH_COMPLETENESS_WEIGHTS,RESEARCH_SCHEMA
} from '../lib/tssResearchQualification.mjs';

const asOf='2026-10-09';
const core={
  id:'TSS-CY-001',name:'Example Research Ltd',category:'Developer',
  district:'Larnaca',website:'https://example.org/',
  source1:'https://example.org/about',source2:'https://records.example.net/company',
  services:'Residential building services',portfolio:'Recorded development portfolio',
  fitAssessment:'Possible fit only; commercial interest UNKNOWN',
  verificationNotes:'Listing checked; identity remains subject to review',
  researchDate:'16 Sep 2026',leadScore:'92',scoreBand:'High priority'
};
test('completeness weights add to 100; fully populated item is never sales-qualified',()=>{
  assert.equal(Object.values(RESEARCH_COMPLETENESS_WEIGHTS).reduce((a,b)=>a+b,0),100);
  const v=assessCompany(core,{asOf});
  assert.equal(v.completeness,100);
  assert.equal(v.completenessBand,'Evidence-review ready');
  assert.equal(v.gate,'HUMAN_EVIDENCE_REVIEW_REQUIRED');
  assert.equal(v.verifiedDeveloperRole,false);
  assert.equal(v.buyingIntent,'UNKNOWN');
  assert.equal(v.fitQualification,'NOT_ASSESSED');
  assert.equal(v.outreachAuthorized,false);
  assert.equal(v.hubspotLifecycleChangeAuthorized,false);
  assert.equal(v.readyForAutoHubspotPromotion,false);
  assert.equal(v.schema,RESEARCH_SCHEMA);
});
test('legacy lifecycle, communication state, sales scores and contact details do not affect completeness or rank',()=>{
  const a=assessCompany({...core,leadScore:'12',scoreBand:'Develop',lifecycle:'Prospect',communicationStatus:'No reply',email:'x@example.org',phone:'001'}, {asOf});
  const b=assessCompany({...core,leadScore:'95',scoreBand:'High priority',lifecycle:'Customer',communicationStatus:'Responded',email:'',phone:''}, {asOf});
  assert.equal(a.completeness,b.completeness);
  assert.equal(a.gate,b.gate);
  assert.notEqual(a.legacyScore,b.legacyScore);
  assert.equal(a.outreachAuthorized,false);
});
test('missing evidence source never becomes automatically verified',()=>{
  const v=assessCompany({...core,source1:'',source2:''},{asOf});
  assert.equal(v.gate,'SOURCE_REVIEW');
  assert.equal(v.sourceLinkCount,0);
  assert.ok(v.reasons.includes('NO_HTTPS_EVIDENCE_SOURCE'));
  assert.equal(v.sourceQuality,'NOT_VERIFIED');
});
test('http/unsafe URL is not accepted as a research source',()=>{
  const v=assessCompany({...core,source1:'http://example.org/',source2:'https://localhost/private'}, {asOf});
  assert.equal(v.gate,'SOURCE_REVIEW');
  assert.equal(v.sourceLinkCount,0);
});
test('repeat links are not treated as two distinct sources',()=>{
  const v=assessCompany({...core,source2:core.source1}, {asOf});
  assert.equal(v.sourceLinkCount,1);
  assert.equal(v.pointBreakdown.secondSource,0);
  assert.ok(v.reasons.includes('ONE_SOURCE_ONLY'));
});
test('no research date or stale review forces freshness review',()=>{
  const unknown=assessCompany({...core,researchDate:''},{asOf});
  const stale=assessCompany({...core,researchDate:'2024-01-01'},{asOf});
  assert.equal(unknown.freshness,'Unknown');
  assert.equal(stale.freshness,'Stale');
  assert.equal(unknown.gate,'FRESHNESS_REVIEW');
  assert.equal(stale.gate,'FRESHNESS_REVIEW');
});
test('valid DD Mon YYYY parser handles invalid calendar dates and explicit asOf',()=>{
  assert.equal(assessCompany({...core,researchDate:'29 Feb 2024'},{asOf:'2024-03-01'}).ageDays,1);
  assert.equal(assessCompany({...core,researchDate:'31 Feb 2026'},{asOf}).freshness,'Unknown');
  assert.throws(()=>assessCompany(core,{asOf:'tomorrow'}),/AS_OF_DATE_REQUIRED/);
});
test('company role and favorable fit narrative never prove developer role, appetite, mandate, or consent',()=>{
  const v=assessCompany({...core,category:'Developer / investor',fitAssessment:'Likely good prospect; Kiti partnership'}, {asOf});
  assert.equal(v.verifiedDeveloperRole,false);
  assert.equal(v.buyingIntent,'UNKNOWN');
  assert.equal(v.outreachAuthorized,false);
});
test('unresolved identity conflicts are held even if complete',()=>{
  const a=assessCompany({...core,verificationNotes:'ambiguous identity in register'}, {asOf});
  const b=assessCompany(core,{asOf,identityHold:true});
  assert.equal(a.gate,'IDENTITY_HOLD');
  assert.equal(b.gate,'IDENTITY_HOLD');
  assert.ok(a.reasons.includes('UNRESOLVED_IDENTITY_HOLD'));
});
test('internal QA is excluded regardless of score',()=>{
  const v=assessCompany({...core,id:'COM-8ee64d5e',name:'TSS Internal Email QA'}, {asOf});
  assert.equal(v.gate,'INTERNAL_QA_EXCLUDED');
  assert.equal(v.completeness,100);
});
test('duplicate canonical ID blocks both records without merging or mutation',()=>{
  const initial=[{...core},{...core,name:'Different entity'},{...core,id:'TSS-CY-002',name:'Other entity'}];
  const copy=JSON.parse(JSON.stringify(initial));
  const result=rankResearchReview(initial,{asOf});
  assert.equal(result.total,3);
  assert.equal(result.reviewReady,1);
  assert.equal(result.held,2);
  assert.equal(result.companies.filter(c=>c.gate==='IDENTITY_HOLD').length,2);
  assert.deepEqual(initial,copy);
});
test('sorting is stable and changes only research review order, not sales data',()=>{
  const a={...core,id:'TSS-CY-002',name:'Two'};
  const b={...core,id:'TSS-CY-001',name:'One'};
  const c={...core,id:'TSS-CY-003',name:'Three',source1:'',source2:''};
  const result=rankResearchReview([a,c,b],{asOf});
  assert.deepEqual(result.companies.map(x=>x.id),['TSS-CY-001','TSS-CY-002','TSS-CY-003']);
  assert.equal(result.companies[2].gate,'SOURCE_REVIEW');
  assert.ok(result.companies.every(x=>!x.readyForAutoHubspotPromotion));
});
test('headers use canonical names, reject missing required columns, and leave source table unchanged',()=>{
  const values=[
    ['id','name','source1','source2','researchDate','leadScore','lifecycle','email'],
    ['TSS-CY-100','Example','https://example.org','https://example.net','2026-10-01','92','customer','private@example.org'],
    ['','','','','','','','']
  ];
  const clone=JSON.parse(JSON.stringify(values));
  const a=sourceRowsToCompanies(values);
  assert.equal(a.length,1);
  assert.equal(a[0].id,'TSS-CY-100');
  assert.equal(a[0].leadScore,'92');
  assert.equal(a[0].lifecycle,undefined);
  assert.equal(a[0].email,undefined);
  assert.deepEqual(values,clone);
  assert.throws(()=>sourceRowsToCompanies([['name'],['A']]),/SOURCE_MISSING_REQUIRED_FIELDS/);
});

test('external Phase 3 identity hold list blocks research readiness even without a conflict keyword in current Companies', () => {
  const held = new Set(['TSS-CY-001']);
  const reviewed = rankResearchReview([core, {...core,id:'TSS-CY-002',name:'Other company'}], {asOf, reviewHoldIds:held});
  assert.equal(reviewed.total,2);
  assert.equal(reviewed.held,1);
  assert.equal(reviewed.companies.find(c=>c.id==='TSS-CY-001').gate,'IDENTITY_HOLD');
  assert.equal(reviewed.companies.find(c=>c.id==='TSS-CY-002').gate,'HUMAN_EVIDENCE_REVIEW_REQUIRED');
  assert.equal(reviewed.companies.find(c=>c.id==='TSS-CY-001').readyForAutoHubspotPromotion,false);
});
test('research readiness never claims checked source accuracy or legal identity', () => {
  const scored = assessCompany(core,{asOf});
  assert.equal(scored.sourceQuality,'NOT_VERIFIED');
  assert.equal(scored.evidenceValidation,'NOT_PERFORMED');
  assert.equal(scored.independentCorroboration,'NOT_ESTABLISHED');
  assert.equal(scored.identityVerification,'NOT_VERIFIED');
  assert.equal(scored.verifiedDeveloperRole,false);
  assert.equal(scored.fitQualification,'NOT_ASSESSED');
});

import {validatePhase3HoldManifest,PHASE3_HOLD_SCHEMA} from '../crm/data-center-phase3-holds.mjs';
const phase3Fixture={schema:PHASE3_HOLD_SCHEMA,origin:'TSS_PHASE3_OWNER_PREVIEW',
 coverage:'KNOWN_OPEN_EXCEPTIONS_ONLY',asOf:'2026-10-09',holds:[
  {companyId:'TSS-CY-001',reasons:['CONFLICTING_EVIDENCE']},
  {companyId:'TSS-CY-007',reasons:['IDENTITY_RELATIONSHIP','AMBIGUOUS_DIRECTORY_MATCH']}
 ]};
test('owner-local known exceptions are a restrictive, non-authoritative additional hold only',()=>{
 const records=[{...core,id:'TSS-CY-001'}, {...core,id:'TSS-CY-007'}, {...core,id:'TSS-CY-300'}];
 const before=JSON.stringify(records);
 const m=validatePhase3HoldManifest(JSON.stringify(phase3Fixture),records,{asOf});
 assert.equal(m.count,2);
 assert.equal(m.authoritativeCoverageEstablished,false);
 assert.equal(m.allowsCommercialQualification,false);
 const result=rankResearchReview(records,{asOf,reviewHoldIds:m.holdIds});
 assert.equal(result.held,2);
 assert.equal(result.reviewReady,1);
 assert.deepEqual(result.companies.filter(x=>x.gate==='IDENTITY_HOLD').map(x=>x.id).sort(),['TSS-CY-001','TSS-CY-007']);
 assert.ok(result.companies.every(x=>!x.outreachAuthorized&&!x.readyForAutoHubspotPromotion));
 assert.equal(JSON.stringify(records),before);
});
test('Phase 3 manifest fails closed on unknown IDs, duplication, malformed and stale data',()=>{
 const records=[{...core,id:'TSS-CY-001'},{...core,id:'TSS-CY-007'}];
 const check=x=>validatePhase3HoldManifest(x,records,{asOf});
 assert.throws(()=>check({...phase3Fixture,holds:[{companyId:'TSS-CY-9999',reasons:['IDENTITY_RELATIONSHIP']}]}),/MANIFEST_ID_NOT_IN_COMPANIES/);
 assert.throws(()=>check({...phase3Fixture,holds:[phase3Fixture.holds[0],phase3Fixture.holds[0]]}),/MANIFEST_HOLD_DUPLICATE/);
 assert.throws(()=>check({...phase3Fixture,holds:[{companyId:'TSS-CY-001',reasons:['QUALIFIED'] }]}),/MANIFEST_HOLD_ROW_INVALID/);
 assert.throws(()=>check({...phase3Fixture,asOf:'2026-08-01'}),/MANIFEST_DATE_OUT_OF_RANGE/);
 assert.throws(()=>check({...phase3Fixture,asOf:'2026-11-01'}),/MANIFEST_DATE_OUT_OF_RANGE/);
 assert.throws(()=>check({...phase3Fixture,coverage:'COMPLETE_AND_CLEARED'}),/MANIFEST_SCHEMA_INVALID/);
 assert.throws(()=>check('not json'),/MANIFEST_JSON_INVALID/);
});
