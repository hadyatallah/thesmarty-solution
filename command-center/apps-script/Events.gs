/* Native, read/preparation-only event jobs. No provider dispatch in this module.
 * Caller must pass authenticated context, current version and explicit age policy.
 * Install event producers only after live phase acceptance. */
const CC_EVENT_TYPES_=['incoming-email','new-enquiry','failed-integration','overdue-task','opportunity-inactivity','content-approval','publication-result'];
function ccEventCore_(ss,ctx,event,policy,adapter){
 if(!ctx?.tenantId||!ctx.actor)throw Error('AUTH_REQUIRED');
 if(!event||!CC_EVENT_TYPES_.includes(event.type)||!/^[-a-z0-9:._]{1,120}$/i.test(event.id||'')||!/^[-a-z0-9:._]{1,80}$/i.test(event.source||'')||!Number.isFinite(Date.parse(event.occurredAt)))throw Error('CC_INVALID_EVENT');
 if(!Number.isFinite(policy?.maxAgeMs)||policy.maxAgeMs<=0||!Number.isInteger(policy.maxAttempts)||policy.maxAttempts<1||policy.maxAttempts>3)throw Error('CC_EVENT_POLICY_REQUIRED');
 const key=ctx.tenantId+':event:'+event.source+':'+event.id;
 let j=ccLatest_(ss,key);
 const payload={type:event.type,source:event.source,id:event.id,occurredAt:event.occurredAt,entity:event.entity||null,recordId:event.recordId||null,version:event.version||null};
 const payloadHash=ccHash_(payload);
 if(j&&j.payloadHash!==payloadHash)throw Error('CC_EVENT_CONFLICT');
 if(j&&!['retry'].includes(j.status))return j;
 if(j?.nextRetryAt&&Date.parse(j.nextRetryAt)>Date.now())return j;
 j=j||{id:Utilities.getUuid(),tenantId:ctx.tenantId,source:'manager',type:event.type,event:payload,payloadHash,idempotencyKey:key,status:'pending',attempts:0,createdAt:new Date().toISOString(),nextRetryAt:null,lastErrorCode:null};
 const age=Date.now()-Date.parse(payload.occurredAt);
 if(age>policy.maxAgeMs||age < -60000){j.status='stale';return ccAppend_(ss,key,j,ctx,'stale');}
 if(payload.recordId){
  if(!payload.entity||payload.version===null)throw Error('CC_VERSION_REQUIRED');
  const r=adapter.read(payload.entity,payload.recordId);
  if(!r||String(r.version)!==String(payload.version)){j.status='changed';return ccAppend_(ss,key,j,ctx,'changed');}
 }
 j.status='running';j.attempts++;j.startedAt=new Date().toISOString();ccAppend_(ss,key,j,ctx,'running');
 try{
  // Fixed read-only report builder; event text never chooses an operation.
  j.result=ccBoundReport_(adapter.prepare(payload.type,payload));
  if(j.result?.externalActionExecuted)throw Error('CC_EXTERNAL_EVENT_ACTION_FORBIDDEN');
  j.status=j.result?.status==='partial'?'partial':'completed';j.completedAt=new Date().toISOString();j.nextRetryAt=null;j.errorCode=j.lastErrorCode=null;
 }catch(e){j.lastErrorCode=j.errorCode='EVENT_PREPARATION_UNAVAILABLE';j.status=j.attempts<policy.maxAttempts?'retry':'failed';j.nextRetryAt=j.status==='retry'?new Date(Date.now()+60000*Math.pow(2,j.attempts-1)).toISOString():null;}
 return ccAppend_(ss,key,j,ctx,j.status);
}
function ccObserveEvent_(event){
 const p=PropertiesService.getScriptProperties();
 if(p.getProperty('CC_LIVE_GATES_PASSED')!==CC_VERSION_||p.getProperty('CC_EVENTS_ENABLED')!=='true')return {status:'disabled'};
 const ctx={tenantId:'tss-internal',actor:OWNER},policy={maxAgeMs:Number(p.getProperty('CC_EVENT_MAX_AGE_MS')),maxAttempts:3};
 return ccLock_(()=>ccEventCore_(db_(),ctx,event,policy,{read:(entity,id)=>rows_(entity).find(r=>r.id===id),prepare:()=>ccBuildBrief_('daily-brief')}));
}
function ccPreviewEventSelfTest(){
 owner_();const p=PropertiesService.getScriptProperties(),id=p.getProperty('CC_TEST_DB');if(!id)throw Error('Run ccPreviewSelfTest first');
 const ss=SpreadsheetApp.openById(id),ctx={tenantId:'tss-test',actor:OWNER},event={id:'test-'+Utilities.getUuid(),source:'isolated-test',type:'overdue-task',occurredAt:new Date().toISOString(),entity:'Tasks',recordId:'SYN-EVENT',version:'1'},policy={maxAgeMs:3600000,maxAttempts:3};
 const evidence=ccLock_(()=>{let builds=0;const adapter={read:()=>({version:'1'}),prepare:()=>{builds++;return {status:'completed',externalActionExecuted:false};}};const a=ccEventCore_(ss,ctx,event,policy,adapter),b=ccEventCore_(ss,ctx,event,policy,adapter);if(builds!==1||a.id!==b.id||b.status!=='completed')throw Error('EVENT_DEDUP_FAILED');const stale=ccEventCore_(ss,ctx,Object.assign({},event,{id:event.id+'-stale',occurredAt:'2000-01-01'}),policy,adapter);const changed=ccEventCore_(ss,ctx,Object.assign({},event,{id:event.id+'-changed',version:'0'}),policy,adapter);if(stale.status!=='stale'||changed.status!=='changed'||builds!==1)throw Error('EVENT_GUARD_FAILED');p.setProperty('CC_TEST_EVENT',JSON.stringify(event));return {singlePreparation:builds,duplicateSuppressed:true,staleBlocked:true,changedBlocked:true,commercialWrites:0,externalSends:0};});console.log(JSON.stringify({version:CC_VERSION_,at:new Date().toISOString(),environment:'Apps Script Head / isolated synthetic spreadsheet',result:'PASS',evidence}));
}
function ccPreviewEventRestartCheck(){
 owner_();const p=PropertiesService.getScriptProperties(),id=p.getProperty('CC_TEST_DB'),event=JSON.parse(p.getProperty('CC_TEST_EVENT')||'null');if(!id||!event)throw Error('Run ccPreviewEventSelfTest first');
 const ss=SpreadsheetApp.openById(id),ctx={tenantId:'tss-test',actor:OWNER};const evidence=ccLock_(()=>{const before=ccReadLedger_(ss).length;let builds=0;const j=ccEventCore_(ss,ctx,event,{maxAgeMs:3600000,maxAttempts:3},{read:()=>({version:'1'}),prepare:()=>{builds++;throw Error('Unexpected rebuild');}});if(builds!==0||j.status!=='completed'||before!==ccReadLedger_(ss).length)throw Error('EVENT_RESTART_FAILED');return {priorResultRetained:true,duplicatePreparations:builds,commercialWrites:0,externalSends:0};});console.log(JSON.stringify({version:CC_VERSION_,at:new Date().toISOString(),environment:'Fresh Apps Script execution / persisted event ledger',result:'PASS',evidence}));
}
