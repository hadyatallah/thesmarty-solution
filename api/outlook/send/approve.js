import {attachmentFields,rejectAttachmentAliases,ATTACHMENT_ERRORS,enforcePdfQaWindow} from '../../../command-center/email-attachment.js';
import {proposalHash,sendFingerprint,validatePdfContent,hasActionHeader,verifySentPdf,requirePdfAuditSupport} from '../../../command-center/email-attachment-server.js';
import {assertTssSignature} from '../../../command-center/email-signature.js';
import {baseHeaders,cors,requireTrustedOrigin,cookies,open,refreshToken,graphMe,assertMailbox,seal,cookie,SESSION_COOKIE} from '../_lib.js';
import {validateMessage,enforceSendPreflight,assertEmailControls} from '../../../command-center/email-send-policy.js';

const BACKEND='https://script.google.com/macros/s/AKfycbyVmqjxRsbdMoIrqGqETiFbOyOumjY3da_aUbThEn_8LdRN7CZFPDPMNUkWRaGJdHWRsQ/exec';
const PROPOSAL_COOKIE='tss_ms_send_proposal';

async function crmCall(fn,args){
 let r=await fetch(BACKEND,{method:'POST',redirect:'manual',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({fn,args})});
 if([302,303].includes(r.status)){const u=new URL(r.headers.get('location')||'',BACKEND);if(u.hostname!=='script.googleusercontent.com'||u.protocol!=='https:'||u.username||u.password||u.port)throw Error('CRM_STATE_UNAVAILABLE');r=await fetch(u.href,{redirect:'manual'});}
 const d=await r.json().catch(()=>null);if(!r.ok)throw Error('CRM_STATE_UNAVAILABLE');if(!d?.ok)throw Error(String(d?.error||'AUTH_REQUIRED').includes('AUTH_REQUIRED')?'AUTH_REQUIRED':String(d?.error||'CRM_STATE_UNAVAILABLE'));return d.result;
}
const crmState=session=>crmCall('getState',[session]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fingerprint=sendFingerprint;

export default async function handler(req,res){
 baseHeaders(res);cors(req,res);
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 let stage='origin',proposal=null,sessionToken='';
 try{
  requireTrustedOrigin(req);
  stage='request';const body=typeof req.body==='string'?JSON.parse(req.body):req.body;sessionToken=body?.session;
  rejectAttachmentAliases(body);
  if(Object.keys(body).some(k=>!['session','id','hash','attachment'].includes(k)))throw Error('EMAIL_APPROVAL_NOT_APPLICABLE');
  stage='proposal-cookie';proposal=open(cookies(req)[PROPOSAL_COOKIE]);
  if(!proposal||proposal.id!==body?.id||proposal.hash!==body?.hash||proposal.state!=='proposed'||Date.now()>proposal.expiresAt||proposal.hash!==proposalHash(proposal))throw Error('EMAIL_APPROVAL_NOT_APPLICABLE');

  stage='message-validation';const message=validateMessage(proposal);
  assertTssSignature(message.text);
  stage='attachment-validation';const graphAttachment=validatePdfContent(proposal.attachment,body.attachment);
  stage='crm-auth';const state=await crmState(sessionToken);
  stage='controls';assertEmailControls(state);
  stage='preflight';const ctx=enforceSendPreflight(state,message,new Date());
  if(ctx.company.id!==proposal.companyId)throw Error('EMAIL_CONTEXT_CHANGED');
  enforcePdfQaWindow(proposal,new Date());
  if(graphAttachment){stage='attachment-audit';await requirePdfAuditSupport(BACKEND,sessionToken,proposal.to,proposal.companyId);}

  stage='outlook-session';const oauth=open(cookies(req)[SESSION_COOKIE]);
  stage='refresh-token';const token=await refreshToken(oauth.refreshToken);
  stage='graph-profile';const me=await graphMe(token.access_token);
  if(assertMailbox(me)!==proposal.from)throw Error('EMAIL_SENDER_CHANGED');

  stage='durable-claim';
  const claimInput={id:proposal.id,hash:proposal.hash,fingerprint:fingerprint(proposal),from:proposal.from,to:proposal.to,subject:proposal.subject,companyId:proposal.companyId,expiresAt:proposal.expiresAt,...attachmentFields(proposal)};
  const claim=await crmCall('outlookClaimSend',[sessionToken,claimInput]);
  if(!claim?.claimed){
   const prior=await crmCall('outlookSendState',[sessionToken,proposal.id]);
   if(prior&&['succeeded','accepted'].includes(prior.status))return res.status(200).json({ok:true,status:prior.status,receipt:prior.receipt||null,companyId:proposal.companyId,replayed:true});
   if(prior&&['dispatch-claimed','uncertain'].includes(prior.status))throw Error('EMAIL_SEND_UNCERTAIN');
   throw Error('EMAIL_DUPLICATE_RECENT');
  }

  if(graphAttachment&&(claim.attachmentAudited!==true||claim.attachmentSha256!==proposal.attachment.sha256)){
   try{await crmCall('outlookRecordSendOutcome',[sessionToken,proposal.id,proposal.hash,{status:'failed',code:'ATTACHMENT_AUDIT_NOT_BOUND'}]);}catch{}
   throw Error('EMAIL_ATTACHMENT_AUDIT_UNAVAILABLE');
  }

  const graphHeaders={Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'};
  proposal.state='executing';
  res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:600,path:'/api/outlook/send'}));

  const acceptedAt=new Date().toISOString();
  stage='graph-send';
  let sendResp;
  try{
   sendResp=await fetch('https://graph.microsoft.com/v1.0/me/sendMail',{
    method:'POST',headers:graphHeaders,
    body:JSON.stringify({message:{subject:proposal.subject,body:{contentType:'Text',content:proposal.text},toRecipients:[{emailAddress:{address:proposal.to}}],internetMessageHeaders:[{name:'x-tss-action-id',value:proposal.id}],...(graphAttachment?{attachments:[graphAttachment]}:{})},saveToSentItems:true})
   });
  }catch{
   try{await crmCall('outlookRecordSendOutcome',[sessionToken,proposal.id,proposal.hash,{status:'uncertain',code:'GRAPH_TRANSPORT'}]);}catch{}
   proposal.state='uncertain';res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:3600,path:'/api/outlook/send'}));throw Error('EMAIL_SEND_UNCERTAIN');
  }

  if(sendResp.status!==202){
   const uncertain=sendResp.status>=500;
   console.warn(JSON.stringify({component:'outlook-send',stage:'graph-send',status:sendResp.status}));
   try{await crmCall('outlookRecordSendOutcome',[sessionToken,proposal.id,proposal.hash,{status:uncertain?'uncertain':'failed',code:'GRAPH_HTTP_'+sendResp.status}]);}catch{}
   proposal.state=uncertain?'uncertain':'failed';res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:3600,path:'/api/outlook/send'}));throw Error(uncertain?'EMAIL_SEND_UNCERTAIN':'EMAIL_SEND_REJECTED');
  }

  const providerRequestId=sendResp.headers.get('request-id')||sendResp.headers.get('client-request-id')||null;
  let receipt={provider:'Microsoft Graph',requestId:providerRequestId,acceptedAt,sentDateTime:null,id:null,internetMessageId:null,reconciled:false,...attachmentFields(proposal)};
  for(let i=0;i<4;i++){
   await sleep(700*(i+1));
   const url="https://graph.microsoft.com/v1.0/me/mailFolders('SentItems')/messages?$select=id,subject,sentDateTime,internetMessageId,toRecipients,bodyPreview"+(graphAttachment?',hasAttachments,internetMessageHeaders':'')+"&$orderby=sentDateTime%20desc&$top=20";
   const check=await fetch(url,{headers:{Authorization:'Bearer '+token.access_token,Prefer:'IdType="ImmutableId"'}});
   if(!check.ok)continue;
   const data=await check.json().catch(()=>({value:[]})),minTime=Date.parse(acceptedAt)-120000;
   const found=(data.value||[]).find(m=>{
    const recipient=(m.toRecipients||[]).some(x=>String(x.emailAddress?.address||'').toLowerCase()===String(proposal.to).toLowerCase());
    return (!graphAttachment||hasActionHeader(m,proposal.id))&&recipient&&Date.parse(m.sentDateTime||0)>=minTime&&String(m.subject||'')===String(proposal.subject)&&String(m.bodyPreview||'').trim().startsWith(String(proposal.text||'').trim().slice(0,80));
   });
   if(found){receipt={...receipt,id:found.id,internetMessageId:found.internetMessageId||null,sentDateTime:found.sentDateTime||acceptedAt,reconciled:true};if(graphAttachment)receipt.attachmentVerification=await verifySentPdf(found,proposal.attachment,token.access_token);break;}
  }

  stage='crm-receipt';
  try{const recorded=await crmCall('outlookRecordReceipt',[sessionToken,proposal.id,proposal.hash,receipt]);if(graphAttachment&&(recorded?.attachmentRecorded!==true||recorded?.attachmentSha256!==proposal.attachment.sha256))throw Error('EMAIL_ATTACHMENT_AUDIT_UNAVAILABLE');}
  catch{
   proposal.state='uncertain';proposal.receipt=receipt;res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:3600,path:'/api/outlook/send'}));throw Error('EMAIL_SEND_UNCERTAIN');
  }
  proposal.state=receipt.reconciled&&(!graphAttachment||receipt.attachmentVerification?.level==='metadata')?'succeeded':'accepted';proposal.receipt=receipt;
  res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:3600,path:'/api/outlook/send'}));
  console.info(JSON.stringify({component:'outlook-send',actionId:proposal.id,result:proposal.state,companyId:proposal.companyId,providerRequestId,sentDateTime:receipt.sentDateTime,reconciled:receipt.reconciled}));
  return res.status(200).json({ok:true,status:proposal.state,receipt,companyId:proposal.companyId});
 }catch(e){
  const known=[...ATTACHMENT_ERRORS,'EMAIL_SIGNATURE_INVALID','AUTH_REQUIRED','EMAIL_APPROVAL_NOT_APPLICABLE','EMAIL_OUTSIDE_BUSINESS_HOURS','EMAIL_DUPLICATE_RECENT','EMAIL_RECIPIENT_SUPPRESSED','EMAIL_CONTEXT_CHANGED','EMAIL_SENDER_CHANGED','EMAIL_SEND_UNCERTAIN','EMAIL_SEND_REJECTED','OUTLOOK_RECONNECT_REQUIRED','CRM_STATE_UNAVAILABLE'];
  const error=known.includes(e.message)?e.message:'EMAIL_SEND_FAILED';
  console.warn(JSON.stringify({component:'outlook-send',stage,code:error,errorType:error==='EMAIL_SEND_FAILED'?String(e?.name||'Error'):undefined}));
  return res.status(error==='AUTH_REQUIRED'?401:error==='EMAIL_SEND_UNCERTAIN'?409:400).json({ok:false,error});
 }
}
