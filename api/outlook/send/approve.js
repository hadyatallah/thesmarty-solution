import {baseHeaders,cors,requireTrustedOrigin,cookies,open,verifyCrmSession,refreshToken,graphMe,assertMailbox,seal,cookie,SESSION_COOKIE} from '../_lib.js';
import {validateMessage,enforceSendPreflight} from '../../../command-center/email-send-policy.js';

const BACKEND='https://script.google.com/macros/s/AKfycbyVmqjxRsbdMoIrqGqETiFbOyOumjY3da_aUbThEn_8LdRN7CZFPDPMNUkWRaGJdHWRsQ/exec';
const PROPOSAL_COOKIE='tss_ms_send_proposal';

async function crmState(session){
 let r=await fetch(BACKEND,{method:'POST',redirect:'manual',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({fn:'getState',args:[session]})});
 if([302,303].includes(r.status)){const u=new URL(r.headers.get('location')||'',BACKEND);if(u.hostname!=='script.googleusercontent.com')throw Error('CRM_STATE_UNAVAILABLE');r=await fetch(u.href);}
 const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw Error('CRM_STATE_UNAVAILABLE');return d.result;
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export default async function handler(req,res){
 baseHeaders(res);cors(req,res);
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 try{
  requireTrustedOrigin(req);
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  await verifyCrmSession(body?.session);

  const proposal=open(cookies(req)[PROPOSAL_COOKIE]);
  if(!proposal||proposal.id!==body?.id||proposal.hash!==body?.hash||proposal.state!=='proposed'||Date.now()>proposal.expiresAt)throw Error('EMAIL_APPROVAL_NOT_APPLICABLE');

  const message=validateMessage(proposal);
  const state=await crmState(body.session);
  const ctx=enforceSendPreflight(state,message,new Date());
  if(ctx.company.id!==proposal.companyId)throw Error('EMAIL_CONTEXT_CHANGED');

  const oauth=open(cookies(req)[SESSION_COOKIE]);
  const token=await refreshToken(oauth.refreshToken);
  const me=await graphMe(token.access_token);
  if(assertMailbox(me)!==proposal.from)throw Error('EMAIL_SENDER_CHANGED');

  const graphHeaders={Authorization:'Bearer '+token.access_token,'Content-Type':'application/json',Prefer:'IdType="ImmutableId"'};
  const draftResp=await fetch('https://graph.microsoft.com/v1.0/me/messages',{method:'POST',headers:graphHeaders,body:JSON.stringify({
   subject:proposal.subject,
   body:{contentType:'Text',content:proposal.text},
   toRecipients:[{emailAddress:{address:proposal.to}}],
   internetMessageHeaders:[{name:'x-tss-action-id',value:proposal.id}]
  })});
  const draft=await draftResp.json().catch(()=>null);
  if(!draftResp.ok||!draft?.id)throw Error('EMAIL_DRAFT_CREATE_FAILED');

  proposal.state='executing';proposal.providerDraftId=draft.id;
  res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:600,path:'/api/outlook/send'}));

  let sendResp;
  try{sendResp=await fetch('https://graph.microsoft.com/v1.0/me/messages/'+encodeURIComponent(draft.id)+'/send',{method:'POST',headers:{Authorization:'Bearer '+token.access_token,Prefer:'IdType="ImmutableId"'}});}
  catch{proposal.state='uncertain';res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:3600,path:'/api/outlook/send'}));throw Error('EMAIL_SEND_UNCERTAIN');}
  if(!sendResp.ok){proposal.state=sendResp.status>=500?'uncertain':'failed';res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:3600,path:'/api/outlook/send'}));throw Error(proposal.state==='uncertain'?'EMAIL_SEND_UNCERTAIN':'EMAIL_SEND_REJECTED');}

  let receipt=null;
  for(let i=0;i<4;i++){
   await sleep(500*(i+1));
   const check=await fetch('https://graph.microsoft.com/v1.0/me/messages/'+encodeURIComponent(draft.id)+'?$select=id,sentDateTime,internetMessageId',{headers:{Authorization:'Bearer '+token.access_token,Prefer:'IdType="ImmutableId"'}});
   if(check.ok){const x=await check.json();if(x.sentDateTime){receipt=x;break;}}
  }
  if(!receipt){proposal.state='uncertain';res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:3600,path:'/api/outlook/send'}));throw Error('EMAIL_SEND_UNCERTAIN');}

  proposal.state='succeeded';proposal.receipt={id:receipt.id,internetMessageId:receipt.internetMessageId||null,sentDateTime:receipt.sentDateTime};
  res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:3600,path:'/api/outlook/send'}));
  console.info(JSON.stringify({component:'outlook-send',actionId:proposal.id,result:'succeeded',companyId:proposal.companyId,providerMessageId:receipt.id,sentDateTime:receipt.sentDateTime}));
  return res.status(200).json({ok:true,status:'succeeded',receipt:proposal.receipt,companyId:proposal.companyId});
 }catch(e){
  const known=['AUTH_REQUIRED','EMAIL_APPROVAL_NOT_APPLICABLE','EMAIL_OUTSIDE_BUSINESS_HOURS','EMAIL_DUPLICATE_RECENT','EMAIL_RECIPIENT_SUPPRESSED','EMAIL_CONTEXT_CHANGED','EMAIL_SENDER_CHANGED','EMAIL_SEND_UNCERTAIN','EMAIL_SEND_REJECTED','EMAIL_DRAFT_CREATE_FAILED'];
  const error=known.includes(e.message)?e.message:'EMAIL_SEND_FAILED';
  return res.status(error==='AUTH_REQUIRED'?401:error==='EMAIL_SEND_UNCERTAIN'?409:400).json({ok:false,error});
 }
}