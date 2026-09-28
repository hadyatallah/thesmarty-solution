/* TSS Command Center native Apps Script binding v0.2.0.
 * Private project dependency: requireSession_, db_, rows_, SCHEMA, OWNER,
 * authHash_, saveRecordLocked_. No new OAuth scopes or external dispatch.
 * Each ledger append contains state and audit in one cell. Script lock covers
 * read/check/append/flush. A crash after dispatch requires manual reconciliation.
 */
const CC_VERSION_='tss-cc-0.3.0';
const CC_HEADERS_=['sequence','key','timestamp','envelope','checksum'];
function ccCanonical_(v){return Array.isArray(v)?v.map(ccCanonical_):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ccCanonical_(v[k])])):v;}
function ccHash_(v){return authHash_(JSON.stringify(ccCanonical_(v)));}
function ccLock_(fn){const lock=LockService.getScriptLock();lock.waitLock(20000);try{return fn();}finally{SpreadsheetApp.flush();lock.releaseLock();}}
function ccContext_(token){requireSession_(token);return {tenantId:'tss-internal',actor:OWNER};}
function ccLedger_(ss,create){let s=ss.getSheetByName('Agent Ledger');if(!s&&create){s=ss.insertSheet('Agent Ledger');s.getRange(1,1,1,5).setValues([CC_HEADERS_]);s.setFrozenRows(1);s.getRange(1,1,1,5).setBackground('#142f40').setFontColor('#ffffff');}if(!s)throw Error('CC_NOT_INSTALLED');const h=s.getRange(1,1,1,5).getDisplayValues()[0];if(h.join('|')!==CC_HEADERS_.join('|'))throw Error('CC_LEDGER_SCHEMA_CHANGED');return s;}
function ccReadLedger_(ss){const s=ccLedger_(ss,false),n=s.getLastRow();if(n<2)return [];return s.getRange(2,1,n-1,5).getDisplayValues().map((r,i)=>{if(String(i+1)!==r[0]||authHash_(r[3])!==r[4])throw Error('CC_LEDGER_INTEGRITY');const e=JSON.parse(r[3]);if(e.key!==r[1]||e.audit.timestamp!==r[2])throw Error('CC_LEDGER_INTEGRITY');return e;});}
function ccLatest_(ss,key){const all=ccReadLedger_(ss);for(let i=all.length-1;i>=0;i--)if(all[i].key===key)return all[i].state;return null;}
function ccAppend_(ss,key,state,ctx,result){
 const now=new Date().toISOString();state.updatedAt=now;
 const audit={id:Utilities.getUuid(),timestamp:now,tenantId:ctx.tenantId,actor:ctx.actor,agent:state.source||'manager',requestId:state.requestId||null,actionId:state.id,operation:state.operation||state.type||'prepare',entity:state.entity||null,recordId:state.recordId||null,result,approvalReference:state.approval?.id||null,errorCode:state.errorCode||null,retry:state.attempts||0,dataSource:'TSS operational backend'};
 const envelope=JSON.stringify({key,state,audit});if(envelope.length>45000)throw Error('CC_PAYLOAD_TOO_LARGE');
 const s=ccLedger_(ss,false);s.appendRow([s.getLastRow(),key,now,envelope,authHash_(envelope)]);SpreadsheetApp.flush();return state;
}
function ccValidate_(a){
 if(!['create','update'].includes(a.operation)||!Object.prototype.hasOwnProperty.call(SCHEMA,a.entity)||a.entity==='Activity')throw Error('CC_OPERATION_UNSUPPORTED');
 if(!a.fields||typeof a.fields!=='object'||Array.isArray(a.fields))throw Error('CC_INVALID_FIELDS');
 const protectedFields=['id','version','createdAt','updatedAt','threadId'];
 for(const [k,v] of Object.entries(a.fields)){if(!SCHEMA[a.entity].includes(k)||protectedFields.includes(k)||v!==null&&typeof v==='object')throw Error('CC_FIELD_NOT_ALLOWED');if(String(v??'').length>20000)throw Error('CC_FIELD_TOO_LONG');}
 if(a.operation==='update'&&(!a.recordId||!a.expectedVersion))throw Error('CC_VERSION_REQUIRED');
 if(a.operation==='create'&&(a.recordId||a.expectedVersion))throw Error('CC_INVALID_CREATE');
}
function ccPayload_(a){return {entity:a.entity,recordId:a.recordId||null,operation:a.operation,fields:a.fields,expectedVersion:a.expectedVersion||null,expectedOutcome:a.expectedOutcome};}
function ccProposeCore_(ss,ctx,input){
 ccValidate_(input);if(typeof input.requestId!=='string'||input.requestId.length<8||input.requestId.length>100||typeof input.expectedOutcome!=='string'||input.expectedOutcome.length>1000)throw Error('CC_INVALID_ACTION');
 const payload=ccPayload_(input),id=ccHash_({tenantId:ctx.tenantId,requestId:input.requestId,payload}).slice(0,32),key=ctx.tenantId+':action:'+id;
 const old=ccLatest_(ss,key);if(old)return old;
 const sensitive=Object.keys(payload.fields).some(k=>['stage','status','lifecycle','communicationStatus','qualificationStatus','projectValue','agreedFee','tssFee','paymentStatus','paidAmount','paidDate'].includes(k));
 const a=Object.assign(payload,{id,tenantId:ctx.tenantId,actor:ctx.actor,source:'manager',requestId:input.requestId,class:sensitive?'high_impact':'controlled_crm',payloadHash:ccHash_(payload),approvalRequired:true,approvalState:'pending',approval:null,status:'proposed',idempotencyKey:key,providerReceipt:null,errorCode:null,auditReference:id,createdAt:new Date().toISOString()});
 return ccAppend_(ss,key,a,ctx,'proposed');
}
function ccPropose(token,input){const ctx=ccContext_(token);return ccLock_(()=>ccProposeCore_(db_(),ctx,input));}
function ccAction_(ss,ctx,id){if(!/^[a-f0-9]{32}$/.test(id))throw Error('CC_INVALID_ID');const key=ctx.tenantId+':action:'+id,a=ccLatest_(ss,key);if(!a||a.tenantId!==ctx.tenantId)throw Error('CC_NOT_FOUND');return {key,a};}
function ccDecisionCore_(ss,ctx,id,hash,decision){
 const {key,a}=ccAction_(ss,ctx,id);if(a.status!=='proposed'||a.payloadHash!==hash||ccHash_(ccPayload_(a))!==hash)throw Error('CC_APPROVAL_NOT_APPLICABLE');
 if(!['approve','reject'].includes(decision))throw Error('CC_INVALID_DECISION');
 a.approvalState=decision==='approve'?'approved':'rejected';
 if(decision==='reject')a.status='cancelled';else a.approval={id:Utilities.getUuid(),actor:ctx.actor,payloadHash:hash,at:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()};
 return ccAppend_(ss,key,a,ctx,a.approvalState);
}
function ccDecide(token,id,hash,decision){const ctx=ccContext_(token);return ccLock_(()=>ccDecisionCore_(db_(),ctx,id,hash,decision));}
function ccExecuteCore_(ss,ctx,id,adapter){
 const {key,a}=ccAction_(ss,ctx,id);if(a.status==='succeeded')return a;
 if(a.status!=='proposed')throw Error('CC_RECONCILE_REQUIRED');
 if(a.approvalState!=='approved'||a.approval?.actor!==ctx.actor||a.approval?.payloadHash!==a.payloadHash||!(Date.parse(a.approval?.expiresAt)>Date.now()))throw Error('CC_APPROVAL_REQUIRED');
 if(ccHash_(ccPayload_(a))!==a.payloadHash)throw Error('CC_PAYLOAD_CHANGED');ccValidate_(a);
 if(a.operation==='update'){const r=adapter.read(a.entity,a.recordId);if(!r||String(r.version)!==String(a.expectedVersion))throw Error('CC_STALE_RECORD');}
 // Persist a dispatch claim before touching the authoritative record. If either
 // write or its acknowledgement fails, no automatic retry is allowed.
 a.status='executing';ccAppend_(ss,key,a,ctx,'executing');
 try{const record=adapter.save(a.entity,Object.assign({},a.fields,a.operation==='update'?{id:a.recordId,version:a.expectedVersion}:{}));if(!record?.id)throw Error('NO_RECEIPT');a.status='succeeded';a.providerReceipt={provider:'TSS CRM',recordId:record.id,updatedAt:record.updatedAt};}
 catch(e){a.status='uncertain';a.errorCode='CRM_WRITE_NOT_CONFIRMED';}
 return ccAppend_(ss,key,a,ctx,a.status);
}
function ccExecute(token,id){const ctx=ccContext_(token);return ccLock_(()=>ccExecuteCore_(db_(),ctx,id,{read:(e,id)=>rows_(e).find(r=>r.id===id),save:(e,input)=>saveRecordLocked_(e,input)}));}
function ccState(token){const ctx=ccContext_(token);return ccLock_(()=>{const all=ccReadLedger_(db_()),latest={};all.forEach(e=>latest[e.key]=e.state);const values=Object.values(latest).filter(s=>s.tenantId===ctx.tenantId);return {version:CC_VERSION_,checkedAt:new Date().toISOString(),actions:values.filter(s=>s.operation).slice(-100).reverse(),jobs:values.filter(s=>s.type).slice(-30).reverse(),audit:all.slice(-100).reverse().map(e=>e.audit),capabilities:{crmWrites:true,emailSend:false,whatsappSend:false,socialPublish:false,researchProvider:false,schedules:PropertiesService.getScriptProperties().getProperty('CC_SCHEDULES_ENABLED')==='true'}};});}
function ccSnapshot_(){const records={},coverage={};Object.keys(SCHEMA).forEach(n=>{try{records[n]=rows_(n);coverage[n]={available:true,complete:true,total:records[n].length};}catch(e){coverage[n]={available:false,error:'CRM_SOURCE_UNAVAILABLE'};}});const commercial=commercialState_();Object.assign(records,commercial.records);Object.assign(coverage,commercial.coverage);return {records,coverage,enums:ENUMS,fields:SCHEMA,updatedAt:new Date().toISOString()};}
function ccBuildBrief_(type){const snapshot=ccSnapshot_(),crm=new CCReadCore.CRMAdapter(snapshot),growth=new CCReadCore.GrowthAgent({crm}),ops=new CCReadCore.OperationsAgent({crm,evidence:CCReadCore.operationalEvidence(snapshot)}),sections=[],errors=[];const jobs=type==='housekeeping'?[['Data quality',()=>crm.quality()],['CRM',()=>crm.attention()]]:[['CRM',()=>type==='weekly-review'?crm.weekly():crm.attention()],['Communications',()=>growth.incoming()],['Growth',()=>growth.prospects()],['Operations',()=>ops.summary()],['Content',()=>ops.content()]];for(const [name,fn] of jobs){try{const data=fn();sections.push({name,data});}catch(e){errors.push({name,errorCode:'SOURCE_UNAVAILABLE'});}}return {status:errors.length?'partial':'completed',sections,errors,at:new Date().toISOString(),externalActionExecuted:false};}
function ccRunBriefCore_(ss,ctx,type,eventId,build){
 if(!['daily-brief','weekly-review','housekeeping'].includes(type)||!/^[a-z0-9:.-]{1,120}$/i.test(eventId))throw Error('CC_INVALID_EVENT');
 const key=ctx.tenantId+':job:'+eventId;let j=ccLatest_(ss,key);if(j&&['completed','partial','running','failed'].includes(j.status))return j;
 if(j?.nextRetryAt&&Date.parse(j.nextRetryAt)>Date.now())return j;
 j=j||{id:Utilities.getUuid(),tenantId:ctx.tenantId,source:'manager',type,eventId,idempotencyKey:key,status:'pending',attempts:0,createdAt:new Date().toISOString(),nextRetryAt:null,lastErrorCode:null};
 j.attempts++;j.startedAt=new Date().toISOString();j.status='running';ccAppend_(ss,key,j,ctx,'running');
 try{j.result=build(type);j.status=j.result.status==='partial'?'partial':'completed';j.completedAt=new Date().toISOString();j.nextRetryAt=null;}
 catch(e){j.status=j.attempts<3?'retry':'failed';j.errorCode=j.lastErrorCode='BRIEF_UNAVAILABLE';j.nextRetryAt=j.status==='retry'?new Date(Date.now()+60000*Math.pow(2,j.attempts-1)).toISOString():null;}
 // Reports may exceed a cell; keep complete summary counts and up to ten items
 // per section, with an explicit truncation marker and original population.
 if(j.result){j.result.sections=j.result.sections.map(s=>({name:s.name,data:ccBoundReport_(s.data)}));}
 return ccAppend_(ss,key,j,ctx,j.status);
}
function ccBoundReport_(v){if(Array.isArray(v))return {items:v.slice(0,10).map(ccBoundReport_),total:v.length,limited:v.length>10};if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,ccBoundReport_(x)]));return typeof v==='string'?v.slice(0,1200):v;}
function ccPrepareBrief(token,type){const ctx=ccContext_(token),d=Utilities.formatDate(new Date(),'Asia/Nicosia','yyyy-MM-dd');return ccLock_(()=>ccRunBriefCore_(db_(),ctx,type,type+':'+d,ccBuildBrief_));}
// Install only after phase gates and production release approval. This function
// is owner-only, not exposed in the web dispatch allowlist.
function ccInstall(){owner_();ccLock_(()=>ccLedger_(db_(),true));return {version:CC_VERSION_,schedulesEnabled:false};}
function ccEnableSchedules(){owner_();const p=PropertiesService.getScriptProperties();if(p.getProperty('CC_LIVE_GATES_PASSED')!==CC_VERSION_)throw Error('CC_PHASE_GATES_REQUIRED');if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='ccScheduledBriefs'))ScriptApp.newTrigger('ccScheduledBriefs').timeBased().everyDays(1).atHour(8).inTimezone('Asia/Nicosia').create();p.setProperty('CC_SCHEDULES_ENABLED','true');}
function ccScheduledBriefs(){if(Session.getEffectiveUser().getEmail().toLowerCase()!==OWNER)throw Error('Access denied');if(PropertiesService.getScriptProperties().getProperty('CC_SCHEDULES_ENABLED')!=='true')return;const now=new Date(),weekday=Utilities.formatDate(now,'Asia/Nicosia','EEE'),d=Utilities.formatDate(now,'Asia/Nicosia','yyyy-MM-dd');if(['Sat','Sun'].includes(weekday))return;const ctx={tenantId:'tss-internal',actor:OWNER};ccLock_(()=>{ccRunBriefCore_(db_(),ctx,'daily-brief','daily-brief:'+d,ccBuildBrief_);if(weekday==='Mon')ccRunBriefCore_(db_(),ctx,'weekly-review','weekly-review:'+d,ccBuildBrief_);});}
function ccDisableSchedules(){owner_();PropertiesService.getScriptProperties().setProperty('CC_SCHEDULES_ENABLED','false');}
function ccPreviewReadCheck(){owner_();const snapshot=ccSnapshot_(),crm=new CCReadCore.CRMAdapter(snapshot);console.log(JSON.stringify({version:CC_VERSION_,at:new Date().toISOString(),counts:Object.fromEntries(Object.entries(snapshot.records).map(([k,v])=>[k,v.length])),attentionItems:crm.attention().items.length,qualityIssues:crm.quality().issues.length,coverage:snapshot.coverage,writePerformed:false}));}
function ccPreviewSelfTest(){
 owner_();const p=PropertiesService.getScriptProperties();let id=p.getProperty('CC_TEST_DB');if(!id){id=SpreadsheetApp.create('TSS Command Center Synthetic Tests').getId();p.setProperty('CC_TEST_DB',id);}const ss=SpreadsheetApp.openById(id),ctx={tenantId:'tss-test',actor:OWNER};
 const results=ccLock_(()=>{ccLedger_(ss,true);const input={requestId:Utilities.getUuid(),entity:'Tasks',operation:'create',fields:{name:'Synthetic gateway test'},expectedOutcome:'Test receipt only; no CRM record'},a=ccProposeCore_(ss,ctx,input);let denied=false;try{ccExecuteCore_(ss,ctx,a.id,{save:()=>{throw Error('Must not execute');}});}catch(e){denied=e.message==='CC_APPROVAL_REQUIRED';}ccDecisionCore_(ss,ctx,a.id,a.payloadHash,'approve');let calls=0;const adapter={save:()=>{calls++;return {id:'SYNTHETIC-'+a.id,updatedAt:new Date().toISOString()};}};const first=ccExecuteCore_(ss,ctx,a.id,adapter),second=ccExecuteCore_(ss,ctx,a.id,adapter);if(!denied||calls!==1||first.status!=='succeeded'||second.status!=='succeeded')throw Error('CC_TEST_FAILED');p.setProperty('CC_TEST_ACTION',a.id);return {unauthorizedExecutionBlocked:denied,dispatchCount:calls,replayPrevented:true,auditRows:ccReadLedger_(ss).length,crmWrites:0,externalSends:0};});console.log(JSON.stringify({version:CC_VERSION_,at:new Date().toISOString(),environment:'Apps Script Head / isolated synthetic spreadsheet',result:'PASS',evidence:results}));
}

function ccPreviewRestartCheck(){
 owner_();const p=PropertiesService.getScriptProperties(),id=p.getProperty('CC_TEST_DB'),actionId=p.getProperty('CC_TEST_ACTION');if(!id||!actionId)throw Error('Run ccPreviewSelfTest first');const ss=SpreadsheetApp.openById(id),ctx={tenantId:'tss-test',actor:OWNER};
 const result=ccLock_(()=>{const before=ccReadLedger_(ss).length;let calls=0;const a=ccExecuteCore_(ss,ctx,actionId,{save:()=>{calls++;throw Error('Duplicate dispatch');}});if(a.status!=='succeeded'||calls!==0||ccReadLedger_(ss).length!==before)throw Error('RESTART_TEST_FAILED');let blocked=0;[()=>ccPropose('bad',{}),()=>ccState('bad'),()=>ccDecide('bad',actionId,'x','approve'),()=>ccExecute('bad',actionId),()=>ccPrepareBrief('bad','daily-brief')].forEach(fn=>{try{fn();}catch(e){if(/AUTH_REQUIRED/.test(e.message))blocked++;}});if(blocked!==5)throw Error('AUTH_TEST_FAILED');return {priorReceiptRetained:true,duplicateDispatches:calls,unauthenticatedEndpointsBlocked:blocked,crmWrites:0,externalSends:0};});console.log(JSON.stringify({version:CC_VERSION_,at:new Date().toISOString(),environment:'Fresh Apps Script execution / persisted synthetic ledger',result:'PASS',evidence:result}));
}
