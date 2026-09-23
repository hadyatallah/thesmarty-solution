import crypto from 'node:crypto';

const BACKEND='https://script.google.com/macros/s/AKfycbyVmqjxRsbdMoIrqGqETiFbOyOumjY3da_aUbThEn_8LdRN7CZFPDPMNUkWRaGJdHWRsQ/exec';
export const FLOW_COOKIE='tss_ms_oauth_flow';
export const SESSION_COOKIE='tss_ms_session';
export const SCOPES='openid profile email offline_access User.Read Mail.Read Mail.Send';

function env(name){const v=process.env[name];if(!v)throw Error('OUTLOOK_NOT_CONFIGURED');return v;}
export function config(){return {tenant:env('TSS_OUTLOOK_TENANT_ID'),clientId:env('TSS_OUTLOOK_CLIENT_ID'),clientSecret:env('TSS_OUTLOOK_CLIENT_SECRET'),redirectUri:env('TSS_OUTLOOK_REDIRECT_URI'),mailbox:env('TSS_OUTLOOK_MAILBOX').toLowerCase(),sessionSecret:env('TSS_OUTLOOK_SESSION_SECRET')};}
const key=()=>crypto.createHash('sha256').update(config().sessionSecret).digest();
export function seal(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv),plain=Buffer.from(JSON.stringify(value));const body=Buffer.concat([cipher.update(plain),cipher.final()]),tag=cipher.getAuthTag();return [iv,tag,body].map(x=>x.toString('base64url')).join('.');}
export function open(value){try{const [a,b,c]=String(value||'').split('.');if(!a||!b||!c)throw Error();const decipher=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(a,'base64url'));decipher.setAuthTag(Buffer.from(b,'base64url'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(c,'base64url')),decipher.final()]).toString('utf8'));}catch{throw Error('OUTLOOK_SESSION_INVALID');}}
export function cookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(/;\s*/).filter(Boolean).map(x=>{const i=x.indexOf('=');return [decodeURIComponent(x.slice(0,i)),decodeURIComponent(x.slice(i+1))]}));}
export function cookie(name,value,{maxAge=600,path='/',sameSite='Lax'}={}){return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=${sameSite}`;}
export function clearCookie(name,path='/'){return `${name}=; Path=${path}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;}
export function baseHeaders(res){res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');}
export function requireSameOrigin(req){let o;try{o=new URL(req.headers.origin);}catch{throw Error('ORIGIN_REQUIRED');}if(o.protocol!=='https:'||o.host!==req.headers.host)throw Error('ORIGIN_NOT_ALLOWED');}
async function backendCall(fn,args){const body=JSON.stringify({fn,args});let r=await fetch(BACKEND,{method:'POST',redirect:'manual',headers:{'Content-Type':'text/plain;charset=UTF-8'},body});if([302,303].includes(r.status)){const target=new URL(r.headers.get('location')||'',BACKEND);if(target.protocol!=='https:'||target.hostname!=='script.googleusercontent.com'||target.username||target.password||target.port)throw Error('CRM_AUTH_UNAVAILABLE');r=await fetch(target.href,{method:'GET',redirect:'manual'});}if(!r.ok)throw Error('CRM_AUTH_UNAVAILABLE');const data=await r.json();if(!data?.ok)throw Error(data?.error||'AUTH_REQUIRED');return data.result;}
export async function verifyCrmSession(token){if(typeof token!=='string'||!token||token.length>4096)throw Error('AUTH_REQUIRED');await backendCall('checkSession',[token]);return true;}
export function pkce(){const verifier=crypto.randomBytes(48).toString('base64url'),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');return {verifier,challenge};}
export function authorizeUrl({state,challenge}){const c=config(),u=new URL(`https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/authorize`);u.search=new URLSearchParams({client_id:c.clientId,response_type:'code',redirect_uri:c.redirectUri,response_mode:'query',scope:SCOPES,state,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'}).toString();return u.toString();}
async function tokenRequest(params){const c=config(),u=`https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`;const body=new URLSearchParams({...params,client_id:c.clientId,client_secret:c.clientSecret,scope:SCOPES});const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const data=await r.json().catch(()=>({}));if(!r.ok||!data.access_token)throw Error('MICROSOFT_TOKEN_EXCHANGE_FAILED');return data;}
export const exchangeCode=(code,verifier)=>{const c=config();return tokenRequest({grant_type:'authorization_code',code,redirect_uri:c.redirectUri,code_verifier:verifier});};
export const refreshToken=refresh_token=>tokenRequest({grant_type:'refresh_token',refresh_token});
export async function graphMe(accessToken){const r=await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',{headers:{Authorization:`Bearer ${accessToken}`}});if(!r.ok)throw Error('MICROSOFT_PROFILE_FAILED');return r.json();}
export function assertMailbox(me){const c=config(),actual=String(me.mail||me.userPrincipalName||'').toLowerCase();if(actual!==c.mailbox)throw Error('MICROSOFT_MAILBOX_MISMATCH');return actual;}
export function sessionEnvelope(refreshTokenValue,mailbox){return seal({refreshToken:refreshTokenValue,mailbox,connectedAt:new Date().toISOString(),v:1});}
