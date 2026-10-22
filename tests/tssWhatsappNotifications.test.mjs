import test from 'node:test';
import assert from 'node:assert/strict';
import {planOwnerAlerts,createOwnerNotifier,outlookOwnerTransport} from '../lib/tssWhatsappNotifications.mjs';
import {validSeal} from '../lib/tssWhatsappLedger.mjs';
const event={key:'a'.repeat(64),kind:'message',receivedAt:'2026-10-22T10:00:00Z',sender:'PRIVATE',body:'PRIVATE'};
function fixture(){let time=Date.parse('2026-10-22T11:00:00Z'),calls=0,result={state:'SUBMITTED_UNVERIFIED'};const rows=new Map();
 const ledger={async create(id,row){if(rows.has(id))return false;rows.set(id,row);return true;},async get(id){return rows.get(id)||null;}};
 const make=()=>createOwnerNotifier({ledger,now:()=>time,transport:async()=>{calls++;if(result instanceof Error)throw result;return result;}});
 return {ledger,rows,make,set result(r){result=r;},get calls(){return calls;},advance:ms=>time+=ms};}
test('alert planning covers failures and unread records without private content',()=>{
 const alerts=planOwnerAlerts({events:[event,event],outcomes:[{actionId:'b'.repeat(64),state:'FAILED'},{actionId:'c'.repeat(64),state:'UNKNOWN_REVIEW_REQUIRED'}],health:{webhook_failure:true,firestore_failure:true},now:Date.parse('2026-10-22T11:00:00Z')});
 assert.equal(alerts.length,6);assert.doesNotMatch(JSON.stringify(alerts),/PRIVATE/);
 assert.equal(planOwnerAlerts({events:[event],reviewedKeys:[event.key],now:Date.parse('2026-10-22T11:00:00Z')}).length,1);
});
test('notification claims deduplicate across concurrent and restarted workers',async()=>{
 const f=fixture(),alert=planOwnerAlerts({events:[event]})[0];
 await Promise.all([f.make()(alert),f.make()(alert),f.make()(alert)]);
 assert.equal(f.calls,1);assert.equal((await f.make()(alert)).state,'SUBMITTED_UNVERIFIED');
 for(const row of f.rows.values())assert.ok(validSeal(row));
});
test('definitive notification failure retries with backoff and finite attempts',async()=>{
 const f=fixture(),alert=planOwnerAlerts({events:[event]})[0];f.result={state:'FAILED'};
 await f.make()(alert);await f.make()(alert);assert.equal(f.calls,1);
 f.advance(60000);await f.make()(alert);assert.equal(f.calls,2);
 f.advance(120000);await f.make()(alert);assert.equal(f.calls,3);
 f.advance(240000);assert.equal((await f.make()(alert)).retriesExhausted,true);assert.equal(f.calls,3);
});
test('notification timeout and ambiguous audit outcome never automatically resend',async()=>{
 const f=fixture(),alert=planOwnerAlerts({events:[event]})[0];f.result=Error('PRIVATE_PROVIDER');
 assert.equal((await f.make()(alert)).state,'UNKNOWN_REVIEW_REQUIRED');f.advance(86400000);await f.make()(alert);assert.equal(f.calls,1);
 const g=fixture(),create=g.ledger.create;g.ledger.create=async(id,row)=>{if(id.includes('_notice_outcome_'))throw Error();return create(id,row);};
 assert.equal((await g.make()(alert)).auditPending,true);await g.make()(alert);assert.equal(g.calls,1);
});
test('Outlook adapter fixes owner/sender and signature;202 is never delivery',async()=>{
 const alert=planOwnerAlerts({events:[event]})[0];let calls=0;
 const env={TSS_WHATSAPP_OWNER_EMAIL_NOTIFICATIONS:'approved'};
 const h=outlookOwnerTransport({env,getToken:async()=> 'synthetic',fetcher:async(url,o)=>{calls++;assert.match(url,/users\/info%40thesmartysolution.com\/sendMail$/);const payload=JSON.parse(o.body);assert.deepEqual(payload.message.toRecipients,[{emailAddress:{address:'thesmartysolution@gmail.com'}}]);assert.match(payload.message.body.content,/Hady Atallah\nThe Smarty Solution LTD/);assert.doesNotMatch(JSON.stringify(payload),/PRIVATE/);return new Response(null,{status:202});}});
 assert.equal((await h(alert)).state,'SUBMITTED_UNVERIFIED');delete env.TSS_WHATSAPP_OWNER_EMAIL_NOTIFICATIONS;await assert.rejects(h(alert));assert.equal(calls,1);
});
