import {createApprovedSender} from './tssWhatsappSender.mjs';
import {createOwnerNotifier,planOwnerAlerts} from './tssWhatsappNotifications.mjs';
import {digest,seal,validSeal} from './tssWhatsappLedger.mjs';
// Uses real durable storage, but transports are fixed local simulations. No Meta
// or Microsoft credential loader, network transport or arbitrary recipient exists.
export function createAuditAcceptance({env,ledger,now=Date.now}){
 return async({session,runId})=>{
  if(env.VERCEL_ENV!=='preview'||env.TSS_WHATSAPP_AUDIT_ACCEPTANCE!=='approved')throw Object.assign(Error('audit_acceptance_disabled'),{status:423});
  if(session?.email!=='thesmartysolution@gmail.com'||(!Number.isFinite(session.expiresAt)||session.expiresAt<=now())||!session.csrfHash)throw Object.assign(Error('owner_session_required'),{status:401});
  if(!/^[a-f0-9]{32}$/.test(runId||''))throw Object.assign(Error('invalid_test_run'),{status:400});
  const manifestId=digest(['audit-acceptance',runId])+'_acceptance';
  const old=await ledger.get(manifestId);if(old){if(!validSeal(old)||old.kind!=='audit_acceptance_run')throw Error('audit_integrity_failed');return {...old,repeated:true};}
  const references=[];
  const tracked={create:async(id,row)=>{const result=await ledger.create(id,row);if(result)references.push({id,recordHash:row.recordHash});return result;},get:id=>ledger.get(id)};
  const event={key:digest(['synthetic-audit-only',runId]),kind:'message',sender:'15550000000',wabaId:'2882413005471663',phoneNumberId:'1378287792033123',messageId:'wamid.TSS_AUDIT_ONLY_'+runId,timestamp:String(Math.floor(now()/1000))};
  const localEnv={VERCEL_ENV:'preview',TSS_WHATSAPP_REPLY_MODE:'test-approved',TSS_WHATSAPP_TEST_RECIPIENTS:'15550000000',TSS_WHATSAPP_TEST_TRANSMISSION_APPROVED:'true',TSS_WHATSAPP_COST_APPROVED:'true'};
  let transportCalls=0;
  const build=()=>createApprovedSender({env:localEnv,ledger:tracked,loadEvent:async()=>event,now,
   transport:async()=>{transportCalls++;throw Error('simulated_timeout_no_network');}});
  const text='TSS AUDIT ONLY. Never transmitted. '+runId;
  const approval=await build().approve({session,eventKey:event.key,text,explicitApproval:true});
  const args={...approval,session,eventKey:event.key,text};
  const outcomes=await Promise.all([build().send(args),build().send(args)]);
  const retry=await build().send(args);
  if(transportCalls!==1||outcomes.filter(x=>x.attempted).length!==1||retry.attempted!==false||retry.state!=='UNKNOWN_REVIEW_REQUIRED')throw Error('idempotency_acceptance_failed');
  await build().reconcile({session,actionId:approval.actionId,classification:'CONFIRMED_NOT_SENT',providerMessageId:'',evidenceReference:'review:synthetic-audit-'+runId});
  if((await build().send(args)).attempted!==false||transportCalls!==1)throw Error('reconciliation_resend_failed');
  const alert=planOwnerAlerts({events:[{key:event.key,kind:'message',receivedAt:new Date(now()).toISOString()}],now:now()})[0];
  let noticeCalls=0;
  const notify=createOwnerNotifier({ledger:tracked,now,transport:async()=>{noticeCalls++;return {state:'SUBMITTED_UNVERIFIED'};}});
  await Promise.all([notify(alert),notify(alert)]);if(noticeCalls!==1)throw Error('notice_dedupe_failed');
  const check=await build().inspect({session,actionId:approval.actionId});
  if(check.state!=='UNKNOWN_REVIEW_REQUIRED')throw Error('audit_status_failed');
  const unique=[...new Map(references.map(x=>[x.id,x])).values()];
  for(const ref of unique){const row=await ledger.get(ref.id);if(!validSeal(row)||row.recordHash!==ref.recordHash)throw Error('audit_readback_failed');}
  const manifest=seal({kind:'audit_acceptance_run',synthetic:true,runId,syntheticActionId:approval.actionId,syntheticEventKey:event.key,
   at:now(),references:unique,tests:{durableReadback:true,atomicClaim:true,duplicateRejected:true,uncertainManualReview:true,noAutomaticResend:true,notificationOutbox:true,notificationDedupe:true},
   actualWhatsAppTransmissions:0,actualEmailTransmissions:0,simulatedTransportCalls:transportCalls});
  if(!await ledger.create(manifestId,manifest))throw Error('acceptance_manifest_conflict');
  if((await ledger.get(manifestId))?.recordHash!==manifest.recordHash)throw Error('manifest_readback_failed');
  return {...manifest,manifestId,independentCloudShellReadback:'PENDING'};
 };
}
