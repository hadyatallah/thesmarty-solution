import {CRMAdapter} from '../command-center/crm.js';
import {Manager} from '../command-center/manager.js';
import {GrowthAgent} from '../command-center/growth.js';
import {OperationsAgent} from '../command-center/operations.js';
import {operationalEvidence,notificationItems} from '../command-center/context.js';
const escape = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const line=(label,value)=>value===undefined||value===null||value===''?'':`<li><strong>${escape(label)}:</strong> ${escape(value)}</li>`;
const list=items=>`<ul>${items.join('')}</ul>`;
const rows=(items,fn)=>items.slice(0,50).map(fn).join('')+(items.length>50?`<p>Showing 50 of ${items.length}. Narrow the request for more detail.</p>`:'');
export function renderResult(result){
 return `<p class="muted">${escape(result.status)} · Checked ${escape(result.at)} · Read and preparation only</p>`+result.results.map(r=>{
  let body='';const d=r.data||{};
  if(r.status==='failed')body=`<p class="error">${escape(r.error)}</p>`;
  else if(d.status==='ambiguous')body='<p>More than one company matches. Use an exact ID.</p>'+list(d.candidates.map(x=>line(x.id,x.name)));
  else if(d.status==='unknown')body='<p>No company matched. Check the name or exact ID.</p>';
  else if(d.record){body=list(['id','name','category','district','email','phone','website','lifecycle','communicationStatus','lastContact','nextAction','followUp'].map(k=>line(k,d.record[k])));for(const [name,items] of Object.entries(d.sections)){const c=d.coverage[name];body+=`<h4>${escape(name)}</h4>`+(!c?.available?'<p>Unavailable.</p>':list(items.slice(0,20).map(x=>line(x.name||x.subject||x.id||x.action||'Record',[x.stage||x.status,x.nextAction,x.dueDate||x.followUp||x.messageDate,x.direction,x.summary,x.email,x.phone,x.role].filter(Boolean).join(' · ')||'No additional details')))+(!items.length?'<p>No linked entries in loaded data.</p>':'')+`<p class="muted">${items.length} linked records. ${c.complete?'Source population marked complete.':'History may be partial.'}</p>`);}}
  else if(d.actions){body=list(d.actions.filter(a=>a.status==='proposed').map(a=>line(a.operation+' '+a.entity,[a.recordId||'new',a.approvalState,a.id].join(' · '))))||'<p>No pending approvals.</p>';body+='<p>Review and execute exact proposals in the approval controls below.</p>';}
  else if(d.notifications){body=list(d.notifications.map(n=>line(n.kind,n.text)))||'<p>No notifications.</p>';}
  else if(d.items && !d.topic){body=`<p>${escape(d.period||'Current attention')} · ${d.items.length} items</p>`+list(d.items.slice(0,50).map(x=>line(x.kind.replaceAll('_',' '),[x.name||x.id,x.date,x.days!==undefined?x.days+' days':''].filter(Boolean).join(' · '))));}
  else if(d.pipeline){body=`<p>Review period: ${escape(d.period.from)} to ${escape(d.period.to)}</p><p>${d.pipeline.length} current open opportunities. This is a current snapshot, not a historical conversion calculation.</p>`+list(d.pipeline.map(x=>line(x.name||x.id,x.stage+' · '+(x.nextAction||'No next action'))))+`<p>${d.attention.items.length} current attention items. Activity coverage may be partial.</p>`;}
  else if(d.duplicates){body=`<p>${d.duplicates.length} duplicate signals and ${d.issues.length} data-quality findings. No records changed.</p>`+list(d.duplicates.slice(0,30).map(x=>line('Review '+x.signal,x.ids.join(', '))))+list(d.issues.slice(0,30).map(x=>line(x.kind,[x.entity,x.id,x.missing||x.field].filter(Boolean).join(' · '))));}
  else if(d.candidates){body=`<p>${escape(d.population)} · ${d.total} records</p>`+list(d.candidates.slice(0,30).map(x=>line(x.name,x.reason)));}
  else if(d.messages){body=d.available===false?'<p>Email history unavailable.</p>':list(d.messages.slice(0,30).map(x=>line(x.subject||'No subject',[x.category,x.date,x.companyId||'Match needs review'].filter(Boolean).join(' · '))));body+=`<p class="muted">${escape(d.limitation)}</p>`;}
  else if(d.services){body=list(d.services.map(x=>line(x.name,x.status+' · '+(x.reason||x.errorCode||''))))+list(d.loggedIssues.map(x=>line(x.component,x.action)));}
  else if(d.topic){body=`<p>Draft concepts for ${escape(d.date)}. Topic: ${escape(d.topic)}. No final assets or publication approval.</p>`+rows(d.items,x=>`<h4>${escape(x.format)} · ${x.width} × ${x.height}</h4><p><strong>${escape(x.headline)}</strong></p><p>${escape(x.caption||(x.script||[]).join(' '))}</p><p class="muted">${escape(x.visualBrief)}</p>`);}
  else if(d.text){body=`<p>Draft only · ${escape(d.channel)}</p>`+list([line('From',d.from),line('To',d.to),line('Subject',d.subject)])+`<p style="white-space:pre-wrap">${escape(d.text)}</p>`;}
  else body=`<p>${escape(d.unavailable||d.message||d.reason||'No result available.')}</p>`;
  body+=(d.limitations?.length?list(d.limitations.map(x=>line('Limit',x))):'');
  return `<section class="section"><h3>${escape(r.section)}</h3>${body}</section>`;
 }).join('');
}
export function createManager(snapshot,runtime=null){const crm=new CRMAdapter(snapshot);return new Manager({crm,growth:new GrowthAgent({crm}),operations:new OperationsAgent({crm,evidence:operationalEvidence(snapshot)}),runtime});}
export function renderAction(a){return `<article class="section"><h4>${escape(a.operation)} ${escape(a.entity)} · ${escape(a.recordId||'new record')}</h4>${list(Object.entries(a.fields||{}).map(([k,v])=>line(k,v)))}<p>${escape(a.expectedOutcome)}</p><p class="muted">${escape(a.status)} · ${escape(a.class)} · Action ${escape(a.id)}</p>${a.status==='proposed'?`<button type="button" data-approve="${escape(a.id)}">Approve exact change and execute</button> <button type="button" data-reject="${escape(a.id)}">Reject</button>`:''}${a.errorCode?`<p class="error">${escape(a.errorCode)}. Check the CRM and audit before proposing another action.</p>`:''}</article>`;}
function bindActions(root,actions,call,onDone){
 root.querySelectorAll('[data-approve],[data-reject]').forEach(button=>button.addEventListener('click',async()=>{
  const id=button.dataset.approve||button.dataset.reject,a=actions.find(x=>x.id===id);if(!a)return;
  root.querySelectorAll('[data-approve],[data-reject]').forEach(b=>b.disabled=true);
  try{await call('ccDecide',a.id,a.payloadHash,button.dataset.reject?'reject':'approve');if(button.dataset.approve){const done=await call('ccExecute',a.id);if(done.status!=='succeeded')throw Error('Outcome '+done.status+'. Review the action ledger before retrying.');}await onDone();}
  catch(e){root.querySelector('[data-feedback]').textContent=e.message+' Refresh the action ledger before trying again.';}
 }));
}
export const commandCenter={
 async answer(query,snapshot,{call}={}){let runtime=null;if(call&&/attention|priorities|daily|weekly|management|approval|notification/i.test(query)){try{runtime=await call('ccState');}catch{}}const result=await createManager(snapshot,runtime).run(query);return result.handled?renderResult(result):null;},
 statusHtml(){return '<section class="section" id="ccControls"><h3>Approvals, activity and system status</h3><button type="button" data-load-ledger>Refresh action ledger</button><button type="button" data-brief="daily-brief">Prepare daily brief</button><button type="button" data-brief="weekly-review">Prepare weekly review</button><button type="button" data-brief="housekeeping">Check data quality</button><p data-brief-status role="status"></p><div data-ledger role="status">Load the server ledger to review pending approvals, jobs and audit evidence.</div></section><details class="section"><summary>Assistant capabilities and limits</summary><p>CRM reads use your signed-in snapshot. Email history may be partial. Sending, publication and automatic WhatsApp inbox access are unavailable. A prepared message has not been sent.</p><p>Assistant changes require a server proposal and a separate exact-action approval. If the backend is not connected, changes are blocked.</p></details>';},
 mount({call}){const root=document.getElementById('ccControls');if(!root)return;const load=async()=>{const box=root.querySelector('[data-ledger]');box.textContent='Loading server evidence…';try{const s=await call('ccState');box.innerHTML=`<p>Backend ${escape(s.version)} · Checked ${escape(s.checkedAt)} · Schedules ${s.capabilities.schedules?'enabled':'not enabled'}</p><h4>Pending approvals and recent actions</h4>${s.actions.map(renderAction).join('')||'<p>No actions recorded.</p>'}<p data-feedback class="error" role="alert"></p><h4>Notifications</h4>${list(notificationItems(s).map(n=>line(n.kind,n.text)))}<h4>Prepared briefs and jobs</h4>${list(s.jobs.map(j=>line(j.type,j.status+' · '+j.updatedAt)))}<h4>Recent audit</h4>${list(s.audit.slice(0,20).map(a=>line(a.timestamp,a.operation+' · '+a.result+' · '+a.actionId)))}`;bindActions(box,s.actions,call,load);}catch(e){box.textContent='Action backend unavailable: '+e.message+'. Reads and drafts remain available; no proposed change was executed.';}};root.querySelector('[data-load-ledger]').addEventListener('click',load);root.querySelectorAll('[data-brief]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;const status=root.querySelector('[data-brief-status]');status.textContent='Preparing report…';try{const j=await call('ccPrepareBrief',button.dataset.brief);status.textContent=j.type+' · '+j.status+' · '+j.id+'. No external messages sent.';await load();}catch(e){status.textContent='Report unavailable: '+e.message;}finally{button.disabled=false;}}));},
 async stagePlan(plan,{call,state,onDone}){
  if(!plan?.actions?.length)return;
  const dialog=document.getElementById('dialog');
  try{
   if(plan.actions.some(a=>a._duplicate))throw Error('Resolve the duplicate before preparing a write.');
   if(plan.actions.some(a=>Object.values(a.data||{}).some(v=>typeof v==='string'&&/^\$action\d+\.id$/.test(v))))throw Error('Create and review the parent record first, then prepare the linked action with its exact ID.');
   for(const a of plan.actions)if(a.operation==='update'){const r=(state.records[a.entity]||[]).find(x=>x.id===a.recordId);if(!r||a._expectedVersion===undefined||String(r.version)!==String(a._expectedVersion))throw Error('Record changed. Prepare a fresh proposal.');}
   plan._gatewayRequestId=plan._gatewayRequestId||crypto.randomUUID();const actions=[];
   for(let i=0;i<plan.actions.length;i++){const a=plan.actions[i];actions.push(await call('ccPropose',{requestId:plan._gatewayRequestId+':'+i,entity:a.entity,operation:a.operation,recordId:a.recordId||null,expectedVersion:a._expectedVersion||null,fields:a.data||{},expectedOutcome:(a.operation==='create'?'Create ':'Update ')+(a.recordName||a.recordId||a.entity)}));}
   dialog.innerHTML='<h3>Review the exact server proposals</h3><p>No CRM changes have been executed. Approve each action separately.</p>'+actions.map(renderAction).join('')+'<p data-feedback class="error" role="alert"></p><button type="button" data-close>Close</button>';
   if(!dialog.open)dialog.showModal();dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
   bindActions(dialog,actions,call,async()=>{await onDone();});
  }catch(e){dialog.innerHTML='<h3>Proposal could not be prepared</h3><p class="error">'+escape(e.message)+'</p><p>No CRM write was requested. Any proposals already recorded remain in the server ledger.</p><button type="button" data-close>Close</button>';if(!dialog.open)dialog.showModal();dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());}
 }
};

if(typeof window!=='undefined')window.TSSCommandCenter=commandCenter;
