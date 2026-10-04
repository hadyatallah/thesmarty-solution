import {baseHeaders,cors,requireTrustedOrigin,verifyCrmSession} from '../../api/outlook/_lib.js';
import {crmCall} from './_backend.js';
export default async function handler(req,res){
 baseHeaders(res);cors(req,res);
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 try{requireTrustedOrigin(req);const body=typeof req.body==='string'?JSON.parse(req.body):req.body;await verifyCrmSession(body?.session);const state=await crmCall('outlookSyncState',[body.session]);return res.status(200).json({ok:true,...state});}
 catch(e){const error=e.message==='AUTH_REQUIRED'?'AUTH_REQUIRED':'OUTLOOK_SYNC_STATE_UNAVAILABLE';return res.status(error==='AUTH_REQUIRED'?401:400).json({ok:false,error});}
}
