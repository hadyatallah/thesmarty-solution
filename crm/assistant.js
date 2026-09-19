'use strict';

const AI_HELP_RULES = [
  'The user may speak naturally. Never require exact commands or field names.',
  'Explain CRM functions using the actual TSS CRM rules, not generic CRM advice.',
  'Company is a database/research record. Prospect is deliberately selected for active work.',
  'Qualified Lead requires a real commercial need or agreed next step. A positive reply alone is not qualification.',
  'Opportunity stages: Identified, Qualified, Discovery, Proposal, Negotiation, Won, Lost, On hold.',
  'Won requires post-sale handoff and does not automatically create an invoice or change lifecycle to Client.',
  'Do not contact blocks future outreach unless deliberately changed.',
  'Proposal requires an opportunity. Revenue Tracker is operational CRM tracking only, not accounting/tax truth.',
  'Duplicate confirmation does not automatically merge or delete records.',
  'Never invent email, phone, decision-maker, budget, fee, project value, payment status, timing, dates or commercial facts.',
  'Normal writes require confirmation. Sensitive actions require explicit confirmation.',
  'Sensitive actions include qualification, Won/Lost, Do not contact, payment/revenue changes, outreach sending/approval, merge/delete.',
  'The browser API can directly write Companies, Contacts, Opportunities, Tickets and Tasks.',
  'Outreach, Prospect Queue, Proposal Tracker, Revenue Tracker, Management Dashboard, System Control and Automation Log are not direct browser saveRecord entities. Explain or guide those actions but never claim a write was executed there.'
].join(' ');

function loadAiState(){
  try{ aiConversation=JSON.parse(localStorage.getItem(AI_CHAT_KEY)||'[]'); if(!Array.isArray(aiConversation))aiConversation=[]; }catch(e){ aiConversation=[]; }
  try{ aiPendingPlan=JSON.parse(localStorage.getItem(AI_PENDING_KEY)||'null'); }catch(e){ aiPendingPlan=null; }
}
function saveAiState(){
  try{ localStorage.setItem(AI_CHAT_KEY,JSON.stringify(aiConversation.slice(-30))); }catch(e){}
  try{ if(aiPendingPlan)localStorage.setItem(AI_PENDING_KEY,JSON.stringify(aiPendingPlan)); else localStorage.removeItem(AI_PENDING_KEY); }catch(e){}
}
function aiActionHistory(){
  try{ const x=JSON.parse(localStorage.getItem(AI_ACTION_KEY)||'[]'); return Array.isArray(x)?x:[]; }catch(e){ return []; }
}
function recordAiAction(item){
  const a=aiActionHistory(); a.unshift(Object.assign({},item,{at:new Date().toISOString()}));
  try{ localStorage.setItem(AI_ACTION_KEY,JSON.stringify(a.slice(0,25))); }catch(e){}
}
function assistantContextSearch(value){
  const box=el('aiContextResults'); if(!box)return;
  const q=String(value||'').trim().toLowerCase();
  if(q.length<2){
    box.innerHTML=aiContextSelection.id
      ? '<span class="assistant-context-pill">'+esc(aiContextSelection.label)+' <button type="button" onclick="clearAssistantContext()" style="min-height:auto;padding:1px 6px">×</button></span>'
      : '<p class="muted" style="margin:8px 0 0">No fixed context. The assistant will infer the relevant records.</p>';
    return;
  }
  const groups=['Companies','Contacts','Opportunities','Tickets','Tasks'],matches=[];
  for(const t of groups){
    for(const r of state.records[t]||[]){
      const cn=r.companyId?company(r.companyId):'';
      const hay=[r.name,r.id,cn,r.email,r.phone,r.status,r.stage,r.category,r.district].filter(Boolean).join(' ').toLowerCase();
      if(hay.includes(q))matches.push({t:t,r:r,cn:cn});
      if(matches.length>=10)break;
    }
    if(matches.length>=10)break;
  }
  box.innerHTML=matches.length
    ? '<div class="list" style="margin-top:10px">'+matches.map(function(x){return '<button type="button" class="record" onclick="chooseAssistantContext(\''+x.t+'\',\''+esc(x.r.id)+'\',\''+esc((x.r.name||x.r.id).replace(/'/g,'&#39;'))+'\')"><strong>'+esc(x.r.name||x.r.id)+'</strong><span class="muted">'+esc(titles[x.t]||x.t)+(x.cn?' · '+esc(x.cn):'')+'</span></button>';}).join('')+'</div>'
    : '<p class="muted" style="margin:8px 0 0">No matching CRM records.</p>';
}
function chooseAssistantContext(entity,id,labelText){
  aiContextSelection={entity:entity,id:id,label:labelText};
  if(el('aiContextSearch'))el('aiContextSearch').value=labelText;
  if(el('aiContextResults'))el('aiContextResults').innerHTML='<span class="assistant-context-pill">'+esc(labelText)+' <button type="button" onclick="clearAssistantContext()" style="min-height:auto;padding:1px 6px">×</button></span>';
}
function clearAssistantContext(){
  aiContextSelection={entity:'',id:'',label:''};
  if(el('aiContextSearch'))el('aiContextSearch').value='';
  assistantContextSearch('');
}
function compactRecord(entity,r){
  if(!r)return null;
  const byEntity={
    Companies:['id','name','category','district','email','phone','website','status','priority','nextAction','followUp','lifecycle','communicationStatus','leadScore','scoreBand'],
    Contacts:['id','name','companyId','role','email','phone','decisionMaker','primaryContact','lastInteraction'],
    Opportunities:['id','name','companyId','service','stage','nextAction','followUp','qualificationStatus','need','decisionMakerConfirmed','timing','budgetStatus','commercialPotential','tssFit','lossReason','engagementStatus','clientHealth'],
    Tickets:['id','name','companyId','contactEmail','priority','status','dueDate','notes'],
    Tasks:['id','name','companyId','opportunityId','ticketId','dueDate','status','notes']
  };
  const out={};
  (byEntity[entity]||['id','name']).forEach(function(k){if(r[k]!==undefined&&r[k]!=='')out[k]=r[k];});
  return out;
}
function lexicalCandidates(text){
  const q=String(text||'').toLowerCase();
  const tokens=q.split(/[^\p{L}\p{N}@.+-]+/u).filter(function(x){return x.length>2;});
  const groups=['Companies','Contacts','Opportunities','Tickets','Tasks'],out=[];
  groups.forEach(function(entity){
    (state.records[entity]||[]).forEach(function(r){
      const cn=r.companyId?company(r.companyId):'',hay=[r.name,r.id,cn,r.email,r.phone,r.website].filter(Boolean).join(' ').toLowerCase();
      let score=0;tokens.forEach(function(t){if(hay.includes(t))score+=t.includes('@')?5:1;});
      if(score)out.push({entity:entity,r:r,score:score});
    });
  });
  return out.sort(function(a,b){return b.score-a.score;}).slice(0,12).map(function(x){return {entity:x.entity,record:compactRecord(x.entity,x.r)};});
}
function workingSummary(){
  const r=state.records,actions=actionableRecords();
  return {today:today(),companies:r.Companies.length,prospects:r.Companies.filter(function(x){return x.lifecycle==='Prospect';}).length,qualifiedLeads:r.Companies.filter(function(x){return x.lifecycle==='Qualified Lead';}).length,overdue:actions.filter(function(x){return overdue(x[1]);}).length,dueToday:actions.filter(function(x){return dueToday(x[1]);}).length,dueSoon:actions.filter(function(x){return dueSoon(x[1]);}).length,openOpportunities:r.Opportunities.filter(function(x){return !done(x);}).length};
}
function recentConversation(){return aiConversation.slice(-6).map(function(x){return x.role+': '+String(x.text||'').slice(0,700);}).join('\n');}
function parseAssistantJson(text){
  const raw=String(text||'').trim(),s=raw.indexOf('{'),e=raw.lastIndexOf('}');
  if(s<0||e<s)return null;
  try{return JSON.parse(raw.slice(s,e+1));}catch(err){return null;}
}
function aiSchemaSummary(){const entities=['Companies','Contacts','Opportunities','Tickets','Tasks'],out={};entities.forEach(function(e){out[e]={fields:(state.fields&&state.fields[e]||[]).filter(function(k){return !['id','version','createdAt','updatedAt','threadId'].includes(k);}),enums:(state.enums&&state.enums[e])||{}};});return out;}
function compactPlannerContext(text){
  return lexicalCandidates(text).slice(0,5).map(function(x){
    const r=x.record||{};
    return {entity:x.entity,id:r.id||'',name:r.name||'',companyId:r.companyId||'',stage:r.stage||'',status:r.status||'',lifecycle:r.lifecycle||''};
  });
}
function dossierRequest(text){
  const q=String(text||'').toLowerCase();
  const wants=/\b(all info|all information|all details|everything about|provide.*info|provide.*details|tell me everything|full details|full info)\b/i.test(q);
  if(!wants)return null;
  const match=lexicalCandidates(text).find(function(x){return x.entity==='Companies';});
  if(!match||!match.record||!match.record.id)return null;
  return (state.records.Companies||[]).find(function(r){return r.id===match.record.id;})||null;
}
function dossierValue(v){return v===undefined||v===null||v===''?'—':esc(v);}
function companyDossierHtml(companyRec){
  const id=companyRec.id;
  const contacts=(state.records.Contacts||[]).filter(function(r){return r.companyId===id;});
  const opps=(state.records.Opportunities||[]).filter(function(r){return r.companyId===id;});
  const tasks=(state.records.Tasks||[]).filter(function(r){return r.companyId===id;}).sort(function(a,b){return String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'));});
  const tickets=(state.records.Tickets||[]).filter(function(r){return r.companyId===id;});
  const linkedIds=new Set([id].concat(contacts.map(function(x){return x.id;}),opps.map(function(x){return x.id;}),tasks.map(function(x){return x.id;}),tickets.map(function(x){return x.id;})));
  const activity=(state.records.Activity||[]).filter(function(a){return linkedIds.has(a.recordId);}).sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''));}).slice(0,12);
  const companyItems=[
    ['CRM ID',companyRec.id],['Category',companyRec.category],['District',companyRec.district],['Email',companyRec.email],['Phone',companyRec.phone],['Website',companyRec.website],
    ['Lifecycle',companyRec.lifecycle||'Company'],['Communication',companyRec.communicationStatus],['Last contact',companyRec.lastContact],['Priority',companyRec.priority],['Lead score',companyRec.leadScore],['Score band',companyRec.scoreBand]
  ];
  const section=function(title,body){return '<section class="section"><h3>'+esc(title)+'</h3>'+body+'</section>';};
  const list=function(items){return '<ul>'+items.filter(function(x){return x[1]!==undefined&&x[1]!==null&&x[1]!=='';}).map(function(x){return '<li><strong>'+esc(x[0])+':</strong> '+dossierValue(x[1])+'</li>';}).join('')+'</ul>';};
  let html='<div class="assistant-message"><h3 style="margin-bottom:4px">'+esc(companyRec.name)+'</h3><span class="muted">Complete CRM dossier</span>';
  html+=section('Company information',list(companyItems));
  html+=section('Contacts',contacts.length?'<ul>'+contacts.map(function(x){return '<li><strong>'+esc(x.name||x.id)+'</strong>'+(x.role?' · '+esc(x.role):'')+(x.decisionMaker==='Yes'?' · Decision maker':'')+'<br><span class="muted">'+[x.email,x.phone].filter(Boolean).map(esc).join(' · ')+'</span></li>';}).join('')+'</ul>':'<p class="muted">No linked contacts.</p>');
  html+=section('Commercial / opportunities',opps.length?'<ul>'+opps.map(function(x){return '<li><strong>'+esc(x.name||x.id)+'</strong> · '+esc(x.stage||'')+(x.qualificationStatus?' · '+esc(x.qualificationStatus):'')+(x.service?'<br>'+esc(x.service):'')+(x.nextAction?'<br><strong>Next action:</strong> '+esc(x.nextAction):'')+(x.followUp?'<br><strong>Follow-up:</strong> '+esc(x.followUp):'')+'</li>';}).join('')+'</ul>':'<p class="muted">No linked opportunities.</p>');
  html+=section('Follow-ups',tasks.length?'<ul>'+tasks.map(function(x){return '<li><strong>'+esc(x.name||x.id)+'</strong> · '+esc(x.status||'')+(x.dueDate?' · due '+esc(x.dueDate):'')+(x.notes?'<br><span class="muted">'+esc(String(x.notes).slice(0,350))+'</span>':'')+'</li>';}).join('')+'</ul>':'<p class="muted">No linked follow-ups.</p>');
  html+=section('Tickets / requests',tickets.length?'<ul>'+tickets.map(function(x){return '<li><strong>'+esc(x.name||x.id)+'</strong> · '+esc(x.status||'')+(x.priority?' · '+esc(x.priority):'')+(x.dueDate?' · due '+esc(x.dueDate):'')+'</li>';}).join('')+'</ul>':'<p class="muted">No linked tickets.</p>');
  html+=section('Communication history',activity.length?'<ul>'+activity.map(function(x){return '<li><strong>'+esc(x.action||'Activity')+'</strong>'+(x.createdAt?' · '+esc(new Date(x.createdAt).toLocaleString()):'')+(x.summary?'<br>'+esc(x.summary):'')+'</li>';}).join('')+'</ul>':'<p class="muted">No communication/activity history recorded.</p>');
  html+=section('Next action',list([['Company next action',companyRec.nextAction],['Company follow-up',companyRec.followUp]]));
  html+='</div>';
  return html;
}
function companyDossierText(companyRec){
  return 'Displayed structured CRM dossier for '+companyRec.name+'.';
}
function localCommunicationAnswer(text){
  const q=String(text||'').toLowerCase();
  const asksSent=(q.includes('sent')||q.includes('emailed')||q.includes('contacted')||q.includes('outreach'))&&(q.includes('email')||q.includes('customer')||q.includes('company')||q.includes('who')||q.includes('which'));
  if(!asksSent)return '';
  const ids=new Set();
  (state.records.Activity||[]).forEach(function(a){
    const action=String(a.action||'').toLowerCase(),summary=String(a.summary||'').toLowerCase();
    if(a.entity==='Companies'&&(action.includes('contact')||action.includes('email')||summary.includes('email sent')||summary.includes('outreach sent')))ids.add(a.recordId);
  });
  (state.records.Companies||[]).forEach(function(r){
    if(['Contacted','Awaiting response','Responded','Follow-up required','No response'].includes(r.communicationStatus)&&r.lastContact)ids.add(r.id);
  });
  const rows=(state.records.Companies||[]).filter(function(r){return ids.has(r.id);}).sort(function(a,b){return String(b.lastContact||'').localeCompare(String(a.lastContact||''));});
  if(!rows.length)return 'I do not have any companies recorded as already contacted by email.';
  return 'Companies already contacted by email:\n'+rows.map(function(r,i){return (i+1)+'. '+r.name+(r.lastContact?' — last contact '+r.lastContact:'')+(r.communicationStatus?' — '+r.communicationStatus:'');}).join('\n');
}
function primaryAssistantContext(text){
  const c=lexicalCandidates(text);
  if(!c.length)return {entity:'',id:''};
  const x=c[0],r=x.record||{};
  return {entity:x.entity||'',id:r.id||''};
}
function aiPlannerPromptFromInterpretation(originalText,interpretation){
  const matches=compactPlannerContext(originalText);
  const rules='Classify the CRM result. Questions/explanations => answer. Searches/lists => query or timeline. Writes => action and need confirmation. Sensitive: Qualified, Won/Lost, Do not contact, payments, outreach send/approve, merge/delete. Positive reply alone is not Qualified. Never invent facts. Writable only: Companies, Contacts, Opportunities, Tickets, Tasks.';
  const formats='JSON only: answer {"mode":"answer","message":"..."}; clarify {"mode":"clarify","message":"..."}; query {"mode":"query","message":"...","query":{"entity":"Companies|Contacts|Opportunities|Tickets|Tasks","conditions":[],"limit":50}}; timeline {"mode":"timeline","message":"...","recordId":"company id"}; action {"mode":"action","message":"...","actions":[{"operation":"create|update","entity":"Companies|Contacts|Opportunities|Tickets|Tasks","recordId":"","recordName":"","data":{}}]}.';
  return [
    rules,
    matches.length?'Matches '+JSON.stringify(matches):'',
    'Original intent '+String(originalText).slice(0,220),
    'AI interpretation '+String(interpretation||'').slice(0,1200),
    formats
  ].filter(Boolean).join('\n').slice(0,2400);
}
function actionIsSensitive(a){
  const d=a.data||{},txt=JSON.stringify(d);
  return d.lifecycle==='Qualified Lead'||d.qualificationStatus==='Qualified'||['Won','Lost'].includes(d.stage)||d.communicationStatus==='Do not contact'||/paid|payment/i.test(txt)||/merge|delete/i.test(a.operation);
}
function writableFields(entity){return new Set((state.fields&&state.fields[entity]||[]).filter(function(k){return !['id','version','createdAt','updatedAt','threadId'].includes(k);}));}
function normalizeForMatch(s){return String(s||'').toLowerCase().replace(/\b(ltd|limited|llc|plc|company|co)\b/g,'').replace(/[^\p{L}\p{N}@]+/gu,' ').replace(/\s+/g,' ').trim();}
function findLikelyCompany(data){
  const name=normalizeForMatch(data.name),email=normEmail(data.email),phone=normPhone(data.phone),domain=companyDomain(data);let best=null;
  (state.records.Companies||[]).forEach(function(r){let score=0;if(name&&normalizeForMatch(r.name)===name)score+=5;if(email&&normEmail(r.email)===email)score+=5;if(phone.length>=7&&normPhone(r.phone)===phone)score+=4;if(domain&&companyDomain(r)===domain)score+=3;if(score>(best?best.score:0))best={r:r,score:score};});
  return best&&best.score>=5?best:null;
}
function findLikelyContact(data){
  const email=normEmail(data.email),name=normalizeForMatch(data.name);
  return (state.records.Contacts||[]).find(function(r){return (email&&normEmail(r.email)===email)||(name&&normalizeForMatch(r.name)===name&&(!data.companyId||r.companyId===data.companyId));})||null;
}
function validatePlan(plan){
  if(!plan||!['answer','clarify','query','timeline','action'].includes(plan.mode))throw Error('The assistant returned an invalid plan. Please rephrase and retry.');
  if(plan.mode!=='action')return plan;
  if(!Array.isArray(plan.actions)||!plan.actions.length)throw Error('No CRM changes were proposed.');
  if(plan.actions.length>20)throw Error('That request contains more than 20 changes. Please split it into smaller batches.');
  plan.actions.forEach(function(a){
    if(!['create','update'].includes(a.operation)||!['Companies','Contacts','Opportunities','Tickets','Tasks'].includes(a.entity))throw Error('The assistant proposed an unsupported CRM action.');
    const fields=writableFields(a.entity);Object.keys(a.data||{}).forEach(function(k){if(!fields.has(k))delete a.data[k];});
    if(a.operation==='create'&&a.entity==='Companies'){const dup=findLikelyCompany(a.data||{});if(dup)a._duplicate={entity:'Companies',id:dup.r.id,name:dup.r.name};}
    if(a.operation==='create'&&a.entity==='Contacts'){const dup=findLikelyContact(a.data||{});if(dup)a._duplicate={entity:'Contacts',id:dup.id,name:dup.name};}
    if(a.operation==='update'&&!a.recordId){const n=normalizeForMatch(a.recordName),match=(state.records[a.entity]||[]).find(function(r){return normalizeForMatch(r.name)===n;});if(match)a.recordId=match.id;}
    if(a.operation==='update'&&!a.recordId)throw Error('I could not identify the record to update.');
    a._sensitive=actionIsSensitive(a);
  });
  return plan;
}
function runLocalQuery(q){
  const entity=q.entity,records=[].concat(state.records[entity]||[]),conds=q.conditions||[];
  function num(v){return Number(v||0);}
  function ok(r,c){const v=r[c.field],x=c.value;switch(c.op){case'eq':return String(v||'').toLowerCase()===String(x||'').toLowerCase();case'neq':return String(v||'').toLowerCase()!==String(x||'').toLowerCase();case'contains':return String(v||'').toLowerCase().includes(String(x||'').toLowerCase());case'gt':return num(v)>num(x);case'gte':return num(v)>=num(x);case'lt':return num(v)<num(x);case'lte':return num(v)<=num(x);case'empty':return !v;case'not_empty':return !!v;default:return true;}}
  let out=records.filter(function(r){return conds.every(function(c){return ok(r,c);});});
  if(q.sort&&q.sort.field)out.sort(function(a,b){const av=a[q.sort.field],bv=b[q.sort.field],n=Number(av)-Number(bv),z=Number.isFinite(n)&&String(av)!==''&&String(bv)!==''?n:String(av||'').localeCompare(String(bv||''));return q.sort.direction==='desc'?-z:z;});
  return out.slice(0,Math.min(Number(q.limit||50),100));
}
function renderQueryResults(plan){
  const rows=runLocalQuery(plan.query||{}),entity=plan.query.entity;
  return '<div class="assistant-message">'+esc(plan.message||('Found '+rows.length+' record(s).'))+'</div><div class="list" style="margin-top:12px">'+(rows.map(function(r){return card(entity,r);}).join('')||'<p class="muted">No matching records.</p>')+'</div>';
}
function renderTimeline(plan){
  const companyRec=(state.records.Companies||[]).find(function(r){return r.id===plan.recordId;});if(!companyRec)return'<div class="assistant-message">I could not find that company.</div>';
  const linked=[];['Contacts','Opportunities','Tickets','Tasks'].forEach(function(t){(state.records[t]||[]).filter(function(r){return r.companyId===companyRec.id;}).forEach(function(r){linked.push({at:r.updatedAt||r.createdAt||'',text:(titles[t]||t)+': '+(r.name||r.id),id:r.id});});});
  (state.records.Activity||[]).filter(function(a){return a.recordId===companyRec.id||linked.some(function(x){return x.id===a.recordId;});}).forEach(function(a){linked.push({at:a.createdAt||'',text:(a.action||'Activity')+(a.summary?' · '+a.summary:'')});});
  linked.sort(function(a,b){return String(b.at).localeCompare(String(a.at));});
  return'<div class="assistant-message">'+esc(plan.message||('Timeline for '+companyRec.name))+'</div><div class="list" style="margin-top:12px">'+linked.slice(0,50).map(function(x){return'<div class="record"><strong>'+esc(x.text)+'</strong><small class="muted">'+esc(x.at?new Date(x.at).toLocaleString():'')+'</small></div>';}).join('')+'</div>';
}
function planConflicts(a){
  if(a.operation!=='update')return[];const r=(state.records[a.entity]||[]).find(function(x){return x.id===a.recordId;});if(!r)return[];
  return Object.entries(a.data||{}).filter(function(kv){return r[kv[0]]&&String(r[kv[0]])!==String(kv[1]);}).map(function(kv){return{field:kv[0],from:r[kv[0]],to:kv[1]};});
}
function planHtml(plan){
  const sensitive=(plan.actions||[]).some(function(a){return a._sensitive;}),dups=(plan.actions||[]).filter(function(a){return a._duplicate;});
  return'<div class="assistant-plan '+(sensitive?'sensitive':'')+'"><div class="row"><strong>Proposed CRM changes</strong>'+(sensitive?'<span class="badge warning">Sensitive</span>':'')+'</div><p class="muted">'+esc(plan.message||'Review before saving.')+'</p>'+plan.actions.map(function(a,i){const conflicts=planConflicts(a);return'<div class="assistant-action"><strong>'+(i+1)+'. '+esc(a.operation==='create'?'Create':'Update')+' '+esc(titles[a.entity]||a.entity)+'</strong><div>'+esc(a.recordName||a.recordId||'New record')+'</div>'+Object.entries(a.data||{}).map(function(kv){return'<small><strong>'+esc(label(kv[0]))+':</strong> '+esc(kv[1])+'</small><br>';}).join('')+(conflicts.length?'<small class="warning">Changes existing value: '+esc(conflicts.map(function(x){return label(x.field);}).join(', '))+'</small>':'')+(a._duplicate?'<small class="warning">Possible existing match: '+esc(a._duplicate.name)+' ('+esc(a._duplicate.id)+'). Creation is blocked until resolved.</small>':'')+'</div>';}).join('')+(dups.length?'<p class="warning">A likely duplicate was found. Update the existing record or revise the request instead of creating another record.</p>':'')+'<div class="actions"><button onclick="cancelAiPlan()">Cancel</button><button onclick="editAiPlan()">Edit request</button><button class="primary" '+(dups.length?'disabled':'')+' onclick="executeAiPlan()">'+(sensitive?'Confirm sensitive action':'Confirm changes')+'</button></div></div>';
}
function assistantHistoryHtml(){
  const actions=aiActionHistory().slice(0,6),undo=localStorage.getItem(AI_UNDO_KEY);
  return'<div class="grid section"><section><h3>Recent AI actions</h3><div class="assistant-history">'+(actions.map(function(a){return'<div class="record"><strong>'+esc(a.summary)+'</strong><small class="muted">'+esc(new Date(a.at).toLocaleString())+'</small></div>';}).join('')||'<p class="muted">No AI-driven changes yet.</p>')+'</div>'+(undo?'<button style="margin-top:10px" onclick="undoLastAiUpdate()">Undo last AI update</button>':'')+'</section><section><h3>Pending confirmation</h3>'+(aiPendingPlan?'<div class="record pending-card"><strong>'+esc(aiPendingPlan.message||'CRM changes waiting for confirmation')+'</strong><button style="margin-top:8px" onclick="showPendingAiPlan()">Review</button></div>':'<p class="muted">Nothing waiting for confirmation.</p>')+'</section></div>';
}
function assistantWorkspaceHtml(){
  loadAiState();
  return '<section class="panel assistant-panel"><div class="row"><div><h3>CRM Assistant</h3><p class="muted">Your one-stop shop for everything in the CRM.</p></div><span class="assistant-status">'+(state.aiEnabled?'AI connected':'AI unavailable')+'</span></div><form id="aiForm"><label><span>What do you want to do?</span><textarea class="assistant-input" id="aiQuestion" maxlength="3000" placeholder="Type naturally, paste an email, ask a question, or describe what happened…" required></textarea></label><div class="actions"><button type="submit" class="primary" '+(!state.aiEnabled?'disabled':'')+'>Send</button></div></form><div id="aiAnswer" class="assistant-response" role="status">'+aiConversation.slice(-4).map(function(m){return'<div class="assistant-message '+(m.role==='user'?'user':'')+'"><strong>'+(m.role==='user'?'You':'Assistant')+'</strong><br>'+esc(m.text)+'</div>';}).join('')+'</div>'+assistantHistoryHtml()+'</section>';
}
function wireAssistantForm(){const form=el('aiForm');if(form)form.onsubmit=handleAssistantSubmit;}
async function handleAssistantSubmit(e){
  e.preventDefault();
  const b=e.submitter,q=el('aiQuestion').value.trim();
  if(!q)return;
  if(q.length>3000){el('aiAnswer').innerHTML='<div class="assistant-message error">Please keep each message to 3,000 characters or less.</div>';return;}
  const dossier=dossierRequest(q);
  if(dossier){
    const txt=companyDossierText(dossier);
    aiConversation.push({role:'user',text:q},{role:'assistant',text:txt});
    saveAiState();
    el('aiAnswer').innerHTML=companyDossierHtml(dossier);
    return;
  }
  const local=localCommunicationAnswer(q);
  if(local){
    aiConversation.push({role:'user',text:q},{role:'assistant',text:local});
    saveAiState();
    el('aiAnswer').innerHTML='<div class="assistant-message">'+esc(local)+'</div>';
    return;
  }
  b.disabled=true;
  aiConversation.push({role:'user',text:q});
  saveAiState();
  el('aiAnswer').innerHTML='<div class="assistant-message">Analyzing CRM context…</div>';
  try{
    const ctx=primaryAssistantContext(q);
    const first=await call('askAssistant',q,ctx.entity,ctx.id);
    const interpretation=String(first.answer||'').trim();
    const second=await call('askAssistant',aiPlannerPromptFromInterpretation(q,interpretation),'','');
    const parsed=parseAssistantJson(second.answer);
    const plan=validatePlan(parsed||{mode:'answer',message:interpretation||second.answer});
    if(plan.mode==='answer'||plan.mode==='clarify'){
      const message=plan.message||interpretation;
      aiConversation.push({role:'assistant',text:message});
      saveAiState();
      el('aiAnswer').innerHTML='<div class="assistant-message">'+esc(message)+'</div>';
    }else if(plan.mode==='query'){
      aiConversation.push({role:'assistant',text:plan.message||'Search results'});
      saveAiState();
      el('aiAnswer').innerHTML=renderQueryResults(plan);
    }else if(plan.mode==='timeline'){
      aiConversation.push({role:'assistant',text:plan.message||'Timeline'});
      saveAiState();
      el('aiAnswer').innerHTML=renderTimeline(plan);
    }else if(plan.mode==='action'){
      aiPendingPlan=Object.assign({},plan,{_originalRequest:q,_interpretation:interpretation});
      saveAiState();
      el('aiAnswer').innerHTML=planHtml(aiPendingPlan);
    }
  }catch(err){
    el('aiAnswer').innerHTML='<div class="assistant-message error">'+esc(err.message)+'</div>';
  }finally{b.disabled=false;}
}
function showPendingAiPlan(){if(aiPendingPlan)showDialog('Pending CRM changes',planHtml(aiPendingPlan));}
function cancelAiPlan(){aiPendingPlan=null;saveAiState();if(el('dialog').open)el('dialog').close();if(el('aiAnswer'))el('aiAnswer').innerHTML='<div class="assistant-message">Proposed changes cancelled.</div>';if(view==='Today'||view==='Assistant')render();}
function editAiPlan(){const req=aiPendingPlan&&aiPendingPlan._originalRequest||'';aiPendingPlan=null;saveAiState();if(el('dialog').open)el('dialog').close();if(view!=='Today'&&view!=='Assistant')go('Today');setTimeout(function(){if(el('aiQuestion')){el('aiQuestion').value=req+(req?'\n\nChange: ':'');el('aiQuestion').focus();}},0);}
function resolveActionRefs(data,results){
  const out=Object.assign({},data);
  Object.entries(out).forEach(function(kv){if(typeof kv[1]==='string'){const m=kv[1].match(/^\$action(\d+)\.id$/);if(m){const x=results[Number(m[1])];if(!x||!x.id)throw Error('A dependent CRM record could not be linked.');out[kv[0]]=x.id;}}});
  return out;
}
function snapshotForUndo(entity,r){const data={};(state.fields&&state.fields[entity]||[]).forEach(function(k){if(!['id','version','createdAt','updatedAt','threadId'].includes(k))data[k]=r[k]||'';});return{entity:entity,id:r.id,data:data};}
async function executeAiPlan(){
  if(!aiPendingPlan||busy)return;const plan=aiPendingPlan;if((plan.actions||[]).some(function(a){return a._duplicate;})){notice('Resolve the duplicate match before creating the record.');return;}
  busy=true;const results=[],undo=[];
  try{
    for(let i=0;i<plan.actions.length;i++){
      const a=plan.actions[i],data=resolveActionRefs(a.data||{},results);
      if(a.operation==='update'){
        const r=(state.records[a.entity]||[]).find(function(x){return x.id===a.recordId;});if(!r)throw Error('Record not found: '+a.recordId);undo.push(snapshotForUndo(a.entity,r));
        const payload={},allowed=writableFields(a.entity);allowed.forEach(function(k){payload[k]=r[k]||'';});Object.assign(payload,data,{id:r.id,version:r.version});if(r.threadId)payload.threadId=r.threadId;
        const saved=await call('saveRecord',a.entity,payload);Object.assign(r,payload);if(saved&&typeof saved==='object')Object.assign(r,saved);results.push(saved||r);
      }else{
        const saved=await call('saveRecord',a.entity,data);if(!saved||!saved.id)throw Error('The new '+a.entity+' record was not returned by the CRM.');results.push(saved);if(state.records[a.entity])state.records[a.entity].push(saved);
      }
    }
    if(undo.length===plan.actions.length&&plan.actions.every(function(a){return a.operation==='update';})){try{localStorage.setItem(AI_UNDO_KEY,JSON.stringify({items:undo,at:Date.now()}));}catch(e){}}else{try{localStorage.removeItem(AI_UNDO_KEY);}catch(e){}}
    const summary=plan.actions.map(function(a){return(a.operation==='create'?'Created ':'Updated ')+(a.recordName||a.recordId||a.entity);}).join('; ');
    recordAiAction({summary:summary});aiConversation.push({role:'assistant',text:'Completed: '+summary});aiPendingPlan=null;saveAiState();if(el('dialog').open)el('dialog').close();await refresh();notice('CRM updated');if(view==='Today'||view==='Assistant')render();
  }catch(err){notice(err.message);if(el('aiAnswer'))el('aiAnswer').innerHTML='<div class="assistant-message error">'+esc(err.message)+'</div>';}finally{busy=false;}
}
async function undoLastAiUpdate(){
  let u;try{u=JSON.parse(localStorage.getItem(AI_UNDO_KEY)||'null');}catch(e){}
  if(!u||!u.items||!u.items.length)return notice('No reversible AI update is available.');
  if(Date.now()-u.at>30*60*1000)return notice('The undo window has expired.');
  busy=true;
  try{
    for(const item of u.items){const r=(state.records[item.entity]||[]).find(function(x){return x.id===item.id;});if(!r)continue;const payload=Object.assign({},item.data,{id:item.id,version:r.version});const saved=await call('saveRecord',item.entity,payload);Object.assign(r,payload);if(saved&&typeof saved==='object')Object.assign(r,saved);}
    localStorage.removeItem(AI_UNDO_KEY);recordAiAction({summary:'Undid previous AI update'});await refresh();notice('Last AI update reversed');
  }catch(e){notice(e.message);}finally{busy=false;}
}
function clearAiConversation(){aiConversation=[];aiPendingPlan=null;aiContextSelection={entity:'',id:'',label:''};saveAiState();if(view==='Today'||view==='Assistant')render();}
function assistant(){aiContextSelection={entity:'',id:'',label:''};el('main').innerHTML='<h2>CRM Assistant</h2><p class="muted">Your one-stop shop for everything in the CRM.</p>'+assistantWorkspaceHtml();wireAssistantForm();}
async function syncInbox(){try{const r=await call('syncEmail');notice(r.created+' new tickets, '+r.updated);await refresh();}catch(e){notice(e.message);}}
