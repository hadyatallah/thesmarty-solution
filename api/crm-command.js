// Transport only. Apps Script remains the authority for sessions, schemas and approvals.
const BACKEND='https://script.google.com/macros/s/AKfycbyVmqjxRsbdMoIrqGqETiFbOyOumjY3da_aUbThEn_8LdRN7CZFPDPMNUkWRaGJdHWRsQ/exec';
const METHODS=new Set(['askAssistant','ccState','ccPropose','ccDecide','ccExecute','ccPrepareBrief']);
export const config={maxDuration:60};
export function makeHandler(fetcher=fetch){return async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const fail=(status,error)=>res.status(status).json({ok:false,error});
 if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(405,'METHOD_NOT_ALLOWED');}
 // Browser calls must originate on this deployment. Session validation is still server-side.
 let origin;try{origin=new URL(req.headers.origin);}catch{return fail(403,'ORIGIN_REQUIRED');}
 if(origin.protocol!=='https:'||origin.host!==req.headers.host)return fail(403,'ORIGIN_NOT_ALLOWED');
 let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return fail(400,'INVALID_REQUEST');}
 if(!body||!METHODS.has(body.fn)||!Array.isArray(body.args)||body.args.length>8)return fail(400,'ACTION_NOT_ALLOWED');
 if(typeof body.args[0]!=='string'||!body.args[0]||body.args[0].length>4096)return fail(401,'AUTH_REQUIRED');
 const payload=JSON.stringify({fn:body.fn,args:body.args});if(Buffer.byteLength(payload)>65536)return fail(413,'REQUEST_TOO_LARGE');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000);
 try{
  let response=await fetcher(BACKEND,{method:'POST',redirect:'manual',signal:controller.signal,headers:{'Content-Type':'text/plain;charset=UTF-8'},body:payload});
  // Apps Script serves JSON from a one-time Google ContentService URL.
  // Never repeat the POST or forward its session body to a redirect target.
  if([302,303].includes(response.status)){
   const target=new URL(response.headers.get('location')||'',BACKEND);
   if(target.protocol!=='https:'||target.hostname!=='script.googleusercontent.com'||target.username||target.password||target.port)throw Error('REDIRECT_BLOCKED');
   response=await fetcher(target.href,{method:'GET',redirect:'manual',signal:controller.signal});
  }
  if(!response.ok)throw Error('UPSTREAM_UNAVAILABLE');
  const value=await response.json();
  if(!value||typeof value.ok!=='boolean')throw Error('INVALID_RESPONSE');
  return res.status(200).json(value);
 }catch{
  // Do not include provider bodies, tokens or exceptions in the response or logs.
  return fail(502,'CRM_CONNECTION_UNCERTAIN: Refresh the action ledger before retrying a change.');
 }finally{clearTimeout(timer);}
};}
export default makeHandler();
