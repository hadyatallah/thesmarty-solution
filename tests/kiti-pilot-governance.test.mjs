import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stableStringify,
  deterministicHash,
  createPackManifest,
  packStaleness,
  createActivityEvent,
  dedupeActivityEvents,
  classifyCommercialResponse,
  createAssistantProposal,
  deriveCommercialAnalytics
} from '../crm/kiti-pilot-governance.js';

test('stable stringify is key-order independent',()=>{
  assert.equal(stableStringify({b:2,a:1}),stableStringify({a:1,b:2}));
  assert.equal(deterministicHash({b:2,a:1}),deterministicHash({a:1,b:2}));
});

test('pack manifest is reproducible for same request and source snapshot',()=>{
  const input={
    requestId:'REQ-PACK-1',
    opportunityId:'COP-KITI-PILOT',
    mandateId:'MAN-KITI',
    matchId:'MAT-KITI',
    recipientCompanyId:'TSS-CY-001',
    audienceRole:'Developer',
    requestedDisclosureLevel:'D3',
    effectiveDisclosureLevel:'D1',
    templateVersion:'developer-v1',
    opportunityVersion:'4',
    mandateVersion:'2',
    matchVersion:'7',
    includedFields:{location:'Kiti',siteArea:'Approx. 859 m²'},
    excludedFields:[{key:'landownerIdentity',reason:'Restricted'}],
    documentRefs:[{id:'DOC-D1',version:'3'}],
    generatedAt:'2026-10-06T09:00:00Z'
  };
  const a=createPackManifest(input),b=createPackManifest({...input,generatedAt:'2026-10-06T10:00:00Z'});
  assert.equal(a.packId,b.packId);
  assert.equal(a.contentFingerprint,b.contentFingerprint);
  assert.equal(a.generatedAt,'2026-10-06T09:00:00Z');
});

test('different request id gives a distinct pack id without changing content fingerprint',()=>{
  const base={
    opportunityId:'COP-KITI-PILOT',mandateId:'MAN-KITI',audienceRole:'Developer',
    requestedDisclosureLevel:'D1',effectiveDisclosureLevel:'D1',templateVersion:'v1',
    opportunityVersion:'1',mandateVersion:'1',includedFields:{title:'Kiti'},
    generatedAt:'2026-10-06T09:00:00Z'
  };
  const a=createPackManifest({...base,requestId:'REQ-A'});
  const b=createPackManifest({...base,requestId:'REQ-B'});
  assert.notEqual(a.packId,b.packId);
  assert.equal(a.contentFingerprint,b.contentFingerprint);
});

test('pack staleness detects record or document version changes',()=>{
  const m=createPackManifest({
    requestId:'REQ-1',opportunityId:'COP',mandateId:'MAN',matchId:'MAT',audienceRole:'Developer',
    requestedDisclosureLevel:'D2',effectiveDisclosureLevel:'D2',templateVersion:'v1',
    opportunityVersion:'3',mandateVersion:'2',matchVersion:'5',
    documentRefs:[{id:'DOC',version:'1'}],generatedAt:'2026-10-06T09:00:00Z'
  });
  assert.equal(packStaleness(m,{opportunityVersion:'3',mandateVersion:'2',matchVersion:'5',templateVersion:'v1',documentRefs:[{id:'DOC',version:'1'}]}).stale,false);
  const stale=packStaleness(m,{opportunityVersion:'4',mandateVersion:'2',matchVersion:'5',templateVersion:'v1',documentRefs:[{id:'DOC',version:'2'}]});
  assert.equal(stale.stale,true);
  assert.ok(stale.reasons.includes('Opportunity version changed'));
  assert.ok(stale.reasons.includes('Document set/version changed'));
});

test('activity event idempotency key yields a stable event id',()=>{
  const input={idempotencyKey:'MSG-1:INTEREST',entityType:'Match',recordId:'MAT-1',action:'Engagement Change',timestamp:'2026-10-06T09:00:00Z',priorState:'Awaiting Response',newState:'Interested'};
  const a=createActivityEvent(input),b=createActivityEvent({...input,timestamp:'2026-10-06T09:05:00Z'});
  assert.equal(a.eventId,b.eventId);
  assert.equal(a.newState,'Interested');
});

test('dedupe keeps one consequential event per idempotency key',()=>{
  const a=createActivityEvent({idempotencyKey:'REQ-1',entityType:'Match',recordId:'MAT-1',action:'Governance Block',timestamp:'2026-10-06T09:00:00Z'});
  const b={...a,timestamp:'2026-10-06T09:01:00Z'};
  assert.equal(dedupeActivityEvents([a,b]).length,1);
});

test('response taxonomy keeps administrative reply out of commercial interest',()=>{
  assert.equal(classifyCommercialResponse('Automatic reply: I am out of office until Monday.'),'Administrative');
  assert.equal(classifyCommercialResponse('We are interested and would like to explore this.'),'Qualified interest signal');
  assert.equal(classifyCommercialResponse('Please remove me from your list.'),'Suppression');
  assert.equal(classifyCommercialResponse('Our offer would be EUR 500,000.'),'Commercial discussion');
});

test('assistant proposal never changes qualification and never executes externally',()=>{
  const p=createAssistantProposal({
    sourceMessageId:'MSG-1',
    opportunityId:'COP-KITI',
    matchId:'MAT-KITI',
    messageText:'We are interested. Please send planning information.',
    createdAt:'2026-10-06T09:00:00Z'
  });
  assert.equal(p.responseCategory,'Qualified interest signal');
  assert.deepEqual(p.proposedChanges,[{field:'engagementState',value:'Interested'}]);
  assert.equal(p.qualificationChange,null);
  assert.equal(p.externalAction,false);
  assert.equal(p.requiresHumanApproval,true);
  assert.ok(p.requests.includes('Planning information'));
});

test('suppression proposal is routed as protected workflow',()=>{
  const p=createAssistantProposal({
    sourceMessageId:'MSG-2',opportunityId:'COP',matchId:'MAT',
    messageText:'Do not contact me again.',createdAt:'2026-10-06T09:00:00Z'
  });
  assert.equal(p.responseCategory,'Suppression');
  assert.equal(p.proposedChanges[0].protectedWorkflow,true);
  assert.equal(p.externalAction,false);
});

test('analytics preserves qualification and engagement as separate dimensions',()=>{
  const events=[
    createActivityEvent({idempotencyKey:'B1',entityType:'Match',recordId:'MAT-1',action:'Governance Block',timestamp:'2026-10-06T09:00:00Z'}),
    createActivityEvent({idempotencyKey:'R1',entityType:'Match',recordId:'MAT-1',action:'Response Classified',timestamp:'2026-10-06T09:01:00Z',details:{responseCategory:'Administrative'}}),
    createActivityEvent({idempotencyKey:'R1',entityType:'Match',recordId:'MAT-1',action:'Response Classified',timestamp:'2026-10-06T09:02:00Z',details:{responseCategory:'Administrative'}})
  ];
  const a=deriveCommercialAnalytics({
    matches:[
      {qualificationState:'Qualified With Gaps',engagementState:'Interested'},
      {qualificationState:'Under Qualification',engagementState:'Not Contacted'}
    ],
    events
  });
  assert.equal(a.qualification['Qualified With Gaps'],1);
  assert.equal(a.qualification['Under Qualification'],1);
  assert.equal(a.engagement.Interested,1);
  assert.equal(a.engagement['Not Contacted'],1);
  assert.equal(a.governanceBlocks,1);
  assert.equal(a.responseCategories.Administrative,1);
  assert.equal(a.eventCount,2);
  assert.equal(a.weightedPipeline,null);
  assert.equal(a.closeProbability,null);
  assert.equal(a.matchScore,null);
});
