import test from 'node:test';
import assert from 'node:assert/strict';
import * as dc from '../engine.mjs';

const now=new Date('2026-09-27T17:00:00Z');
const companies=[
 {id:'A1',name:'Group Alpha Ltd',website:'https://alpha.example',phone:'+357 22220000',businessAddress:'1 Main Street',category:'Developer',researchLevel:'Company website checked',leadScore:'50',scoreBand:'Warm'},
 {id:'A2',name:'Group Alpha Developments',website:'https://alpha.example',phone:'+357 22220000',businessAddress:'1 Main Street',category:'Contractor',researchLevel:'Commercial directory',leadScore:'12',scoreBand:'Cool'},
 {id:'F1',name:'Company With Public Email',website:'https://publicmail.example',email:'person@gmail.com',phone:'+357 99000000',businessAddress:'2 Side Road'}
];

test('all supporting objects have defined schemas and approved enum vocabularies',()=>{
 for(const name of ['ResearchCandidate','ResearchSource','EvidenceObservation','IdentityRelationship','ResearchRun','DeveloperProject','DeveloperProjectCompanyRole','DataCenterAudit']) assert.ok(dc.SCHEMAS[name].length>0);
 assert.deepEqual(dc.ENUMS.verificationStatus,['UNVERIFIED','SOURCE SUPPORTED','DIRECTLY CONFIRMED','CONFLICTING / REVIEW REQUIRED']);
 assert.deepEqual(dc.ENUMS.freshnessStatus,['Current','Review Due','Stale']);
 assert.deepEqual(dc.ENUMS.researchDepth,['Basic','Profiled','Commercially Researched','Active Intelligence']);
});

test('exact domain creates a review suggestion, not a link or company',()=>{
 const match=dc.matchCandidate({discoveredName:'Alpha Group',website:'https://www.alpha.example/contact'},companies);
 assert.equal(match.candidateStatus,'Needs Review');
 assert.deepEqual(match.possibleCompanyIds,['A1','A2']);
 assert.equal(match.autoLink,false); assert.equal(match.autoCreate,false);
});

test('public email, similar names, shared phone, and shared office cannot identify a company alone',()=>{
 const publicEmail=dc.matchCandidate({discoveredName:'Unrelated Trading Ltd',email:'info@gmail.com'},companies);
 assert.deepEqual(publicEmail.possibleCompanyIds,[]);
 const phone=dc.matchCandidate({discoveredName:'Completely Other Ltd',phone:'+357 22220000'},companies);
 assert.equal(phone.identityMatchBasis,'WEAK_SIGNAL_ONLY'); assert.equal(phone.candidateStatus,'Needs Review');
 const address=dc.matchCandidate({discoveredName:'Other Office Ltd',businessAddress:'1 Main Street'},companies);
 assert.equal(address.identityMatchBasis,'WEAK_SIGNAL_ONLY');
 const similar=dc.matchCandidate({discoveredName:'Group Alpha Development Ltd'},companies);
 assert.equal(similar.identityMatchBasis,'NO_SUPPORTED_MATCH');
});

test('candidate creation is idempotent and source lineage is part of its key',()=>{
 const row={discoveredName:'Cyprus Test Ltd',website:'https://test.example',country:'Cyprus',region:'Larnaca',discoverySourceRef:'https://source.example/item'};
 const first=dc.stageCandidateIdempotent([],row,now),second=dc.stageCandidateIdempotent([first.record],row,now);
 assert.equal(first.created,true); assert.equal(second.created,false); assert.equal(first.record.candidateId,second.record.candidateId);
 assert.equal(first.record.normalizedDomain,'test.example');
 const third=dc.stageCandidateIdempotent([second.record],{...row,discoverySourceRef:'https://other.example/item'},now);
 assert.equal(third.created,false); assert.deepEqual(third.record.discoverySourceRefs,[row.discoverySourceRef,'https://other.example/item']);
 assert.equal(third.record.version,2);
});

test('evidence is append-only and conflicting material facts are retained for review',()=>{
 const first=dc.appendEvidence([], {companyId:'C1',attributePath:'developmentActivity',valueJson:'active',displayValue:'Current project advertised',sourceId:'S1',sourceRef:'https://source1.example/project',verificationStatus:'SOURCE SUPPORTED',freshnessStatus:'Current',informationClass:'Reusable TSS Intelligence'},now);
 const second=dc.appendEvidence([first.record], {companyId:'C1',attributePath:'developmentActivity',valueJson:'ceased',displayValue:'Development ceased',sourceId:'S2',sourceRef:'https://source2.example/report',verificationStatus:'SOURCE SUPPORTED',freshnessStatus:'Current',informationClass:'Reusable TSS Intelligence'},now);
 assert.equal(second.conflict,true); assert.equal(second.overwrote,false); assert.equal(second.record.verificationStatus,'CONFLICTING / REVIEW REQUIRED');
 assert.deepEqual(second.previousEvidenceIds,[first.record.evidenceId]);
});

test('freshness is per evidence date and absence remains Unknown',()=>{
 assert.equal(dc.assessFreshness('2026-09-20T00:00:00Z',30,now),'Current');
 assert.equal(dc.assessFreshness('2026-09-01T00:00:00Z',30,now),'Review Due');
 assert.equal(dc.assessFreshness('2026-07-01T00:00:00Z',30,now),'Stale');
 assert.equal(dc.inferAbsence(undefined),'Unknown'); assert.equal(dc.inferAbsence(''),'Unknown');
});

test('Research Runs are idempotent and preserve run counts',()=>{
 const input={sector:'Cyprus Property Developer',geography:'Republic of Cyprus',methodologyVersion:'1.0',sourceSet:['SRC-CPDA'],idempotencyKey:'phase3-test-run-1'};
 const a=dc.createResearchRunIdempotent([],input,now),b=dc.createResearchRunIdempotent([a.record],input,now);
 assert.equal(a.created,true); assert.equal(b.created,false); assert.equal(b.record.runId,a.record.runId); assert.equal(a.record.newCanonicalCompanies,0);
});

test('candidate outreach, automatic merge, and Company role inheritance are blocked',()=>{
 assert.equal(dc.candidateCanOutreach(),false);
 assert.throws(()=>dc.assertNoOutreach('ResearchCandidate','send email'),/PROHIBITED/);
 assert.throws(()=>dc.createIdentityRelationship({relationshipType:'Same Company / Duplicate Candidate',autoMerge:true}),/AUTOMATIC_MERGE_PROHIBITED/);
 assert.equal(dc.companyRoleInheritanceAllowed(),false);
});

test('canonical Company creation requires human approval and a recorded identity basis',()=>{
 const candidate={candidateStatus:'Approved New Company',disposition:'Approved New Company',discoveredName:'New Ltd',candidateId:'RC-1',discoverySourceRef:'https://official.example/new'};
 assert.throws(()=>dc.createCompanyFromCandidate(candidate,{}),/HUMAN_IDENTITY_APPROVAL_REQUIRED/);
 const created=dc.createCompanyFromCandidate(candidate,{approved:true,humanReviewer:'Hady',identityMatchBasis:'official registry plus official domain'});
 assert.equal(created.sourceCandidateId,'RC-1'); assert.equal(created.sourceLineage,candidate.discoverySourceRef);
});

test('Evidence Observation must reference exactly one Company or Candidate',()=>{
 const base={attributePath:'website',sourceId:'SRC1',sourceRef:'https://source.example',verificationStatus:'SOURCE SUPPORTED',freshnessStatus:'Current',informationClass:'Reusable TSS Intelligence'};
 assert.throws(()=>dc.appendEvidence([],{...base},now),/EXACTLY_ONE/);
 assert.throws(()=>dc.appendEvidence([],{...base,companyId:'C1',candidateId:'RC1'},now),/EXACTLY_ONE/);
});

test('Company dossier is a projection and keeps CRM fields separate from Data Center depth',()=>{
 const evidence=[{evidenceId:'EV1',companyId:'A1',attributePath:'developerRole',displayValue:'Residential Developer',sourceId:'SRC1',sourceRef:'https://source.example',observedAt:now.toISOString(),verificationStatus:'SOURCE SUPPORTED',freshnessStatus:'Current',informationClass:'Reusable TSS Intelligence'}];
 const dossier=dc.buildCompanyDossier('A1',companies,evidence,[],[],[]);
 assert.equal(dossier.canonicalCompany.id,'A1');
 assert.equal(dossier.identity.category,'Developer');
 assert.equal(dossier.identity.legacyResearchLevel,'Company website checked');
 assert.equal(dossier.researchDepth,'Unassigned');
 assert.equal(dossier.evidence[0].sourceRef,'https://source.example');
 assert.ok(dossier.researchGaps.includes('developmentActivity'));
 assert.equal(dossier.commercialQualification,'Not assessed by Data Center preview');
 const profiled=dc.buildCompanyDossier('A1',companies,evidence,[],[],[],'Profiled');
 assert.equal(profiled.researchDepth,'Profiled');
 assert.throws(()=>dc.buildCompanyDossier('A1',companies,evidence,[],[],[],'High'),/INVALID_DATA_CENTER_RESEARCH_DEPTH/);
});

test('project roles require evidence and do not inherit from groups',()=>{
 assert.throws(()=>dc.developerRoleForProject({projectId:'P1',companyId:'C1',projectRole:'Developer'}),/EVIDENCE_REQUIRED/);
 const r=dc.developerRoleForProject({projectId:'P1',companyId:'C1',projectRole:'Contractor',evidenceId:'EV1'});
 assert.equal(r.projectRole,'Contractor'); assert.equal(dc.companyRoleInheritanceAllowed(),false);
});

test('legacy Company fields stay unchanged',()=>{
 const before=companies[0]; assert.equal(dc.assertExistingCompanyCompatibility(before,{...before,notes:'Added note'}),true);
 assert.throws(()=>dc.assertExistingCompanyCompatibility(before,{...before,category:'New meaning'}),/category/);
 assert.throws(()=>dc.assertExistingCompanyCompatibility(before,{...before,leadScore:'99'}),/leadScore/);
});

test('12 approved pilot fixtures produce their expected safe dispositions',()=>{
 const cases=[
  [{companyMatches:['TSS-CY-001'],developerRoleEvidence:true,activeDevelopmentEvidence:true,legacyCategory:'Developer'}, {identityState:'Existing Company',developerRole:'SOURCE SUPPORTED',developmentActivity:'Observed Active Development',legacyCategoryPreserved:'Developer'}],
  [{companyMatches:['TSS-CY-018'],developerRoleEvidence:true,contractorRoleEvidence:true,legacyCategory:'Contractor'}, {identityState:'Existing Company',developerRole:'SOURCE SUPPORTED',contractorRole:'SOURCE SUPPORTED',legacyCategoryPreserved:'Contractor'}],
  [{companyMatches:['TSS-CY-361'],developerRoleEvidence:true,activeDevelopmentEvidence:true}, {identityState:'Existing Company',developerRole:'SOURCE SUPPORTED',developmentActivity:'Observed Active Development'}],
  [{companyMatches:['TSS-CY-348'],developerRoleEvidence:true}, {identityState:'Existing Company',developerRole:'SOURCE SUPPORTED',developmentActivity:'Development Activity Unknown'}],
  [{projectVehicleEvidence:true}, {identityState:'Research Candidate',disposition:'Needs Review',relationshipHint:'SPV / Project Vehicle'}],
  [{entityType:'project-brand',canonicalOrganizationEvidence:false}, {identityState:'Project / Brand Only',disposition:'Project / Brand Only'}],
  [{companyMatches:['TSS-CY-339','TSS-CY-1727'],identityConflict:true}, {identityState:'Relationship Review',disposition:'Needs Review',merged:false}],
  [{companyMatches:['TSS-CY-007','TSS-CY-2298'],identityConflict:true,duplicateReview:true}, {identityState:'Probable Duplicate Review',disposition:'Needs Review',merged:false}],
  [{developerRoleEvidence:true}, {identityState:'Research Candidate',disposition:'Needs Review',developerRole:'SOURCE SUPPORTED',developmentActivity:'Development Activity Unknown'}],
  [{companyMatches:['TSS-CY-025'],outOfScope:true}, {identityState:'Linked Existing Company',disposition:'Not Relevant',developerRole:'Not Supported'}],
  [{companyMatches:['TSS-CY-013'],relatedCompany:true,developerRoleEvidence:true,relationshipType:'Group / related entity'}, {identityState:'Related Companies',disposition:'Related Company',developerRole:'SOURCE SUPPORTED'}],
  [{companyMatches:['TSS-CY-356'],contractorRoleEvidence:true,developerRoleEvidence:false}, {identityState:'Existing Company',developerRole:'Not Supported',contractorRole:'SOURCE SUPPORTED',roleInherited:false}]
 ];
 for(const [fixture,expected] of cases){const got=dc.evaluatePilotCase(fixture);for(const [k,v] of Object.entries(expected)) assert.deepEqual(got[k],v,`${fixture.companyMatches?.[0]||fixture.entityType||'candidate'}.${k}`);assert.equal(got.createdCanonicalCompany,false);assert.equal(got.outreachTriggered,false);assert.equal(got.roleInherited,false);}
});
