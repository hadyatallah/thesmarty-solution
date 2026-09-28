// Transport only. Apps Script remains the authority for sessions, schemas and approvals.
const BACKEND='https://script.google.com/macros/s/AKfycbyVmqjxRsbdMoIrqGqETiFbOyOumjY3da_aUbThEn_8LdRN7CZFPDPMNUkWRaGJdHWRsQ/exec';
const METHODS=new Set(['askAssistant','ccState','ccPropose','ccDecide','ccExecute','ccPrepareBrief']);
export const config={maxDuration:60};
const ALLOWED_ORIGINS=new Set(['https://www.thesmartysolution.com','https://thesmartysolution.com']);
function cors(req,res){let origin='';try{origin=new URL(req.headers.origin).origin;}catch{}if(origin&&ALLOWED_ORIGINS.has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');}res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');return origin;}
export function makeHandler(fetcher=fetch){return async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');cors(req,res);
 const fail=(status,error)=>res.status(status).json({ok:false,error});
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(405,'METHOD_NOT_ALLOWED');}
 let origin;try{origin=new URL(req.headers.origin);}catch{return fail(403,'ORIGIN_REQUIRED');}
 if(origin.protocol!=='https:'||!ALLOWED_ORIGINS.has(origin.origin))return fail(403,'ORIGIN_NOT_ALLOWED');
 let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return fail(400,'INVALID_REQUEST');}
 if(!body||!METHODS.has(body.fn)||!Array.isArray(body.args)||body.args.length>8)return fail(400,'ACTION_NOT_ALLOWED');
 if(typeof body.args[0]!=='string'||!body.args[0]||body.args[0].length>4096)return fail(401,'AUTH_REQUIRED');
 const payload=JSON.stringify({fn:body.fn,args:body.args});if(Buffer.byteLength(payload)>65536)return fail(413,'REQUEST_TOO_LARGE');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000);let stage='dispatch',upstreamStatus=null;
 try{
  let response=await fetcher(BACKEND,{method:'POST',redirect:'manual',signal:controller.signal,headers:{'Content-Type':'text/plain;charset=UTF-8'},body:payload});
  upstreamStatus=response.status;
  // Apps Script serves JSON from a one-time Google ContentService URL.
  // Never repeat the POST or forward its session body to a redirect target.
  if([302,303].includes(response.status)){
   const target=new URL(response.headers.get('location')||'',BACKEND);
   if(target.protocol!=='https:'||target.hostname!=='script.googleusercontent.com'||target.username||target.password||target.port)throw Error('REDIRECT_BLOCKED');
   stage='receipt';response=await fetcher(target.href,{method:'GET',redirect:'manual',signal:controller.signal});
  }
  upstreamStatus=response.status;if(!response.ok)throw Error('UPSTREAM_UNAVAILABLE');
  stage='decode';
  const value=await response.json();
  if(!value||typeof value.ok!=='boolean')throw Error('INVALID_RESPONSE');
  return res.status(200).json(value);
 }catch(error){
  const code=controller.signal.aborted?'UPSTREAM_TIMEOUT':['REDIRECT_BLOCKED','UPSTREAM_UNAVAILABLE','INVALID_RESPONSE'].includes(error?.message)?error.message:stage==='decode'?'NON_JSON_RESPONSE':'UPSTREAM_NETWORK';
  console.warn(JSON.stringify({component:'crm-command',operation:body.fn,stage,code,upstreamStatus}));
  // Do not include provider bodies, tokens or exceptions in the response or logs.
  return fail(502,'CRM_CONNECTION_UNCERTAIN: Refresh the action ledger before retrying a change.');
 }finally{clearTimeout(timer);}
};}
export default makeHandler();
