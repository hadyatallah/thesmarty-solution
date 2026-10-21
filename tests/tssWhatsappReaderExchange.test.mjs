import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createInboxHandler } from '../lib/tssWhatsappInbox.mjs';
import { keylessToken } from '../lib/tssWhatsappGoogle.mjs';
const { Gaxios } = createRequire(import.meta.url)('gaxios');

test('real Google library exchanges a synthetic Vercel subject for the dedicated reader before Firestore', async t => {
 const env = {
  GCP_PROJECT_NUMBER:'103840050410', GCP_WORKLOAD_IDENTITY_POOL_ID:'vercel-research-center', GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID:'vercel',
  TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL:'tss-whatsapp-inbox-reader@tss-crm-508908.iam.gserviceaccount.com',
  TSS_WHATSAPP_OWNER_EMAIL:'thesmartysolution@gmail.com', TSS_WHATSAPP_FIRESTORE_PARENT:'projects/tss-crm-508908/databases/(default)/documents',
  TSS_WHATSAPP_READER_AUTH_READY:'true', TSS_WHATSAPP_GOOGLE_CLIENT_ID:'103840050410-synthetic.apps.googleusercontent.com'
 };
 const subject = [Buffer.from(JSON.stringify({alg:'RS256'})).toString('base64url'), Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,sub:'synthetic-preview-subject',aud:'https://vercel.com/tss21'})).toString('base64url'), 'synthetic-signature-only'].join('.');
 const sts = 'synthetic-sts-token-not-reader-token';
 const reader = 'synthetic-impersonated-reader-access-token';
 const prior = process.env.VERCEL_OIDC_TOKEN;
 const priorFile = process.env.VERCEL_OIDC_TOKEN_FILE;
 process.env.VERCEL_OIDC_TOKEN=subject;
 delete process.env.VERCEL_OIDC_TOKEN_FILE;
 let stage=0;
 t.mock.method(Gaxios.prototype, 'request', async options => {
  const url=String(options.url);
  assert.equal(options.method,'POST');
  if (stage===0) {
   assert.equal(url,'https://sts.googleapis.com/v1/token');
   assert.equal(options.data.get('subject_token'),subject);
   assert.equal(options.data.get('scope'),'https://www.googleapis.com/auth/cloud-platform');
   assert.equal(options.data.get('audience'),'//iam.googleapis.com/projects/103840050410/locations/global/workloadIdentityPools/vercel-research-center/providers/vercel');
   stage++;
   return {data:{access_token:sts,expires_in:3600,token_type:'Bearer'}};
  }
  assert.equal(stage,1);
  assert.equal(url,'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+env.TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL+':generateAccessToken');
  assert.equal(new Headers(options.headers).get('authorization'),'Bearer '+sts);
  assert.deepEqual(options.data.scope,['https://www.googleapis.com/auth/cloud-platform']);
  stage++;
  return {data:{accessToken:reader,expireTime:new Date(Date.now()+3600000).toISOString()}};
 });
 try {
  const handler=createInboxHandler({enabled:true,env,
   verifyIdentity:async()=>({email:env.TSS_WHATSAPP_OWNER_EMAIL,email_verified:true}),
   readerAccessToken:async()=>directToken,
   fetcher:async(url,options)=>{
    assert.equal(stage,2); assert.equal(options.method,'GET');
    assert.equal(options.headers.Authorization,'Bearer '+reader);
    assert.match(url,/^https:\/\/firestore.googleapis.com\/v1\/projects\/tss-crm-508908\/databases\/\(default\)\/documents\/tss_whatsapp_inbox\?/);
    stage++; return Response.json({documents:[]});
   }
  });
  const res={setHeader(){},end(body){this.body=JSON.parse(body);}};
  await handler({method:'GET',url:'/api/tss-whatsapp-inbox',headers:{authorization:'Bearer '+'synthetic-owner-id-token'.repeat(3)}},res);
  assert.equal(res.statusCode,200); assert.deepEqual(res.body.records,[]); assert.equal(stage,3);
 } finally {
  if(prior===undefined)delete process.env.VERCEL_OIDC_TOKEN;else process.env.VERCEL_OIDC_TOKEN=prior;
  if(priorFile===undefined)delete process.env.VERCEL_OIDC_TOKEN_FILE;else process.env.VERCEL_OIDC_TOKEN_FILE=priorFile;
 }
});
