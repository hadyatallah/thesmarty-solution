import crypto from 'node:crypto';
import {pdfMetadata,attachmentFields,rejectAttachmentAliases,ATTACHMENT_ERRORS} from '../../../command-center/email-attachment.js';
import {proposalHash,requirePdfAuditSupport} from '../../../command-center/email-attachment-server.js';
import {assertTssSignature} from '../../../command-center/email-signature.js';
import {baseHeaders,cors,requireTrustedOrigin,cookies,open,refreshToken,graphMe,assertMailbox,seal,cookie,SESSION_COOKIE} from '../_lib.js';
import {validateMessage,findRecipientContext,recentDuplicate,assertEmailControls} from '../../../command-center/email-send-policy.js';

const BACKEND='https://script.google.com/macros/s/AKfycbyVmqjxRsbdMoIrqGqETiFbOyOumjY3da_aUbThEn_8LdRN7CZFPDPMNUkWRaGJdHWRsQ/exec';
const PROPOSAL_COOKIE='tss_ms_send_proposal';

async function crmState(session){
 const payload=JSON.stringify({fn:'getState',args:[session]});
 let r=await fetch(BACKEND,{method:'POST',redirect:'manual',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:payload});
 if([302,303].includes(r.status)){const u=new URL(r.headers.get('location')||'',BACKEND);if(u.hostname!=='script.googleusercontent.com')throw Error('CRM_STATE_UNAVAILABLE');r=await fetch(u.href,{redirect:'manual'});}
 const d=await r.json().catch(()=>null);
 if(!r.ok)throw Error('CRM_STATE_UNAVAILABLE');
 if(!d?.ok)throw Error(String(d?.error||'AUTH_REQUIRED').includes('AUTH_REQUIRED')?'AUTH_REQUIRED':'CRM_STATE_UNAVAILABLE');
 return d.result;
}

export default async function handler(req,res){
 baseHeaders(res);cors(req,res);
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 let stage='origin';
 try{
  requireTrustedOrigin(req);
  stage='request';
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  rejectAttachmentAliases(body);
  if(Object.keys(body).some(k=>!['session','message','attachment'].includes(k)))throw Error('EMAIL_ATTACHMENT_INVALID');
  const attachment=pdfMetadata(body.attachment);
  stage='crm-auth';
  stage='outlook-session';
  const raw=cookies(req)[SESSION_COOKIE];
  if(!raw)throw Error('OUTLOOK_RECONNECT_REQUIRED');
  let session;try{session=open(raw);}catch{throw Error('OUTLOOK_RECONNECT_REQUIRED');}
  let token;try{token=await refreshToken(session.refreshToken);}catch{throw Error('OUTLOOK_RECONNECT_REQUIRED');}
  let me;try{me=await graphMe(token.access_token);}catch{throw Error('OUTLOOK_RECONNECT_REQUIRED');}
  const mailbox=assertMailbox(me);
  stage='message-validation';
  const message=validateMessage(body?.message||{});
  assertTssSignature(message.text);
  stage='crm-auth';
  const state=await crmState(body.session);
  stage='controls';
  assertEmailControls(state);
  stage='recipient';
  const ctx=findRecipientContext(state,message.to);
  stage='duplicate-check';
  if(recentDuplicate(state,message,new Date()))throw Error('EMAIL_DUPLICATE_RECENT');
  if(attachment){stage='attachment-audit';await requirePdfAuditSupport(BACKEND,body.session,message.to,ctx.company.id);}
  stage='proposal-build';
  const id=crypto.randomUUID();
  const proposal={id,from:mailbox,to:message.to,subject:message.subject,text:message.text,companyId:ctx.company.id,createdAt:Date.now(),expiresAt:Date.now()+600000,state:'proposed',...(attachment?{attachment}:{})};
  proposal.hash=proposalHash(proposal);
  res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:600,path:'/api/outlook/send'}));
  return res.status(200).json({ok:true,proposal:{id:proposal.id,hash:proposal.hash,from:proposal.from,to:proposal.to,subject:proposal.subject,text:proposal.text,companyId:proposal.companyId,...attachmentFields(proposal),expiresAt:new Date(proposal.expiresAt).toISOString()}});
 }catch(e){
  const known=[...ATTACHMENT_ERRORS,'EMAIL_SIGNATURE_INVALID','EMAIL_RECIPIENT_INVALID','EMAIL_SUBJECT_INVALID','EMAIL_BODY_INVALID','EMAIL_TRANSLATION_INCOMPLETE','EMAIL_RECIPIENT_AMBIGUOUS','EMAIL_RECIPIENT_NOT_IN_CRM','EMAIL_COMPANY_NOT_FOUND','EMAIL_RECIPIENT_SUPPRESSED','EMAIL_DUPLICATE_RECENT','AUTH_REQUIRED','OUTLOOK_RECONNECT_REQUIRED','CRM_STATE_UNAVAILABLE','EMAIL_DIRECT_SEND_DISABLED','EMAIL_APPROVAL_CONTROL_INVALID','EMAIL_MAILBOX_CONTROL_INVALID','EMAIL_OUTREACH_DISABLED'];
  const safe=known.includes(e.message)?e.message:'EMAIL_PROPOSAL_FAILED';
  console.warn(JSON.stringify({component:'outlook-proposal',code:safe,stage,errorType:safe==='EMAIL_PROPOSAL_FAILED'?String(e?.name||'Error'):undefined}));
  return res.status(safe==='AUTH_REQUIRED'?401:400).json({ok:false,error:safe});
 }
}
