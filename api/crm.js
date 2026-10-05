// Same-origin transport for the native CRM Apps Script backend.
// Apps Script remains authoritative for authentication, sessions, schemas and writes.
// This layer removes browser cross-origin/redirect fragility and adds bounded transport handling.
const BACKEND='https://script.google.com/macros/s/AKfycbyVmqjxRsbdMoIrqGqETiFbOyOumjY3da_aUbThEn_8LdRN7CZFPDPMNUkWRaGJdHWRsQ/exec';
const METHODS=new Set(['beginGoogleLogin','googleSignIn','checkSession','getState','saveRecord','signOut','signOutAll']);
const SAFE_RETRY_METHODS=new Set(['beginGoogleLogin','checkSession','getState']);
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
  if(req.method==='GET'&&req.query?.smoke==='1'){
    const started=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000);
    try{const {value,upstreamStatus}=await dispatch(fetcher,JSON.stringify({fn:'beginGoogleLogin',args:[]}),controller.signal);return res.status(200).json({smoke:true,elapsedMs:Date.now()-started,upstreamStatus,ok:!!value?.ok,hasNonce:typeof value?.result?.nonce==='string'&&value.result.nonce.length>10});}
    catch(error){return res.status(502).json({smoke:true,elapsedMs:Date.now()-started,ok:false,error:controller.signal.aborted?'UPSTREAM_TIMEOUT':error?.message||'UPSTREAM_NETWORK'});}
    finally{clearTimeout(timer);}
  }
  if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(405,'METHOD_NOT_ALLOWED');}
  const origin=String(req.headers.origin||'');
  if(!origin||!allowedOrigin(origin))return fail(403,'ORIGIN_NOT_ALLOWED');

  let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return fail(400,'INVALID_REQUEST');}
  if(!body||!METHODS.has(body.fn)||!Array.isArray(body.args)||body.args.length>8)return fail(400,'ACTION_NOT_ALLOWED');
  const payload=JSON.stringify({fn:body.fn,args:body.args});
  if(Buffer.byteLength(payload)>1048576)return fail(413,'REQUEST_TOO_LARGE');

  const started=Date.now();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),55000);
  const maxAttempts=SAFE_RETRY_METHODS.has(body.fn)?2:1;
  let lastError=null;
  try{
    for(let attempt=1;attempt<=maxAttempts;attempt++){
      try{
        const {value,upstreamStatus}=await dispatch(fetcher,payload,controller.signal);
        console.info(JSON.stringify({component:'crm-gateway',operation:body.fn,attempt,elapsedMs:Date.now()-started,upstreamStatus,outcome:'ok'}));
        return res.status(200).json(value);
      }catch(error){
        lastError=error;
        const retryable=!controller.signal.aborted&&attempt<maxAttempts&&['UPSTREAM_UNAVAILABLE','NON_JSON_RESPONSE'].includes(error?.message);
        console.warn(JSON.stringify({component:'crm-gateway',operation:body.fn,attempt,elapsedMs:Date.now()-started,stage:error?.stage||'dispatch',code:controller.signal.aborted?'UPSTREAM_TIMEOUT':error?.message||'UPSTREAM_NETWORK',upstreamStatus:error?.upstreamStatus??null,retrying:retryable}));
        if(!retryable)break;
        await sleep(250);
      }
    }
    const code=controller.signal.aborted?'UPSTREAM_TIMEOUT':lastError?.message==='REDIRECT_BLOCKED'?'REDIRECT_BLOCKED':'CRM_BACKEND_UNAVAILABLE';
    return fail(502,code,{retryable:SAFE_RETRY_METHODS.has(body.fn)});
  }finally{clearTimeout(timer);}
};}
export default makeHandler();
