import {preflightQaProposal,buildQaAppendRows} from './review.mjs';

/* Public PREVIEW shell with synthetic data only. Nothing here can fetch, store,
 * authenticate, write a Google Sheet or contact HubSpot. */
const el=id=>document.getElementById(id);
const form=el('proposal'),status=el('status'),details=el('details');
const prepare=el('prepare'),prepared=el('prepared');
let check=null;

/* Historic QA records are illustrative STATIC fixtures, NOT live snapshots.
 * An eligible production workflow would require re-reading both QA tabs
 * after review and rechecking request ID collisions before any attempt. */
const context=Object.freeze({
 knownCompanyIds:Object.freeze(['QA-COMPANY-001']),
 knownCandidateIds:Object.freeze(['QA-CANDIDATE-001']),
 existingEvidence:Object.freeze([Object.freeze({
  evidenceId:'EV-QA-SEED-001',requestId:'QA-IDC-SEED-001',
  companyId:'QA-COMPANY-001',candidateId:'',
  attributePath:'developerRoles',displayValue:'Synthetic seed only',
  sourceRef:'synthetic://tss-idc/write-gate/seed',observedAt:'2026-10-11'
 })]),
 existingAudits:Object.freeze([Object.freeze({
  auditId:'AUD-QA-SEED-001',requestId:'QA-IDC-SEED-001'
 })])
});
const defaults=Object.freeze({
 identity:'QA-COMPANY-001',factType:'Development Activity',
 attributePath:'newDemoObservation',displayValue:'Synthetic status only',
 valueJson:'"Synthetic status only"',observedAt:'2026-10-11',
 verificationStatus:'UNVERIFIED',freshnessStatus:'Review Due',
 sourceId:'QA-SRC-001',sourceRef:'synthetic://tss-idc/v2/demo-source-002',
 requestId:'QA-IDC-V2-REQ-0002',evidenceId:'EV-QA-V2-0002',
 auditId:'AUD-QA-V2-0002',conflictGroupId:'',
 actor:'Internal QA',auditDate:'2026-10-11',
 reviewNotes:'Synthetic proposal for non-production validation only.'
});
function writeFields(obj){
 for(const [key,value] of Object.entries(obj)){
  const element=key==='identity'?el('identity'):form.elements.namedItem(key);
  if(element)element.value=value;
 }
}
function clearOutput(){
 check=null;prepare.disabled=true;prepared.textContent='No proposal prepared.';
 status.className='status neutral';status.textContent='Not checked';
 details.replaceChildren();
 const p=document.createElement('p');
 p.textContent='Run the checks to see duplicate protection, classification and source warnings.';
 details.append(p);
}
function readDraft(){
 const input=Object.fromEntries(Object.keys(defaults)
  .filter(k=>k!=='identity')
  .map(k=>[k,form.elements.namedItem(k)?.value||'']));
 const identity=el('identity').value;
 return {...input,companyId:identity.startsWith('QA-COMPANY-')?identity:'',
  candidateId:identity.startsWith('QA-CANDIDATE-')?identity:'',
  informationClass:'Internal QA Only'};
}
function addList(heading,items){
 if(!items.length)return;
 const title=document.createElement('h3');title.textContent=heading;details.append(title);
 const list=document.createElement('ul');
 for(const message of items){
  const item=document.createElement('li');item.textContent=message;list.append(item);
 }
 details.append(list);
}
function setOutcome(result){
 status.className='status '+({
  BLOCKED:'blocked',REVIEW_REQUIRED:'review',QA_READY:'ready'
 }[result.status]||'neutral');
 status.textContent={
  BLOCKED:'BLOCKED — correct the proposal',
  REVIEW_REQUIRED:'HUMAN REVIEW REQUIRED',
  QA_READY:'LOCAL QA PREFLIGHT PASSED — not write authorization'
 }[result.status]||result.status;
 details.replaceChildren();
 addList('Blocking controls',result.errors);
 addList('Review flags',result.warnings);
 const text=document.createElement('p');
 text.textContent=result.status==='QA_READY'
  ? 'The synthetic example passed its local checks. Fresh provider snapshots, concurrence checks and owner approval are still required for any actual write.'
  : 'No evidence or audit rows may be prepared as write instructions in this state. Preserve prior observations and resolve all flagged issues.';
 details.append(text);
 prepare.disabled=result.status!=='QA_READY';
 prepared.textContent='No proposal prepared.';
}
form.addEventListener('submit',event=>{
 event.preventDefault();
 check=preflightQaProposal(readDraft(),context);
 setOutcome(check);
});
form.addEventListener('input',clearOutput);
form.addEventListener('change',clearOutput);
el('reset').addEventListener('click',()=>{writeFields(defaults);clearOutput();});
el('duplicate').addEventListener('click',()=>{
 writeFields({...defaults,requestId:'QA-IDC-SEED-001'});
 clearOutput();form.requestSubmit();
});
el('conflict').addEventListener('click',()=>{
 writeFields({...defaults,attributePath:'developerRoles',
  displayValue:'Another synthetic role',valueJson:'"Another synthetic role"',
  verificationStatus:'CONFLICTING / REVIEW REQUIRED'});
 clearOutput();form.requestSubmit();
});
prepare.addEventListener('click',()=>{
 if(!check||check.status!=='QA_READY'){clearOutput();return;}
 // Revalidate every current field before returning any in-memory rows.
 const again=preflightQaProposal(readDraft(),context);
 if(again.status!=='QA_READY'){check=again;setOutcome(again);return;}
 const rows=buildQaAppendRows(again);
 prepared.textContent=JSON.stringify({
  notice:'LOCAL PREVIEW ONLY — NOT A SHEETS WRITE OR AN AUDIT RECORD',
  snapshots:'FROZEN SYNTHETIC FIXTURES ONLY; NO FRESH LIVE READBACK',
  destination:rows.destination,evidenceTab:rows.evidenceTab,
  evidenceRow:rows.evidenceRow,auditTab:rows.auditTab,
  auditRow:rows.auditRow,writesPerformed:rows.writesPerformed
 },null,2);
 prepare.disabled=true;
});
el('clear').addEventListener('click',()=>{
 form.reset();writeFields(defaults);clearOutput();
});
clearOutput();
