/*
 * TSS V2 — operational Evidence / Review Decisions / Audit acceptance.
 *
 * Pure, deterministic and provider-independent. NO Google token, browser
 * write scope, network call, or workbook ID. A ChatGPT management operation
 * may apply a plan only after fresh connected-provider preflight, a specific
 * owner decision, and the single-writer restriction. This is not a CRM.
 */
import {evaluateRealProposal} from './real-review.mjs';

export const OPERATIONAL_HEADERS=Object.freeze({
 evidence:Object.freeze([
  'evidenceId','companyId','candidateId','factType','attributePath',
  'valueJson','displayValue','sourceId','sourceRef','sourcePublishedAt',
  'observedAt','verificationStatus','freshnessStatus','informationClass',
  'supersedesEvidenceId','conflictGroupId','capturedBy','reviewNotes',
  'createdAt','updatedAt','version','requestId','decisionId','auditId'
 ]),
 audit:Object.freeze([
  'auditId','requestId','eventAt','actor','action','entityType','recordId',
  'companyId','decisionId','priorVersion','newVersion','outcome',
  'sourceRef','details','verificationAt','providerWriteRef'
 ]),
 decisions:Object.freeze([
  'decisionId','requestId','companyId','attributePath','proposedValue',
  'sourceRef','observedAt','submittedAt','reviewer','decision','decidedAt',
  'rationale','evidenceId','auditId','informationClass'
 ])
});
export const APPROVAL_CONFIRMATION='APPROVE ONE V2 EVIDENCE APPEND';
export const REQUIRED_TABS=Object.freeze({
 evidence:'Evidence Observation',audit:'Audit Ledger',decisions:'Review Decisions'
});

const s=v=>String(v??'').trim();
const utcDate=x=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(x)
 &&Number.isFinite(Date.parse(x));
const rowObjects=(values,headers)=>{
 if(!Array.isArray(values)||!Array.isArray(values[0])
  ||values[0].length!==headers.length
  ||values[0].some((v,i)=>s(v)!==headers[i]))
  throw Error('Operational ledger header mismatch; do not write');
 return values.slice(1).filter(row=>Array.isArray(row)&&row.some(v=>s(v)))
  .map(row=>Object.fromEntries(headers.map((h,i)=>[h,s(row[i])])));
};
const unique=(items,k,v)=>!items.some(x=>s(x[k])===v);
function assertSnapshot(snapshot){
 if(!snapshot||snapshot.ownerVerified!==true||snapshot.ledgerAclOwnerOnly!==true
  ||snapshot.singleWriterReserved!==true||snapshot.snapshotComplete!==true)
  throw Error('Current verified owner, ACL, full snapshots, and single-writer reservation required');
 if(!Number.isFinite(snapshot.observedMs)||!Number.isFinite(snapshot.nowMs)
  ||snapshot.nowMs<snapshot.observedMs||snapshot.nowMs-snapshot.observedMs>15000)
  throw Error('Ledger snapshot stale or timing evidence missing');
 if(!Array.isArray(snapshot.canonicalCompanies)||!Array.isArray(snapshot.archivedEvidence))
  throw Error('Verified canonical Companies and archived evidence required');
 if(snapshot.canonicalCompanyIdsUnique!==true)
  throw Error('Canonical Company ID integrity not accepted');
 if(!snapshot.sheetIds||new Set(Object.values(snapshot.sheetIds)).size!==3
  ||Object.values(snapshot.sheetIds).some(x=>!Number.isInteger(x)||x<0))
  throw Error('Three verified operational sheet IDs required');
 for(const k of ['evidence','audit','decisions']){
  if(!Array.isArray(snapshot.values?.[k]))throw Error('Missing '+k+' ledger rows');
  if(snapshot.tabNames?.[k]!==REQUIRED_TABS[k])
   throw Error('Operational sheet name changed: '+k);
 }
 return Object.fromEntries(Object.keys(OPERATIONAL_HEADERS).map(k=>[
  k,rowObjects(snapshot.values[k],OPERATIONAL_HEADERS[k])
 ]));
}
function assertApprovedInput(input){
 const ids=['requestId','evidenceId','auditId','decisionId'];
 for(const field of ids){
  if(!/^[A-Z0-9][A-Z0-9-]{7,95}$/.test(s(input[field])))
   throw Error(field+' must be an explicit stable, non-fixture identifier');
  if(/QA-|TEST|PREV/i.test(input[field]))throw Error('Synthetic/preview identifiers prohibited for operational research');
 }
 if(new Set(ids.map(k=>s(input[k]))).size!==4)
  throw Error('Four unique record IDs required');
 if(input.candidateId)throw Error('Operational proposal must use one canonical Company ID only');
 if(input.supersedesEvidenceId)throw Error('Supersession disabled pending dedicated acceptance');
 if(s(input.ownerDecision)!=='APPROVED'||s(input.ownerConfirmation)!==APPROVAL_CONFIRMATION)
  throw Error('Explicit reviewed owner APPROVED decision and confirmation required');
 if(s(input.reviewer)!=='TSS Google owner'||s(input.capturedBy)!=='TSS Google owner')
  throw Error('Approved single owner must be both reviewer and recorder');
 if(!s(input.rationale)||s(input.rationale).length>1500)
  throw Error('Owner rationale required (up to 1500 characters)');
 if(!utcDate(s(input.timestamp)))throw Error('Exact UTC approval timestamp required');
 if(s(input.sourceId).length<3||s(input.sourceId).length>90)
  throw Error('Evidence source ID required');
 if(!s(input.reviewNotes)||s(input.reviewNotes).length>1500)
  throw Error('Source review notes required');
 if(s(input.valueJson).length>3000)throw Error('Encoded evidence value exceeds limit');
 let parsed;
 try{parsed=JSON.parse(s(input.valueJson));}
 catch{throw Error('Valid JSON evidence value required');}
 if(typeof parsed!=='string'||s(parsed)!==s(input.displayValue))
  throw Error('JSON value must be an exact string encoding of the reviewed reported value');
}
/**
 * Accepts complete, provider-verified snapshot objects. Produces only
 * 3 proposed append rows; does NOT touch Google Sheets or lock a workbook.
 * The controlling actor must retain a single-writer reservation across the
 * last read and the actual append. No stronger transactional guarantee exists.
 */
export function prepareOperationalAppend(input,snapshot){
 assertApprovedInput(input);
 const ledger=assertSnapshot(snapshot);
 const keys=[
  ['requestId','requestId'],['evidenceId','evidenceId'],
  ['auditId','auditId'],['decisionId','decisionId']
 ];
 for(const [field] of keys){
  const id=s(input[field]);
  for(const records of Object.values(ledger)){
   for(const other of keys.map(x=>x[1])){
    if(!unique(records,other,id))throw Error(field+' already used in operational ledger; never retry');
   }
  }
 }
 if((snapshot.archivedEvidence||[]).some(row=>s(row.evidenceId)===s(input.evidenceId)))
  throw Error('Evidence ID already used in preserved archive');
 const result=evaluateRealProposal(input,{
  companies:snapshot.canonicalCompanies,evidence:[
   ...snapshot.archivedEvidence,...ledger.evidence
  ],sourceVerified:true,today:s(input.timestamp).slice(0,10)
 });
 if(result.status==='BLOCKED')throw Error('Evidence preflight BLOCKED: '+result.errors.join('; '));
 if(result.status==='REQUIRES_HUMAN_REVIEW'){
  if(s(input.conflictAcknowledged)!=='YES'||s(input.rationale).length<20)
   throw Error('Conflict/restricted fact requires explicit owner acknowledgement and rationale');
  if(input.verificationStatus==='CONFLICTING / REVIEW REQUIRED'&&!s(input.conflictGroupId))
   throw Error('Conflict group required');
 }
 // Always use an appended observation. Historical source rows are immutable.
 const stamp=s(input.timestamp),decisionId=s(input.decisionId);
 const record={
  evidence:{
   evidenceId:s(input.evidenceId),companyId:s(input.companyId),candidateId:'',
   factType:s(input.factType),attributePath:s(input.attributePath),
   valueJson:s(input.valueJson),displayValue:s(input.displayValue),sourceId:s(input.sourceId),
   sourceRef:s(input.sourceRef),sourcePublishedAt:s(input.sourcePublishedAt),
   observedAt:s(input.observedAt),verificationStatus:s(input.verificationStatus),
   freshnessStatus:s(input.freshnessStatus),informationClass:s(input.informationClass),
   supersedesEvidenceId:'',conflictGroupId:s(input.conflictGroupId),
   capturedBy:'TSS Google owner',reviewNotes:s(input.reviewNotes),
   createdAt:stamp,updatedAt:stamp,version:'1',requestId:s(input.requestId),
   decisionId,auditId:s(input.auditId)
  },
  audit:{
   auditId:s(input.auditId),requestId:s(input.requestId),eventAt:stamp,
   actor:'TSS Google owner',action:'APPEND',entityType:'Evidence Observation',
   recordId:s(input.evidenceId),companyId:s(input.companyId),decisionId,
   priorVersion:'0',newVersion:'1',outcome:'RECORDED',
   sourceRef:s(input.sourceRef),
   details:'Owner-approved append-only fact; verify provider replies and all three rows',
   verificationAt:stamp,providerWriteRef:''
  },
  decisions:{
   decisionId,requestId:s(input.requestId),companyId:s(input.companyId),
   attributePath:s(input.attributePath),proposedValue:s(input.displayValue),
   sourceRef:s(input.sourceRef),observedAt:s(input.observedAt),
   submittedAt:stamp,reviewer:'TSS Google owner',decision:'APPROVED',
   decidedAt:stamp,rationale:s(input.rationale),evidenceId:s(input.evidenceId),
   auditId:s(input.auditId),informationClass:s(input.informationClass)
  }
 };
 const rows=Object.fromEntries(Object.keys(record).map(k=>[
  k,Object.freeze(OPERATIONAL_HEADERS[k].map(h=>s(record[k][h])))
 ]));
 return Object.freeze({
  status:'PREPARED_NOT_WRITTEN',writesPerformed:0,
  requestId:s(input.requestId),
  rows:Object.freeze(rows),
  targetTabNames:REQUIRED_TABS,
  expectedSheetIds:Object.freeze({...snapshot.sheetIds}),
  expectedCounts:Object.freeze(Object.fromEntries(Object.keys(ledger).map(k=>[k,ledger[k].length]))),
  caveat:'ONE-WRITER ONLY; native Sheets has no unique constraint; no blind retry',
  realProposalDisposition:result.status
 });
}
export function providerBatchForPrepared(plan){
 if(plan?.status!=='PREPARED_NOT_WRITTEN')throw Error('Validated plan required');
 const asCells=values=>({values:values.map(v=>({userEnteredValue:{stringValue:v}}))});
 return {
  requests:['evidence','audit','decisions'].map(k=>({
   appendCells:{sheetId:plan.expectedSheetIds[k],
    rows:[asCells(plan.rows[k])],fields:'userEnteredValue'}
  }))
 };
}
export function verifyOperationalReadback(plan,after){
 if(plan?.status!=='PREPARED_NOT_WRITTEN')throw Error('Prepared plan required');
 const found={};
 for(const k of Object.keys(OPERATIONAL_HEADERS)){
  const rows=rowObjects(after?.values?.[k],OPERATIONAL_HEADERS[k]);
  if(rows.length!==plan.expectedCounts[k]+1)
   return {status:'UNCERTAIN',reason:'Unexpected '+k+' row count; stop and reconcile',writesPerformed:'unknown'};
  const matches=rows.filter(x=>x.requestId===plan.requestId);
  if(matches.length!==1)
   return {status:'UNCERTAIN',reason:'Not exactly one '+k+' request ID; stop',writesPerformed:'unknown'};
  const actual=OPERATIONAL_HEADERS[k].map(h=>s(matches[0][h]));
  if(actual.some((v,i)=>v!==plan.rows[k][i]))
   return {status:'UNCERTAIN',reason:k+' row payload mismatch; stop',writesPerformed:'unknown'};
  found[k]=matches[0];
 }
 if(found.evidence.decisionId!==found.decisions.decisionId
  ||found.evidence.auditId!==found.audit.auditId
  ||found.audit.recordId!==found.evidence.evidenceId
  ||found.decisions.evidenceId!==found.evidence.evidenceId)
  return {status:'UNCERTAIN',reason:'Cross-row linkage mismatch',writesPerformed:'unknown'};
 return Object.freeze({status:'THREE_TAB_APPEND_VERIFIED',writesPerformed:3,requestId:plan.requestId,
  caveat:'Do not reuse these IDs. Next write requires fresh source preflight.'});
}
