import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createSessionService,firestoreSessionStore} from '../lib/tssAdminSession.mjs';
import {createInboxHandler} from '../lib/tssWhatsappInbox.mjs';
const owner='thesmartysolution@gmail.com',origin='https://whatsapp-preview.thesmartysolution.com';
const client='103840050410-dlhipb15600ot54jk7m6qj0olrbms7i4.apps.googleusercontent.com';
const env={VERCEL_ENV:'preview',TSS_ADMIN_SESSION_WRITER_SERVICE_ACCOUNT_EMAIL:'tss-admin-session-writer@tss-crm-508908.iam.gserviceaccount.com',TSS_ADMIN_SESSION_ENABLED:'true',TSS_ADMIN_ORIGIN:origin,TSS_WHATSAPP_OWNER_EMAIL:owner,TSS_WHATSAPP_FIRESTORE_PARENT:'projects/tss-crm-508908/databases/(default)/documents',TSS_WHATSAPP_READER_AUTH_READY:'true',TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL:'tss-whatsapp-inbox-reader@tss-crm-508908.iam.gserviceaccount.com',TSS_WHATSAPP_GOOGLE_CLIENT_ID:client};
const hash=s=>createHash('sha256').update(s).digest('hex');
function harness(overrides={}) {
 let now=1000000;const records=new Map(),revoked=new Set();let verifyCalls=0;
 const store={create:async(id,data)=>records.set(id,{...data,email:owner,csrfHash:hash(data.csrf)}),get:async id=>revoked.has(id)?null:records.get(id),revoke:async id=>revoked.add(id)};
 const service=createSessionService({env,store,now:()=>now,verifyGoogle:async()=>{verifyCalls++;return {aud:client,email:owner,email_verified:true,expiry_date:now+3600000,...overrides};}});
 const run=async(method='GET',cookie='',body,headers={})=>{
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(s){this.body=JSON.parse(s);}};
  await service.handler({method,headers:{cookie,origin,'content-type':'application/json','x-tss-session':'1',...headers},body},res);return res;
 };
 return {run,records,revoked,service,expire(){now+=900001;},get verifyCalls(){return verifyCalls;}};
}
const login=h=>h.run('POST','',{accessToken:'synthetic-owner-oauth-access-token'});
const cookie=res=>res.headers['Set-Cookie'].split(';')[0];
test('server verifies audience and owner, persists no Google token, cookie is secure and session works across requests',async()=>{
 const h=harness(),res=await login(h);assert.equal(res.statusCode,200);assert.equal(h.verifyCalls,1);
 assert.match(res.headers['Set-Cookie'],/__Host-tss_admin=.+; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=900/);
 assert.equal((await h.run('GET',cookie(res))).body.email,owner);assert.equal(h.verifyCalls,1);
 assert.doesNotMatch(JSON.stringify([...h.records]),/synthetic-owner-oauth/);
 assert.equal((await h.run('GET')).statusCode,401);
 assert.equal((await h.run('GET',cookie(res)+'x')).statusCode,401);
 h.expire();assert.equal((await h.run('GET',cookie(res))).statusCode,401);
});
test('unauthorized account, unverified email, wrong audience and expired credential cannot create a session',async()=>{
 for(const override of [{email:'other@gmail.com'},{email_verified:false},{aud:'wrong-client'},{expiry_date:1}]){
  const h=harness(override);const res=await login(h);assert.ok([401,403].includes(res.statusCode));assert.equal(h.records.size,0);assert.equal(res.headers['Set-Cookie'],undefined);
 }
});
test('login CSRF, logout CSRF, durable logout and replay rejection',async()=>{
 const h=harness();assert.equal((await h.run('POST','',{}, {origin:'https://evil.example'})).statusCode,403);
 assert.equal((await h.run('POST','',{}, {'x-tss-session':''})).statusCode,403);
 const res=await login(h),c=cookie(res);
 assert.equal((await h.run('DELETE',c)).statusCode,403);
 assert.equal((await h.run('DELETE',c,undefined,{'x-tss-csrf':res.body.csrf,origin:'https://evil.example'})).statusCode,403);
 const restored=await h.run('GET',c);assert.equal(restored.body.csrf,res.body.csrf);
 assert.equal((await h.run('DELETE',c,undefined,{'x-tss-csrf':restored.body.csrf})).statusCode,200);
 assert.equal(h.revoked.size,1);assert.equal((await h.run('GET',c)).statusCode,401);
});
test('session Firestore uses separate reader and create-only writer, never PATCH or DELETE',async()=>{
 const calls=[];const store=firestoreSessionStore({env,getToken:async(_env,key)=>key,fetcher:async(url,options)=>{calls.push({url,options});return options.method==='GET'?new Response('',{status:404}):Response.json({});}});
 await store.create('a'.repeat(64),{origin,csrf:'test',expiresAt:Date.now()+1000});await store.get('a'.repeat(64));await store.revoke('a'.repeat(64));
 assert.deepEqual(calls.map(c=>c.options.method),['POST','GET','POST']);
 assert.match(calls[0].options.headers.Authorization,/TSS_ADMIN_SESSION_WRITER_SERVICE_ACCOUNT_EMAIL/);
 assert.match(calls[1].options.headers.Authorization,/TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL/);
 assert.ok(calls.every(c=>!c.url.includes('tss_whatsapp_inbox')));
});
test('session storage 401/403/500 fail closed rather than issue cookies',async()=>{
 for(const status of [401,403,500]) {
  const store=firestoreSessionStore({env,getToken:async()=> 'synthetic',fetcher:async()=>new Response('',{status})});
  await assert.rejects(store.get('a'.repeat(64)),new RegExp('session_read_http_'+status));
 }
});
test('session cookie authorization precedes reader credential creation and Firestore list, refresh and pagination',async()=>{
 const h=harness(),res=await login(h),calls=[];
 const handler=createInboxHandler({enabled:true,env,authenticateSession:h.service.authenticate,readerAccessToken:async()=>{calls.push('reader');return 'dedicated-reader';},fetcher:async(url,options)=>{calls.push(url);assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer dedicated-reader');return Response.json({documents:[],nextPageToken:'next'});}});
 async function run(c,url='/api/tss-whatsapp-inbox'){const r={setHeader(){},end(s){this.body=JSON.parse(s);}};await handler({method:'GET',url,headers:{cookie:c}},r);return r;}
 assert.equal((await run('')).statusCode,401);assert.equal(calls.length,0);
 assert.equal((await run(cookie(res))).statusCode,200);assert.equal(calls.length,2);
 assert.equal((await run(cookie(res),'/?pageToken=next')).statusCode,200);assert.match(calls[3],/pageToken=next/);
 h.expire();assert.equal((await run(cookie(res))).statusCode,401);assert.equal(calls.length,4);
});
test('deployed inbox has no bearer fallback, separate GIS interface, browser token storage, or send action',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.match(read('api/tss-whatsapp-inbox.js'),/authenticateSession:sessions.authenticate/);
 const app=read('whatsapp-inbox/app.js');assert.doesNotMatch(app,/google\.accounts|Authorization:|localStorage|sessionStorage|graph\.facebook/);
 assert.match(app,/credentials: 'same-origin'/);assert.match(app,/navigator.clipboard.writeText/);
 assert.match(read('admin-login/index.html'),/href="\/whatsapp-inbox\/"/);
 assert.match(read('admin-login/session.js'),/\/api\/tss-admin-session/);
});
