import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovedSender,metaTestTransport} from '../lib/tssWhatsappSender.mjs';
import {firestoreLedger,digest,seal,validSeal} from '../lib/tssWhatsappLedger.mjs';
function fixture(){
 let time=Date.UTC(2026,9,22,12);const rows=new Map(),eventKey='a'.repeat(64);
 const ledger={async create(id,row){if(rows.has(id))return false;rows.set(id,structuredClone(row));return true;},async get(id){return rows.get(id)||null;}};
 const env={VERCEL_ENV:'preview',TSS_WHATSAPP_REPLY_MODE:'test-approved',TSS_WHATSAPP_TEST_RECIPIENTS:'15550000000',TSS_WHATSAPP_TEST_TRANSMISSION_APPROVED:'true',TSS_WHATSAPP_COST_APPROVED:'true'};
 const session={email:'thesmartysolution@gmail.com',csrfHash:'session-hash',expiresAt:time+900000};
 const event={key:eventKey,kind:'message',sender:'15550000000',wabaId:'2882413005471663',phoneNumberId:'1378287792033123',messageId:'wamid.inbound',timestamp:String(time/1000)};
 let calls=0;let result={state:'SUBMITTED',providerMessageId:'wamid.confirmed'};
 const transport=async()=>{calls++;if(result instanceof Error)throw result;return result;};
 const make=()=>createApprovedSender({env,ledger,loadEvent:async()=>event,transport,now:()=>time});
 const approve=()=>make().approve({session,eventKey,text:'Approved test text',explicitApproval:true});
 const send=approval=>make().send({...approval,session,eventKey,text:'Approved test text'});
 return {rows,ledger,env,session,event,eventKey,make,approve,send,get calls(){return calls;},set result(r){result=r;},advance:ms=>time+=ms};
}
test('durable claim arbitrates concurrent sends and survives new worker instances',async()=>{
 const f=fixture(),approval=await f.approve();
 const results=await Promise.all([f.send(approval),f.send(approval),f.send(approval)]);
 assert.equal(f.calls,1);assert.equal(results.filter(r=>r.attempted).length,1);
 assert.equal((await f.send(approval)).attempted,false);assert.equal(f.calls,1);
 for(const row of f.rows.values())assert.ok(validSeal(row));
 assert.doesNotMatch(JSON.stringify([...f.rows.values()]),/Approved test text|15550000000/);
});
test('owner approval binds event, exact text, token and live session',async()=>{
 const f=fixture(),approval=await f.approve();
 for(const patch of [{text:'Changed text'},{approvalToken:'x'.repeat(43)},{session:{...f.session,csrfHash:'other'}},{eventKey:'b'.repeat(64)}]){
  await assert.rejects(f.make().send({...approval,session:f.session,eventKey:f.eventKey,text:'Approved test text',...patch}));
 }
 assert.equal(f.calls,0);f.advance(300001);await assert.rejects(f.send(approval),/approval_invalid/);
});
test('production, absent approval/cost gates, unknown recipient and stale windows never transmit',async()=>{
 for(const patch of [{VERCEL_ENV:'production'},{TSS_WHATSAPP_REPLY_MODE:'send'},{TSS_WHATSAPP_TEST_RECIPIENTS:''}]){
  const f=fixture();Object.assign(f.env,patch);await assert.rejects(f.approve());assert.equal(f.calls,0);
 }
 for(const name of ['TSS_WHATSAPP_TEST_TRANSMISSION_APPROVED','TSS_WHATSAPP_COST_APPROVED']){
  const f=fixture(),approval=await f.approve();delete f.env[name];await assert.rejects(f.send(approval));assert.equal(f.calls,0);
 }
 const f=fixture();await assert.rejects(f.make().approve({session:f.session,eventKey:f.eventKey,text:'text',explicitApproval:false}));
 f.event.timestamp=String(Number(f.event.timestamp)-86400);await assert.rejects(f.approve(),/fresh_inbound_window_required/);
 f.event.timestamp='invalid';await assert.rejects(f.approve());
});
test('ambiguous timeout remains manual review across retries and reconciliation',async()=>{
 const f=fixture();f.result=Error('PRIVATE_PROVIDER_BODY');const approval=await f.approve();
 assert.equal((await f.send(approval)).state,'UNKNOWN_REVIEW_REQUIRED');
 const actionId=approval.actionId;
 await f.make().reconcile({session:f.session,actionId,classification:'CONFIRMED_NOT_SENT',evidenceReference:'review:owner_checked_123'});
 assert.equal((await f.send(approval)).attempted,false);assert.equal(f.calls,1);
 assert.doesNotMatch(JSON.stringify([...f.rows.values()]),/PRIVATE_PROVIDER_BODY/);
});
test('audit failure before dispatch prevents transmission; outcome failure never reopens claim',async()=>{
 const f=fixture(),approval=await f.approve();const create=f.ledger.create;
 f.ledger.create=async(id,row)=>{if(id.endsWith('_claim'))throw Error('store_down');return create(id,row);};
 await assert.rejects(f.send(approval));assert.equal(f.calls,0);
 f.ledger.create=async(id,row)=>{if(id.endsWith('_outcome'))throw Error('store_down');return create(id,row);};
 assert.equal((await f.send(approval)).auditPending,true);assert.equal(f.calls,1);
 assert.equal((await f.send(approval)).state,'UNKNOWN_REVIEW_REQUIRED');assert.equal(f.calls,1);
});
test('delivery observation requires exact signed Inbox status correlation',async()=>{
 const f=fixture(),approval=await f.approve();await f.send(approval);
 const statusKey='b'.repeat(64);Object.assign(f.event,{key:statusKey,kind:'status',type:'delivered',messageId:'wamid.other'});
 await assert.rejects(f.make().recordStatus({session:f.session,actionId:approval.actionId,eventKey:statusKey}));
 f.event.messageId='wamid.confirmed';const r=await f.make().recordStatus({session:f.session,actionId:approval.actionId,eventKey:statusKey});
 assert.equal(r.observedStatus,'delivered');assert.equal(r.created,true);
 assert.equal((await f.make().recordStatus({session:f.session,actionId:approval.actionId,eventKey:statusKey})).created,false);
});
test('Meta transport is pinned and classifies malformed success/timeouts as uncertain',async()=>{
 const env={VERCEL_ENV:'preview',TSS_WHATSAPP_REPLY_MODE:'test-approved',TSS_WHATSAPP_TEST_TRANSMISSION_APPROVED:'true',TSS_WHATSAPP_COST_APPROVED:'true',TSS_WHATSAPP_GRAPH_VERSION:'v99.0'};
 let calls=0;let response=new Response('{"messages":[{"id":"wamid.synthetic"}]}',{status:200});
 const h=metaTestTransport({env,getToken:async()=> 'SYNTHETIC_PRIVATE_TOKEN',fetcher:async(url,o)=>{calls++;assert.equal(url,'https://graph.facebook.com/v99.0/1378287792033123/messages');assert.equal(o.redirect,'error');assert.equal(o.headers.authorization,'Bearer SYNTHETIC_PRIVATE_TOKEN');return response;}});
 assert.equal((await h({to:'15550000000'},'1378287792033123')).state,'SUBMITTED');
 response=new Response('{}',{status:200});assert.equal((await h({to:'15550000000'},'1378287792033123')).state,'UNKNOWN_REVIEW_REQUIRED');
 response=new Response('{"error":{"code":131047,"message":"PRIVATE"}}',{status:400});assert.equal((await h({to:'15550000000'},'1378287792033123')).state,'FAILED');
 const before=calls;await assert.rejects(h({to:'35799810330'},'1378287792033123'));assert.equal(calls,before);
});
test('Firestore audit adapter only creates and reads pinned sealed records',async()=>{
 const row=seal({kind:'fixture',at:1});let requests=[];
 const ledger=firestoreLedger({getToken:async()=> 'synthetic',fetcher:async(url,o)=>{requests.push({url,...o});return o.method==='POST'?new Response('{}',{status:200}):new Response(JSON.stringify({fields:{record:{stringValue:JSON.stringify(row)}}}),{status:200});}});
 const id=digest('fixture')+'_claim';assert.equal(await ledger.create(id,row),true);assert.deepEqual(await ledger.get(id),row);
 await assert.rejects(ledger.get('../private'));await assert.rejects(ledger.create(id,{...row,at:2}));
 assert.equal(requests.length,2);assert.deepEqual(requests.map(r=>r.method),['POST','GET']);
 assert.ok(requests.every(r=>r.url.includes('/tss_whatsapp_operations')));
});

test('review acknowledgement is durable, deduplicated, owner-only and never sends',async()=>{
 const f=fixture();const args={session:f.session,eventKey:f.eventKey};
 assert.equal((await f.make().markReviewed(args)).reviewed,true);
 assert.equal((await f.make().markReviewed(args)).duplicate,true);
 assert.equal(f.rows.size,1);assert.equal(f.calls,0);
 assert.ok(validSeal(f.rows.get(f.eventKey+'_review')));
 await assert.rejects(f.make().markReviewed({...args,session:{...f.session,email:'other@example.com'}}));
 f.env.VERCEL_ENV='production';await assert.rejects(f.make().markReviewed(args));
});
