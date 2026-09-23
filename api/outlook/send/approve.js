import {baseHeaders,cors,requireTrustedOrigin,cookies,open,verifyCrmSession,refreshToken,graphMe,assertMailbox,seal,cookie,SESSION_COOKIE} from '../_lib.js';
import {validateMessage,enforceSendPreflight,assertEmailControls} from '../../../command-center/email-send-policy.js';

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
  assertEmailControls(state);
  const ctx=enforceSendPreflight(state,message,new Date());
  if(ctx.company.id!==proposal.companyId)throw Error('EMAIL_CONTEXT_CHANGED');

  const oauth=open(cookies(req)[SESSION_COOKIE]);
  const token=await refreshToken(oauth.refreshToken);
  const me=await graphMe(token.access_token);
  if(assertMailbox(me)!==proposal.from)throw Error('EMAIL_SENDER_CHANGED');

  const graphHeaders={Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'};
  proposal.state='executing';
  res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:600,path:'/api/outlook/send'}));

  const acceptedAt=new Date().toISOString();
  let sendResp;
  try{
   sendResp=await fetch('https://graph.microsoft.com/v1.0/me/sendMail',{
    method:'POST',
    headers:graphHeaders,
    body:JSON.stringify({
     message:{
      subject:proposal.subject,
      body:{contentType:'Text',content:proposal.text},
      toRecipients:[{emailAddress:{address:proposal.to}}],
      internetMessageHeaders:[{name:'x-tss-action-id',value:proposal.id}]
     },
     saveToSentItems:true
    })
   });
  }catch{
   proposal.state='uncertain';
   res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:3600,path:'/api/outlook/send'}));
   throw Error('EMAIL_SEND_UNCERTAIN');
  }

  if(sendResp.status!==202){
   proposal.state=sendResp.status>=500?'uncertain':'failed';
   res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:3600,path:'/api/outlook/send'}));
   throw Error(proposal.state==='uncertain'?'EMAIL_SEND_UNCERTAIN':'EMAIL_SEND_REJECTED');
  }

  const providerRequestId=sendResp.headers.get('request-id')||sendResp.headers.get('client-request-id')||null;
  let receipt={provider:'Microsoft Graph',requestId:providerRequestId,acceptedAt,sentDateTime:null,id:null,internetMessageId:null,reconciled:false};

  for(let i=0;i<4;i++){
   await sleep(700*(i+1));
   const url="https://graph.microsoft.com/v1.0/me/mailFolders('SentItems')/messages?$select=id,subject,sentDateTime,internetMessageId,toRecipients,bodyPreview&$orderby=sentDateTime%20desc&$top=20";
   const check=await fetch(url,{headers:{Authorization:'Bearer '+token.access_token,Prefer:'IdType="ImmutableId"'}});
   if(!check.ok)continue;
   const data=await check.json().catch(()=>({value:[]}));
   const minTime=Date.parse(acceptedAt)-120000;
   const found=(data.value||[]).find(m=>{
    const recipient=(m.toRecipients||[]).some(x=>String(x.emailAddress?.address||'').toLowerCase()===String(proposal.to).toLowerCase());
    const recent=Date.parse(m.sentDateTime||0)>=minTime;
    const sameSubject=String(m.subject||'')===String(proposal.subject);
    const sameBody=String(m.bodyPreview||'').trim().startsWith(String(proposal.text||'').trim().slice(0,80));
    return recipient&&recent&&sameSubject&&sameBody;
   });
   if(found){receipt={...receipt,id:found.id,internetMessageId:found.internetMessageId||null,sentDateTime:found.sentDateTime||acceptedAt,reconciled:true};break;}
  }

  proposal.state=receipt.reconciled?'succeeded':'accepted';
  proposal.receipt=receipt;
  res.setHeader('Set-Cookie',cookie(PROPOSAL_COOKIE,seal(proposal),{maxAge:3600,path:'/api/outlook/send'}));
  console.info(JSON.stringify({component:'outlook-send',actionId:proposal.id,result:proposal.state,companyId:proposal.companyId,providerRequestId,sentDateTime:receipt.sentDateTime,reconciled:receipt.reconciled}));
  return res.status(200).json({ok:true,status:proposal.state,receipt,companyId:proposal.companyId});
 }catch(e){
  const known=['AUTH_REQUIRED','EMAIL_APPROVAL_NOT_APPLICABLE','EMAIL_OUTSIDE_BUSINESS_HOURS','EMAIL_DUPLICATE_RECENT','EMAIL_RECIPIENT_SUPPRESSED','EMAIL_CONTEXT_CHANGED','EMAIL_SENDER_CHANGED','EMAIL_SEND_UNCERTAIN','EMAIL_SEND_REJECTED'];
  const error=known.includes(e.message)?e.message:'EMAIL_SEND_FAILED';
  return res.status(error==='AUTH_REQUIRED'?401:error==='EMAIL_SEND_UNCERTAIN'?409:400).json({ok:false,error});
 }
}