import crypto from 'node:crypto';
import {baseHeaders,cors,requireTrustedOrigin,verifyCrmSession,pkce,authorizeUrl,seal,cookie,FLOW_COOKIE} from '../_lib.js';
export default async function handler(req,res){
 baseHeaders(res);cors(req,res);
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 try{
  requireTrustedOrigin(req);
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  await verifyCrmSession(body?.session);
  const {verifier,challenge}=pkce(),state=crypto.randomBytes(24).toString('base64url');
  const flow=seal({state,verifier,session:body.session,createdAt:Date.now()});
  res.setHeader('Set-Cookie',cookie(FLOW_COOKIE,flow,{maxAge:600,path:'/api/outlook/oauth'}));
  return res.status(200).json({ok:true,url:authorizeUrl({state,challenge})});
 }catch(e){
  const code=['ORIGIN_REQUIRED','ORIGIN_NOT_ALLOWED','AUTH_REQUIRED'].includes(e.message)?401:'OUTLOOK_CONNECT_FAILED';
  return res.status(code===401?401:500).json({ok:false,error:code});
 }
}