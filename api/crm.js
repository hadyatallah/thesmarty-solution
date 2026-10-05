// Same-origin transport for the native CRM Apps Script backend.
// Apps Script remains authoritative for authentication, sessions, schemas and writes.
// This layer removes browser cross-origin/redirect fragility and adds bounded transport handling.
const BACKEND='https://script.google.com/macros/s/AKfycbyVmqjxRsbdMoIrqGqETiFbOyOumjY3da_aUbThEn_8LdRN7CZFPDPMNUkWRaGJdHWRsQ/exec';
const METHODS=new Set(['beginGoogleLogin','googleSignIn','checkSession','getState','saveRecord','signOut','signOutAll']);
const SAFE_RETRY_METHODS=new Set(['beginGoogleLogin','checkSession']);
const DEFINITIVE_HTTP_RETRY_METHODS=new Set(['googleSignIn']);
export const config={maxDuration:60};

const PROD_ORIGINS=new Set(['https://www.thesmartysolution.com','https://thesmartysolution.com']);
function allowedOrigin(value=''){
  let u;try{u=new URL(value);}catch{return false;}
  if(u.protocol!=='https:')return false;
  if(PROD_ORIGINS.has(u.origin))return true;
  return /^thesmarty-solution-agent(?:-git-[a-z0-9-]+)?-tss21\.vercel\.app$/i.test(u.hostname);
}
function cors(req,res){
  const origin=String(req.headers.origin||'');
  if(origin&&allowedOrigin(origin)){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Access-Control-Allow-Credentials','true');
    res.setHeader('Vary','Origin');
  }
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  return origin;
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function dispatch(fetcher,payload,signal){
  let stage='dispatch',upstreamStatus=null;
  let response=await fetcher(BACKEND,{
    method:'POST',
    redirect:'manual',
    signal,
    headers:{'Content-Type':'text/plain;charset=UTF-8'},
    body:payload
  });
  upstreamStatus=response.status;
  if([301,302,303,307,308].includes(response.status)){
    const target=new URL(response.headers.get('location')||'',BACKEND);
    if(target.protocol!=='https:'||target.hostname!=='script.googleusercontent.com'||target.username||target.password||target.port) {
      const e=Error('REDIRECT_BLOCKED');e.stage=stage;e.upstreamStatus=upstreamStatus;throw e;
    }
    stage='receipt';
    response=await fetcher(target.href,{method:'GET',redirect:'manual',signal});
  }
  upstreamStatus=response.status;
  if(!response.ok){const e=Error('UPSTREAM_UNAVAILABLE');e.stage=stage;e.upstreamStatus=upstreamStatus;throw e;}
  stage='decode';
  let value;
  try{value=await response.json();}catch{const e=Error('NON_JSON_RESPONSE');e.stage=stage;e.upstreamStatus=upstreamStatus;throw e;}
  if(!value||typeof value.ok!=='boolean'){const e=Error('INVALID_RESPONSE');e.stage=stage;e.upstreamStatus=upstreamStatus;throw e;}
  return {value,upstreamStatus};
}

export function makeHandler(fetcher=fetch){return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  cors(req,res);
  const fail=(status,error,extra={})=>res.status(status).json({ok:false,error,...extra});
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(405,'METHOD_NOT_ALLOWED');}
  const origin=String(req.headers.origin||'');
  if(!origin||!allowedOrigin(origin))return fail(403,'ORIGIN_NOT_ALLOWED');

  let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return fail(400,'INVALID_REQUEST');}
  if(!body||!METHODS.has(body.fn)||!Array.isArray(body.args)||body.args.length>8)return fail(400,'ACTION_NOT_ALLOWED');
  const payload=JSON.stringify({fn:body.fn,args:body.args});
  if(Buffer.byteLength(payload)>1048576)return fail(413,'REQUEST_TOO_LARGE');

  const started=Date.now();
  const maxAttempts=body.fn==='beginGoogleLogin'?3:(SAFE_RETRY_METHODS.has(body.fn)||DEFINITIVE_HTTP_RETRY_METHODS.has(body.fn))?2:1;
  const attemptTimeoutMs=body.fn==='beginGoogleLogin'?18000:body.fn==='checkSession'?18000:body.fn==='googleSignIn'?25000:body.fn==='getState'?45000:55000;
  let lastError=null,lastTimedOut=false;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),attemptTimeoutMs);
    try{
      const {value,upstreamStatus}=await dispatch(fetcher,payload,controller.signal);
      console.info(JSON.stringify({component:'crm-gateway',operation:body.fn,attempt,elapsedMs:Date.now()-started,attemptElapsedLimitMs:attemptTimeoutMs,upstreamStatus,outcome:'ok'}));
      return res.status(200).json(value);
    }catch(error){
      lastError=error;lastTimedOut=controller.signal.aborted;
      const safeReadRetry=SAFE_RETRY_METHODS.has(body.fn)&&error?.message!=='REDIRECT_BLOCKED';
      const definiteAuthInfraRetry=DEFINITIVE_HTTP_RETRY_METHODS.has(body.fn)&&error?.message==='UPSTREAM_UNAVAILABLE'&&[429,502,503,504].includes(Number(error?.upstreamStatus));
      const retryable=attempt<maxAttempts&&(safeReadRetry||definiteAuthInfraRetry);
      console.warn(JSON.stringify({component:'crm-gateway',operation:body.fn,attempt,elapsedMs:Date.now()-started,attemptElapsedLimitMs:attemptTimeoutMs,stage:error?.stage||'dispatch',code:lastTimedOut?'UPSTREAM_TIMEOUT':error?.message||'UPSTREAM_NETWORK',upstreamStatus:error?.upstreamStatus??null,retrying:retryable}));
      if(!retryable)break;
      await sleep(250);
    }finally{clearTimeout(timer);}
  }
  const code=lastTimedOut?'UPSTREAM_TIMEOUT':lastError?.message==='REDIRECT_BLOCKED'?'REDIRECT_BLOCKED':'CRM_BACKEND_UNAVAILABLE';
  return fail(502,code,{retryable:SAFE_RETRY_METHODS.has(body.fn)||DEFINITIVE_HTTP_RETRY_METHODS.has(body.fn)});
};}
export default makeHandler();
