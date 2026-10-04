import {baseHeaders,cors,requireTrustedOrigin,cookies,open,verifyCrmSession,refreshToken,graphMe,assertMailbox,seal,sessionEnvelope,cookie,SESSION_COOKIE} from '../../api/outlook/_lib.js';
import {crmCall} from './_backend.js';
import {makeServiceKey,serviceKeyHash,ingestionBindingPayload} from './_core.js';

export default async function handler(req,res){
 baseHeaders(res);cors(req,res);
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 let bound=false,sessionToken='';
 try{
  requireTrustedOrigin(req);
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  sessionToken=body?.session;
  await verifyCrmSession(sessionToken);
  const raw=cookies(req)[SESSION_COOKIE];if(!raw)throw Error('OUTLOOK_RECONNECT_REQUIRED');
  let current;try{current=open(raw);}catch{throw Error('OUTLOOK_RECONNECT_REQUIRED');}
  const token=await refreshToken(current.refreshToken),me=await graphMe(token.access_token),mailbox=assertMailbox(me);
  const serviceKey=makeServiceKey(),nextRefresh=token.refresh_token||current.refreshToken;
  const binding=seal(ingestionBindingPayload({refreshToken:nextRefresh,mailbox,serviceKeyHash:serviceKeyHash(serviceKey),connectedAt:current.connectedAt}));
  await crmCall('outlookBindIngestion',[sessionToken,{mailbox,binding,serviceKey}]);bound=true;
  const schedule=await crmCall('outlookInstallSchedule',[sessionToken]);
  if(token.refresh_token)res.setHeader('Set-Cookie',cookie(SESSION_COOKIE,sessionEnvelope(token.refresh_token,mailbox),{maxAge:2592000,path:'/api/outlook'}));
  return res.status(200).json({ok:true,bound:true,enabled:schedule?.enabled===true,mailbox});
 }catch(e){
  if(bound&&sessionToken){try{await crmCall('outlookDisconnectIngestion',[sessionToken]);}catch{}}
  const known=['AUTH_REQUIRED','OUTLOOK_RECONNECT_REQUIRED','OUTLOOK_SYNC_BUSY','OUTLOOK_NOT_BOUND','CRM_AUTH_UNAVAILABLE'];
  const error=known.includes(e.message)?e.message:'OUTLOOK_INGESTION_ENABLE_FAILED';
  return res.status(error==='AUTH_REQUIRED'?401:error==='OUTLOOK_RECONNECT_REQUIRED'?409:400).json({ok:false,error});
 }
}
