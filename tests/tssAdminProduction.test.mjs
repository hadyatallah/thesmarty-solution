import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {approvedOrigin,sameOrigin,createSessionService} from '../lib/tssAdminSession.mjs';
const origins={preview:'https://whatsapp-preview.thesmartysolution.com',production:'https://www.thesmartysolution.com'};
const hash=s=>createHash('sha256').update(s).digest('hex');
test('exact deployment origin allowlist rejects swapped, missing and arbitrary configuration',()=>{
 for(const [environment,origin] of Object.entries(origins)){
  const env={VERCEL_ENV:environment,TSS_ADMIN_ORIGIN:origin};
  assert.equal(approvedOrigin(env),origin);
  assert.equal(sameOrigin({headers:{origin,'sec-fetch-site':'same-origin'}},env),true);
  for(const bad of [undefined,'null','https://evil.example',origin+'/',origin+'.evil.example',...Object.values(origins).filter(x=>x!==origin)]){
   assert.equal(sameOrigin({headers:{origin:bad,host:new URL(origin).host,'x-forwarded-host':new URL(origin).host,'x-forwarded-proto':'https'}},env),false);
  }
  for(const site of ['cross-site','same-site','none'])assert.equal(sameOrigin({headers:{origin,'sec-fetch-site':site}},env),false);
  assert.equal(sameOrigin({headers:{origin,host:'attacker.example','x-forwarded-host':'attacker.example'}},env),true);
  assert.equal(approvedOrigin({...env,TSS_ADMIN_ORIGIN:'https://evil.example'}),null);
  assert.equal(approvedOrigin({...env,VERCEL_ENV:'development'}),null);
  assert.equal(approvedOrigin({TSS_ADMIN_ORIGIN:origin}),null);
 }
});
test('production login, cookie, CSRF and durable logout; preview cookie cannot authorize production',async()=>{
 const records=new Map(),revoked=new Set();let reads=0;const now=Date.now();
 const store={create:async(id,d)=>records.set(id,{...d,email:'thesmartysolution@gmail.com',csrfHash:hash(d.csrf)}),get:async id=>{reads++;return revoked.has(id)?null:records.get(id);},revoke:async id=>revoked.add(id)};
 const services=Object.fromEntries(Object.entries(origins).map(([environment,origin])=>[environment,createSessionService({env:{VERCEL_ENV:environment,TSS_ADMIN_ORIGIN:origin,TSS_ADMIN_SESSION_ENABLED:'true'},store,now:()=>now,verifyGoogle:async()=>({aud:'103840050410-dlhipb15600ot54jk7m6qj0olrbms7i4.apps.googleusercontent.com',email:'thesmartysolution@gmail.com',email_verified:true,expiry_date:now+3600000})})]));
 async function run(environment,method,cookie='',headers={}){
  const r={headers:{},setHeader(k,v){this.headers[k]=v;},end(s){this.body=JSON.parse(s);}};
  await services[environment].handler({method,headers:{origin:origins[environment],cookie,'content-type':'application/json','x-tss-session':'1',...headers},body:{accessToken:'synthetic-owner-oauth-access-token'}},r);return r;
 }
 for(const environment of Object.keys(origins)){
  const login=await run(environment,'POST');assert.equal(login.statusCode,200);
  const cookie=login.headers['Set-Cookie'].split(';')[0];
  assert.match(login.headers['Set-Cookie'],/; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=900$/);assert.doesNotMatch(login.headers['Set-Cookie'],/Domain=/);
  assert.equal((await run(environment,'GET',cookie)).statusCode,200);
  const other=environment==='preview'?'production':'preview';
  assert.equal((await run(other,'GET',cookie)).statusCode,401);
  assert.equal((await run(other,'DELETE',cookie,{'x-tss-csrf':login.body.csrf})).statusCode,401);
  assert.equal((await run(environment,'DELETE',cookie,{'x-tss-csrf':'x'.repeat(43)})).statusCode,403);
  assert.equal((await run(environment,'DELETE',cookie,{'x-tss-csrf':login.body.csrf})).statusCode,200);
  assert.equal((await run(environment,'GET',cookie)).statusCode,401);
 }
 assert.ok(reads>0);
});
