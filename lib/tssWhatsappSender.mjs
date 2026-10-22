import {randomBytes,timingSafeEqual} from 'node:crypto';
import {digest,seal,validSeal} from './tssWhatsappLedger.mjs';
import {prepareTestReply} from './tssWhatsappOperations.mjs';
const OWNER='thesmartysolution@gmail.com';
function deny(code,status=403){throw Object.assign(Error(code),{status});}
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function mode(env){if(env.VERCEL_ENV!=='preview'||env.TSS_WHATSAPP_REPLY_MODE!=='test-approved')deny('sender_disabled',423);}
function owner(session,now){if(session?.email!==OWNER||!Number.isFinite(session.expiresAt)||session.expiresAt<=now||!session.csrfHash)deny('owner_session_required',401);}
function draft(record,text,env,now){
  const result=prepareTestReply(record,{action:'prepare-test-reply',eventKey:record?.key,text},{...env,TSS_WHATSAPP_REPLY_MODE:'dry-run'});
  const timestamp=Number(record.timestamp)*1000;
  if(!Number.isFinite(timestamp)||timestamp>now+60000||now-timestamp>=24*3600000)deny('fresh_inbound_window_required');
  return result;
}
// No templates, production numbers or arbitrary recipients can use this sender.
// All provider requests are test-only and require a separate cost/transmission gate.
export function createApprovedSender({env,ledger,loadEvent,transport,now=Date.now}) {
  return {
    async inspect({session,actionId}) {
      mode(env);owner(session,now());if(!/^[a-f0-9]{64}$/.test(actionId||''))deny('action_reference_invalid');
      const claim=await ledger.get(actionId+'_claim'),outcome=await ledger.get(actionId+'_outcome');
      if(!claim)return {ok:true,actionId,state:'NO_DISPATCH_CLAIM',sendAllowed:false};
      const approval=await ledger.get(claim.approvalId+'_approval');
      if(!validSeal(claim)||!validSeal(approval)||claim.previousHash!==approval.recordHash||
        (outcome&&(!validSeal(outcome)||outcome.previousHash!==claim.recordHash)))deny('audit_integrity_failed',503);
      return {ok:true,actionId,eventKey:claim.eventKey,state:outcome?.state||'UNKNOWN_REVIEW_REQUIRED',
        approvedAt:approval.approvedAt,attemptedAt:claim.at,providerMessageId:outcome?.providerMessageId||'',sendAllowed:false};
    },
    async approve({session,eventKey,text,explicitApproval}) {
      mode(env);owner(session,now());if(explicitApproval!==true)deny('explicit_owner_approval_required');
      const record=await loadEvent(eventKey);if(record?.key!==eventKey)deny('event_reference_invalid');
      const prepared=draft(record,text,env,now());
      const approvalToken=randomBytes(32).toString('base64url');
      const approvalId=digest([randomBytes(32).toString('hex'),prepared.approvalDigest]);
      const actionId=digest(['test-reply',eventKey,prepared.approvalDigest]);
      const row=seal({kind:'owner_approval',approvalId,actionId,eventKey,digest:prepared.approvalDigest,
        recipientHash:digest(record.sender),wabaId:record.wabaId,phoneNumberId:record.phoneNumberId,
        owner:OWNER,sessionHash:digest(session.csrfHash),tokenHash:digest(approvalToken),
        approvedAt:now(),expiresAt:Math.min(now()+300000,session.expiresAt)});
      if(!await ledger.create(approvalId+'_approval',row))deny('approval_conflict',409);
      const saved=await ledger.get(approvalId+'_approval');
      if(saved?.recordHash!==row.recordHash)deny('approval_readback_failed',503);
      return {ok:true,sent:false,approvalId,approvalToken,actionId,expiresAt:row.expiresAt,digest:row.digest};
    },
    async send({session,approvalId,approvalToken,eventKey,text}) {
      mode(env);owner(session,now());
      if(env.TSS_WHATSAPP_TEST_TRANSMISSION_APPROVED!=='true'||env.TSS_WHATSAPP_COST_APPROVED!=='true')deny('test_transmission_not_authorized',423);
      if(!/^[a-f0-9]{64}$/.test(approvalId||'')||typeof approvalToken!=='string'||approvalToken.length!==43)deny('approval_invalid');
      const approval=await ledger.get(approvalId+'_approval');
      if(!validSeal(approval)||approval.kind!=='owner_approval'||approval.owner!==OWNER||
        approval.eventKey!==eventKey||approval.expiresAt<=now()||
        approval.sessionHash!==digest(session.csrfHash)||!equal(approval.tokenHash,digest(approvalToken)))deny('approval_invalid');
      const record=await loadEvent(eventKey);if(record?.key!==eventKey)deny('event_reference_invalid');
      const prepared=draft(record,text,env,now());
      if(prepared.approvalDigest!==approval.digest||digest(record.sender)!==approval.recipientHash)deny('approved_message_changed');
      // Atomic create is the durable dispatch fence. An existing claim is never
      // reclaimed, even after expiry, because a provider attempt may have occurred.
      const claim=seal({kind:'dispatch_claim',actionId:approval.actionId,approvalId,eventKey,
        digest:approval.digest,state:'DISPATCHING',at:now()},approval.recordHash);
      if(!await ledger.create(approval.actionId+'_claim',claim)) {
        const outcome=await ledger.get(approval.actionId+'_outcome');
        return {ok:true,attempted:false,state:outcome?.state||'UNKNOWN_REVIEW_REQUIRED',actionId:approval.actionId};
      }
      // Readback before transport prevents proceeding after ambiguous storage.
      if((await ledger.get(approval.actionId+'_claim'))?.recordHash!==claim.recordHash)deny('claim_readback_failed',503);
      let outcome;
      try{outcome=await transport(prepared.payload,record.phoneNumberId);}catch{outcome={state:'UNKNOWN_REVIEW_REQUIRED',category:'transport_uncertain'};}
      if(!['SUBMITTED','FAILED','UNKNOWN_REVIEW_REQUIRED'].includes(outcome?.state))outcome={state:'UNKNOWN_REVIEW_REQUIRED',category:'response_unclassified'};
      const row=seal({kind:'provider_outcome',actionId:approval.actionId,state:outcome.state,
        providerMessageId:outcome.providerMessageId||'',category:outcome.category||'',at:now()},claim.recordHash);
      try {
        if(!await ledger.create(approval.actionId+'_outcome',row)||
          (await ledger.get(approval.actionId+'_outcome'))?.recordHash!==row.recordHash)throw Error();
      }catch{return {ok:false,attempted:true,state:'UNKNOWN_REVIEW_REQUIRED',actionId:approval.actionId,auditPending:true};}
      return {ok:outcome.state==='SUBMITTED',attempted:true,state:outcome.state,actionId:approval.actionId,
        providerMessageId:row.providerMessageId,delivered:false};
    },
    async reconcile({session,actionId,classification,evidenceReference,providerMessageId=''}) {
      mode(env);owner(session,now());
      if(!/^[a-f0-9]{64}$/.test(actionId||'')||!['CONFIRMED_SUBMITTED','CONFIRMED_NOT_SENT','UNRESOLVED'].includes(classification)||
        typeof evidenceReference!=='string'||!/^review:[a-zA-Z0-9_-]{8,100}$/.test(evidenceReference)||
        (providerMessageId!==''&&!/^wamid\.[a-zA-Z0-9_+=\/-]{1,250}$/.test(providerMessageId)))deny('reconciliation_invalid');
      const claim=await ledger.get(actionId+'_claim');if(!validSeal(claim))deny('dispatch_claim_required');
      const row=seal({kind:'owner_reconciliation',actionId,classification,evidenceReference,
        providerMessageId,owner:OWNER,at:now()},claim.recordHash);
      if(!await ledger.create(actionId+'_review_'+digest(evidenceReference).slice(0,20),row))deny('review_already_recorded',409);
      // Reconciliation never deletes/reopens the claim or automatically resends.
      return {ok:true,sendAllowed:false,classification};
    },
    async recordStatus({session,actionId,eventKey}) {
      mode(env);owner(session,now());
      if(!/^[a-f0-9]{64}$/.test(actionId||'')||!/^[a-f0-9]{64}$/.test(eventKey||''))deny('status_reference_invalid');
      const claim=await ledger.get(actionId+'_claim'),outcome=await ledger.get(actionId+'_outcome');
      if(!validSeal(claim)||!validSeal(outcome)||outcome.state!=='SUBMITTED'||outcome.previousHash!==claim.recordHash)deny('submission_required');
      const approval=await ledger.get(claim.approvalId+'_approval'),event=await loadEvent(eventKey);
      if(!validSeal(approval)||claim.previousHash!==approval.recordHash||event?.kind!=='status'||
        event.wabaId!=='2882413005471663'||event.phoneNumberId!=='1378287792033123'||
        event.messageId!==outcome.providerMessageId||digest(event.sender)!==approval.recipientHash||
        !['sent','delivered','read','failed'].includes(event.type))deny('status_not_correlated');
      const row=seal({kind:'delivery_observation',actionId,eventKey,status:event.type,
        providerTimestamp:event.timestamp,recordedAt:now()},outcome.recordHash);
      const created=await ledger.create(actionId+'_status_'+eventKey.slice(0,40),row);
      return {ok:true,created,observedStatus:event.type,observationOnly:true};
    }
  };
}
export function metaTestTransport({env,getToken,fetcher=fetch}) {
  return async(payload,phoneId)=>{
    mode(env);
    if(env.TSS_WHATSAPP_TEST_TRANSMISSION_APPROVED!=='true'||env.TSS_WHATSAPP_COST_APPROVED!=='true'||phoneId!=='1378287792033123'||payload.to==='35799810330')deny('test_transmission_not_authorized',423);
    if(!/^v\d{2}\.0$/.test(env.TSS_WHATSAPP_GRAPH_VERSION||''))deny('reviewed_graph_version_required',423);
    // Resolving the token happens before the provider attempt. Token failures
    // still consume the claim conservatively; they never trigger automatic retry.
    const token=await getToken();
    const r=await fetcher('https://graph.facebook.com/'+env.TSS_WHATSAPP_GRAPH_VERSION+'/'+phoneId+'/messages',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(payload)});
    const data=await r.json().catch(()=>null);
    if(r.ok&&typeof data?.messages?.[0]?.id==='string'&&/^wamid\.[a-zA-Z0-9_+=\/-]{1,250}$/.test(data.messages[0].id))return {state:'SUBMITTED',providerMessageId:data.messages[0].id};
    if(r.status>=400&&r.status<500&&data?.error&&Number.isInteger(data.error.code))return {state:'FAILED',category:'meta_rejected_'+data.error.code};
    return {state:'UNKNOWN_REVIEW_REQUIRED',category:'meta_response_uncertain'};
  };
}
