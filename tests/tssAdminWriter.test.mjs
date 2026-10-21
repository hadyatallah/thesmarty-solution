import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {firestoreSessionStore} from '../lib/tssAdminSession.mjs';
import {keylessToken} from '../lib/tssWhatsappGoogle.mjs';
import {createRequire} from 'node:module';
const {Gaxios}=createRequire(import.meta.url)('gaxios');
const writer='tss-admin-session-writer@tss-crm-508908.iam.gserviceaccount.com';
const reader='tss-whatsapp-inbox-reader@tss-crm-508908.iam.gserviceaccount.com';
const env={TSS_ADMIN_SESSION_WRITER_SERVICE_ACCOUNT_EMAIL:writer,TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL:reader,TSS_WHATSAPP_SERVICE_ACCOUNT_EMAIL:'tss-whatsapp-webhook@tss-crm-508908.iam.gserviceaccount.com'};
const id='a'.repeat(64);
test('missing or wrong dedicated writer fails before any credential exchange, without webhook fallback',async()=>{
 for(const value of [undefined,'',env.TSS_WHATSAPP_SERVICE_ACCOUNT_EMAIL,reader]){
  let calls=0;const store=firestoreSessionStore({env:{...env,TSS_ADMIN_SESSION_WRITER_SERVICE_ACCOUNT_EMAIL:value},getToken:async()=>{calls++;},fetcher:async()=>{calls++;}});
  await assert.rejects(store.create(id,{csrf:'test',expiresAt:Date.now()}),/session_writer_not_configured/);assert.equal(calls,0);
 }
});
test('invalid collection document identifiers never obtain Google credentials',async()=>{
 let calls=0;const store=firestoreSessionStore({env,getToken:async()=>{calls++;}});
 for(const bad of ['../tss_whatsapp_inbox/a','b'.repeat(63),'A'.repeat(64),'x'.repeat(64)])await assert.rejects(store.get(bad),/session_resource_denied/);
 assert.equal(calls,0);
});
test('writer and reader WIF failures are distinct and redact raw upstream details',async()=>{
 const store=firestoreSessionStore({env,getToken:async()=>{throw Error('PRIVATE_UPSTREAM_TOKEN');}});
 await assert.rejects(store.create(id,{csrf:'test',expiresAt:Date.now()}),/^Error: session_writer_exchange_failed$/);
 await assert.rejects(store.get(id),/^Error: session_reader_exchange_failed$/);
});
test('writer has only fixed POST creates, reader independently reads session and tombstone; no secrets or outbound routes',async()=>{
 const calls=[],keys=[];
 const store=firestoreSessionStore({env,getToken:async(_env,key)=>{keys.push(key);return 'synthetic-'+key;},fetcher:async(url,options)=>{
  calls.push({url,options});
  if(options.method==='POST')return Response.json({});
  if(url.includes('/tss_admin_revocations/'))return new Response('',{status:404});
  return Response.json({fields:{owner:{stringValue:'thesmartysolution@gmail.com'},origin:{stringValue:'https://whatsapp-preview.thesmartysolution.com'},expiresAt:{timestampValue:new Date(Date.now()+900000).toISOString()},csrfHash:{stringValue:'hash'}}});
 }});
 await store.create(id,{csrf:'test',expiresAt:Date.now()+900000});const record=await store.get(id);assert.equal(record.email,'thesmartysolution@gmail.com');await store.revoke(id);
 assert.deepEqual(keys,['TSS_ADMIN_SESSION_WRITER_SERVICE_ACCOUNT_EMAIL','TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL','TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL','TSS_ADMIN_SESSION_WRITER_SERVICE_ACCOUNT_EMAIL']);
 assert.deepEqual(calls.map(x=>x.options.method),['POST','GET','GET','POST']);
 assert.ok(calls.every(c=>/^https:\/\/firestore.googleapis.com\/v1\/projects\/tss-crm-508908\/databases\/\(default\)\/documents\/tss_admin_(sessions|revocations)(\?|\/)/.test(c.url)));
 assert.ok(calls.every(c=>c.options.redirect==='error'));
 const source=readFileSync(new URL('../lib/tssAdminSession.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/TSS_WHATSAPP_SERVICE_ACCOUNT_EMAIL|secretmanager\.googleapis|graph\.facebook/);
});
test('Firestore create 401 and 403 fail closed and never become successful session writes',async()=>{
 for(const status of [401,403]){
  const store=firestoreSessionStore({env,getToken:async()=> 'synthetic',fetcher:async()=>new Response('',{status})});
  await assert.rejects(store.create(id,{csrf:'test',expiresAt:Date.now()}),new RegExp('session_write_http_'+status));
 }
});
test('real Google library impersonates only the dedicated Admin writer with datastore scope',async t=>{
 const prior=process.env.VERCEL_OIDC_TOKEN,priorFile=process.env.VERCEL_OIDC_TOKEN_FILE;
 const subject=[Buffer.from(JSON.stringify({alg:'RS256'})).toString('base64url'),Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,sub:'owner:tss21:project:thesmarty-solution-agent:environment:preview',aud:'https://vercel.com/tss21'})).toString('base64url'),'synthetic-signature'].join('.');
 process.env.VERCEL_OIDC_TOKEN=subject;delete process.env.VERCEL_OIDC_TOKEN_FILE;
 let stage=0;
 t.mock.method(Gaxios.prototype,'request',async options=>{
  assert.equal(options.method,'POST');
  if(stage++===0){assert.equal(String(options.url),'https://sts.googleapis.com/v1/token');assert.equal(options.data.get('subject_token'),subject);return {data:{access_token:'synthetic-federated-token',expires_in:3600,token_type:'Bearer'}};}
  assert.equal(String(options.url),'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+writer+':generateAccessToken');
  assert.deepEqual(options.data.scope,['https://www.googleapis.com/auth/datastore']);
  assert.equal(new Headers(options.headers).get('authorization'),'Bearer synthetic-federated-token');
  return {data:{accessToken:'synthetic-admin-writer-token',expireTime:new Date(Date.now()+3600000).toISOString()}};
 });
 try {
  const token=await keylessToken({...env,GCP_PROJECT_NUMBER:'103840050410',GCP_WORKLOAD_IDENTITY_POOL_ID:'vercel-research-center',GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID:'vercel'},'TSS_ADMIN_SESSION_WRITER_SERVICE_ACCOUNT_EMAIL');
  assert.equal(token,'synthetic-admin-writer-token');assert.equal(stage,2);
 }finally{
  if(prior===undefined)delete process.env.VERCEL_OIDC_TOKEN;else process.env.VERCEL_OIDC_TOKEN=prior;
  if(priorFile===undefined)delete process.env.VERCEL_OIDC_TOKEN_FILE;else process.env.VERCEL_OIDC_TOKEN_FILE=priorFile;
 }
});
