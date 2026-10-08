import crypto from 'node:crypto';

export const OUTLOOK_SYNC_FOLDERS = new Set(['inbox','sentitems']);
export const OUTLOOK_BACKFILL_DAYS = 30;
export const OUTLOOK_PAGE_LIMIT = 25;
const GRAPH_ORIGIN='https://graph.microsoft.com';

export function makeServiceKey(){return crypto.randomBytes(32).toString('base64url');}
export function serviceKeyHash(value){return crypto.createHash('sha256').update(String(value||'')).digest('hex');}
export function safeEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
export function ingestionBindingPayload({refreshToken,mailbox,serviceKeyHash:hash,connectedAt}){
 if(typeof refreshToken!=='string'||!refreshToken)throw Error('OUTLOOK_BINDING_INVALID');
 if(typeof mailbox!=='string'||!mailbox)throw Error('OUTLOOK_BINDING_INVALID');
 if(!/^[a-f0-9]{64}$/.test(String(hash||'')))throw Error('OUTLOOK_BINDING_INVALID');
 return {refreshToken,mailbox:mailbox.toLowerCase(),serviceKeyHash:hash,connectedAt:connectedAt||new Date().toISOString(),purpose:'outlook-ingestion',v:2};
}
export function verifyBindingCapability(binding,serviceKey){
 if(!binding||binding.purpose!=='outlook-ingestion'||binding.v!==2||typeof binding.refreshToken!=='string'||!binding.refreshToken||!/^[a-f0-9]{64}$/.test(String(binding.serviceKeyHash||'')))throw Error('OUTLOOK_BINDING_INVALID');
 if(!/^[A-Za-z0-9_-]{43}$/.test(String(serviceKey||''))||!safeEqual(binding.serviceKeyHash,serviceKeyHash(serviceKey)))throw Error('OUTLOOK_BROKER_UNAUTHORIZED');
 return true;
}
export function initialDeltaUrl(folder,now=new Date()){
 if(!OUTLOOK_SYNC_FOLDERS.has(folder))throw Error('OUTLOOK_FOLDER_INVALID');
 const cutoff=new Date(now.getTime()-OUTLOOK_BACKFILL_DAYS*86400000).toISOString();
 const u=new URL(`${GRAPH_ORIGIN}/v1.0/me/mailFolders/${folder}/messages/delta`);
 u.searchParams.set('$select','id,conversationId,from,toRecipients,subject,bodyPreview,receivedDateTime,sentDateTime');
 u.searchParams.set('$filter',`receivedDateTime ge ${cutoff}`);
 u.searchParams.set('$top',String(OUTLOOK_PAGE_LIMIT));
 return u.href;
}
export function cursorFolderRef(cursor){
 let u;try{u=new URL(cursor);}catch{throw Error('OUTLOOK_CURSOR_RESET_REQUIRED');}
 const path=decodeURIComponent(u.pathname);
 const match=path.match(/^\/v1\.0\/me\/mailFolders(?:\/([^/()]+)|\('([^']+)'\))\/messages\/delta$/i);
 if(!match)throw Error('OUTLOOK_CURSOR_RESET_REQUIRED');
 return match[1]||match[2];
}
export function validateDeltaCursor(cursor,folder,{folderId=null}={}){
 if(!OUTLOOK_SYNC_FOLDERS.has(folder))throw Error('OUTLOOK_FOLDER_INVALID');
 if(!cursor)return '';
 if(typeof cursor!=='string'||cursor.length>8000)throw Error('OUTLOOK_CURSOR_RESET_REQUIRED');
 let u;try{u=new URL(cursor);}catch{throw Error('OUTLOOK_CURSOR_RESET_REQUIRED');}
 if(u.origin!==GRAPH_ORIGIN||u.username||u.password||u.port)throw Error('OUTLOOK_CURSOR_RESET_REQUIRED');
 const ref=cursorFolderRef(cursor);
 const wellKnown=ref.toLowerCase()===folder.toLowerCase();
 if(!wellKnown&&(!folderId||ref!==folderId))throw Error('OUTLOOK_CURSOR_RESET_REQUIRED');
 return u.href;
}
export function normalizeDeltaPage(data){
 if(!data||!Array.isArray(data.value)||data.value.length>OUTLOOK_PAGE_LIMIT)throw Error('OUTLOOK_PROVIDER_UNAVAILABLE');
 const next=typeof data['@odata.nextLink']==='string'?data['@odata.nextLink']:'';
 const delta=typeof data['@odata.deltaLink']==='string'?data['@odata.deltaLink']:'';
 if(!!next===!!delta)throw Error('OUTLOOK_PROVIDER_UNAVAILABLE');
 return {messages:data.value,next:next||null,delta:delta||null};
}
