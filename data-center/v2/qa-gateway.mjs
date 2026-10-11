/*
 * TSS IDC V2 isolated QA gateway.
 * Hard boundary: writes may target the existing owner-only NON-CANONICAL QA
 * workbook, never the Master Companies or preserved Phase-3 archive.
 * All records and OAuth tokens are memory-only. There is no automatic retry.
 */
import {preflightQaProposal,buildQaAppendRows} from './review.mjs';

export const QA_BOOK='1X1EQpRLRK-ErvHXHxZ8Jp1rvV-SIW8GaKelVuCbzFkk';
export const QA_OWNER='thesmartysolution@gmail.com';
export const QA_TABS=Object.freeze({
 evidence:Object.freeze({name:'Evidence QA',id:406344347,columns:16}),
 audit:Object.freeze({name:'Audit QA',id:899733297,columns:12})
});
export const EVIDENCE_HEADERS=Object.freeze([
 'evidenceId','companyId','candidateId','factType','attributePath','valueJson','displayValue',
 'sourceId','sourceRef','observedAt','verificationStatus','freshnessStatus','informationClass',
 'conflictGroupId','requestId','version'
]);
export const AUDIT_HEADERS=Object.freeze([
 'auditId','date','actor','action','entityType','recordId','requestId','priorVersion',
 'newVersion','outcome','details','sourceRef'
]);
const norm=s=>String(s??'').trim().toLocaleLowerCase('en');
const obj=(values,headers)=>values.slice(1).filter(r=>r.some(v=>String(v??'').trim()))
 .map(r=>Object.fromEntries(headers.map((key,i)=>[key,String(r[i]??'').trim()])));
const sameHeaders=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const copy=record=>JSON.parse(JSON.stringify(record));

export class QaGateError extends Error {
 constructor(code,message){super(message);this.name='QaGateError';this.code=code;}
}
/** Create an isolated testable transport, injected so mocks cannot send web requests. */
export function makeQaGateway({fetcher,now=()=>Date.now()}={}){
 if(typeof fetcher!=='function')throw new QaGateError('NO_TRANSPORT','Explicit transport is required');
 let busy=false,used=false,issuedAt=null;
 const request=async(token,path,options={})=>{
  if(!token||typeof token!=='string')throw new QaGateError('NO_TOKEN','Owner Google token required');
  const response=await fetcher('https://sheets.googleapis.com/v4/spreadsheets/'+QA_BOOK+path,{
   method:options.method||'GET',
   headers:{Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})},
   cache:'no-store',...(options.body?{body:JSON.stringify(options.body)}:{})
  });
  if(!response?.ok)throw new QaGateError('GOOGLE_HTTP_'+(response?.status||'UNKNOWN'),
   'Google Sheets request was rejected; inspect existing rows before any fresh attempt');
  return response.json();
 };
 const read=async token=>{
  const metadata=await request(token,'?fields=spreadsheetId,sheets(properties(sheetId,title))');
  if(metadata.spreadsheetId!==QA_BOOK)throw new QaGateError('WRONG_BOOK','Wrong workbook');
  for(const tab of Object.values(QA_TABS)){
   if(!metadata.sheets?.some(x=>x.properties?.title===tab.name&&x.properties?.sheetId===tab.id))
    throw new QaGateError('TAB_CHANGED','QA tab name or ID mismatch');
  }
  const q=new URLSearchParams();
  q.append('ranges',"'Evidence QA'!A1:P100");
  q.append('ranges',"'Audit QA'!A1:L100");
  const response=await request(token,'/values:batchGet?'+q);
  const valueRanges=response.valueRanges;
  if(!Array.isArray(valueRanges)||valueRanges.length!==2)
   throw new QaGateError('INCOMPLETE','Both independent QA ranges must be available');
  const E=valueRanges[0]?.values,A=valueRanges[1]?.values;
  if(!Array.isArray(E)||!Array.isArray(A)||!sameHeaders(E[0]||[],EVIDENCE_HEADERS)
   ||!sameHeaders(A[0]||[],AUDIT_HEADERS))throw new QaGateError('HEADER_CHANGED','QA header mismatch');
  if(E.length>100||A.length>100)throw new QaGateError('FULL','QA workbook reached preflight row limit');
  return Object.freeze({at:now(),evidence:Object.freeze(obj(E,EVIDENCE_HEADERS)),
   audits:Object.freeze(obj(A,AUDIT_HEADERS))});
 };
 async function verifyGoogleOwner(token){
  if(!token)throw new QaGateError('NO_TOKEN','An owner token is required');
  const response=await fetcher('https://www.googleapis.com/oauth2/v3/userinfo',{
   headers:{Authorization:'Bearer '+token},cache:'no-store'
  });
  if(!response?.ok)throw new QaGateError('IDENTITY','Google could not verify owner identity');
  const user=await response.json();
  if(!user?.email_verified||norm(user.email)!==QA_OWNER)
   throw new QaGateError('UNAUTHORIZED','Only the TSS owner may operate QA');
  return QA_OWNER;
 }
 function preflight(draft,snapshot){
  if(!snapshot?.evidence||!snapshot?.audits)
   throw new QaGateError('NO_SNAPSHOT','Fresh provider QA evidence/audit snapshot required');
  return preflightQaProposal(draft,{
   knownCompanyIds:['QA-COMPANY-001'],knownCandidateIds:['QA-CANDIDATE-001'],
   existingEvidence:snapshot.evidence,existingAudits:snapshot.audits
  });
 }
 const row=a=>({values:a.map(v=>({userEnteredValue:{stringValue:String(v)}}))});
 const writeBody=rows=>({requests:[
  {appendCells:{sheetId:QA_TABS.evidence.id,rows:[row(rows.evidenceRow)],fields:'userEnteredValue'}},
  {appendCells:{sheetId:QA_TABS.audit.id,rows:[row([
   ...rows.auditRow.slice(0,9),'RECORDED',
   'Single controlled synthetic QA append; independent readback required',rows.auditRow[11]
  ])],fields:'userEnteredValue'}}
 ]});
 /** 
  * Explicit per-call submission, never from an effect, page load or retry.
  * Used exactly once per gateway instance; even failures must be manually
  * reconciled before constructing a new gateway/request.
  */
 async function appendOnce({token,draft,confirmation}={}){
  if(busy||used)throw new QaGateError('REPLAY','This submission session has already been used');
  if(confirmation!=='WRITE SYNTHETIC QA ONLY')
   throw new QaGateError('CONFIRM','Exact QA-only authorization phrase required');
  busy=true;used=true;issuedAt=now();
  try {
   await verifyGoogleOwner(token);
   const snapshot=await read(token); // mandatory pre-write provider read
   const check=preflight(draft,snapshot);
   if(check.status!=='QA_READY')return Object.freeze({
    status:check.status,writesPerformed:0,errors:check.errors,warnings:check.warnings
   });
   if(now()-snapshot.at>15000)
    throw new QaGateError('STALE','Snapshot too old for bounded QA submission');
   const rows=buildQaAppendRows(check);
   // Commit happens only AFTER owner check and fresh provider preflight.
   // Sheets is not a transactional uniqueness database: independent writer
   // races remain an unaccepted Production gate.
   let commitError=null;
   try {
    const commit=await request(token,':batchUpdate',{method:'POST',body:writeBody(rows)});
    if(!Array.isArray(commit.replies)||commit.replies.length!==2)
     commitError='Provider replies incomplete; must read back before status';
   }catch(err){commitError=err.message||'Uncertain provider response';}
   // Never blindly repeat a write, even if it timed out or failed.
   let after;
   try{after=await read(token);}
   catch(err){return Object.freeze({status:'UNCERTAIN',writesPerformed:'unknown',
    error:commitError||'Post-write readback unavailable',
    note:'Do not retry; manually reconcile by requestId'});}
   const e=after.evidence.filter(x=>x.requestId===draft.requestId||x.evidenceId===draft.evidenceId);
   const a=after.audits.filter(x=>x.requestId===draft.requestId||x.auditId===draft.auditId);
   const exact=e.length===1&&a.length===1&&e[0].evidenceId===draft.evidenceId
    &&a[0].auditId===draft.auditId&&a[0].recordId===draft.evidenceId
    &&e[0].requestId===draft.requestId&&a[0].requestId===draft.requestId
    &&e[0].companyId===draft.companyId&&e[0].candidateId===(draft.candidateId||'')
    &&e[0].informationClass==='Internal QA Only'&&a[0].outcome==='RECORDED'
    &&e[0].sourceRef===draft.sourceRef
    &&after.evidence.length===snapshot.evidence.length+1
    &&after.audits.length===snapshot.audits.length+1;
   if(!exact||commitError)return Object.freeze({
    status:'UNCERTAIN',writesPerformed:'unknown',
    note:'Reconcile both QA tabs by immutable requestId before any new submission',
    evidenceMatches:e.length,auditMatches:a.length,commitError
   });
   return Object.freeze({
    status:'QA_APPEND_VERIFIED',writesPerformed:2,
    requestId:draft.requestId,evidenceId:draft.evidenceId,auditId:draft.auditId,
    evidenceRows:after.evidence.length,auditRows:after.audits.length,
    timestamp:now(),note:'Only isolated synthetic QA workbook updated'
   });
  }finally{busy=false;}
 }
 return Object.freeze({
  read,verifyGoogleOwner,preflight,appendOnce,
  get spent(){return used;},get initiatedAt(){return issuedAt;}
 });
}
