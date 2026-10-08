import {baseHeaders,open,refreshToken,graphMe,assertMailbox,seal} from '../../api/outlook/_lib.js';
import {verifyBindingCapability,ingestionBindingPayload,initialDeltaUrl,validateDeltaCursor,cursorFolderRef,normalizeDeltaPage} from './_core.js';

export default async function handler(req,res){
 baseHeaders(res);
 let cursorFailure=null; // Sanitized diagnostic only, never the cursor URL/token.
 let diagnosticFolder=null; // Allowlisted folder only; never cursor data.
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  const folder=String(body?.folder||'').toLowerCase(),cursor=body?.cursor||'';
  diagnosticFolder=['inbox','sentitems'].includes(folder)?folder:null;
  let binding;try{binding=open(body?.binding);}catch{throw Error('OUTLOOK_RECONNECT_REQUIRED');}
  verifyBindingCapability(binding,body?.serviceKey);
  let token;try{token=await refreshToken(binding.refreshToken);}catch{throw Error('OUTLOOK_RECONNECT_REQUIRED');}
  let me;try{me=await graphMe(token.access_token);}catch{throw Error('OUTLOOK_RECONNECT_REQUIRED');}
  const mailbox=assertMailbox(me);
  if(mailbox!==binding.mailbox)throw Error('OUTLOOK_RECONNECT_REQUIRED');
  let url;
  try{
   if(cursor){
    const ref=cursorFolderRef(cursor);
    let folderId=null;
    if(ref.toLowerCase()!==folder.toLowerCase()){
     const folderLookup=await fetch('https://graph.microsoft.com/v1.0/me/mailFolders/'+encodeURIComponent(folder),{headers:{Authorization:'Bearer '+token.access_token}});
     if(!folderLookup.ok)throw Error('OUTLOOK_CURSOR_RESET_REQUIRED');
     const folderMeta=await folderLookup.json();
     folderId=typeof folderMeta.id==='string'?folderMeta.id:null;
    }
    url=validateDeltaCursor(cursor,folder,{folderId});
   }else url=initialDeltaUrl(folder,new Date());
  }catch(e){if(e.message==='OUTLOOK_CURSOR_RESET_REQUIRED')cursorFailure='LOCAL_VALIDATION';throw e;}
  const graph=await fetch(url,{headers:{Authorization:'Bearer '+token.access_token,Prefer:'IdType="ImmutableId", odata.maxpagesize=25'}});
  if(graph.status===410){cursorFailure='GRAPH_HTTP_410';throw Error('OUTLOOK_CURSOR_RESET_REQUIRED');}
  if(graph.status===429)throw Error('OUTLOOK_THROTTLED');
  if([401,403].includes(graph.status))throw Error('OUTLOOK_RECONNECT_REQUIRED');
  if(!graph.ok)throw Error('OUTLOOK_PROVIDER_UNAVAILABLE');
  const page=normalizeDeltaPage(await graph.json());
  const nextRefresh=token.refresh_token||binding.refreshToken;
  const rotated=seal(ingestionBindingPayload({refreshToken:nextRefresh,mailbox,serviceKeyHash:binding.serviceKeyHash,connectedAt:binding.connectedAt}));
  return res.status(200).json({ok:true,binding:rotated,...page});
 }catch(e){
  const known=['OUTLOOK_RECONNECT_REQUIRED','OUTLOOK_CURSOR_RESET_REQUIRED','OUTLOOK_THROTTLED','OUTLOOK_FOLDER_INVALID','OUTLOOK_BROKER_UNAUTHORIZED','OUTLOOK_PROVIDER_UNAVAILABLE'];
  const error=known.includes(e.message)?e.message:'OUTLOOK_PROVIDER_UNAVAILABLE';
  const status=error==='OUTLOOK_BROKER_UNAUTHORIZED'?403:error==='OUTLOOK_CURSOR_RESET_REQUIRED'||error==='OUTLOOK_RECONNECT_REQUIRED'?409:error==='OUTLOOK_THROTTLED'?429:400;
  if(error==='OUTLOOK_CURSOR_RESET_REQUIRED' && diagnosticFolder){
   console.warn(JSON.stringify({component:'outlook-sync',event:'cursor-rejected',folder:diagnosticFolder,cause:cursorFailure||'UNSPECIFIED'}));
  }
  return res.status(status).json({ok:false,error:error==='OUTLOOK_BROKER_UNAUTHORIZED'?'OUTLOOK_PROVIDER_UNAVAILABLE':error,...(error==='OUTLOOK_CURSOR_RESET_REQUIRED'?{cursorFailure:cursorFailure||'UNSPECIFIED'}:{})});
 }
}
