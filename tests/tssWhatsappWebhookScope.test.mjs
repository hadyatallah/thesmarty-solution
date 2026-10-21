import test from 'node:test';
import assert from 'node:assert/strict';
import {keylessToken} from '../lib/tssWhatsappGoogle.mjs';
import {createRequire} from 'node:module';
const {Gaxios}=createRequire(import.meta.url)('gaxios');
const env={TSS_WHATSAPP_SERVICE_ACCOUNT_EMAIL:'tss-whatsapp-webhook@tss-crm-508908.iam.gserviceaccount.com'};
test('webhook impersonation requests Secret Manager scope without changing reader or writer scopes',async t=>{
 const prior=process.env.VERCEL_OIDC_TOKEN,priorFile=process.env.VERCEL_OIDC_TOKEN_FILE;
 const subject=[Buffer.from(JSON.stringify({alg:'RS256'})).toString('base64url'),Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,sub:'owner:tss21:project:thesmarty-solution-agent:environment:preview',aud:'https://vercel.com/tss21'})).toString('base64url'),'synthetic-signature'].join('.');
 process.env.VERCEL_OIDC_TOKEN=subject;delete process.env.VERCEL_OIDC_TOKEN_FILE;
 let stage=0;
 t.mock.method(Gaxios.prototype,'request',async options=>{
  assert.equal(options.method,'POST');
  if(stage++===0){assert.equal(String(options.url),'https://sts.googleapis.com/v1/token');assert.equal(options.data.get('subject_token'),subject);return {data:{access_token:'synthetic-federated-token',expires_in:3600,token_type:'Bearer'}};}
  assert.equal(String(options.url),'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+env.TSS_WHATSAPP_SERVICE_ACCOUNT_EMAIL+':generateAccessToken');
  assert.deepEqual(options.data.scope,['https://www.googleapis.com/auth/cloud-platform']);
  assert.equal(new Headers(options.headers).get('authorization'),'Bearer synthetic-federated-token');
  return {data:{accessToken:'synthetic-admin-writer-token',expireTime:new Date(Date.now()+3600000).toISOString()}};
 });
 try {
  const token=await keylessToken({...env,GCP_PROJECT_NUMBER:'103840050410',GCP_WORKLOAD_IDENTITY_POOL_ID:'vercel-research-center',GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID:'vercel'},'TSS_WHATSAPP_SERVICE_ACCOUNT_EMAIL');
  assert.equal(token,'synthetic-admin-writer-token');assert.equal(stage,2);
 }finally{
  if(prior===undefined)delete process.env.VERCEL_OIDC_TOKEN;else process.env.VERCEL_OIDC_TOKEN=prior;
  if(priorFile===undefined)delete process.env.VERCEL_OIDC_TOKEN_FILE;else process.env.VERCEL_OIDC_TOKEN_FILE=priorFile;
 }
});
