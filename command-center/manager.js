import {CRMAdapter} from './crm.js';
import {registry} from './prompts.js';
import {approvalSummary,notificationItems} from './context.js';
export class Manager {
 constructor({crm,growth,operations,runtime=null}={}){this.crm=crm;this.growth=growth;this.operations=operations;this.runtime=runtime;}
 async run(command,now=new Date()) {
  const q=String(command||'').trim(); if(!q||q.length>3000)throw Error('INVALID_COMMAND');
  const jobs=[];const add=(name,fn)=>jobs.push({name,fn});
  const dossier=q.match(/^(?:summari[sz]e|tell me (?:everything )?about|give me everything about|lookup|look up)\s+(.+?)[.!?]?$/i);
  if(dossier)add('CRM',()=>this.crm.dossier(dossier[1]));
  else if(/weekly|management (?:review|report)/i.test(q)){add('CRM',()=>this.crm.weekly(now));if(this.growth){add('Communications',()=>this.growth.incoming());add('Growth',()=>this.growth.prospects());}if(this.operations){add('Operations',()=>this.operations.summary(now));add('Content',()=>this.operations.content(now));}add('Approvals',()=>approvalSummary(this.runtime));}
  else if(/duplicate|incomplete|data (?:quality|problems)|inconsistent/i.test(q))add('CRM',()=>this.crm.quality());
  else if(/important (?:emails|replies)|incoming|unanswered/i.test(q))add('Communications',()=>this.growth?this.growth.incoming():{unavailable:'Email adapter is unavailable'});
  else if(/contact next|(?:who|which companies).*contact|prospects/i.test(q))add('Growth',()=>this.growth?this.growth.prospects():{unavailable:'Growth adapter is unavailable'});
  else if(/^research\s+/i.test(q))add('Growth',()=>this.growth?this.growth.research(q.replace(/^research\s+/i,'')):{unavailable:'Research adapter unavailable'});
  else if(/prepare.*(?:email|whatsapp|follow.up|introduction)/i.test(q))add('Communications',()=>{if(!this.growth)return {status:'needs_context',message:'Growth adapter is unavailable. Nothing has been sent.'};const patterns=[/\bfor\s+(.+?)\s+about\s+(.+)$/i,/\bto\s+(.+?)\s+about\s+(.+)$/i,/\bto\s+(.+?)\s+for\s+(.+)$/i,/\bfor\s+(.+?)\s+for\s+(.+)$/i];let match=null;for(const p of patterns){match=q.match(p);if(match)break;}if(!match)return {status:'needs_context',message:'Specify the exact company and purpose, for example: Prepare an email for [company] about [purpose]. Nothing has been sent.'};const companyName=match[1].replace(/\s+(?:and|with)\s+(?:state|say|mention|include)\b.*$/i,'').trim();const purpose=match[2].trim();const company=this.crm.lookup(companyName);if(!company.record)return company;return this.growth.prepareDraft({companyId:company.record.id,channel:/whatsapp/i.test(q)?'whatsapp':'email',purpose,followUp:/follow.up/i.test(q)});});
  else if(/content|social|story|reel/i.test(q))add('Content',()=>this.operations?this.operations.content(now):{unavailable:'Content adapter is unavailable'});
  else if(/fail|overnight|healthy|health|integration|outlook|enquiry workflow/i.test(q))add('Operations',()=>this.operations?this.operations.summary(now):{unavailable:'Operations evidence is unavailable'});
  else if(/approval/i.test(q))add('Approvals',()=>approvalSummary(this.runtime));
  else if(/notification/i.test(q))add('Notifications',()=>this.runtime?{notifications:notificationItems(this.runtime,now)}:{unavailable:'Notification service unavailable'});
  else if(/changed since|yesterday/i.test(q))add('CRM',()=>({period:'Available recent activity only',...this.crm.weekly(now),limitation:'No complete audit snapshot comparison is available'}));
  else if(/attention|priorities|daily|overdue|dormant|no next action/i.test(q)){
   add('CRM',()=>{const r=this.crm.attention(now);if(/overdue/i.test(q))r.items=r.items.filter(x=>x.kind==='overdue');else if(/dormant/i.test(q))r.items=r.items.filter(x=>x.kind==='dormant');else if(/no next action/i.test(q)){if(/companies/i.test(q))r.items=this.crm.rows('Companies').filter(x=>!String(x.nextAction||'').trim()).map(x=>({kind:'missing_next_action',entity:'Companies',id:x.id,name:x.name}));else r.items=r.items.filter(x=>x.kind==='missing_next_action');}return r;});
   if(/attention|priorities|daily/i.test(q)){if(this.growth){add('Communications',()=>this.growth.incoming());add('Growth',()=>this.growth.prospects());}if(this.operations){add('Operations',()=>this.operations.summary(now));add('Content',()=>this.operations.content(now));}add('Approvals',()=>approvalSummary(this.runtime));}
  }else return {handled:false};
  const settled=await Promise.allSettled(jobs.map(j=>Promise.resolve().then(j.fn)));
  const results=settled.map((r,i)=>r.status==='fulfilled'?{section:jobs[i].name,status:r.value?.unavailable||r.value?.status==='unavailable'||r.value?.available===false?'unavailable':r.value?.approvalReady===false||r.value?.status==='needs_context'?'partial':'success',data:r.value}:{section:jobs[i].name,status:'failed',error:'Specialist unavailable; no action executed'});
  return {handled:true,version:registry.manager.id,at:now.toISOString(),status:results.every(r=>r.status==='success')?'completed':results.some(r=>['success','partial'].includes(r.status))?'partial':'failed',results};
 }
}
export const managerForSnapshot=snapshot=>new Manager({crm:new CRMAdapter(snapshot)});
