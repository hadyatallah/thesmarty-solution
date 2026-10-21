import { randomBytes, createHash } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { keylessToken } from './tssWhatsappGoogle.mjs';

const OWNER = 'thesmartysolution@gmail.com';
const CLIENT = '103840050410-dlhipb15600ot54jk7m6qj0olrbms7i4.apps.googleusercontent.com';
const ROOT = 'https://firestore.googleapis.com/v1/projects/tss-crm-508908/databases/(default)/documents';
const COOKIE = '__Host-tss_admin';
const TTL = 900;
const hash = value => createHash('sha256').update(value).digest('hex');
const opaque = () => randomBytes(32).toString('base64url');
const csrfFor = token => createHash('sha256').update('tss-csrf:'+token).digest('base64url');
export function sessionCookie(req) {
  const matches = String(req.headers?.cookie || '').split(';').map(s=>s.trim()).filter(s=>s.startsWith(COOKIE+'='));
  if(matches.length!==1) return '';
  const value=matches[0].slice(COOKIE.length+1);
  return /^[A-Za-z0-9_-]{43}$/.test(value)?value:'';
}
export function sameOrigin(req, env) {
  return env.TSS_ADMIN_ORIGIN === 'https://whatsapp-preview.thesmartysolution.com' &&
    req.headers?.origin === env.TSS_ADMIN_ORIGIN &&
    (!req.headers?.['sec-fetch-site'] || req.headers['sec-fetch-site']==='same-origin');
}
function failure(code, status=503) { const e=Error(code);e.status=status;return e; }

// No key material or OAuth tokens are persisted. Only hashed random session IDs,
// owner identity, expiry and hashed CSRF values live in this existing database.
// The inbox reader remains GET-only. The existing create-only identity can only
// create immutable session/tombstone documents, never update messages or sessions.
export function firestoreSessionStore({env=process.env,fetcher=fetch,getToken=keylessToken}={}) {
  async function call(collection,id,write) {
    const key=write?'TSS_WHATSAPP_SERVICE_ACCOUNT_EMAIL':'TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL';
    let token;
    try { token=await getToken(env,key); }
    catch { throw failure(write?'session_writer_exchange_failed':'session_reader_exchange_failed'); }
    const url=write?`${ROOT}/${collection}?documentId=${id}`:`${ROOT}/${collection}/${id}`;
    const response=await fetcher(url,{method:write?'POST':'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(write?{body:JSON.stringify({fields:write})}:{})});
    if(!write&&response.status===404)return null;
    if(write&&response.status===409)throw failure('session_document_exists',409);
    if(!response.ok)throw failure(`session_${write?'write':'read'}_http_${response.status}`);
    return write?true:(await response.json()).fields;
  }
  return {
    create: (id,data)=>call('tss_admin_sessions',id,{owner:{stringValue:OWNER},origin:{stringValue:data.origin},expiresAt:{timestampValue:new Date(data.expiresAt).toISOString()},csrfHash:{stringValue:hash(data.csrf)}}),
    async get(id) {
      const record=await call('tss_admin_sessions',id);
      if(!record)return null;
      const revoked=await call('tss_admin_revocations',id);
      if(revoked)return null;
      return {email:record.owner?.stringValue,origin:record.origin?.stringValue,expiresAt:Date.parse(record.expiresAt?.timestampValue),csrfHash:record.csrfHash?.stringValue};
    },
    async revoke(id) {
      try { await call('tss_admin_revocations',id,{revokedAt:{timestampValue:new Date().toISOString()}}); }
      catch(e){if(e.message!=='session_document_exists')throw e;}
    }
  };
}
export function createSessionService({env=process.env,store=firestoreSessionStore({env}),now=Date.now,verifyGoogle}={}) {
  async function authenticate(req) {
    const token=sessionCookie(req);
    if(!token)throw failure('owner_session_required',401);
    const record=await store.get(hash(token));
    if(!record||record.email!==OWNER||record.origin!==env.TSS_ADMIN_ORIGIN||!Number.isFinite(record.expiresAt)||record.expiresAt<=now())throw failure('owner_session_invalid_or_expired',401);
    return {...record,id:hash(token),csrf:csrfFor(token)};
  }
  async function verify(token) {
    if(typeof token!=='string'||! /^[A-Za-z0-9._~-]{30,4096}$/.test(token))throw failure('google_credential_invalid',401);
    let info;
    try {
      if (verifyGoogle) info=await verifyGoogle(token);
      else {
        const tokenInfo=await new OAuth2Client(CLIENT).getTokenInfo(token);
        // TokenInfo validates audience and expiry; userinfo supplies the
        // verified-email flag, which getTokenInfo may not include.
        const response=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{
          method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(9000),
          headers:{Authorization:'Bearer '+token}
        });
        if(!response.ok)throw Error('USERINFO_REJECTED');
        const identity=await response.json();
        info={...tokenInfo,email:identity.email,email_verified:identity.email_verified};
      }
    } catch {throw failure('google_credential_invalid_or_expired',401);}
    if(info.aud!==CLIENT||!Number.isFinite(info.expiry_date)||info.expiry_date<=now())throw failure('google_credential_invalid_or_expired',401);
    if(info.email!==OWNER||info.email_verified!==true)throw failure('owner_only',403);
    return info;
  }
  return {authenticate,async handler(req,res){
    res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const reply=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
    if(env.TSS_ADMIN_SESSION_ENABLED!=='true')return reply(503,{ok:false,error:'admin_session_not_enabled'});
    if(!['GET','POST','DELETE'].includes(req.method)){res.setHeader('Allow','GET, POST, DELETE');return reply(405,{ok:false,error:'method_not_allowed'});}
    if(req.method!=='GET'&&!sameOrigin(req,env))return reply(403,{ok:false,error:'csrf_origin_denied'});
    try {
      if(req.method==='POST') {
        if(!String(req.headers?.['content-type']||'').startsWith('application/json')||req.headers?.['x-tss-session']!=='1')throw failure('csrf_header_required',403);
        let body=req.body;
        if(typeof body==='string'){if(body.length>5000)throw failure('bad_request',400);try{body=JSON.parse(body);}catch{throw failure('bad_request',400);}}
        const info=await verify(body?.accessToken);
        const token=opaque(),csrf=csrfFor(token),expiresAt=Math.min(now()+TTL*1000,info.expiry_date);
        await store.create(hash(token),{origin:env.TSS_ADMIN_ORIGIN,expiresAt,csrf});
        // Readback proves both session reader and writer before issuing a cookie.
        const persisted=await store.get(hash(token));
        if(!persisted||persisted.csrfHash!==hash(csrf))throw failure('session_readback_failed');
        res.setHeader('Set-Cookie',`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor((expiresAt-now())/1000)}`);
        return reply(200,{ok:true,email:OWNER,expiresAt,csrf});
      }
      const session=await authenticate(req);
      if(req.method==='DELETE') {
        const csrf=req.headers?.['x-tss-csrf'];
        if(typeof csrf!=='string'||csrf.length!==43||hash(csrf)!==session.csrfHash)throw failure('csrf_token_invalid',403);
        await store.revoke(session.id);
        // Never report logout until durable revocation is independently visible.
        if(await store.get(session.id))throw failure('logout_readback_failed');
        res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
        return reply(200,{ok:true});
      }
      return reply(200,{ok:true,email:OWNER,expiresAt:session.expiresAt,csrf:session.csrf});
    } catch(e){return reply(e.status||503,{ok:false,error:e.status?e.message:'session_storage_unavailable'});}
  }};
}
