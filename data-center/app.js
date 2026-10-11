import {rowsToObjects,filterCompanies,companyDossier,isReviewNeeded,overview,safeExternalUrl,text,normalized,businessOnly} from './model.mjs';
const cfg=window.TSS_IDC_CONFIG||{};
const root=document.querySelector('#content');
const banner=document.querySelector('#notice');
const loginCard=document.querySelector('#loginCard');
const loginMessage=document.querySelector('#loginMessage');
const authButton=document.querySelector('#auth');
const refreshButton=document.querySelector('#refresh');
const identity=document.querySelector('#identity');
const locationLabel=document.querySelector('#location');
const titleNode=document.querySelector('#viewTitle');
const introNode=document.querySelector('#viewIntro');
const paths={
 dashboard:['Dashboard','An owner-only overview of canonical Companies and evidence-backed market coverage.'],
 companies:['Companies','Search and filter the current canonical Master Workbook. Company profiles combine historical source observations.'],
 projects:['Developers & Projects','Project and company roles come from the preserved evidence ledger; marketing status is not construction confirmation.'],
 candidates:['Research Queue','Discovery candidates remain research-only until identity reconciliation and owner approval.'],
 evidence:['Evidence & Sources','Every fact retains its own source, observation date, verification and freshness.'],
 review:['Review Queue','Open conflicts, review-due facts and potential duplicates are preserved, never silently resolved.'],
 handover:['HubSpot Handover','Review commercial qualification before working in HubSpot. No automatic promotions or outreach.']
};
let view='dashboard',token='',owner='',busy=false,loaded={master:false,research:false};
let records={companies:[],candidates:[],sources:[],evidence:[],relationships:[],projects:[],roles:[],profiles:[]};
function el(tag,cls='',label='') {const node=document.createElement(tag);if(cls)node.className=cls;if(label!==undefined)node.textContent=String(label);return node;}
function add(parent,...children){for(const child of children) if(child)parent.append(child);return parent;}
function section(heading,desc=''){const node=el('section','section');add(node,el('h2','',heading));if(desc)add(node,el('p','',desc));return node;}
function empty(label){return el('div','empty',label);}
function paragraph(s){return el('p','',s);}
function badge(s){const value=text(s)||'Unknown';const b=el('span','tag',value);if(/conflict|review due|stale|unknown|needs review/i.test(value))b.classList.add('warn');if(/unverified|duplicate/i.test(value))b.classList.add('danger');return b;}
function aLink(url,label){const href=safeExternalUrl(url);if(!href)return el('span','muted',label||'Not available');const a=el('a','inline-link',label||'Open');a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;}
function btn(label,func,cls='button secondary'){const b=el('button',cls,label);b.type='button';b.addEventListener('click',func);return b;}
function infoLine(label,value){const cell=el('div');add(cell,el('strong','',label),el('span','',text(value)||'Unknown'));return cell;}
function table(headers,items,renderRow){
 const wrap=el('div','table-scroll'),t=el('table','data-table'),head=el('thead'),tr=el('tr');
 headers.forEach(h=>add(tr,el('th','',h)));head.append(tr);t.append(head);
 const body=el('tbody');items.forEach((item,index)=>{const row=el('tr');const cells=renderRow(item,index);cells.forEach(cell=>{const td=el('td');add(td,typeof cell==='string'?document.createTextNode(cell):cell);row.append(td)});body.append(row)});
 if(!items.length){const row=el('tr'),td=el('td');td.colSpan=headers.length;add(td,empty('No matching rows in the loaded data.'));row.append(td);body.append(row)}t.append(body);wrap.append(t);return wrap;
}
function setNotice(message){banner.hidden=!message;banner.textContent=message||'';}
function setBusy(v){busy=v;refreshButton.disabled=!token||busy;authButton.disabled=busy;authButton.textContent=busy?'Loading…':token?'Disconnect':'Connect Google';}
function setView(v){
 view=paths[v]?v:'dashboard';document.querySelectorAll('.nav button').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 locationLabel.textContent=paths[view][0];titleNode.textContent=paths[view][0];introNode.textContent=paths[view][1];
 render();
}
document.querySelectorAll('.nav button').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
const hasClient=typeof cfg.googleClientId==='string'&&/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(cfg.googleClientId);
function signedOut(){
 token='';owner='';loaded={master:false,research:false};
 records={companies:[],candidates:[],sources:[],evidence:[],relationships:[],projects:[],roles:[],profiles:[]};
 identity.textContent='Not connected';loginCard.hidden=false;root.replaceChildren();root.hidden=true;setBusy(false);document.querySelector('.privacy').textContent='Private data locked';
 loginMessage.textContent=hasClient?'Connect the owner Google account to load private Company records and research evidence. Tokens remain in memory only.':'App interface installed. Google OAuth registration and owner-only read access require provider acceptance before live Company data can load. Continue using the existing private Admin workspace.';
 setNotice(hasClient?'':'Provider configuration is pending. The app does not expose Google Sheets or a sample of private Companies to unauthenticated visitors.');
}
function auth(){
 if(token){const oldToken=token;signedOut();window.google?.accounts?.oauth2?.revoke?.(oldToken,()=>{});return;}
 if(!hasClient){setNotice('Google OAuth client ID is not configured. No private data can be accessed here. Use the existing private Admin workspace until authorized Google setup is completed.');return;}
 if(!window.google?.accounts?.oauth2){setNotice('Google sign-in has not loaded. Check the browser connection and retry.');return;}
 const client=window.google.accounts.oauth2.initTokenClient({
  client_id:cfg.googleClientId,
  scope:'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/spreadsheets.readonly',
  include_granted_scopes:false,
  callback:async response=>{
   if(response.error||!response.access_token){setNotice('Google sign-in was not completed.');return;}
   const issued=response.access_token;
   setBusy(true);
   try{
    const result=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+issued},cache:'no-store'});
    if(!result.ok)throw Error('Google could not verify the current account.');
    const user=await result.json();
    if(!user.email_verified||normalized(user.email)!==normalized(cfg.allowedEmail)){
      throw Error('This account is not authorized for TSS research. Sign in as '+cfg.allowedEmail+'.');
    }
    token=issued;owner=user.email;identity.textContent=owner;document.querySelector('.privacy').textContent='Owner-only data';await loadAll();
   }catch(err){signedOut();setNotice(err.message||'Google sign-in failed.');}
   finally{setBusy(false);}
  },
  error_callback:()=>setNotice('Google sign-in window could not be completed.')
 });
 client.requestAccessToken({prompt:'consent'});
}
authButton.addEventListener('click',auth);
refreshButton.addEventListener('click',()=>{if(token)loadAll()});
async function batchGet(sheetId,ranges) {
 const query=new URLSearchParams();for(const range of ranges)query.append('ranges',range);
 const res=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sheetId)+'/values:batchGet?'+query.toString(),{
  headers:{Authorization:'Bearer '+token},cache:'no-store'
 });
 if(res.status===401){signedOut();throw Error('Google access expired. Reconnect the owner account.');}
 if(!res.ok)throw Error('Google Sheets declined a read ('+res.status+'). Check Google consent, Sheets API and file permissions.');
 return (await res.json()).valueRanges||[];
}
async function loadAll(){
 if(!token)return;setBusy(true);setNotice('Loading private research data from Google Sheets…');
 try{
  const main=await batchGet(cfg.masterSpreadsheetId,['Companies!A1:L3004']);
  const companyRows=rowsToObjects(main[0]?.values||[]);
  if(!companyRows.length)throw Error('Canonical Companies sheet is empty or unavailable.');
  const research=await batchGet(cfg.researchSpreadsheetId,[
   "'Research Candidate'!A1:Z800","'Research Source'!A1:O300","'Evidence Observation'!A1:U1200",
   "'Identity Relationship'!A1:N800","'Developer Project'!A1:P600",
   "'Developer Project Company Role'!A1:M600","'Company Intelligence Profile'!A1:P800"
  ]);
  const names=['candidates','sources','evidence','relationships','projects','roles','profiles'];
  if(research.length!==names.length)throw Error('Incomplete research evidence response; nothing was loaded.');
  const next={companies:companyRows,candidates:[],sources:[],evidence:[],relationships:[],projects:[],roles:[],profiles:[]};
  names.forEach((name,i)=>{next[name]=businessOnly(rowsToObjects(research[i]?.values||[]))});
  if(!next.evidence.length)throw Error('Research evidence was empty; nothing was loaded.');
  records=next;loaded={master:true,research:true};
  setNotice('Source read complete. Records are private, read-only and current as of this refresh; source-level observation dates still control research freshness.');
 }catch(err){setNotice(err.message||'Private data is unavailable.');}
 finally{
  if(loaded.master){loginCard.hidden=true;root.hidden=false;}
  setBusy(false);render();
 }
}
function render(){
 if(!loaded.master){loginCard.hidden=false;root.hidden=true;return;}
 root.hidden=false;root.replaceChildren();
 if(view==='dashboard')return dashboard();
 if(view==='companies')return companiesView();
 if(view==='projects')return projectsView();
 if(view==='candidates')return candidatesView();
 if(view==='evidence')return evidenceView();
 if(view==='review')return reviewView();
 if(view==='handover')return handoverView();
}
function card(label,value){const c=el('article','card');add(c,el('div','metric-label',label),el('div','metric',value));return c;}
function heading(label,desc){return section(label,desc);}
function dashboard(){
 const counts=overview(records),cards=el('div','cards');
 const na=loaded.research?'—':'Not loaded';
 [
 ['Canonical Companies',counts.companies],
 ['Research Candidates',loaded.research?counts.candidates:na],
 ['Developer Projects',loaded.research?counts.projects:na],
 ['Evidence Observations',loaded.research?counts.evidence:na]
 ].forEach(([label,v])=>add(cards,card(label,v)));root.append(cards);
 const main=heading('Company coverage','These are loaded research records, not a complete estimate of the Cyprus business market.');
 const byDist=new Map();
 for(const c of records.companies){const d=c.district||'Unknown';byDist.set(d,(byDist.get(d)||0)+1);}
 const r=[...byDist.entries()].sort((a,b)=>b[1]-a[1]);
 main.append(table(['District / area','Loaded Companies'],r,([name,total])=>[name,String(total)]));root.append(main);
 const note=heading('Research boundaries','Company identity belongs to the canonical Master Workbook; historical evidence stays in the preserved research archive.');
 add(note,el('div','help-note','Missing information remains Unknown. Review-due and conflicting facts are not silently promoted to verified. This read-only app neither writes research data nor creates HubSpot Contacts.'));
 add(note,el('div','button-line'),aLink('https://docs.google.com/document/d/1CqVTdI6I402HFvJtTT0y3QfhL7T09Ku1bjex9Ac6CGI/edit','Open research operating guide ↗'));
 root.append(note);
}
function companiesView(){
 const s=heading('Company directory','Search the current Master Companies list by Company ID, name, category, district, email, phone or website.');
 const tools=el('div','toolbar');const input=el('input');input.placeholder='Search companies, e.g. developer Larnaca';input.setAttribute('aria-label','Search companies');
 const district=el('select');district.setAttribute('aria-label','District');add(district,el('option','','All districts'));district.firstChild.value='';
 for(const x of [...new Set(records.companies.map(c=>c.district).filter(Boolean))].sort()) {const o=el('option','',x);o.value=x;district.append(o)}
 const category=el('input');category.placeholder='Category filter';category.setAttribute('aria-label','Category filter');category.style.maxWidth='165px';
 add(tools,input,district,category);s.append(tools);
 const container=el('div'),dossierArea=el('div');let page=0;
 function update(){
  const result=filterCompanies(records.companies,{query:input.value,district:district.value,category:category.value});
  const start=page*50;container.replaceChildren(table(['Company','Category','District','Research Level','Website'],result.slice(start,start+50),c=>[
   btn(c.name||'Unknown',()=>showDossier(c.id,dossierArea),'link-button'),
   c.category||'Unknown',c.district||'Unknown',c.researchLevel||'Unknown',aLink(c.website,'View ↗')
  ]));
  const p=el('div','pager'),prev=btn('Previous',()=>{page--;update()}),next=btn('Next',()=>{page++;update()});prev.disabled=page===0;next.disabled=start+50>=result.length;
  add(p,el('span','',result.length+' matches · showing '+(result.length?start+1:0)+'–'+Math.min(start+50,result.length)),prev,next);container.append(p);
 }
 for(const e of [input,district,category])e.addEventListener(e===district?'change':'input',()=>{page=0;dossierArea.replaceChildren();update()});
 update();s.append(container,dossierArea);root.append(s);
}
function showDossier(id,target){
 const c=records.companies.find(c=>c.id===id);if(!c)return;
 const d=companyDossier(c,records);target.replaceChildren();
 const panel=el('div','dossier');add(panel,el('h3','',c.name+' · '+c.id));
 const facts=el('div','kv');
 [['Category',c.category],['District',c.district],['Email',c.email],['Phone',c.phone],['Research level',c.researchLevel],['Current evidence status',d.profile?.disposition]].forEach(([k,v])=>facts.append(infoLine(k,v)));
 panel.append(facts);
 const ops=el('div','button-line');add(ops,aLink(c.website,'Official website ↗'),aLink('https://docs.google.com/spreadsheets/d/'+cfg.masterSpreadsheetId+'/edit#gid=0','Canonical Google Sheet ↗'));panel.append(ops);
 const p=el('h3','','Evidence and source history');panel.append(p);
 if(!loaded.research)panel.append(paragraph('Research archive not loaded.'));
 else panel.append(table(['Fact','Reported value','Verification / freshness','Source'],d.evidence.slice(0,40),ev=>[
   ev.attributePath||ev.factType||'Unknown',ev.displayValue||'Unknown',
   badge((ev.verificationStatus||'UNVERIFIED')+' · '+(ev.freshnessStatus||'Unknown')),
   aLink(ev.sourceRef,'Source ↗')
 ]));
 if(d.profile){add(panel,el('h3','','Research gaps'),paragraph(d.profile.researchGaps||'No reviewed research gaps recorded.'),el('div','help-note','Profile state: '+(d.profile.canonicalIdentityState||'Unknown')+'; development activity: '+(d.profile.developmentActivity||'Unknown')));}
 add(panel,el('h3','','Linked projects'),table(['Project','Published status','Role'],d.projects.map(p=>({p,role:d.roles.find(r=>r.projectId===p.projectId)})),({p,role})=>[
 p.projectName||p.projectId,p.observedStatus||'Unknown',role?.projectRole||'Unknown'
 ]));target.append(panel);target.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function projectsView(){
 const s=heading('Developer & project records','Projects are linked to canonical Companies only when a separate evidence-backed role exists.');
 const tools=el('div','toolbar'),q=el('input');q.placeholder='Search project name, locality or status';q.setAttribute('aria-label','Search developer projects');tools.append(q);s.append(tools);
 const target=el('div');
 const renderRows=()=>{const val=normalized(q.value),matches=records.projects.filter(p=>[p.projectName,p.district,p.locality,p.observedStatus,p.propertyType].some(v=>normalized(v).includes(val)));
  target.replaceChildren(table(['Project','District / locality','Reported status','Associated companies','Official source'],matches.slice(0,100),p=>{
   const roles=records.roles.filter(r=>r.projectId===p.projectId);
   return [p.projectName||p.projectId,[p.district,p.locality].filter(Boolean).join(' / ')||'Unknown',
    badge(p.observedStatus||'Unknown'),roles.map(r=>r.companyId||r.candidateId).filter(Boolean).join(', ')||'Unknown',
    aLink(p.website,'Project ↗')];
  }),paragraph('Showing '+Math.min(100,matches.length)+' of '+matches.length+' loaded projects. Source-reported construction status is not independent onsite verification.'));
 };q.addEventListener('input',renderRows);renderRows();s.append(target);root.append(s);
}
function candidatesView(){
 const s=heading('Research candidates','Candidates never create canonical Companies or outreach automatically.');
 s.append(table(['Candidate','Locality','Status','Proposed Company','Source'],records.candidates.slice(0,150),c=>[
 c.discoveredName||'Unknown',[c.region,c.locality].filter(Boolean).join(' / ')||'Unknown',
 badge(c.candidateStatus||'Unknown'),c.possibleCompanyId||'Not yet matched',aLink(c.discoverySourceRef,'Source ↗')
 ]));
 add(s,paragraph('Showing up to 150 entries. Use the governed research procedure for new evidence; direct editing is disabled.'));root.append(s);
}
function evidenceView(){
 const s=heading('Evidence observations','Facts are historical observations. The source and date matter as much as the reported value.');
 const tools=el('div','toolbar'),q=el('input');q.placeholder='Filter evidence by Company ID or fact type';q.setAttribute('aria-label','Filter evidence');tools.append(q);s.append(tools);
 const target=el('div');const renderRows=()=>{
  const val=normalized(q.value),matches=records.evidence.filter(e=>[e.companyId,e.candidateId,e.attributePath,e.factType,e.verificationStatus].some(v=>normalized(v).includes(val)));
  target.replaceChildren(table(['Company / Candidate','Fact','Value','Status','Source'],matches.slice(0,100),e=>[
   e.companyId||e.candidateId||'Unknown',e.attributePath||e.factType||'Unknown',
   e.displayValue||'Unknown',badge((e.verificationStatus||'UNVERIFIED')+' · '+(e.freshnessStatus||'Unknown')),aLink(e.sourceRef,'Open ↗')
  ]),paragraph('Showing up to 100 of '+matches.length+' matching observations.'));
 };q.addEventListener('input',renderRows);renderRows();s.append(target);root.append(s);
 const sources=heading('Registered research sources','A source listed in the archive is not necessarily recently swept or reviewed.');
 sources.append(table(['Name','Usage level','Scope','Next review','Reference'],records.sources.slice(0,70),x=>[
 x.sourceName||'Unknown',x.sourceUsageLevel||'Unknown',x.geographyScope||'Unknown',
 x.nextReviewAt||'Unknown',aLink(x.baseUrl,'Source ↗')
 ]));root.append(sources);
}
function reviewView(){
 const e=records.evidence.filter(isReviewNeeded),p=records.profiles.filter(isReviewNeeded);
 const main=heading('Evidence requiring review','Review due is not a negative fact. Every unresolved group remains visible.');
 main.append(table(['Company','Fact','Verification','Freshness','Conflict group'],e.slice(0,150),x=>[
 x.companyId||x.candidateId||'Unknown',x.attributePath||x.factType||'Unknown',
 badge(x.verificationStatus||'UNVERIFIED'),badge(x.freshnessStatus||'Unknown'),x.conflictGroupId||'—'
 ]));
 add(main,paragraph(e.length+' observations currently flagged for review by source metadata.'));root.append(main);
 const profiles=heading('Company profile review','Possible duplicates are flagged for human resolution, not merged.');
 profiles.append(table(['Company ID','Disposition','Identity','Duplicate review'],p.slice(0,80),x=>[
 x.companyId||'Unknown',badge(x.disposition||'Unknown'),
 x.canonicalIdentityState||'Unknown',badge(x.duplicateReviewState||'Unknown')
 ]));root.append(profiles);
}
function handoverView(){
 const s=heading('Commercial handover requires approval','Research is not automatically a lead. HubSpot remains the only commercial CRM.');
 const guide=el('div','help-note','Before promoting: verify canonical Company and legal identity, compare existing HubSpot Company/domain, check evidence and information class, establish commercial qualification, obtain explicit owner approval, and avoid any automatic outreach.');
 s.append(guide);
 const row=el('div','button-line');add(row,aLink('https://app-eu1.hubspot.com/contacts/'+cfg.hubspotPortalId+'/objects/0-2','Open HubSpot Companies ↗'),aLink('https://docs.google.com/document/d/1CqVTdI6I402HFvJtTT0y3QfhL7T09Ku1bjex9Ac6CGI/edit','Review operating guide ↗'));s.append(row);
 add(s,paragraph('No HubSpot API calls, write controls, bulk imports, marketing actions or email sending are implemented in this app.'));root.append(s);
}
signedOut();
setView('dashboard');
// The service worker is limited to public static shell assets.
// OAuth tokens and private Sheets responses are never placed in caches.
if('serviceWorker' in navigator && location.protocol==='https:'){
 window.addEventListener('load',()=>navigator.serviceWorker.register('/data-center/sw.js',{scope:'/data-center/'}).catch(()=>{
  // Browser installation enhancement is optional; authenticated app stays online.
 }));
}
