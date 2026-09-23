import {randomUUID} from 'node:crypto';
import {day} from './crm.js';
export const automationRegister=Object.freeze([
 {id:'daily-brief',enabled:false,trigger:'working-day schedule',timezone:'Asia/Nicosia',operation:'prepare',runtime:'Existing TSS backend; binding pending'},
 {id:'weekly-review',enabled:false,trigger:'weekly schedule',timezone:'Asia/Nicosia',operation:'prepare',runtime:'Existing TSS backend; binding pending'},
 {id:'housekeeping',enabled:false,trigger:'CRM change event or existing health job',operation:'detect only'},
 {id:'enquiry-attention',enabled:false,trigger:'Persisted enquiry / transfer result',operation:'notify'},
 {id:'mail-attention',enabled:false,trigger:'Captured message event',operation:'classify and propose'},
 {id:'publication-result',enabled:false,trigger:'Verified provider result',operation:'reconcile only'}
]);
// Durable store binding is mandatory in production. TestStore exists only under tests.
export class WorkflowEngine {
 constructor({store,authorize,handlers,readRecord,clock=()=>new Date(),maxAttempts=3,maxEventAgeMs=86400000}){Object.assign(this,{store,authorize,handlers,readRecord,clock,maxAttempts,maxEventAgeMs});}
 async ingest(ctx,event){
  if(!ctx?.tenantId||!ctx.actor||!await this.authorize(ctx,'workflow'))throw Error('UNAUTHORIZED');
  if(!event?.id||!event.type||!event.source||!Number.isFinite(Date.parse(event.occurredAt)))throw Error('INVALID_EVENT');
  if(!this.handlers[event.type])throw Error('UNSUPPORTED_EVENT');
  if(/send|publish|delete|merge|pay|deploy/i.test(event.type))throw Error('EXTERNAL_WRITE_FORBIDDEN');
  const key=ctx.tenantId+':event:'+event.source+':'+event.id;
  return this.store.atomic(key,async tx=>{
   const existing=await tx.get();if(existing)return {...existing,duplicate:true};
   const now=this.clock();const stale=now-Date.parse(event.occurredAt)>this.maxEventAgeMs||Date.parse(event.occurredAt)>now.getTime()+60000;
   const job={id:randomUUID(),tenantId:ctx.tenantId,type:event.type,event:structuredClone(event),status:stale?'stale':'pending',attempts:0,nextRetryAt:null,idempotencyKey:key,lastErrorCode:null,createdAt:now.toISOString(),startedAt:null,completedAt:null};
   await tx.put(job);await tx.audit({id:randomUUID(),timestamp:now.toISOString(),tenantId:ctx.tenantId,actor:ctx.actor,agent:'manager',action:'event_received',jobId:job.id,eventId:event.id,result:job.status});return job;
  });
 }
 async run(ctx,event){
  if(!ctx?.tenantId||!ctx.actor||!await this.authorize(ctx,'workflow'))throw Error('UNAUTHORIZED');
  const key=ctx.tenantId+':event:'+event.source+':'+event.id;
  const job=await this.store.atomic(key,async tx=>{
   const j=await tx.get();if(!j)throw Error('EVENT_NOT_FOUND');
   if(!['pending','retry'].includes(j.status))return {...j,skip:true};
   if(j.nextRetryAt&&Date.parse(j.nextRetryAt)>this.clock())return {...j,skip:true};
   if(j.event.recordId){const current=await this.readRecord(ctx,j.event.entity,j.event.recordId);if(!current||String(current.version)!==String(j.event.version)){j.status='changed';await tx.put(j);return {...j,skip:true};}}
   j.status='running';j.startedAt=this.clock().toISOString();j.attempts++;await tx.put(j);return j;
  });
  if(job.skip)return job;
  let result,error;try{result=await this.handlers[job.type](ctx,job.event);if(result?.externalActionExecuted)throw Error('UNEXPECTED_EXTERNAL_WRITE');}catch(e){error=e;}
  return this.store.atomic(key,async tx=>{const j=await tx.get();if(error){j.lastErrorCode='DOWNSTREAM_UNAVAILABLE';j.status=j.attempts<this.maxAttempts?'retry':'failed';j.nextRetryAt=j.status==='retry'?new Date(this.clock().getTime()+Math.min(60000*2**(j.attempts-1),900000)).toISOString():null;}else{j.status='completed';j.completedAt=this.clock().toISOString();j.result=result;}await tx.put(j);await tx.audit({id:randomUUID(),timestamp:this.clock().toISOString(),tenantId:ctx.tenantId,actor:ctx.actor,agent:'manager',action:'job_result',jobId:j.id,result:j.status,retry:j.attempts,errorCode:j.lastErrorCode});return j;});
 }
 async notify(ctx,{key,kind,reference}){
  if(!await this.authorize(ctx,'workflow')||!ctx.tenantId||!ctx.actor)throw Error('UNAUTHORIZED');
  if(!['Needs Action','Needs Approval','Warning','Failed','Completed','Informational'].includes(kind))throw Error('INVALID_NOTIFICATION');
  return this.store.atomic(ctx.tenantId+':notification:'+key,async tx=>{const old=await tx.get();if(old)return {...old,duplicate:true};const item={id:randomUUID(),tenantId:ctx.tenantId,kind,reference,createdAt:this.clock().toISOString()};await tx.put(item);return item;});
 }
}
export function dailyEvent(now=new Date()) {
 const weekday=new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'Asia/Nicosia'}).format(now);
 return ['Sat','Sun'].includes(weekday)?null:{id:'daily:'+day(now),source:'tss-backend',type:'daily-brief',occurredAt:now.toISOString()};
}
