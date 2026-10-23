import {digest,seal} from './tssWhatsappLedger.mjs';
import {createOwnerNotifier} from './tssWhatsappNotifications.mjs';
// One owner-authorized Preview email for this acceptance, across deployments.
export const ACCEPTANCE_ID=digest(['tss-owner-mail-acceptance','2026-10-23','info@thesmartysolution.com']);
export const ACCEPTANCE_APPROVAL='Send exactly one Preview test notification to info@thesmartysolution.com';
export function createMailAcceptance({env,ledger,transport,defer,delay,now=Date.now}){
 const gate=()=>{if(env.VERCEL_ENV!=='preview'||env.TSS_WHATSAPP_OWNER_EMAIL_NOTIFICATIONS!=='approved'||env.TSS_WHATSAPP_MAIL_SCOPE_VERIFIED!=='approved')throw Error('mail_acceptance_disabled');};
 const notify=createOwnerNotifier({ledger,transport,now});
 async function status(){gate();const request=await ledger.get(ACCEPTANCE_ID+'_mail_acceptance');const outcome=await ledger.get(ACCEPTANCE_ID+'_notice_outcome_0');return {ok:true,id:ACCEPTANCE_ID,queued:Boolean(request),state:outcome?.state||(request?'PENDING_OR_MANUAL_REVIEW':'NOT_REQUESTED'),attemptedAt:outcome?.at||null};}
 async function start({explicitApproval}){
  gate();if(explicitApproval!==ACCEPTANCE_APPROVAL)throw Object.assign(Error('explicit_mail_approval_required'),{status:400});
  const request=seal({kind:'mail_acceptance_request',recipient:'info@thesmartysolution.com',approvedAt:now(),notBefore:now()+30000,approvalDigest:digest(ACCEPTANCE_APPROVAL)});
  if(!await ledger.create(ACCEPTANCE_ID+'_mail_acceptance',request))return {...await status(),duplicateSuppressed:true};
  if((await ledger.get(ACCEPTANCE_ID+'_mail_acceptance'))?.recordHash!==request.recordHash)throw Error('audit_readback_failed');
  // Bounded acceptance only. Not a scheduler or crash-recovery guarantee.
  defer((async()=>{
   try{await delay(30000);await notify({id:ACCEPTANCE_ID,kind:'acceptance_test',reference:ACCEPTANCE_ID});}
   catch{try{await ledger.create(ACCEPTANCE_ID+'_mail_acceptance_failure',seal({kind:'mail_acceptance_failure',state:'UNKNOWN_REVIEW_REQUIRED',at:now()},request.recordHash));}catch{}}
  })());
  return {ok:true,id:ACCEPTANCE_ID,queued:true,notBefore:request.notBefore,duplicateSuppressed:false};
 }
 return {start,status};
}
