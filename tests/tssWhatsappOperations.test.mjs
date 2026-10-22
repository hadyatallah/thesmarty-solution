import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareTestReply,createOperationsHandler,retentionPlan} from '../lib/tssWhatsappOperations.mjs';
import {createOwnerAlerts} from '../whatsapp-inbox/alerts.mjs';
const key='a'.repeat(64),csrf='c'.repeat(43),hash=s=>createHash('sha256').update(s).digest('hex');
const env={VERCEL_ENV:'preview',TSS_ADMIN_ORIGIN:'https://whatsapp-preview.thesmartysolution.com',TSS_WHATSAPP_REPLY_MODE:'dry-run',TSS_WHATSAPP_TEST_RECIPIENTS:'15550000000'};
const event={key,kind:'message',wabaId:'2882413005471663',phoneNumberId:'1378287792033123',messageId:'wamid.synthetic',sender:'15550000000'};
const body={action:'prepare-test-reply',eventKey:key,text:'Synthetic test only'};
test('test reply is deterministic, unsent and locked to test accounts and recipient allowlist',()=>{
 const r=prepareTestReply(event,body,env);assert.equal(r.sent,false);assert.equal(r.payload.to,event.sender);assert.equal(r.approvalDigest,prepareTestReply(event,body,env).approvalDigest);
 for(const changes of [{VERCEL_ENV:'production'},{TSS_WHATSAPP_REPLY_MODE:'send'},{TSS_WHATSAPP_REPLY_MODE:undefined},{TSS_WHATSAPP_TEST_RECIPIENTS:''}])assert.throws(()=>prepareTestReply(event,body,{...env,...changes}));
 for(const changes of [{kind:'status'},{wabaId:'production'},{phoneNumberId:'production'},{sender:'35799810330'}])assert.throws(()=>prepareTestReply({...event,...changes},body,env));
 for(const changes of [{to:'35799810330'},{text:''},{text:'x'.repeat(2001)},{eventKey:'b'.repeat(64)},{action:'send'}])assert.throws(()=>prepareTestReply(event,{...body,...changes},env));
});
test('owner, CSRF and origin precede event read; workflow has no send transport',async()=>{
 let reads=0;const audits=[];
 const h=createOperationsHandler({env,authenticate:async req=>{if(!req.headers.cookie)throw Object.assign(Error('owner_session_required'),{status:401});return {email:req.headers.cookie==='bad'?'bad@example.com':'thesmartysolution@gmail.com',csrfHash:hash(csrf)};},loadEvent:async()=>{reads++;return event;},audit:e=>audits.push(e)});
 async function run(headers={},data=body){const res={setHeader(){},end(s){this.body=JSON.parse(s);}};await h({method:'POST',headers:{cookie:'owner',origin:env.TSS_ADMIN_ORIGIN,'content-type':'application/json','x-tss-csrf':csrf,...headers},body:data},res);return res;}
 assert.equal((await run({origin:'https://evil.example'})).statusCode,403);assert.equal((await run({cookie:''})).statusCode,401);assert.equal((await run({cookie:'bad'})).statusCode,403);assert.equal((await run({'x-tss-csrf':'wrong'})).statusCode,403);assert.equal(reads,0);
 assert.equal((await run()).body.sent,false);assert.equal(reads,1);assert.doesNotMatch(JSON.stringify(audits),/Synthetic test only|15550000000/);
});
test('retention is non-destructive, legal holds win and dedupe is preserved',()=>{
 const now=Date.UTC(2026,9,21);const records=[{key:'old',receivedAt:'2025-01-01'},{key:'held',receivedAt:'2025-01-01',legalHold:true},{key:'new',receivedAt:new Date(now).toISOString()},{key:'invalid',receivedAt:'invalid'}];
 const p=retentionPlan(records,{now});assert.equal(p.deletionAllowed,false);assert.equal(p.activated,false);assert.deepEqual(p.candidates,[{eventKey:'old',action:'review_payload_redaction',preserveDedupe:true}]);assert.equal(retentionPlan(records,{now,policyApproved:true}).activated,false);assert.throws(()=>retentionPlan([],{retentionDays:0}));
});
test('owner alerts suppress baseline and old pages, deduplicate, throttle, reset and omit contents',()=>{
 const alerts=[];let now=0;const a=createOwnerAlerts({notify:m=>alerts.push(m),now:()=>now});
 a.observe([{key:'baseline',kind:'message'}]);assert.equal(alerts.length,0);
 a.observe([{key:'new',kind:'message',body:'PRIVATE',sender:'PRIVATE'}]);a.observe([{key:'new',kind:'message'}]);assert.equal(alerts.length,1);
 a.observe([{key:'old',kind:'message'}],{append:true});assert.equal(alerts.length,1);
 a.observe([{key:'error',kind:'provider_error'}]);a.failure();a.failure();assert.equal(alerts.length,3);now+=60001;a.failure();assert.equal(alerts.length,4);
 assert.doesNotMatch(JSON.stringify(alerts),/PRIVATE/);a.reset();a.observe([{key:'newest',kind:'message'}]);assert.equal(alerts.length,4);
});
import {createHealthHandler} from '../lib/tssWhatsappOperations.mjs';
test('policy preview is selected-event only and production blocks even capability reads',async()=>{
 const h=createOperationsHandler({env,authenticate:async()=>({email:'thesmartysolution@gmail.com',csrfHash:hash(csrf)}),loadEvent:async()=>({...event,receivedAt:'2026-10-22',legalHold:true})});
 const r={setHeader(){},end(x){this.body=JSON.parse(x);}};
 await h({method:'POST',headers:{origin:env.TSS_ADMIN_ORIGIN,'content-type':'application/json','x-tss-csrf':csrf},body:{action:'policy-preview',eventKey:key,retentionDays:90}},r);
 assert.equal(r.statusCode,200);assert.equal(r.body.deletionAllowed,false);assert.equal(r.body.scope,'selected-event-only');assert.equal(r.body.inventory.legalHoldOrUnknown,1);
 const production=createOperationsHandler({env:{...env,VERCEL_ENV:'production',TSS_ADMIN_ORIGIN:'https://www.thesmartysolution.com'},authenticate:async()=>({email:'thesmartysolution@gmail.com',csrfHash:hash(csrf)}),loadEvent:async()=>{throw Error('must_not_read');}});
 await production({method:'POST',headers:{origin:'https://www.thesmartysolution.com','content-type':'application/json','x-tss-csrf':csrf},body:{action:'capabilities'}},r);
 assert.equal(r.statusCode,423);
});
test('health is owner-gated, uses pinned URL without credentials and fails on wrong response',async()=>{
 for(const status of [400,403,503]){
  let calls=0;const h=createHealthHandler({env,authenticate:async req=>{if(!req.headers.cookie)throw Object.assign(Error('owner_session_required'),{status:401});return {email:'thesmartysolution@gmail.com'};},fetcher:async(url,options)=>{calls++;assert.equal(url,env.TSS_ADMIN_ORIGIN+'/api/tss-whatsapp-webhook');assert.equal(options.redirect,'error');assert.equal(options.headers,undefined);return new Response(status===400?'Invalid challenge':'Unavailable',{status});}});
  async function run(cookie){const res={setHeader(){},end(s){this.body=JSON.parse(s);}};await h({method:'GET',headers:{cookie}},res);return res;}
  assert.equal((await run('')).statusCode,401);assert.equal(calls,0);const r=await run('owner');assert.equal(r.statusCode,status===400?200:503);assert.equal(r.body.endToEndVerified,false);
 }
});
