import {createHash} from 'node:crypto';
import {sameOrigin} from './tssAdminSession.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const OWNER='thesmartysolution@gmail.com';
const TEST_WABA='2882413005471663', TEST_PHONE='1378287792033123';
function fail(code,status=400){const e=Error(code);e.status=status;throw e;}
// Review-only workflow: no transport, token, Graph URL or send switch exists here.
export function prepareTestReply(record,body,env){
 if(env.VERCEL_ENV!=='preview'||env.TSS_WHATSAPP_REPLY_MODE!=='dry-run')fail('reply_workflow_disabled',423);
 if(!record||record.kind!=='message'||record.wabaId!==TEST_WABA||record.phoneNumberId!==TEST_PHONE)fail('test_account_required',403);
 const allow=String(env.TSS_WHATSAPP_TEST_RECIPIENTS||'').split(',').filter(Boolean);
 if(!/^\d{8,17}$/.test(record.sender)||!allow.includes(record.sender)||record.sender==='35799810330')fail('test_recipient_denied',403);
 if(!body||Object.keys(body).sort().join(',')!=='action,eventKey,text'||body.action!=='prepare-test-reply'||body.eventKey!==record.key)fail('invalid_reply_request');
 if(typeof body.text!=='string'||!body.text.trim()||body.text.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.text))fail('invalid_reply_text');
 if(typeof record.messageId!=='string'||!record.messageId||record.messageId.length>250||/[\u0000-\u001f]/.test(record.messageId))fail('invalid_message_reference');
 const payload={messaging_product:'whatsapp',recipient_type:'individual',to:record.sender,type:'text',context:{message_id:record.messageId},text:{preview_url:false,body:body.text.trim()}};
 return {ok:true,mode:'dry-run',sent:false,payload,approvalDigest:hash(JSON.stringify([record.key,payload])),requiresSeparateApprovalForTransmission:true};
}
export function createOperationsHandler({env=process.env,authenticate,loadEvent,approvedSender,auditAcceptance,checkMailAuthentication,checkNotificationInventory,mailAcceptance,audit=()=>{}}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  try{
   if(req.method!=='POST')return reply(405,{ok:false,error:'method_not_allowed'});
   if(!sameOrigin(req,env))fail('csrf_origin_denied',403);
   const session=await authenticate(req);
   if(session.email!==OWNER)fail('owner_only',403);
   if(typeof req.headers?.['x-tss-csrf']!=='string'||hash(req.headers['x-tss-csrf'])!==session.csrfHash)fail('csrf_token_invalid',403);
   if(!String(req.headers?.['content-type']||'').startsWith('application/json'))fail('json_required',415);
   let body=req.body;
   if(typeof body==='string'){if(body.length>5000)fail('request_too_large',413);try{body=JSON.parse(body);}catch{fail('invalid_json');}}
   if(!body||Array.isArray(body)||JSON.stringify(body).length>5000)fail('invalid_request');
   if(env.VERCEL_ENV!=='preview'||!['dry-run','test-approved'].includes(env.TSS_WHATSAPP_REPLY_MODE))fail('reply_workflow_disabled',423);
   const schemas={
    'capabilities':['action'],
    'mail-auth-check':['action'],
    'notification-inventory-check':['action'],
    'mail-acceptance-start':['action','explicitApproval'],
    'mail-acceptance-status':['action'],
    'audit-acceptance':['action','runId'],
    'mark-test-reviewed':['action','eventKey'],
    'approve-test-reply':['action','eventKey','explicitApproval','text'],
    'send-approved-test-reply':['action','approvalId','approvalToken','eventKey','text'],
    'reconcile-test-reply':['action','actionId','classification','evidenceReference','providerMessageId'],
    'record-test-delivery':['action','actionId','eventKey'],
    'audit-preview':['action','actionId'],
    'policy-preview':['action','eventKey','retentionDays']
   };
   if(Object.hasOwn(schemas,body.action)){
    if(Object.keys(body).sort().join(',')!==schemas[body.action].sort().join(','))fail('invalid_request');
    if(body.action==='notification-inventory-check'){if(!checkNotificationInventory)fail('inventory_check_disabled',423);return reply(200,await checkNotificationInventory());}
    if(body.action==='mail-acceptance-start'||body.action==='mail-acceptance-status'){if(!mailAcceptance)fail('mail_acceptance_disabled',423);return reply(200,await (body.action==='mail-acceptance-start'?mailAcceptance.start({explicitApproval:body.explicitApproval}):mailAcceptance.status()));}
    if(body.action==='mail-auth-check'){if(!checkMailAuthentication)fail('mail_auth_check_disabled',423);await checkMailAuthentication();return reply(200,{ok:true,authentication:'token_exchange_pass',emailsSent:0});}
    if(body.action==='audit-acceptance'){if(!auditAcceptance)fail('audit_acceptance_disabled',423);return reply(200,await auditAcceptance({session,runId:body.runId}));}
    if(body.action==='capabilities'){
     const canApprove=env.TSS_WHATSAPP_REPLY_MODE==='test-approved'&&Boolean(env.TSS_WHATSAPP_OPERATIONS_SERVICE_ACCOUNT_EMAIL);
     return reply(200,{ok:true,canAudit:env.TSS_WHATSAPP_AUDIT_ACCEPTANCE==='approved'&&Boolean(env.TSS_WHATSAPP_OPERATIONS_SERVICE_ACCOUNT_EMAIL),canApprove,canSendTest:canApprove&&env.TSS_WHATSAPP_TEST_TRANSMISSION_APPROVED==='true'&&env.TSS_WHATSAPP_COST_APPROVED==='true'&&Boolean(env.TSS_WHATSAPP_TEST_SENDER_SECRET_VERSION)&&/^v\d{2}\.0$/.test(env.TSS_WHATSAPP_GRAPH_VERSION||''),productionSending:false});
    }
    if(body.action==='policy-preview'){
     if(!/^[a-f0-9]{64}$/.test(body.eventKey))fail('invalid_event_key');
     const record=await loadEvent(body.eventKey);if(!record)fail('event_unavailable',404);
     return reply(200,{ok:true,...retentionPlan([record],{retentionDays:body.retentionDays}),
      inventory:{examined:1,legalHoldOrUnknown:record.legalHold!==false?1:0},scope:'selected-event-only'});
    }
    if(!approvedSender)fail('sender_disabled',423);
    const args={...body,session};delete args.action;
    const method={'mark-test-reviewed':'markReviewed','approve-test-reply':'approve','send-approved-test-reply':'send','reconcile-test-reply':'reconcile','record-test-delivery':'recordStatus','audit-preview':'inspect'}[body.action];
    return reply(200,await approvedSender[method](args));
   }
   if(!/^[a-f0-9]{64}$/.test(body?.eventKey||''))fail('invalid_event_key');
   const result=prepareTestReply(await loadEvent(body.eventKey),body,{...env,TSS_WHATSAPP_REPLY_MODE:'dry-run'});
   audit({component:'whatsapp_operations',code:'test_reply_prepared',eventKey:body.eventKey,digest:result.approvalDigest});
   return reply(200,result);
  }catch(e){
   // Emit only pinned internal categories, never Google response text, request
   // bodies, approval tokens, CSRF values or provider stacks.
   if(!e.status){const known=new Set(['operations_identity_not_configured','operations_identity_unavailable','audit_unavailable','audit_corrupt','audit_integrity_failed','audit_readback_failed','manifest_readback_failed']);
    audit({component:'whatsapp_operations',code:known.has(e.message)?e.message:'operations_unavailable'});}
   return reply(e.status||503,{ok:false,error:e.status?e.message:'operations_unavailable'});
  }
 };
}
// Planning only. No TTL activation, credentials or deletion API is present.
export function retentionPlan(records,{now=Date.now(),retentionDays=90,policyApproved=false}={}){
 if(!Number.isInteger(retentionDays)||retentionDays<1||retentionDays>3650)fail('invalid_retention_period');
 return {mode:'plan-only',policyApproved,activated:false,candidates:records.filter(r=>!r.legalHold&&Number.isFinite(Date.parse(r.receivedAt))&&Date.parse(r.receivedAt)<now-retentionDays*86400000).map(r=>({eventKey:r.key,action:'review_payload_redaction',preserveDedupe:true})),deletionAllowed:false};
}
// This checks dependency initialization, never sends a challenge token or signed event.
// A healthy result does not prove persistence or Meta delivery.
export function createHealthHandler({env=process.env,authenticate,fetcher=fetch}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json');
  const reply=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
  try{
   if(req.method!=='GET')return reply(405,{ok:false,error:'method_not_allowed'});
   const session=await authenticate(req);if(session.email!==OWNER)fail('owner_only',403);
   const origin=env.VERCEL_ENV==='production'?'https://www.thesmartysolution.com':'https://whatsapp-preview.thesmartysolution.com';
   if(!sameOrigin({headers:{origin}},env))fail('admin_origin_not_configured',503);
   const r=await fetcher(origin+'/api/tss-whatsapp-webhook',{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
   const ready=r.status===400&&(await r.text())==='Invalid challenge';
   return reply(ready?200:503,{ok:ready,ingestionDependenciesReady:ready,endToEndVerified:false});
  }catch(e){return reply(e.status||503,{ok:false,error:e.status?e.message:'health_unavailable'});}
 };
}
