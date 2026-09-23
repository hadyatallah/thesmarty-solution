import {baseHeaders,cookies,open,verifyCrmSession,exchangeCode,graphMe,assertMailbox,sessionEnvelope,cookie,clearCookie,FLOW_COOKIE,SESSION_COOKIE} from '../_lib.js';
export default async function handler(req,res){
 baseHeaders(res);
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).send('Method not allowed');}
 const fail=code=>{res.setHeader('Set-Cookie',clearCookie(FLOW_COOKIE,'/api/outlook/oauth'));return res.redirect(302,'https://www.thesmartysolution.com/crm/?view=Assistant&outlook='+encodeURIComponent(code));};
 try{
  if(req.query?.error)return fail('denied');
  const flow=open(cookies(req)[FLOW_COOKIE]);
  if(!flow?.state||flow.state!==req.query?.state||!flow.verifier||!flow.session||Date.now()-Number(flow.createdAt)>600000)return fail('invalid');
  await verifyCrmSession(flow.session);
  const token=await exchangeCode(String(req.query?.code||''),flow.verifier);
  const me=await graphMe(token.access_token),mailbox=assertMailbox(me);
  if(!token.refresh_token)throw Error('MICROSOFT_REFRESH_TOKEN_MISSING');
  res.setHeader('Set-Cookie',[
   clearCookie(FLOW_COOKIE,'/api/outlook/oauth'),
   cookie(SESSION_COOKIE,sessionEnvelope(token.refresh_token,mailbox),{maxAge:2592000,path:'/api/outlook'})
  ]);
  return res.redirect(302,'https://www.thesmartysolution.com/crm/?view=Assistant&outlook=connected');
 }catch(e){console.warn(JSON.stringify({component:'outlook-oauth',stage:'callback',code:e.message}));return fail('failed');}
}