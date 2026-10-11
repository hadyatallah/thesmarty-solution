/*
 * TSS Intelligent Data Center V2 — isolated research proposal preflight.
 *
 * This module NEVER reads or writes Google, HubSpot, browser storage or a
 * canonical Company workbook. It prepares append-only QA rows in memory.
 *
 * V1 remains a separate read-only Production stage. Do not import this module
 * from the live app or expand Google's read-only OAuth scope.
 */

export const VERIFICATION_STATES=Object.freeze([
 'UNVERIFIED','SOURCE SUPPORTED','DIRECTLY CONFIRMED','CONFLICTING / REVIEW REQUIRED'
]);
export const FRESHNESS_STATES=Object.freeze(['Current','Review Due','Stale']);
export const INFORMATION_CLASSES=Object.freeze([
 'Reusable TSS Intelligence','TSS Restricted Intelligence','Mandate Confidential','Highly Restricted'
]);

const QA_CLASS='Internal QA Only';
const QA_SOURCE='synthetic://tss-idc/';
const QA_PREFIX='QA-IDC-V2-';

const t=value=>String(value??'').trim();
const unique=values=>new Set((values||[]).map(t).filter(Boolean));
const same=(a,b)=>t(a)===t(b);
const isoDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))
 &&new Date(s+'T00:00:00Z').toISOString().startsWith(s);
const validHttp=s=>{
 try{const url=new URL(s);return ['https:','http:'].includes(url.protocol)&&Boolean(url.hostname);}
 catch{return false;}
};

/**
 * Prepare a proposed append-only evidence observation for an ISOLATED
 * SYNTHETIC QA workbook. All input is considered untrusted.
 *
 * No generated evidence ID, row index, Sheet permission or write capability.
 * The caller must supply source records, real identity checks and
 * idempotency readbacks. Ready is NOT authority to write.
 */
export function preflightQaProposal(input={},context={}){
 const errors=[],warnings=[];
 const draft=Object.fromEntries([
  'requestId','evidenceId','auditId','companyId','candidateId','factType',
  'attributePath','valueJson','displayValue','sourceId','sourceRef',
  'observedAt','verificationStatus','freshnessStatus','informationClass',
  'conflictGroupId','reviewNotes','actor','auditDate'
 ].map(key=>[key,t(input[key])]));
 const {
  requestId,evidenceId,auditId,companyId,candidateId,factType,attributePath,
  valueJson,displayValue,sourceId,sourceRef,observedAt,verificationStatus,
  freshnessStatus,informationClass,actor,auditDate
 }=draft;
 const required=(field,value,max)=>{if(!value)errors.push(field+': required');
  else if(value.length>max)errors.push(field+': too long');};
 for(const [k,v,max] of [
  ['requestId',requestId,85],['evidenceId',evidenceId,85],
  ['auditId',auditId,85],['factType',factType,120],
  ['attributePath',attributePath,120],['valueJson',valueJson,3000],
  ['displayValue',displayValue,500],['sourceId',sourceId,85],
  ['sourceRef',sourceRef,500],['observedAt',observedAt,10],
  ['verificationStatus',verificationStatus,85],['freshnessStatus',freshnessStatus,40],
  ['actor',actor,100],['auditDate',auditDate,10]
 ])required(k,v,max);
 for(const [field,value,prefix] of [
  ['requestId',requestId,QA_PREFIX],['evidenceId',evidenceId,'EV-QA-V2-'],
  ['auditId',auditId,'AUD-QA-V2-']
 ])if(value&&!value.startsWith(prefix))errors.push(field+': must be a V2 QA ID');
 if(!companyId&&!candidateId)errors.push('identity: exactly one QA identity required');
 if(companyId&&candidateId)errors.push('identity: Company and Candidate cannot both be set');
 if(companyId&&!companyId.startsWith('QA-COMPANY-'))errors.push('companyId: real Companies prohibited');
 if(candidateId&&!candidateId.startsWith('QA-CANDIDATE-'))errors.push('candidateId: real Candidates prohibited');
 if(companyId&&!unique(context.knownCompanyIds).has(companyId))errors.push('companyId: not in verified QA catalogue');
 if(candidateId&&!unique(context.knownCandidateIds).has(candidateId))errors.push('candidateId: not in verified QA catalogue');
 if(sourceId&&!sourceId.startsWith('QA-SRC-'))errors.push('sourceId: QA sources only');
 if(sourceRef&&!sourceRef.startsWith(QA_SOURCE))errors.push('sourceRef: isolated QA synthetic provenance only');
 if(sourceRef&&sourceRef.startsWith(QA_SOURCE)&&sourceRef.length===QA_SOURCE.length)errors.push('sourceRef: empty QA provenance');
 if(!isoDate(observedAt))errors.push('observedAt: valid ISO date required');
 if(!isoDate(auditDate))errors.push('auditDate: valid ISO date required');
 if(verificationStatus&&!VERIFICATION_STATES.includes(verificationStatus))errors.push('verificationStatus: unapproved value');
 if(freshnessStatus&&!FRESHNESS_STATES.includes(freshnessStatus))errors.push('freshnessStatus: unapproved value');
 if(informationClass!==QA_CLASS)errors.push('informationClass: must be Internal QA Only');
 if(actor!=='Internal QA')errors.push('actor: must be Internal QA in this isolated fixture');
 try{if(valueJson&&JSON.stringify(JSON.parse(valueJson))!==valueJson)
    warnings.push('valueJson: semantically valid JSON, but noncanonical serialization; review before release');}
 catch{errors.push('valueJson: valid JSON required');}
 const oldEvidence=Array.isArray(context.existingEvidence)?context.existingEvidence:[];
 const oldAudits=Array.isArray(context.existingAudits)?context.existingAudits:[];
 if(!Array.isArray(context.existingEvidence)||!Array.isArray(context.existingAudits))
  errors.push('preflight: live QA Evidence and Audit snapshots are required');
 if(unique([...oldEvidence.map(x=>x.requestId),...oldAudits.map(x=>x.requestId)]).has(requestId))
  errors.push('requestId: existing QA Evidence or Audit request; never retry');
 if(oldEvidence.some(x=>same(x.evidenceId,evidenceId)))errors.push('evidenceId: already present');
 if(oldAudits.some(x=>same(x.auditId,auditId)))errors.push('auditId: already present');
 const comparable=oldEvidence.filter(x=>same(x.companyId,companyId)&&same(x.candidateId,candidateId)
  &&same(x.attributePath,attributePath)&&attributePath);
 if(comparable.some(x=>same(x.displayValue,displayValue)&&same(x.sourceRef,sourceRef)
    &&same(x.observedAt,observedAt)))
  errors.push('evidence: equivalent source observation already present');
 if(comparable.some(x=>!same(x.displayValue,displayValue)))
  warnings.push('evidence: existing differing fact requires human conflict review; no replacement or merge');
 if(verificationStatus==='CONFLICTING / REVIEW REQUIRED'&&!draft.conflictGroupId)
  warnings.push('conflictGroupId: assign a reviewed conflict group before any accepted write');
 const status=errors.length?'BLOCKED':warnings.length?'REVIEW_REQUIRED':'QA_READY';
 return Object.freeze({status,errors:Object.freeze(errors),warnings:Object.freeze(warnings),
  draft:Object.freeze(draft),target:'ISOLATED_SYNTHETIC_QA_ONLY',writesPerformed:0});
}

/** Only returns in-memory arrays matching the existing QA worksheet headers. */
export function buildQaAppendRows(check){
 if(check?.status!=='QA_READY')throw Error('Preflight not QA_READY; no append rows produced');
 const d=check.draft;
 const evidence=[
  d.evidenceId,d.companyId,d.candidateId,d.factType,d.attributePath,
  d.valueJson,d.displayValue,d.sourceId,d.sourceRef,d.observedAt,
  d.verificationStatus,d.freshnessStatus,d.informationClass,
  d.conflictGroupId,d.requestId,'1'
 ];
 const audit=[
  d.auditId,d.auditDate,d.actor,'APPEND','Evidence Observation',d.evidenceId,
  d.requestId,'0','1','PREPARED','V2 synthetic QA only; not executed',d.sourceRef
 ];
 return Object.freeze({
  destination:'ISOLATED_SYNTHETIC_QA_ONLY',
  evidenceTab:'Evidence QA',auditTab:'Audit QA',
  evidenceRow:Object.freeze(evidence),auditRow:Object.freeze(audit),
  writesPerformed:0,
  warning:'Never submit these rows to canonical or preserved source Sheets. PREPARED is not RECORDED.'
 });
}

/**
 * Return-only production source validator for later V2 specification.
 * It does not produce a write or change the V1 auth scope.
 */
export function inspectRealSourceCitation(sourceRef){
 const source=t(sourceRef);
 return Object.freeze({valid:validHttp(source),sourceRef:validHttp(source)?source:'',
  writesPerformed:0});
}
