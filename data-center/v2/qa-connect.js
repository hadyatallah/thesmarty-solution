import {makeQaGateway,QA_OWNER,QA_BOOK} from './qa-gateway.mjs';

const cfg=window.TSS_IDC_CONFIG||{};
const el=id=>document.getElementById(id);
const text=(id,message)=>{el(id).textContent=message;};
let token='',owner='',gateway=null,snapshot=null,attempted=false,busy=false;
const fields=['requestId','evidenceId','auditId','companyId','factType',
 'attributePath','displayValue','sourceId','sourceRef','observedAt'];
const gate=()=>makeQaGateway({fetcher:(url,options)=>fetch(url,options)});
const today='2026-10-11';  // Fixed acceptance fixture; not a dynamic live fact.
function proposal(){
 const values=Object.fromEntries(fields.map(key=>[key,el('proposal').elements.namedItem(key)?.value||'']));
 return {...values,candidateId:'',valueJson:JSON.stringify(values.displayValue),
  verificationStatus:'UNVERIFIED',freshnessStatus:'Review Due',
  informationClass:'Internal QA Only',actor:'Internal QA',auditDate:today,
  conflictGroupId:'',reviewNotes:'Synthetic UI acceptance, no real business data'};
}
function controls(){
 el('connect').disabled=busy||Boolean(token);
 el('read').disabled=busy||!token;
 el('preflight').disabled=busy||!token||!snapshot||attempted;
 el('submit').disabled=busy||!token||!snapshot||attempted
  ||!el('consent').checked||el('phrase').value!=='WRITE SYNTHETIC QA ONLY';
 el('reconcile').disabled=busy||!token;
}
function lock(){
 token='';owner='';gateway=null;snapshot=null;attempted=false;busy=false;
 el('consent').checked=false;el('phrase').value='';
 text('owner','Not connected. All Google tokens and QA rows cleared from this page.');
 text('snapshot','No provider snapshot loaded.');
 text('result','No QA preflight performed.');
 text('outcome','No QA write attempted.');
 controls();
}
async function connect(){
 if(token||busy)return;
 if(cfg.allowedEmail!==QA_OWNER||cfg.readOnly!==true){
  text('owner','Configuration mismatch. Refusing access.');return;
 }
 if(!window.google?.accounts?.oauth2){
  text('owner','Google OAuth library is unavailable. Check connectivity; no data was accessed.');return;
 }
 const client=window.google.accounts.oauth2.initTokenClient({
  client_id:cfg.googleClientId,
  scope:'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/spreadsheets',
  include_granted_scopes:false,
  login_hint:QA_OWNER,
  callback:async response=>{
   if(response?.error||!response?.access_token){
    text('owner','Google did not authorize QA access. Nothing was read or written.');return;
   }
   busy=true;controls();
   try{
    const nextGate=gate();
    await nextGate.verifyGoogleOwner(response.access_token);
    token=response.access_token;owner=QA_OWNER;gateway=nextGate;
    text('owner',owner+' · Owner verified · QA workbook '+QA_BOOK);
    text('result','Connected. Run Read QA Evidence + Audit before preflight.');
   }catch(error){
    token='';owner='';gateway=null;
    text('owner',error.message||'Owner verification failed');
   }finally{busy=false;controls();}
  },
  error_callback:()=>text('owner','Google could not complete the sign-in window; no QA data accessed.')
 });
 client.requestAccessToken({prompt:'',login_hint:QA_OWNER});
}
async function load(){
 if(!token||busy)return;
 busy=true;controls();
 try{
  await gateway.verifyGoogleOwner(token);
  snapshot=await gateway.read(token);
  const evid=snapshot.evidence.length,audit=snapshot.audits.length;
  text('snapshot','Fresh Google QA read completed: '+evid+' Evidence and '+audit+
   ' Audit records. No Production workbook accessed.');
  text('result','Snapshot loaded. Preflight is available.');
 }catch(error){
  snapshot=null;text('snapshot','Read rejected: '+error.message);
 }finally{busy=false;controls();}
}
function check(){
 if(!snapshot||!token||attempted)return;
 const result=gateway.preflight(proposal(),snapshot);
 text('result',result.status+(
  result.errors.length?' · Blocked: '+result.errors.join(' | '):'')+
  (result.warnings.length?' · Human review: '+result.warnings.join(' | '):'')+
  (result.status==='QA_READY'?' · Fresh recheck occurs before any write.':''));
 return result;
}
async function submit(){
 if(busy||attempted||!token||!snapshot||!el('consent').checked
  ||el('phrase').value!=='WRITE SYNTHETIC QA ONLY')return;
 // The exact sample is a synthetic fixture. Never retry this request automatically,
 // including on timeout, provider error, result mismatch or lost network.
 busy=true;attempted=true;controls();
 text('outcome','Submitting at most one QA-only Evidence/Audit append. No retry permitted…');
 try {
  const response=await gateway.appendOnce({
   token,draft:proposal(),confirmation:'WRITE SYNTHETIC QA ONLY'
  });
  text('outcome',JSON.stringify(response,null,2));
  text('result',response.status==='QA_APPEND_VERIFIED'
   ? 'PASS: QA-only append independently verified. This request is now spent.'
   : 'QA write not accepted as complete. Reconcile by ID before any future request.');
 }catch(error){
  text('outcome','ERROR / POSSIBLY UNCERTAIN: '+(error.message||'Unknown')+
   '\nDo not retry. Verify both QA tabs by stable request ID.');
 }finally{busy=false;controls();}
}
async function reconcile(){
 if(!token||busy)return;busy=true;controls();
 try{
  const current=await gateway.read(token);
  const requestId=proposal().requestId;
  const e=current.evidence.filter(x=>x.requestId===requestId);
  const a=current.audits.filter(x=>x.requestId===requestId);
  text('outcome',JSON.stringify({
   mode:'READ_ONLY_RECONCILIATION',requestId,
   evidenceMatches:e.length,auditMatches:a.length,
   evidenceIds:e.map(x=>x.evidenceId),
   auditIds:a.map(x=>x.auditId),auditOutcomes:a.map(x=>x.outcome),
   writesPerformed:0
  },null,2));
 }catch(error){text('outcome','QA readback unavailable: '+error.message+'\nNo write was attempted.');}
 finally{busy=false;controls();}
}
el('connect').addEventListener('click',connect);
el('lock').addEventListener('click',lock);
el('read').addEventListener('click',load);
el('preflight').addEventListener('click',check);
el('submit').addEventListener('click',submit);
el('reconcile').addEventListener('click',reconcile);
el('consent').addEventListener('change',controls);
el('phrase').addEventListener('input',controls);
controls();
