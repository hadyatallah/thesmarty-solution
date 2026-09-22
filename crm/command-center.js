import {CRMAdapter} from '../command-center/crm.js';
import {Manager} from '../command-center/manager.js';
import {GrowthAgent} from '../command-center/growth.js';
import {OperationsAgent} from '../command-center/operations.js';
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
  else if(d.record){body=list(['id','name','category','district','email','phone','website','lifecycle','communicationStatus','lastContact','nextAction','followUp'].map(k=>line(k,d.record[k])));for(const [name,items] of Object.entries(d.sections)){const c=d.coverage[name];body+=`<h4>${escape(name)}</h4>`+(!c?.available?'<p>Unavailable.</p>':list(items.slice(0,20).map(x=>line(x.name||x.subject||x.id||x.action||'Record',[x.stage||x.status,x.nextAction,x.dueDate||x.followUp||x.messageDate,x.direction,x.summary].filter(Boolean).join(' · '))))+(!items.length?'<p>No linked entries in loaded data.</p>':'')+`<p class="muted">${items.length} linked records. ${c.complete?'Source population marked complete.':'History may be partial.'}</p>`);}}
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
export function createManager(snapshot){const crm=new CRMAdapter(snapshot);return new Manager({crm,growth:new GrowthAgent({crm}),operations:new OperationsAgent({crm})});}
export const commandCenter={
 async answer(query,snapshot){const result=await createManager(snapshot).run(query);return result.handled?renderResult(result):null;},
 statusHtml(){return '<details class="section"><summary>Assistant capabilities and limits</summary><p>CRM reads use your current signed-in snapshot. Email history may be partial. Research providers, durable approvals, external actions and proactive jobs are not connected to this candidate.</p><p>Existing CRM changes still use the current confirmation flow. New Manager functions read and prepare only.</p></details>';}
};

if(typeof window!=='undefined')window.TSSCommandCenter=commandCenter;
