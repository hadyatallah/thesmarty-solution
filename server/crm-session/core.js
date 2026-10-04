import crypto from 'node:crypto';

export const OWNER = 'thesmartysolution@gmail.com';
export const CLIENT_ID = '103840050410-80lukup1okjnkmt6qvmd9s2mbvi3uakf.apps.googleusercontent.com';
export const BACKEND = 'https://script.google.com/macros/s/AKfycbyVmqjxRsbdMoIrqGqETiFbOyOumjY3da_aUbThEn_8LdRN7CZFPDPMNUkWRaGJdHWRsQ/exec';
export const SESSION_COOKIE = '__Host-tss-crm-v1';
export const FLOW_COOKIE = '__Host-tss-crm-flow-v1';
export const MARKER = 'tss-cookie-v1:';
export const MAX_MS = 60 * 60 * 1000;
const ORIGINS = new Set(['https://www.thesmartysolution.com', 'https://thesmartysolution.com']);
const ERROR_CODES = new Set(['AUTH_REQUIRED','SESSION_CHANGED','CSRF_REJECTED','ORIGIN_NOT_ALLOWED','INVALID_REQUEST','METHOD_NOT_ALLOWED','ACTION_NOT_ALLOWED','SESSION_NOT_CONFIGURED','NATIVE_CONTRACT_UNVERIFIED','CRM_CONNECTION_UNCERTAIN','SIGNIN_REJECTED']);
export const fail = code => { throw Error(code); };
export const safeCode = e => ERROR_CODES.has(e?.message) ? e.message : 'CRM_CONNECTION_UNCERTAIN';
export const timingSafe = (a,b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && a.length <= 4096 && Buffer.byteLength(a)===Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function settings(env=process.env) {
  // Release remains off until both implementation and native-contract acceptance pass.
  const requested = env.TSS_CRM_BROWSER_SESSION_ENABLED === 'true';
  const encoded = env.TSS_CRM_BROWSER_SESSION_KEY || '';
  const key = /^[a-f0-9]{64}$/i.test(encoded) ? Buffer.from(encoded,'hex') : null;
  const accepted = env.TSS_CRM_SESSION_CONTRACT_ACCEPTED === 'true';
  return {enabled:requested && accepted && !!key, requested, key};
}
export function trustedOrigin(req,res) {
  const origin=req.headers?.origin;
  if(typeof origin !== 'string' || !ORIGINS.has(origin))fail('ORIGIN_NOT_ALLOWED');
  if(res){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');}
  return origin;
}
export function headers(res) {
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Pragma','no-cache');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, X-TSS-CRM-Request, X-TSS-CRM-CSRF');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
}
export function parseBody(req) {
  let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{fail('INVALID_REQUEST');}
  if(!body || typeof body!=='object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body))>65536)fail('INVALID_REQUEST');
  return body;
}
export function cookieValue(req,name) {
  const raw=req.headers?.cookie||'';
  if(typeof raw!=='string'||raw.length>16384)fail('AUTH_REQUIRED');
  const found=raw.split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
  if(found.length!==1)fail('AUTH_REQUIRED');
  const value=found[0].slice(name.length+1);
  if(!value || value.length>3800)fail('AUTH_REQUIRED');
  return value;
}
export function seal(value,key,purpose) {
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from('tss-crm-v1:'+purpose));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  const encoded=Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
  if(encoded.length>3800)fail('NATIVE_CONTRACT_UNVERIFIED');
  return encoded;
}
export function unseal(value,key,purpose) {
  try {
    if(!/^[A-Za-z0-9_-]+$/.test(value)||value.length>3800)throw Error();
    const bytes=Buffer.from(value,'base64url');if(bytes.length<29||bytes.toString('base64url')!==value)throw Error();
    const dec=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
    dec.setAAD(Buffer.from('tss-crm-v1:'+purpose));dec.setAuthTag(bytes.subarray(12,28));
    return JSON.parse(Buffer.concat([dec.update(bytes.subarray(28)),dec.final()]).toString('utf8'));
  } catch { fail('AUTH_REQUIRED'); }
}
export function sessionCookie(name,value,{expiresAt,now=Date.now(),persistent=false}={}) {
  let out=`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict`;
  if(persistent)out+=`; Max-Age=${Math.max(0,Math.floor((expiresAt-now)/1000))}`;
  return out;
}
export const clearCookie = name => `${name}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`;
export function csrf(req,expected) {
  if(req.headers?.['x-tss-crm-request']!=='1'||!timingSafe(req.headers?.['x-tss-crm-csrf'],expected))fail('CSRF_REJECTED');
}
export function activeSession(req,key,now=Date.now()) {
  const s=unseal(cookieValue(req,SESSION_COOKIE),key,'session');
  if(s.v!==1||s.host!==req.headers.host||s.owner!==OWNER||typeof s.token!=='string'||!s.token||s.token.length>2048||
     !/^[a-f0-9]{32}$/.test(s.id)||!/^[a-f0-9]{64}$/.test(s.csrf)||
     !Number.isSafeInteger(s.issuedAt)||!Number.isSafeInteger(s.expiresAt)||
     s.issuedAt>now||s.expiresAt<=now||s.expiresAt-s.issuedAt>MAX_MS||typeof s.trusted!=='boolean')fail('AUTH_REQUIRED');
  return s;
}
export function publicSession(s) { return {marker:MARKER+s.id,expiresAt:s.expiresAt,trusted:s.trusted,csrf:s.csrf}; }
export async function nativeCall(fn,args,{fetcher=fetch,timeoutMs=55000}={}) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    let r=await fetcher(BACKEND,{method:'POST',redirect:'manual',signal:controller.signal,headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({fn,args})});
    if([302,303].includes(r.status)) {
      const u=new URL(r.headers.get('location')||'',BACKEND);
      if(u.protocol!=='https:'||u.hostname!=='script.googleusercontent.com'||u.username||u.password||u.port)fail('CRM_CONNECTION_UNCERTAIN');
      r=await fetcher(u.href,{method:'GET',redirect:'manual',signal:controller.signal});
    }
    if(!r.ok)fail('CRM_CONNECTION_UNCERTAIN');
    const value=await r.json();
    if(!value||typeof value.ok!=='boolean')fail('CRM_CONNECTION_UNCERTAIN');
    if(!value.ok) {
      if(/AUTH_REQUIRED|SESSION_CHANGED/.test(String(value.error||'')))fail('AUTH_REQUIRED');
      // Do not expose unreviewed native exceptions. Specific business error mapping is a release-contract gate.
      fail(fn==='googleSignIn'?'SIGNIN_REJECTED':'CRM_CONNECTION_UNCERTAIN');
    }
    return value.result;
  }catch(e){fail(safeCode(e));}finally{clearTimeout(timer);}
}
export function validNativeCheck(value,now=Date.now()) {
  // The recovered native source returns {expiresAt}, not a generic success flag.
  // Source provenance and deployed-version parity remain separate activation gates.
  if(value===false||value===null||value===undefined||value?.valid===false||value?.authenticated===false||value?.ok===false)fail('AUTH_REQUIRED');
  if(!value||typeof value!=='object'||Array.isArray(value)||!Number.isSafeInteger(value.expiresAt))fail('NATIVE_CONTRACT_UNVERIFIED');
  if(value.expiresAt<=now)fail('AUTH_REQUIRED');
  if(value.email && value.email!==OWNER)fail('AUTH_REQUIRED');
  return {expiresAt:value.expiresAt};
}
export async function resolveBrowserSession(req,marker,{env=process.env,now=Date.now(),call=nativeCall}={}) {
  const config=settings(env);if(!config.enabled)fail('SESSION_NOT_CONFIGURED');
  trustedOrigin(req);if(req.headers.host!=='api.thesmartysolution.com')fail('ORIGIN_NOT_ALLOWED');const s=activeSession(req,config.key,now);csrf(req,s.csrf);
  if(marker!==MARKER+s.id)fail('SESSION_CHANGED');
  const checked=validNativeCheck(await call('checkSession',[s.token]),now);
  return {...s,expiresAt:Math.min(s.expiresAt,checked.expiresAt)};
}
export function withBrowserSession(handler,shape='session',deps={}) {
  return async(req,res)=>{
    // Preflight grants only the same two origins already accepted by the legacy routes.
    if(req.method==='OPTIONS') {
      try{headers(res);trustedOrigin(req,res);return res.status(204).end();}
      catch{return res.status(403).json({ok:false,error:'ORIGIN_NOT_ALLOWED'});}
    }
    let body;try{body=parseBody(req);}catch{return handler(req,res);}
    const marker=shape==='args'?body.args?.[0]:body.session;
    if(typeof marker!=='string'||!marker.startsWith(MARKER))return handler(req,res);
    try {
      headers(res);trustedOrigin(req,res);if(req.method!=='POST')fail('METHOD_NOT_ALLOWED');
      const s=await resolveBrowserSession(req,marker,deps);
      const next=shape==='args'?{...body,args:[s.token,...body.args.slice(1)]}:{...body,session:s.token};
      // Preserve IncomingMessage/Vercel getters and methods; spreading drops prototype headers.
      const forwarded=new Proxy(req,{get:(target,key)=>key==='body'?next:Reflect.get(target,key,target)});
      return handler(forwarded,res);
    }catch(e){const code=safeCode(e);return res.status(['AUTH_REQUIRED','SESSION_CHANGED'].includes(code)?401:code==='CRM_CONNECTION_UNCERTAIN'?503:403).json({ok:false,error:code});}
  };
}
