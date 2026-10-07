(() => {
'use strict';

const API='/api/crm';
const TARGET='commercial-network-dev2';
const GOOGLE_CLIENT_ID='103840050410-80lukup1okjnkmt6qvmd9s2mbvi3uakf.apps.googleusercontent.com';
const SESSION_KEY='tss-cn-dev2-session-v1';
const SESSION_DEVICE_MAX_MS=8*60*60*1000;
const sections=['Overview','Mandate','Target Criteria','Matches','Activity','Documents','Public Presentation'];

let sessionToken='',sessionExpiry=0,networkState=null,opportunity=null,mandate=null,criteria=[],matches=[],activeSection='Overview';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el=id=>document.getElementById(id);

async function rpc(fn,...args){
  let response;
  try{
    response=await fetch(API,{
      method:'POST',credentials:'same-origin',redirect:'follow',cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({target:TARGET,fn,args})
    });
  }catch(e){throw Error('DEV2_READ_TRANSPORT_UNAVAILABLE')}
  let data;try{data=await response.json()}catch{throw Error('DEV2_READ_INVALID_RESPONSE')}
  if(!response.ok||!data?.ok)throw Error(data?.error||'DEV2_READ_FAILED');
  return data.result;
}
async function call(fn,...args){
  const token=sessionToken;
  try{
    const result=await rpc(fn,token,...args);
    if(token!==sessionToken)throw Error('SESSION_CHANGED');
    return result;
  }catch(e){
    if(/AUTH_REQUIRED|SESSION_CHANGED/.test(String(e.message||e))){clearSession();showLogin('Your DEV2 session ended. Sign in again.');}
    throw e;
  }
}
function rememberSession(){
  if(!sessionToken)return;
  try{localStorage.setItem(SESSION_KEY,JSON.stringify({token:sessionToken,serverExpiry:sessionExpiry,deviceExpiry:Date.now()+SESSION_DEVICE_MAX_MS}))}catch(e){}
}
function clearSession(){
  sessionToken='';sessionExpiry=0;
  try{localStorage.removeItem(SESSION_KEY)}catch(e){}
}
function setConnection(text,error=''){
  el('connectionState').textContent=text||'';
  el('connectionError').textContent=error||'';
}
function backendErrorMessage(code){
  if(code==='DEV2_BACKEND_NOT_CONFIGURED')return 'The DEV2 read endpoint has not been deployed/configured for this preview yet.';
  if(code==='DEV2_PREVIEW_ONLY')return 'The DEV2 Commercial Network read path is restricted to the approved preview branch.';
  if(code==='CRM_BACKEND_UNAVAILABLE'||code==='UPSTREAM_TIMEOUT')return 'The DEV2 backend is temporarily unavailable.';
  return code||'DEV2 read failed.';
}
async function loadGoogle(){
  if(window.google?.accounts?.id)return;
  await new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;
    s.onload=resolve;s.onerror=()=>reject(Error('GOOGLE_SIGN_IN_UNAVAILABLE'));document.head.appendChild(s);
  });
}
async function showLogin(message=''){
  clearSession();networkState=null;opportunity=null;mandate=null;criteria=[];matches=[];
  el('workspace').hidden=true;el('emptyState').hidden=true;el('connectionPanel').hidden=false;
  setConnection('Authentication required',message);
  el('retryButton').hidden=true;el('googleButton').innerHTML='';
  try{
    const challenge=await rpc('beginGoogleLogin');
    await loadGoogle();
    setConnection('Sign in with the authorised TSS Google account');
    google.accounts.id.initialize({
      client_id:GOOGLE_CLIENT_ID,nonce:challenge.nonce,auto_select:false,
      callback:async response=>{
        setConnection('Verifying DEV2 access…');el('googleButton').innerHTML='';
        try{
          const auth=await rpc('googleSignIn',response.credential,challenge.nonce);
          sessionToken=auth.token;sessionExpiry=Number(auth.expiresAt||0);rememberSession();
          await refreshState();
        }catch(e){showLogin(backendErrorMessage(String(e.message||e)))}
      }
    });
    google.accounts.id.renderButton(el('googleButton'),{theme:'outline',size:'large',text:'signin_with',width:280});
  }catch(e){
    setConnection('DEV2 read connection not available',backendErrorMessage(String(e.message||e)));
    el('retryButton').hidden=false;
  }
}
async function restoreSession(){
  let saved;try{saved=JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(e){}
  if(!saved?.token||!saved.deviceExpiry||Date.now()>=Number(saved.deviceExpiry)){clearSession();return false;}
  sessionToken=saved.token;sessionExpiry=Number(saved.serverExpiry||0);
  try{
    const checked=await rpc('checkSession',sessionToken);
    sessionExpiry=Number(checked?.expiresAt||sessionExpiry||Date.now()+5*60*1000);rememberSession();return true;
  }catch(e){clearSession();return false}
}

function parseJson(value,fallback){
  if(value==null||value==='')return fallback;
  if(typeof value==='object')return value;
  try{return JSON.parse(value)}catch{return fallback}
}
function criterionRows(m){
  const raw=parseJson(m?.criteriaJson,[]);
  if(Array.isArray(raw))return raw.map((x,i)=>normalizeCriterion(x,i));
  if(raw&&Array.isArray(raw.criteria))return raw.criteria.map((x,i)=>normalizeCriterion(x,i));
  if(raw&&typeof raw==='object'){
    const out=[];
    for(const type of ['Mandatory','Preferred','Informational']){
      const source=raw[type]??raw[type.toLowerCase()]??raw[type.toLowerCase().replace(/al$/,'')];
      if(Array.isArray(source))source.forEach((x,i)=>out.push(normalizeCriterion(typeof x==='object'?{...x,type}: {label:String(x),type},i)));
    }
    return out;
  }
  return [];
}
function normalizeCriterion(x,i){
  if(typeof x==='string')return {label:x,type:'Informational',result:'Not Assessed'};
  const type=String(x.type||x.classification||x.requirementType||'Informational');
  return {
    label:String(x.label||x.name||x.criterion||x.field||('Criterion '+(i+1))),
    type,
    result:String(x.result||x.status||'Not Assessed')
  };
}
function activeMandateFor(opp){
  const all=(networkState?.mandates||[]).filter(m=>String(m.commercialOpportunityId)===String(opp.id));
  return all.find(m=>String(m.status)==='Active')||all[0]||null;
}
function matchesFor(m){
  if(!m)return [];
  return (networkState?.matches||[]).filter(x=>String(x.mandateId)===String(m.id));
}
function operatingPhase(opp,m,criteriaRows){
  if(!opp||String(opp.status)!=='Accepted')return 'PREPARE';
  const stage=String(opp.developmentStage||'Preparation');
  const launch=['Targeting','Qualification','Shortlist','Outreach','Interest'];
  const convert=['Introduction','Active Discussion','Negotiation / Professional Handoff','Outcome'];
  const mandatory=criteriaRows.some(c=>String(c.type)==='Mandatory');
  const blocked=!m||String(m.status)!=='Active'||String(m.authorityResearch||'Not Granted')==='Not Granted'||String(m.authorityOutreach||'Not Granted')!=='Granted'||!mandatory;
  if(stage==='Preparation'||(launch.includes(stage)&&blocked))return 'LOAD';
  if(launch.includes(stage))return 'LAUNCH';
  if(convert.includes(stage))return 'CONVERT';
  return 'PREPARE';
}
function readinessChecks(){
  const o=opportunity,m=mandate;
  return [
    ['Opportunity definition',Boolean(o?.title&&o?.opportunityType&&o?.status),o?.title?'Ready':'Attention Required'],
    ['Opportunity summary',Boolean(String(o?.internalSummary||'').trim()),String(o?.internalSummary||'').trim()?'Ready':'Attention Required'],
    ['Target criteria',criteria.some(c=>String(c.type)==='Mandatory'),criteria.some(c=>String(c.type)==='Mandatory')?'Ready':'Incomplete'],
    ['Mandate',Boolean(m&&String(m.status)==='Active'),m?.status||'Missing'],
    ['Research authority',String(m?.authorityResearch||'Not Granted')==='Granted',m?.authorityResearch||'Not Granted'],
    ['Outreach authority',String(m?.authorityOutreach||'Not Granted')==='Granted',m?.authorityOutreach||'Not Granted'],
    ['Disclosure authority',!['','Not Granted'].includes(String(m?.authorityDisclosure||'')),m?.authorityDisclosure||'Not Granted'],
    ['Professional / regulatory route',Boolean(String(m?.legalProfessionalRoute||'').trim())&&String(m?.legalProfessionalRoute)!=='Review Required',m?.legalProfessionalRoute||'Not Set'],
    ['Documents',Array.isArray(o?.keyDocumentRefs)&&o.keyDocumentRefs.length>0,(o?.keyDocumentRefs||[]).length?'Ready':'None referenced']
  ];
}
function statusCard(label,value){return '<div class="status-card"><small>'+esc(label)+'</small><strong>'+esc(value||'Unknown')+'</strong></div>'}
function kv(label,value){return '<div class="kv"><dt>'+esc(label)+'</dt><dd>'+esc(value||'Unknown')+'</dd></div>'}

function selectOpportunity(opp){
  opportunity=opp;mandate=activeMandateFor(opp);criteria=criterionRows(mandate);matches=matchesFor(mandate);activeSection='Overview';
  renderWorkspace();
}
function renderNetworkEmpty(){
  el('connectionPanel').hidden=true;el('workspace').hidden=true;el('emptyState').hidden=false;
  const c=networkState?.coverage||{};
  const total=(networkState?.commercialOpportunities||[]).length;
  el('emptyState').innerHTML='<strong>DEV2 read projection connected.</strong><br>'+
    'Commercial Opportunities: '+esc(total)+' · Mandates: '+esc(c.Mandates?.active??(networkState?.mandates||[]).length)+' · Matches: '+esc(c.Matches?.active??(networkState?.matches||[]).length)+
    '<br><span class="muted">No persistent Commercial Opportunity is currently available to open. This is the expected clean DEV2 state after acceptance cleanup.</span>';
  window.cnWorkspaceReady=true;
}
function renderOpportunityChooser(){
  const list=networkState?.commercialOpportunities||[];
  if(list.length===1){selectOpportunity(list[0]);return}
  if(list.length===0){renderNetworkEmpty();return}
  const id=new URLSearchParams(location.search).get('opportunity');
  const selected=list.find(x=>String(x.id)===String(id))||list[0];
  selectOpportunity(selected);
}
function renderWorkspace(){
  el('connectionPanel').hidden=true;el('emptyState').hidden=true;el('workspace').hidden=false;
  const o=opportunity,m=mandate,phase=operatingPhase(o,m,criteria);
  el('opportunityTitle').textContent=o.title||o.id;
  el('opportunitySubtitle').textContent=[o.opportunityType,o.geographyLocality,o.geographyRegion,o.geographyCountry].filter(Boolean).join(' · ');
  el('statusStrip').innerHTML=[
    ['Operating Phase',phase],['Opportunity Status',o.status],['Development Stage',o.developmentStage],
    ['Mandate',m?.status||'Missing'],['Outreach',m?.authorityOutreach||'Not Granted'],['Disclosure Ceiling',m?.maxDisclosureLevel||'Not Set'],['Owner',o.owner||'Unknown']
  ].map(x=>statusCard(...x)).join('');
  const outreachGranted=String(m?.authorityOutreach||'Not Granted')==='Granted';
  el('attentionBanner').className='alert '+(outreachGranted?'good':'');
  el('attentionBanner').innerHTML=outreachGranted
    ?'<strong>Read-only preview</strong> The Mandate records Outreach as Granted, but this Action Item 8 frontend deliberately exposes no send/write action.'
    :'<strong>🔒 Outreach blocked</strong> The current DEV2 Mandate does not grant Outreach. External communication remains unavailable.';
  renderTabs();renderPanel();window.cnWorkspaceReady=true;
}
function renderTabs(){
  el('workspaceTabs').innerHTML=sections.map(section=>'<button type="button" role="tab" aria-selected="'+(section===activeSection)+'" data-section="'+esc(section)+'">'+esc(section)+'</button>').join('');
  document.querySelectorAll('[data-section]').forEach(btn=>btn.addEventListener('click',()=>{activeSection=btn.dataset.section;renderTabs();renderPanel()}));
}
function renderOverview(){
  const o=opportunity,checks=readinessChecks();
  return '<div class="grid"><section class="panel"><h3>Opportunity summary</h3><dl>'+
    kv('Opportunity ID',o.id)+kv('Type',o.opportunityType)+kv('Sector',o.sector)+kv('Geography',[o.geographyLocality,o.geographyRegion,o.geographyCountry].filter(Boolean).join(', '))+
    kv('Commercial structure',o.commercialStructure)+kv('Information class',o.informationClass)+kv('Publication status',o.publicationStatus)+
    '</dl></section><section class="panel"><h3>Launch readiness</h3><div class="readiness">'+checks.map(([label,ok,state])=>'<div class="readiness-item"><strong>'+esc(label)+'</strong><div class="readiness-state '+(ok?'ready':'blocked')+'">'+esc(state)+'</div></div>').join('')+
    '</div><p class="notice">No readiness percentage is calculated. These checks are derived only from the authenticated DEV2 projection.</p></section>'+
    '<section class="panel full"><h3>Internal summary</h3><p>'+esc(o.internalSummary||'No internal summary recorded.')+'</p></section></div>';
}
function renderMandate(){
  if(!mandate)return '<div class="empty"><strong>No Mandate linked to this Opportunity.</strong><br>Read-only mode does not create one.</div>';
  const m=mandate,authorities=[['Research',m.authorityResearch],['Outreach',m.authorityOutreach],['Disclosure',m.authorityDisclosure],['Introduction',m.authorityIntroduction],['Representation',m.authorityRepresentation],['Negotiation',m.authorityNegotiation],['Binding',m.authorityBinding]];
  return '<div class="grid"><section class="panel"><h3>Mandate summary</h3><dl>'+kv('Mandate ID',m.id)+kv('Title',m.title)+kv('Status',m.status)+kv('Maximum disclosure',m.maxDisclosureLevel)+kv('Restrictions',m.restrictions)+kv('Professional route',m.legalProfessionalRoute)+'</dl></section>'+
    '<section class="panel"><h3>Authorities</h3>'+authorities.map(([name,value])=>'<div class="kv"><dt>'+esc(name)+'</dt><dd><span class="badge '+(value==='Granted'?'':'warn')+'">'+esc(value||'Not Granted')+'</span></dd></div>').join('')+'</section></div>';
}
function renderCriteria(){
  if(!criteria.length)return '<div class="empty"><strong>No target criteria recorded in the linked Mandate.</strong></div>';
  return '<section class="panel"><div class="section-title"><h3>Target criteria</h3><span class="badge">Authenticated DEV2 read</span></div><div class="table-wrap"><table><thead><tr><th>Criterion</th><th>Type</th><th>Result</th></tr></thead><tbody>'+
    criteria.map(c=>'<tr><td>'+esc(c.label)+'</td><td>'+esc(c.type)+'</td><td><span class="badge '+(/unknown|not assessed/i.test(c.result)?'warn':'')+'">'+esc(c.result)+'</span></td></tr>').join('')+
    '</tbody></table></div><div class="mobile-cards">'+criteria.map(c=>'<div class="mobile-card"><strong>'+esc(c.label)+'</strong><span class="muted">'+esc(c.type)+'</span><div><span class="badge '+(/unknown|not assessed/i.test(c.result)?'warn':'')+'">'+esc(c.result)+'</span></div></div>').join('')+'</div></section>';
}
function evidenceSummary(m){
  const evidence=parseJson(m.criteriaEvidenceJson,{});
  if(Array.isArray(evidence))return evidence.map(x=>typeof x==='string'?x:(x.label||x.criterion||x.result||JSON.stringify(x))).join(' · ');
  if(evidence&&typeof evidence==='object')return Object.entries(evidence).slice(0,8).map(([k,v])=>k+': '+(typeof v==='string'?v:JSON.stringify(v))).join(' · ');
  return '';
}
function renderMatches(){
  if(!matches.length)return '<div class="empty"><strong>No Matches linked to the current Mandate.</strong></div>';
  return '<section class="panel"><div class="section-title"><h3>Matches</h3><span class="badge">'+esc(matches.length)+' candidate'+(matches.length===1?'':'s')+'</span></div><div class="table-wrap"><table><thead><tr><th>Company ID</th><th>Qualification</th><th>Engagement</th><th>Mandatory Criteria</th><th>Evidence / Gaps</th><th>Next Action</th></tr></thead><tbody>'+
    matches.map(m=>'<tr><td><strong>'+esc(m.companyId)+'</strong></td><td>'+esc(m.qualificationState)+'</td><td>'+esc(m.engagementState)+'</td><td>'+esc(m.mandatoryCriteriaResult)+'</td><td>'+esc([evidenceSummary(m),m.gaps].filter(Boolean).join(' · ')||'No evidence summary recorded')+'</td><td>'+esc(m.nextAction||'Not set')+'</td></tr>').join('')+
    '</tbody></table></div><div class="mobile-cards">'+matches.map(m=>'<article class="mobile-card"><strong>'+esc(m.companyId)+'</strong><span class="muted">'+esc(m.qualificationState)+' · '+esc(m.engagementState)+'</span><p>'+esc(m.gaps||evidenceSummary(m)||'No evidence summary recorded')+'</p><small>'+esc(m.nextAction||'No next action')+'</small></article>').join('')+'</div></section>';
}
function renderActivity(){
  return '<div class="empty"><strong>Activity is not included in the current Commercial Network read projection.</strong><br>The approved projection returns Commercial Network entities only. Action Item 8 does not bypass that boundary by reading Activity directly.</div>';
}
function renderDocuments(){
  const refs=Array.isArray(opportunity?.keyDocumentRefs)?opportunity.keyDocumentRefs:parseJson(opportunity?.keyDocumentRefs,[]);
  if(!refs?.length&&!opportunity?.documentFolderRef)return '<div class="empty"><strong>No document references recorded in the authenticated DEV2 Opportunity.</strong></div>';
  return '<section class="panel"><h3>Document references</h3><dl>'+kv('Folder reference',opportunity.documentFolderRef||'None')+kv('Key document references',(refs||[]).join(', ')||'None')+'</dl><p class="notice">This read-only preview does not fetch or release document contents.</p></section>';
}
function renderPublicPresentation(){
  const o=opportunity;
  return '<div class="grid"><section class="panel"><h3>Internal status</h3><dl>'+kv('Information class',o.informationClass)+kv('Publication status',o.publicationStatus)+kv('Disclosure ceiling',mandate?.maxDisclosureLevel||'Not Set')+'</dl></section>'+
    '<section class="panel"><h3>External projection</h3><dl>'+kv('Public title',o.publicTitle)+kv('Public summary',o.publicSummary)+kv('Public geography',o.publicGeography)+kv('Public opportunity type',o.publicOpportunityType)+kv('Public structure',o.publicStructure)+kv('Public CTA',o.publicCTA)+'</dl><p class="notice">Public-safe does not mean published. No publication action is exposed here.</p></section></div>';
}
function renderPanel(){
  const renderers={'Overview':renderOverview,'Mandate':renderMandate,'Target Criteria':renderCriteria,'Matches':renderMatches,'Activity':renderActivity,'Documents':renderDocuments,'Public Presentation':renderPublicPresentation};
  el('workspacePanel').innerHTML=renderers[activeSection]();
}
async function refreshState(){
  el('connectionPanel').hidden=false;el('workspace').hidden=true;el('emptyState').hidden=true;setConnection('Reading authenticated DEV2 Commercial Network projection…');
  try{
    networkState=await call('getCommercialNetworkState',{purpose:'commercial-network',includeArchived:false});
    setConnection('DEV2 read projection connected');
    renderOpportunityChooser();
  }catch(e){
    el('connectionPanel').hidden=false;el('workspace').hidden=true;el('emptyState').hidden=true;
    setConnection('DEV2 read connection failed',backendErrorMessage(String(e.message||e)));el('retryButton').hidden=false;window.cnWorkspaceReady=true;
  }
}
async function init(){
  el('retryButton').addEventListener('click',()=>{el('retryButton').hidden=true;restoreSession().then(ok=>ok?refreshState():showLogin())});
  if(await restoreSession())await refreshState();else await showLogin();
  window.TSSCommercialNetworkPreview={
    get state(){return networkState},
    get opportunity(){return opportunity},
    operatingPhase,
    readinessChecks
  };
}
init();
})();
