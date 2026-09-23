import crypto from 'node:crypto';
import {baseHeaders,cors,requireTrustedOrigin,cookies,open,verifyCrmSession,refreshToken,graphMe,assertMailbox,seal,cookie,SESSION_COOKIE} from '../_lib.js';
import {validateMessage,findRecipientContext,recentDuplicate,assertEmailControls} from '../../../command-center/email-send-policy.js';

const BACKEND='https://script.google.com/macros/s/AKfycbyVmqjxRsbdMoIrqGqETiFbOyOumjY3da_aUbThEn_8LdRN7CZFPDPMNUkWRaGJdHWRsQ/exec';
const PROPOSAL_COOKIE='tss_ms_send_proposal';

async function crmState(session){
 const payload=JSON.stringify({fn:'getState',args:[session]});
 let r=await fetch(BACKEND,{method:'POST',redirect:'manual',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:payload});
 if([302,303].includes(r.status)){const u=new URL(r.headers.get('location')||'',BACKEND);if(u.hostname!=='script.googleusercontent.com')throw Error('CRM_STATE_UNAVAILABLE');r=await fetch(u.href,{redirect:'manual'});}
 const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw Error('CRM_STATE_UNAVAILABLE');return d.result;
}
export default async function handler(req,res){
 baseHeaders(res);cors(req,res);
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 try{
  requireTrustedOrigin(req);
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  await verifyCrmSession(body?.session);
  const session=open(cookies(req)[SESSION_COOKIE]);const token=await refreshToken(session.refreshToken);const me=await graphMe(token.access_token);const mailbox=assertMailbox(me);
  const message=validateMessage(body?.message||{});
  const state=await crmState(body.session);assertEmailControls(state);const ctx=findRecipientContext(state,message.to);
  if(recentDuplicate(state,message,new Date()))throw Error('EMAIL_DUPLICATE_RECENT');
  const id=crypto.randomUUID(),proposal={id,from:mailbox,to:message.to,subject:message.subject,text:message.text,companyId:ctx.company.id,createdAt:Date.now(),expiresAt:Date.now()+600000,state:'proposed'};
  proposal.hash=crypto.createHash('sha256').update(JSON.stringify({id:proposal.id,from:proposal.from,to:proposal.to,subject:proposal.subject,text:proposal.text,companyId:proposal.companyId})).digest('hex');
  res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:600,path:'/api/outlook/send'}));
  return res.status(200).json({ok:true,proposal:{id:proposal.id,hash:proposal.hash,from:proposal.from,to:proposal.to,subject:proposal.subject,text:proposal.text,companyId:proposal.companyId,expiresAt:new Date(proposal.expiresAt).toISOString()}});
 }catch(e){const safe=['EMAIL_RECIPIENT_INVALID','EMAIL_SUBJECT_INVALID','EMAIL_BODY_INVALID','EMAIL_TRANSLATION_INCOMPLETE','EMAIL_RECIPIENT_AMBIGUOUS','EMAIL_RECIPIENT_NOT_IN_CRM','EMAIL_COMPANY_NOT_FOUND','EMAIL_RECIPIENT_SUPPRESSED','EMAIL_DUPLICATE_RECENT','AUTH_REQUIRED'].includes(e.message)?e.message:'EMAIL_PROPOSAL_FAILED';return res.status(safe==='AUTH_REQUIRED'?401:400).json({ok:false,error:safe});}
}