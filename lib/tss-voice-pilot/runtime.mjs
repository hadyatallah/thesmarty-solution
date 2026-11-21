import {createSessionRoute} from "./session-route.mjs";
import {createBlobPilotPermit} from "./blob-permit.mjs";
export const ORIGIN="https://www.thesmartysolution.com";
export const ROUTE="/api/tss-receptionist-pilot";
export const MODEL="gpt-live-1.1";
export const VOICE="voice_6b00891c5a1c8191a895b";
export const BLOB_STORE="store_bHL2AOyuvDvPlbur";
const has=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const MAX_WINDOW_MS=5*60*1000;
function strictUtcMs(value){
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))return NaN;
 const ms=Date.parse(value);
 if(!Number.isSafeInteger(ms))return NaN;
 return new Date(ms).toISOString().replace(/\.000Z$/,"Z")===value.replace(/\.000Z$/,"Z")?ms:NaN;
}
function makeActivationWindow(env,now){
 const start=strictUtcMs(env.TSS_PUBLIC_PILOT_OPEN_UTC);
 const end=strictUtcMs(env.TSS_PUBLIC_PILOT_EXPIRES_UTC);
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start||end-start>MAX_WINDOW_MS)
   return ()=>false;
 return ()=>{const t=now();return Number.isSafeInteger(t)&&t>=start&&t<end;};
}
function pickPilotKey(env){
 // A configured dedicated key always takes precedence. An empty/malformed dedicated
 // configuration is an error, not permission to silently try a second credential.
 const key=has(env,"TSS_PUBLIC_PILOT_OPENAI_KEY")?env.TSS_PUBLIC_PILOT_OPENAI_KEY:env.OPENAI_API_KEY;
 return typeof key==="string"&&key.length>0&&key.length<=1024&&!/[^!-~]/.test(key)?key:null;
}
const reply=(status,error)=>new Response(JSON.stringify({error}),{status,headers:{
 "Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"
}});
export function createPublicPilot({getEnv,blobGet,blobPut,preconditionError,loadOidcToken,prepareClose,providerFetch,now=Date.now}){
 return async request=>{
  const env=getEnv();const url=new URL(request.url);
  if(!env||env.VERCEL!=="1"||env.VERCEL_ENV!=="production"||env.VERCEL_TARGET_ENV!=="production"||
    !/^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA??"")||env.VERCEL_GIT_COMMIT_SHA!==env.TSS_PUBLIC_PILOT_REVIEWED_COMMIT||
    url.origin!==ORIGIN||url.pathname!==ROUTE||url.search)
    return reply(404,"not_found");
  const isStatus=request.method==="GET";
  if(!isStatus&&request.method!=="POST")return reply(405,"method_not_allowed");
  if(request.headers.get("sec-fetch-site")!=="same-origin"||
     request.headers.get("sec-fetch-dest")!=="empty"||
     (!isStatus&&request.headers.get("origin")!==ORIGIN))
    return reply(403,"forbidden");
  if(env.TSS_PUBLIC_VOICE_PILOT!=="armed-one-call"||env.TSS_PUBLIC_PILOT_RUNTIME_REVIEW!=="voice-sideband-and-cas-v1"||
     env.BLOB_STORE_ID!==BLOB_STORE||
     (has(env,"TSS_PUBLIC_PILOT_BLOB_STORE_ID")&&env.TSS_PUBLIC_PILOT_BLOB_STORE_ID!==BLOB_STORE)||
     typeof blobGet!=="function"||typeof blobPut!=="function"||typeof loadOidcToken!=="function"||
     typeof prepareClose!=="function")
    return reply(503,"pilot_closed");
  const canStart=makeActivationWindow(env,now);
  if(!canStart())return reply(503,"pilot_closed");
  const pilotKey=pickPilotKey(env);
  if(!pilotKey)return reply(503,"pilot_closed");
  if(isStatus){
   // Status does not touch the voice provider or spend the one-call permit.
   return new Response(JSON.stringify({remainingMs:strictUtcMs(env.TSS_PUBLIC_PILOT_EXPIRES_UTC)-now()}),
    {status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }
  const takePermit=createBlobPilotPermit({enabled:true,storeId:BLOB_STORE,
    get:blobGet,put:blobPut,loadOidcToken,preconditionError,canClaim:canStart});
  // Public pilot: no visitor identity or arbitrary client credential accepted.
  // An eligible public caller may consume the globally unique permit before Hady.
  return createSessionRoute({verifyOwner:async()=>true,takePermit,prepareClose,providerFetch,canStartProvider:canStart,now})(request,{
     TSS_PRIVATE_ORIGIN:ORIGIN,TSS_LIVE_PILOT:"armed",OPENAI_API_KEY:pilotKey,
     TSS_LIVE_MODEL:MODEL,TSS_LIVE_VOICE_ID:VOICE
  });
 };
}
