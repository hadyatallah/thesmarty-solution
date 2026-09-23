import {baseHeaders,requireSameOrigin,cookies,open,verifyCrmSession,refreshToken,graphMe,assertMailbox,sessionEnvelope,cookie,clearCookie,SESSION_COOKIE} from './_lib.js';
export default async function handler(req,res){
 baseHeaders(res);
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 try{
  requireSameOrigin(req);
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  await verifyCrmSession(body?.session);
  const raw=cookies(req)[SESSION_COOKIE];if(!raw)return res.status(200).json({ok:true,connected:false});
  const s=open(raw),token=await refreshToken(s.refreshToken),me=await graphMe(token.access_token),mailbox=assertMailbox(me);
  if(token.refresh_token)res.setHeader('Set-Cookie',cookie(SESSION_COOKIE,sessionEnvelope(token.refresh_token,mailbox),{maxAge:2592000,path:'/api/outlook'}));
  return res.status(200).json({ok:true,connected:true,mailbox,displayName:me.displayName||null,connectedAt:s.connectedAt||null});
 }catch(e){
  if(['OUTLOOK_SESSION_INVALID','MICROSOFT_TOKEN_EXCHANGE_FAILED','MICROSOFT_PROFILE_FAILED','MICROSOFT_MAILBOX_MISMATCH'].includes(e.message))res.setHeader('Set-Cookie',clearCookie(SESSION_COOKIE,'/api/outlook'));
  return res.status(e.message==='AUTH_REQUIRED'?401:200).json({ok:true,connected:false,error:e.message==='AUTH_REQUIRED'?'AUTH_REQUIRED':'OUTLOOK_RECONNECT_REQUIRED'});
 }
}