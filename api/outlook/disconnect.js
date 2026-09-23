import {baseHeaders,cors,requireTrustedOrigin,verifyCrmSession,clearCookie,SESSION_COOKIE} from './_lib.js';
export default async function handler(req,res){
 baseHeaders(res);cors(req,res);
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 try{requireTrustedOrigin(req);const body=typeof req.body==='string'?JSON.parse(req.body):req.body;await verifyCrmSession(body?.session);res.setHeader('Set-Cookie',clearCookie(SESSION_COOKIE,'/api/outlook'));return res.status(200).json({ok:true,connected:false});}
 catch(e){return res.status(e.message==='AUTH_REQUIRED'?401:403).json({ok:false,error:e.message==='AUTH_REQUIRED'?'AUTH_REQUIRED':'OUTLOOK_DISCONNECT_FAILED'});}
}