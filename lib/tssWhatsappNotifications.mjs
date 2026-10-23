import {digest,seal} from './tssWhatsappLedger.mjs';
const KINDS=new Set(['acceptance_test','new_inbound','webhook_failure','firestore_failure','outbound_failed','outbound_uncertain','unread_escalation']);
// Metadata only. Never include sender, text, provider body, credentials or URLs.
export function planOwnerAlerts({events=[],outcomes=[],reviewedKeys=[],health={},now=Date.now(),unreadMinutes=15}) {
  if(!Number.isInteger(unreadMinutes)||unreadMinutes<1||unreadMinutes>1440)throw Error('alert_policy_invalid');
  const reviewed=new Set(reviewedKeys),alerts=[];
  const add=(kind,reference)=>alerts.push({id:digest([kind,reference]),kind,reference});
  for(const event of events){
    if(!/^[a-f0-9]{64}$/.test(event.key||'')||event.kind!=='message')continue;
    add('new_inbound',event.key);
    const age=now-Date.parse(event.receivedAt);
    if(!reviewed.has(event.key)&&Number.isFinite(age)&&age>=unreadMinutes*60000)add('unread_escalation',event.key);
  }
  for(const outcome of outcomes){
    if(!/^[a-f0-9]{64}$/.test(outcome.actionId||''))continue;
    if(outcome.state==='FAILED')add('outbound_failed',outcome.actionId);
    if(outcome.state==='UNKNOWN_REVIEW_REQUIRED')add('outbound_uncertain',outcome.actionId);
  }
  // One incident per hour per failure category. An independent monitor must
  // observe these failures too; a failed Firestore cannot host its own outbox.
  for(const kind of ['webhook_failure','firestore_failure'])if(health[kind]===true)add(kind,health.incidentReferences?.[kind]||String(Math.floor(now/3600000)));
  return [...new Map(alerts.map(x=>[x.id,x])).values()];
}
export function createOwnerNotifier({ledger,transport,now=Date.now}) {
  return async function notify(alert) {
    if(!KINDS.has(alert?.kind)||alert.id!==(alert.kind==='acceptance_test'?alert.reference:digest([alert.kind,alert.reference]))||
      !/^(?:[a-f0-9]{64}|\d{1,15})$/.test(alert.reference))throw Error('alert_invalid');
    const outbox=seal({kind:'notification_outbox',alertKind:alert.kind,reference:alert.reference,at:now()});
    await ledger.create(alert.id+'_notice',outbox);
    const saved=await ledger.get(alert.id+'_notice');if(!saved||saved.alertKind!==alert.kind)throw Error('notification_outbox_unavailable');
    // Definitive failures can retry at most twice with backoff. Unknown outcomes
    // and claims without outcomes are never retried automatically.
    for(let attempt=0;attempt<3;attempt++){
      const claimId=alert.id+'_notice_claim_'+attempt;
      const previous=attempt?await ledger.get(alert.id+'_notice_outcome_'+(attempt-1)):null;
      if(attempt&&(!previous||previous.state!=='FAILED'||now()<previous.retryAfter))return {state:previous?.state||'UNKNOWN_REVIEW_REQUIRED',attempted:false};
      const claim=seal({kind:'notification_claim',alertId:alert.id,attempt,at:now()},saved.recordHash);
      if(!await ledger.create(claimId,claim)){
        const outcome=await ledger.get(alert.id+'_notice_outcome_'+attempt);
        if(!outcome)return {state:'UNKNOWN_REVIEW_REQUIRED',attempted:false};
        if(outcome.state==='FAILED')continue;
        return {state:outcome.state,attempted:false};
      }
      if((await ledger.get(claimId))?.recordHash!==claim.recordHash)throw Error('notification_claim_unavailable');
      let result;
      try{result=await transport({id:alert.id,kind:alert.kind});}catch{result={state:'UNKNOWN_REVIEW_REQUIRED'};}
      if(!['SUBMITTED_UNVERIFIED','FAILED','UNKNOWN_REVIEW_REQUIRED'].includes(result?.state))result={state:'UNKNOWN_REVIEW_REQUIRED'};
      const classification=['AUTHENTICATION_FAILED','PROVIDER_REJECTED','PROVIDER_ACCEPTED','AMBIGUOUS_PROVIDER_OUTCOME'].includes(result.classification)?result.classification:'UNCLASSIFIED';
      const row=seal({kind:'notification_outcome',alertId:alert.id,attempt,state:result.state,classification,
        retryAfter:now()+60000*2**attempt,at:now()},claim.recordHash);
      try{
        if(!await ledger.create(alert.id+'_notice_outcome_'+attempt,row)||
          (await ledger.get(alert.id+'_notice_outcome_'+attempt))?.recordHash!==row.recordHash)throw Error();
      }catch{return {state:'UNKNOWN_REVIEW_REQUIRED',attempted:true,auditPending:true};}
      return {state:row.state,attempted:true};
    }
    return {state:'FAILED',attempted:false,retriesExhausted:true};
  };
}
const SIGNATURE='Hady Atallah\nThe Smarty Solution LTD\nPhone: +357 99 810 330\ninfo@thesmartysolution.com\nwww.thesmartysolution.com\nConnect · Develop · Invest.';
export function outlookOwnerTransport({env,getToken,fetcher=fetch}) {
  return async({id,kind})=>{
    if(env.TSS_WHATSAPP_OWNER_EMAIL_NOTIFICATIONS!=='approved'||!KINDS.has(kind)||!/^[a-f0-9]{64}$/.test(id))throw Error('owner_mail_disabled');
    const body='WhatsApp operational event: '+kind+'\nReference: '+id+'\nReview: https://www.thesmartysolution.com/admin-login/\n\n'+SIGNATURE;
    let token;
    try{token=await getToken();}catch{return {state:'FAILED',classification:'AUTHENTICATION_FAILED'};}
    const r=await fetcher('https://graph.microsoft.com/v1.0/users/info%40thesmartysolution.com/sendMail',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({message:{subject:'TSS WhatsApp '+kind+' ['+id.slice(0,12)+']',
        body:{contentType:'Text',content:body},toRecipients:[{emailAddress:{address:'info@thesmartysolution.com'}}],
        internetMessageHeaders:[{name:'x-tss-notification-id',value:id}]},saveToSentItems:true})});
    // Graph202 is acceptance, not delivery. Sent/provider readback is a release gate.
    if(r.status===202)return {state:'SUBMITTED_UNVERIFIED',classification:'PROVIDER_ACCEPTED'};
    if([400,401,403,404,422,429].includes(r.status))return {state:'FAILED',classification:'PROVIDER_REJECTED'};
    return {state:'UNKNOWN_REVIEW_REQUIRED',classification:'AMBIGUOUS_PROVIDER_OUTCOME'};
  };
}
