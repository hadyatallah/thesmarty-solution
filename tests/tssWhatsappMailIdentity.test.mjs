import test from 'node:test';
import assert from 'node:assert/strict';
import {federatedMailToken} from '../lib/tssWhatsappMailIdentity.mjs';
const MAIL='tss-whatsapp-owner-mail@tss-crm-508908.iam.gserviceaccount.com';
const env={VERCEL_ENV:'preview',TSS_WHATSAPP_OWNER_EMAIL_NOTIFICATIONS:'approved',TSS_WHATSAPP_MAIL_SCOPE_VERIFIED:'approved',TSS_WHATSAPP_MAIL_SCOPE_EVIDENCE_SHA256:'a'.repeat(64),TSS_WHATSAPP_MAIL_AUTH:'google-federated',TSS_WHATSAPP_MAIL_SERVICE_ACCOUNT_EMAIL:MAIL,TSS_WHATSAPP_MAIL_TENANT_ID:'0d3c6e54-c584-44a3-bb2d-4533b5393fc6',TSS_WHATSAPP_MAIL_CLIENT_ID:'1b834ef7-b258-41fb-8ca9-ea9f093b4264',TSS_WHATSAPP_MAIL_GOOGLE_SUBJECT:'103840050410123456789'};
const claims={iss:'https://accounts.google.com',aud:'api://AzureADTokenExchange',sub:env.TSS_WHATSAPP_MAIL_GOOGLE_SUBJECT,email:MAIL,email_verified:true};
function fixture(change={}){
 const calls=[];const assertion='header.'+Buffer.from(JSON.stringify({...claims,...change})).toString('base64url')+'.signature';
 return {calls,dependencies:{subjectToken:async()=>'VERCEL_PRIVATE_TOKEN',exchange:async()=>({token:'PRIVATE_STS'}),fetcher:async(url,options)=>{
  calls.push({url,options});return {ok:true,json:async()=>url.includes('iamcredentials')?{token:assertion}:{access_token:'PRIVATE_GRAPH_ACCESS_TOKEN'}};
 }}};
}
test('keyless Google ID assertion exchanges for Graph without a client secret',async()=>{
 const f=fixture();assert.equal(await federatedMailToken(env,f.dependencies),'PRIVATE_GRAPH_ACCESS_TOKEN');assert.equal(f.calls.length,2);
 const [google,microsoft]=f.calls;assert.ok(google.url.endsWith(MAIL+':generateIdToken'));
 assert.deepEqual(JSON.parse(google.options.body),{audience:'api://AzureADTokenExchange',includeEmail:true});
 assert.equal(microsoft.options.body.get('grant_type'),'client_credentials');assert.equal(microsoft.options.body.has('client_secret'),false);
 for(const c of f.calls)assert.equal(c.options.redirect,'error');
});
test('mail federation denies production, disabled flags and changed identities before any token request',async()=>{
 for(const patch of [{TSS_WHATSAPP_MAIL_SCOPE_VERIFIED:'pending'},{TSS_WHATSAPP_MAIL_SCOPE_EVIDENCE_SHA256:''},{VERCEL_ENV:'production'},{TSS_WHATSAPP_MAIL_AUTH:'secret'},{TSS_WHATSAPP_MAIL_SERVICE_ACCOUNT_EMAIL:'other@example.com'},{TSS_WHATSAPP_OWNER_EMAIL_NOTIFICATIONS:'disabled'},{TSS_WHATSAPP_MAIL_TENANT_ID:'../other'},{TSS_WHATSAPP_MAIL_TENANT_ID:'11111111-1111-1111-1111-111111111111'},{TSS_WHATSAPP_MAIL_CLIENT_ID:'22222222-2222-2222-2222-222222222222'}]){
  const f=fixture();await assert.rejects(federatedMailToken({...env,...patch},f.dependencies),/not_configured/);assert.equal(f.calls.length,0);
 }
});
test('wrong Google subject or issuer cannot reach Microsoft and provider errors remain sanitized',async()=>{
 for(const change of [{sub:'other'},{iss:'other'},{aud:'other'},{email:'other@example.com'},{email_verified:false}]){
  const f=fixture(change);await assert.rejects(federatedMailToken(env,f.dependencies),/^Error: mail_federation_unavailable$/);assert.equal(f.calls.length,1);
 }
 const f=fixture();f.dependencies.fetcher=async()=>{throw Error('PRIVATE_PROVIDER_TOKEN');};await assert.rejects(federatedMailToken(env,f.dependencies),/^Error: mail_federation_unavailable$/);
});
