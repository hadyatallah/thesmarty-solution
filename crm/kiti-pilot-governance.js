import {outreachGate,effectiveDisclosure} from './kiti-pilot-model.js';

const RESPONSE_CATEGORIES = Object.freeze([
  'No relevant response',
  'Administrative',
  'Clarification',
  'Information request',
  'Qualified interest signal',
  'Timing / defer',
  'Not interested',
  'Suppression',
  'Professional / technical query',
  'Commercial discussion'
]);

function normalize(value){
  if(Array.isArray(value)) return value.map(normalize);
  if(value && typeof value==='object'){
    return Object.keys(value).sort().reduce((o,k)=>{o[k]=normalize(value[k]);return o;},{});
  }
  return value;
}

export function stableStringify(value){
  return JSON.stringify(normalize(value));
}

export function deterministicHash(value){
  const s=typeof value==='string'?value:stableStringify(value);
  let h=2166136261;
  for(let i=0;i<s.length;i++){
    h^=s.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return (h>>>0).toString(16).padStart(8,'0').toUpperCase();
}

function required(value,code){
  const v=String(value??'').trim();
  if(!v) throw Error(code);
  return v;
}

export function createPackManifest({
  requestId,
  opportunityId,
  mandateId,
  matchId='',
  recipientCompanyId='',
  recipientContactId='',
  audienceRole,
  requestedDisclosureLevel,
  effectiveDisclosureLevel,
  templateVersion,
  opportunityVersion,
  mandateVersion,
  matchVersion='',
  includedFields={},
  excludedFields=[],
  documentRefs=[],
  generatedAt,
  generatedBy='chat-controlled-pilot',
  approvalStatus='Draft',
  approvedAt='',
  approvedBy='',
  artifactRef='',
  supersedesPackId=''
}={}){
  const req=required(requestId,'PACK_REQUEST_ID_REQUIRED');
  const opp=required(opportunityId,'PACK_OPPORTUNITY_REQUIRED');
  const man=required(mandateId,'PACK_MANDATE_REQUIRED');
  const audience=required(audienceRole,'PACK_AUDIENCE_REQUIRED');
  const requested=required(requestedDisclosureLevel,'PACK_REQUESTED_DISCLOSURE_REQUIRED');
  const effective=required(effectiveDisclosureLevel,'PACK_EFFECTIVE_DISCLOSURE_REQUIRED');
  const template=required(templateVersion,'PACK_TEMPLATE_VERSION_REQUIRED');
  const oVersion=required(opportunityVersion,'PACK_OPPORTUNITY_VERSION_REQUIRED');
  const mVersion=required(mandateVersion,'PACK_MANDATE_VERSION_REQUIRED');
  const at=required(generatedAt,'PACK_GENERATED_AT_REQUIRED');

  const sourceSnapshot={
    opportunityId:opp,opportunityVersion:oVersion,
    mandateId:man,mandateVersion:mVersion,
    matchId:String(matchId||''),matchVersion:String(matchVersion||''),
    recipientCompanyId:String(recipientCompanyId||''),
    recipientContactId:String(recipientContactId||''),
    audienceRole:audience,
    requestedDisclosureLevel:requested,
    effectiveDisclosureLevel:effective,
    templateVersion:template,
    includedFields:normalize(includedFields),
    excludedFields:normalize(excludedFields),
    documentRefs:normalize(documentRefs)
  };
  const contentFingerprint=deterministicHash(sourceSnapshot);
  const packId='PACK-'+deterministicHash({requestId:req,sourceSnapshot});
  return {
    packId,
    requestId:req,
    ...sourceSnapshot,
    contentFingerprint,
    generatedAt:at,
    generatedBy:String(generatedBy||''),
    approvalStatus:String(approvalStatus||'Draft'),
    approvedAt:String(approvedAt||''),
    approvedBy:String(approvedBy||''),
    artifactRef:String(artifactRef||''),
    supersedesPackId:String(supersedesPackId||'')
  };
}

export function packStaleness(manifest,current={}){
  if(!manifest) return {stale:true,reasons:['Manifest missing']};
  const reasons=[];
  const checks=[
    ['Opportunity version','opportunityVersion'],
    ['Mandate version','mandateVersion'],
    ['Match version','matchVersion'],
    ['Template version','templateVersion']
  ];
  for(const [label,key] of checks){
    if(current[key]!==undefined && String(current[key])!==String(manifest[key]||'')){
      reasons.push(label+' changed');
    }
  }
  if(current.documentRefs){
    const now=deterministicHash(normalize(current.documentRefs));
    const before=deterministicHash(normalize(manifest.documentRefs||[]));
    if(now!==before) reasons.push('Document set/version changed');
  }
  return {stale:reasons.length>0,reasons};
}

export function createActivityEvent({
  idempotencyKey,
  entityType,
  recordId,
  action,
  timestamp,
  actor='chat-controlled-pilot',
  priorState='',
  newState='',
  sourceRef='',
  details={}
}={}){
  const key=required(idempotencyKey,'ACTIVITY_IDEMPOTENCY_KEY_REQUIRED');
  const entity=required(entityType,'ACTIVITY_ENTITY_REQUIRED');
  const id=required(recordId,'ACTIVITY_RECORD_REQUIRED');
  const act=required(action,'ACTIVITY_ACTION_REQUIRED');
  const at=required(timestamp,'ACTIVITY_TIMESTAMP_REQUIRED');
  return {
    eventId:'AE-'+deterministicHash({key,entity,id,act}),
    idempotencyKey:key,
    timestamp:at,
    actor:String(actor||''),
    entityType:entity,
    recordId:id,
    action:act,
    priorState:String(priorState??''),
    newState:String(newState??''),
    sourceRef:String(sourceRef||''),
    details:normalize(details)
  };
}

export function dedupeActivityEvents(events=[]){
  const seen=new Map();
  for(const event of events){
    const key=String(event.idempotencyKey||event.eventId||'');
    if(!key) throw Error('ACTIVITY_DEDUPE_KEY_REQUIRED');
    if(!seen.has(key)) seen.set(key,event);
  }
  return [...seen.values()];
}

export function classifyCommercialResponse(text=''){
  const s=String(text||'').trim();
  if(!s) return 'No relevant response';
  if(/remove me|do not contact|unsubscribe/i.test(s)) return 'Suppression';
  if(/not interested|no interest|decline|pass on this/i.test(s)) return 'Not interested';
  if(/out of office|automatic reply|auto[- ]?reply|forwarded your message/i.test(s)) return 'Administrative';
  if(/offer|counteroffer|commercial terms|price of|propose(d)?\s+(price|terms)|€|eur|usd|\$/i.test(s)) return 'Commercial discussion';
  if(/lawyer|legal|tax|planning consultant|architect|technical review|professional adviser/i.test(s)) return 'Professional / technical query';
  if(/contact.*next|reach out.*next|later this year|next month|next week|defer|not now/i.test(s)) return 'Timing / defer';
  if(/interested|keen to explore|would like to explore|let's discuss|let us discuss/i.test(s)) return 'Qualified interest signal';
  if(/send|share|provide|planning|document|pack|information|details|nda/i.test(s)) return 'Information request';
  if(/what|when|where|which|how|can you|could you|would you/i.test(s)) return 'Clarification';
  return 'No relevant response';
}

export function createAssistantProposal({
  sourceMessageId,
  opportunityId,
  matchId,
  messageText,
  createdAt,
  createdBy='chat-controlled-pilot'
}={}){
  const messageId=required(sourceMessageId,'ASSISTANT_SOURCE_MESSAGE_REQUIRED');
  const opp=required(opportunityId,'ASSISTANT_OPPORTUNITY_REQUIRED');
  const match=required(matchId,'ASSISTANT_MATCH_REQUIRED');
  const text=required(messageText,'ASSISTANT_MESSAGE_TEXT_REQUIRED');
  const at=required(createdAt,'ASSISTANT_CREATED_AT_REQUIRED');
  const category=classifyCommercialResponse(text);
  const proposedChanges=[];
  if(category==='Qualified interest signal') proposedChanges.push({field:'engagementState',value:'Interested'});
  if(category==='Not interested') proposedChanges.push({field:'engagementState',value:'Not Interested'});
  if(category==='Suppression') proposedChanges.push({field:'suppression',value:'Do not contact',protectedWorkflow:true});
  const requests=[];
  if(/planning|permit|approval/i.test(text)) requests.push('Planning information');
  if(/joint venture|\bjv\b/i.test(text)) requests.push('JV structure');
  if(/who owns|owner identity|landowner/i.test(text)) requests.push('Restricted principal identity');
  if(/signed nda|nda.*attached|non-disclosure agreement.*attached/i.test(text)) requests.push('Possible executed NDA verification');
  return {
    proposalId:'ASP-'+deterministicHash({messageId,opp,match}),
    sourceMessageId:messageId,
    opportunityId:opp,
    matchId:match,
    responseCategory:category,
    proposedChanges,
    requests,
    qualificationChange:null,
    externalAction:false,
    requiresHumanApproval:true,
    createdAt:at,
    createdBy:String(createdBy||'')
  };
}

export function deriveCommercialAnalytics({matches=[],events=[]}={}){
  const qualificationStates=['Identified','Research Required','Under Qualification','Qualified','Qualified With Gaps','Not Qualified','Shortlisted','Outreach Approved'];
  const engagementStates=['Not Contacted','Contacted','Awaiting Response','Interested','Not Interested','Introduction Approved','Introduced','Active Discussion','Negotiation','Closed'];
  const qualification=Object.fromEntries(qualificationStates.map(s=>[s,0]));
  const engagement=Object.fromEntries(engagementStates.map(s=>[s,0]));
  for(const match of matches){
    if(match.qualificationState in qualification) qualification[match.qualificationState]++;
    if(match.engagementState in engagement) engagement[match.engagementState]++;
  }
  const uniqueEvents=dedupeActivityEvents(events);
  const governanceBlocks=uniqueEvents.filter(e=>e.action==='Governance Block').length;
  const responseCategories={};
  for(const e of uniqueEvents){
    const category=e.details?.responseCategory;
    if(category) responseCategories[category]=(responseCategories[category]||0)+1;
  }
  return {
    qualification,
    engagement,
    governanceBlocks,
    responseCategories,
    eventCount:uniqueEvents.length,
    weightedPipeline:null,
    closeProbability:null,
    matchScore:null
  };
}

export {RESPONSE_CATEGORIES};


export function runSyntheticPositiveJourney(){
  const company={id:'TSS-CY-SYN-DEV',name:'Synthetic Developer'};
  const opportunity={id:'COP-KITI-PILOT',status:'Accepted',developmentStage:'Targeting',version:'1'};
  const mandate={
    id:'MAN-KITI-SYN',status:'Active',authorityResearch:'Granted',authorityOutreach:'Not Granted',
    maxDisclosureLevel:'D1',version:'1'
  };
  const match={
    id:'MAT-KITI-SYN',companyId:company.id,qualificationState:'Under Qualification',
    engagementState:'Not Contacted',version:'1',suppressed:false
  };
  const events=[];
  const add=(key,action,priorState,newState,details={})=>events.push(createActivityEvent({
    idempotencyKey:key,entityType:'Match',recordId:match.id,action,
    timestamp:'2026-10-06T10:'+String(events.length).padStart(2,'0')+':00Z',
    priorState,newState,details
  }));

  const firstGate=outreachGate({mandate,match,suppressed:match.suppressed,recipientKnown:true});
  add('J:1','Governance Block',match.engagementState,match.engagementState,{reason:firstGate.reason});
  match.qualificationState='Qualified With Gaps';
  add('J:2','Qualification Change','Under Qualification','Qualified With Gaps',{humanApproved:true});
  match.qualificationState='Shortlisted';
  add('J:3','Qualification Change','Qualified With Gaps','Shortlisted',{humanApproved:true});

  mandate.authorityOutreach='Granted';
  mandate.version='2';
  match.qualificationState='Outreach Approved';
  match.version='2';
  add('J:4','Qualification Change','Shortlisted','Outreach Approved',{humanApproved:true});
  const secondGate=outreachGate({mandate,match,suppressed:false,recipientKnown:true});
  if(!secondGate.allowed) throw Error('POSITIVE_JOURNEY_OUTREACH_GATE_FAILED');
  match.engagementState='Contacted';
  add('J:5','Engagement Change','Not Contacted','Contacted',{providerAccepted:true});

  const proposal=createAssistantProposal({
    sourceMessageId:'MSG-KITI-SYN-POS',
    opportunityId:opportunity.id,
    matchId:match.id,
    messageText:'We are interested. Please send the planning information.',
    createdAt:'2026-10-06T10:06:00Z'
  });
  if(!proposal.proposedChanges.some(x=>x.field==='engagementState'&&x.value==='Interested')) throw Error('POSITIVE_JOURNEY_INTEREST_PROPOSAL_FAILED');
  match.engagementState='Interested';
  add('J:6','Engagement Change','Contacted','Interested',{humanApproved:true,responseCategory:proposal.responseCategory});

  const beforeNda=effectiveDisclosure({mandateCeiling:'D1',recipientLevel:'D2',documentLevel:'D3'});
  if(beforeNda!=='D1') throw Error('POSITIVE_JOURNEY_DISCLOSURE_PRECONDITION_FAILED');
  add('J:7','Governance Block','D1','D1',{reason:'D3 planning material requested above current disclosure ceiling'});

  mandate.maxDisclosureLevel='D3';
  mandate.version='3';
  const afterNda=effectiveDisclosure({mandateCeiling:'D3',recipientLevel:'D3',documentLevel:'D3'});
  if(afterNda!=='D3') throw Error('POSITIVE_JOURNEY_DISCLOSURE_POSTCONDITION_FAILED');
  add('J:8','Disclosure Gate','D1','D3',{ndaVerified:true,humanApproved:true});

  match.engagementState='Introduced';
  add('J:9','Engagement Change','Interested','Introduced',{humanApproved:true});
  match.engagementState='Active Discussion';
  add('J:10','Engagement Change','Introduced','Active Discussion',{humanApproved:true});
  add('J:11','Professional Handoff','Active Discussion','Active Discussion',{humanApproved:true});
  match.engagementState='Closed';
  add('J:12','Outcome Recorded','Active Discussion','Closed',{outcome:'Synthetic acceptance outcome'});

  return {
    outcome:'PASS',
    externalCommunicationSimulated:true,
    realExternalAction:false,
    company,
    opportunity,
    mandate,
    match,
    proposal,
    disclosure:{beforeNda,afterNda},
    events:dedupeActivityEvents(events)
  };
}

export function runSyntheticNegativeJourney(){
  const company={id:'TSS-CY-SYN-BLOCKED',name:'Synthetic Suppressed Developer',unchanged:true};
  const mandate={id:'MAN-KITI-SYN-NEG',status:'Active',authorityOutreach:'Granted',maxDisclosureLevel:'D3'};
  const match={
    id:'MAT-KITI-SYN-NEG',companyId:company.id,qualificationState:'Outreach Approved',
    engagementState:'Not Contacted',suppressed:true
  };
  const gate=outreachGate({mandate,match,suppressed:true,recipientKnown:true});
  const event=createActivityEvent({
    idempotencyKey:'NEG:SUPPRESSION',
    entityType:'Match',
    recordId:match.id,
    action:'Governance Block',
    timestamp:'2026-10-06T11:00:00Z',
    priorState:'Not Contacted',
    newState:'Not Contacted',
    details:{reason:gate.reason}
  });
  return {
    outcome:gate.allowed?'FAIL':'PASS',
    realExternalAction:false,
    sendAttempted:false,
    company,
    match,
    gate,
    events:[event]
  };
}
