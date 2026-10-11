import {rowsToObjects,filterCompanies,businessOnly,normalized} from '../model.mjs';
import {evaluateRealProposal} from './real-review.mjs';

/* Never imports a writer. All Sheets requests use only .readonly OAuth scope.
 * Research data and bearer token remain in JS memory, cleared on Lock.
 */
const cfg=window.TSS_IDC_CONFIG||{};
const el=id=>document.getElementById(id);
const set=(id,value)=>{el(id).textContent=String(value??'');};
let token='',owner='',epoch=0,busy=false,selectedId='',loaded=false;
let records={companies:[],evidence:[],profiles:[]};
const allowOwner='thesmartysolution@gmail.com';
const readScope='https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/spreadsheets.readonly';
function clearProposal(){
 el('check').disabled=!loaded||!selectedId||busy;
 el('decision').className='status neutral';
 set('decision','Not evaluated');
 set('issues','No proposal prepared.');
 set('draft','A review proposal will appear here after validation. No Google Sheet is changed.');
}
function controls(){
 el('connect').disabled=Boolean(token)||busy;
 el('refresh').disabled=!token||busy;
 el('check').disabled=!loaded||!selectedId||busy;
}
function lock(){
 epoch++;token='';owner='';busy=false;loaded=false;selectedId='';
 records={companies:[],evidence:[],profiles:[]};
 el('workspace').hidden=true;el('search').value='';
 el('matches').replaceChildren();el('facts').replaceChildren();
 set('identity','Not connected. All private Google token and research data cleared.');
 set('sourceStatus','Research locked. Open with the approved TSS Google owner account.');
 set('selected','Select a canonical Company first.');
 set('dossier','Choose a Company to inspect its recorded evidence.');
 clearProposal();controls();
}
function notice(message){set('sourceStatus',message);}
async function batchGet(tokenValue,spreadsheet,ranges){
 const query=new URLSearchParams();
 for(const range of ranges)query.append('ranges',range);
 const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheet)+
  '/values:batchGet?'+query;
 const res=await fetch(url,{headers:{Authorization:'Bearer '+tokenValue},cache:'no-store'});
 if(!res.ok)throw Error('Google Sheets read denied ('+res.status+').');
 const json=await res.json();
 if(!Array.isArray(json.valueRanges)||json.valueRanges.length!==ranges.length)
  throw Error('Google returned incomplete research evidence ranges');
 return json.valueRanges.map(x=>rowsToObjects(x.values||[]));
}
async function load(){
 if(!token||busy)return;
 busy=true;controls();const serial=epoch,issued=token;
 notice('Reading private canonical Companies and preserved evidence through Google Sheets…');
 try{
  const [c]=await batchGet(issued,cfg.masterSpreadsheetId,['Companies!A:L']);
  const [rawEvidence,profiles]=await batchGet(issued,cfg.researchSpreadsheetId,
   ["'Evidence Observation'!A:U","'Company Intelligence Profile'!A:O"]);
  if(serial!==epoch||issued!==token)return;
  if(!c.length||!rawEvidence.length)throw Error('One of the required research sources is empty');
  const ids=c.map(x=>x.id).filter(Boolean);
  if(ids.length!==c.length||new Set(ids).size!==ids.length)
   throw Error('Canonical Company ID integrity check failed');
  records={companies:c,evidence:businessOnly(rawEvidence),profiles:businessOnly(profiles)};
  loaded=true;selectedId='';
  el('workspace').hidden=false;
  set('identity',owner+' · Verified owner · Google Sheets read only');
  notice('Research read complete: '+c.length+' canonical Companies, '+
   records.evidence.length+' evidence observations. No write permitted.');
  set('dossier','Choose a Company from the exact canonical search.');
  el('facts').replaceChildren();set('selected','Select a canonical Company first.');
  el('search').value='';renderMatches();clearProposal();
 }catch(error){
  if(serial!==epoch)return;
  lock();notice('Source read failed and session locked: '+error.message);
 }finally{if(serial===epoch){busy=false;controls();}}
}
async function connect(){
 if(token||busy)return;
 if(cfg.readOnly!==true||cfg.allowedEmail!==allowOwner||
  !/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(cfg.googleClientId||'')){
  notice('Owner-only read-only configuration is invalid; no data accessed.');return;
 }
 if(!window.google?.accounts?.oauth2){notice('Google sign-in is unavailable; no data accessed.');return;}
 const client=window.google.accounts.oauth2.initTokenClient({
  client_id:cfg.googleClientId,scope:readScope,include_granted_scopes:false,
  login_hint:allowOwner,
  callback:async response=>{
   if(response?.error||!response?.access_token){notice('Google did not authorize the research read.');return;}
   const issued=response.access_token,serial=epoch;
   busy=true;controls();
   try{
    const res=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{
     headers:{Authorization:'Bearer '+issued},cache:'no-store'
    });
    if(!res.ok)throw Error('Google owner identity could not be verified');
    const user=await res.json();
    if(!user.email_verified||normalized(user.email)!==allowOwner)
     throw Error('Only the verified TSS Google owner account is permitted');
    if(serial!==epoch)return;
    token=issued;owner=user.email;
    set('identity',owner+' · Verified Google owner');
   }catch(error){if(serial===epoch){lock();notice(error.message);}}
   finally{if(serial===epoch){busy=false;controls();}}
   if(serial===epoch&&token)await load();
  },
  error_callback:()=>notice('Google sign-in window did not complete. No private data loaded.')
 });
 client.requestAccessToken({prompt:'',login_hint:allowOwner});
}
function node(tag,value,cls=''){
 const n=document.createElement(tag);
 if(cls)n.className=cls;
 n.textContent=String(value??'');
 return n;
}
function renderMatches(){
 const list=el('matches');list.replaceChildren();
 if(!loaded)return;
 const term=el('search').value.trim();
 if(!term){list.append(node('p','Enter Company ID or name to search the private catalogue.','hint'));return;}
 const hits=filterCompanies(records.companies,{query:term}).slice(0,30);
 if(!hits.length){list.append(node('p','No matching canonical Companies.','hint'));return;}
 for(const company of hits){
  const b=node('button',(company.name||'Unknown')+' · '+company.id,'secondary');
  b.type='button';b.style.display='block';b.style.width='100%';b.style.textAlign='left';
  b.style.marginBottom='7px';b.addEventListener('click',()=>selectCompany(company.id));
  list.append(b);
 }
}
function selectCompany(id){
 if(!loaded)return;
 const c=records.companies.find(x=>x.id===id);if(!c)return;
 selectedId=c.id;
 const rows=records.evidence.filter(e=>e.companyId===id);
 const p=records.profiles.find(x=>x.companyId===id);
 set('selected','Proposed research for '+(c.name||'Unknown')+' · '+id);
 set('dossier',(c.name||'Unknown')+' · '+id+' | '+(c.category||'Unknown category')+
  ' | '+(c.district||'Unknown district')+' | '+rows.length+' source observations'+
  (p?' | Profile: '+(p.disposition||'Unknown'):''));
 const facts=el('facts');facts.replaceChildren();
 if(!rows.length){facts.append(node('p','No existing evidence is recorded for this Company.','hint'));}
 for(const e of rows.slice(0,40)){
  const box=node('div','', 'prior');
  box.append(node('strong',(e.attributePath||e.factType||'Unknown')+
   ' · '+(e.displayValue||'Unknown')));
  box.append(node('span',(e.verificationStatus||'UNVERIFIED')+' · '+
   (e.freshnessStatus||'Unknown')+' · Observed '+(e.observedAt||'Unknown')));
  box.append(node('span','Source: '+(e.sourceRef||'Not recorded')));
  facts.append(box);
 }
 clearProposal();
}
function evaluate(event){
 event?.preventDefault();
 if(!loaded||!selectedId)return;
 const form=el('proposal');
 const fields=['factType','attributePath','displayValue','sourceRef','observedAt',
  'verificationStatus','freshnessStatus','informationClass','reviewNotes'];
 const draft=Object.fromEntries(fields.map(k=>[k,form.elements.namedItem(k)?.value||'']));
 const result=evaluateRealProposal({...draft,companyId:selectedId},{
  sourceVerified:Boolean(owner)&&loaded,companies:records.companies,
  evidence:records.evidence,today:new Date().toISOString().slice(0,10)
 });
 el('decision').className='status '+(result.status==='BLOCKED'?'blocked':
  result.status==='REQUIRES_HUMAN_REVIEW'?'review':'ready');
 set('decision',result.status+' — NOT A WRITE AUTHORIZATION');
 set('issues',[...result.errors,...result.warnings].join('\n')||
  'No detected duplicate or contradiction. Owner review and write gate still required.');
 set('draft',JSON.stringify({
  status:result.status,companyId:result.candidate.companyId,
  proposedFact:result.candidate,priorEvidenceCount:result.existingEvidenceCount,
  priorObservations:result.existingFacts,
  writesPerformed:0,nextAction:result.nextAction
 },null,2));
}
el('connect').addEventListener('click',connect);
el('refresh').addEventListener('click',load);
el('lock').addEventListener('click',lock);
el('search').addEventListener('input',renderMatches);
el('proposal').addEventListener('submit',evaluate);
el('proposal').addEventListener('input',clearProposal);
lock();
