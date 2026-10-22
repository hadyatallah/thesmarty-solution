import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationWorker} from '../lib/tssWhatsappNotificationWorker.mjs';
test('notification worker gates all I/O and requires a verified platform identity',async()=>{
 let reads=0,identities=0;
 const env={};const h=createNotificationWorker({env,authenticateJob:async()=>{identities++;throw Error();},loadInventory:async()=>{reads++;}});
 const run=async()=>{const r={setHeader(){},end(x){this.body=JSON.parse(x);}};await h({method:'POST'},r);return r;};
 assert.equal((await run()).statusCode,423);assert.equal(identities,0);
 Object.assign(env,{TSS_WHATSAPP_NOTIFICATION_WORKER:'approved',TSS_WHATSAPP_OWNER_EMAIL_NOTIFICATIONS:'approved'});
 assert.equal((await run()).statusCode,401);assert.equal(reads,0);
});
test('closed-browser worker runs without a browser and deduplicates immutable outbox',async()=>{
 const env={TSS_WHATSAPP_NOTIFICATION_WORKER:'approved',TSS_WHATSAPP_OWNER_EMAIL_NOTIFICATIONS:'approved',TSS_WHATSAPP_NOTIFICATION_START_AT:'2026-10-22T10:00:00Z'};
 const rows=new Map();let sends=0;
 const ledger={async create(id,row){if(rows.has(id))return false;rows.set(id,row);return true;},async get(id){return rows.get(id)||null;}};
 const h=createNotificationWorker({env,authenticateJob:async()=>{},loadInventory:async()=>({events:[{key:'a'.repeat(64),kind:'message',receivedAt:'2026-10-22T11:00:00Z'}],operations:[],truncated:false}),ledger,now:()=>Date.parse('2026-10-22T11:01:00Z'),transport:async()=>{sends++;return {state:'SUBMITTED_UNVERIFIED'};}});
 const run=async()=>{const r={setHeader(){},end(x){this.body=JSON.parse(x);}};await h({method:'POST'},r);return r;};
 assert.equal((await run()).body.submittedUnverified,1);assert.equal((await run()).body.submittedUnverified,0);assert.equal(sends,1);assert.equal([...rows.values()].filter(x=>x.kind==='notification_cycle').length,2);
});
test('datastore outage returns a fixed failure and requires independent monitoring',async()=>{
 const audit=[];const h=createNotificationWorker({env:{TSS_WHATSAPP_NOTIFICATION_WORKER:'approved',TSS_WHATSAPP_OWNER_EMAIL_NOTIFICATIONS:'approved',TSS_WHATSAPP_NOTIFICATION_START_AT:'2026-01-01'},authenticateJob:async()=>{},loadInventory:async()=>{throw Error('PRIVATE_PROVIDER');},audit:e=>audit.push(e)});
 const r={setHeader(){},end(x){this.body=JSON.parse(x);}};await h({method:'POST'},r);
 assert.equal(r.statusCode,503);assert.equal(r.body.independentMonitorRequired,true);assert.doesNotMatch(JSON.stringify([r.body,audit]),/PRIVATE_PROVIDER/);
});

test('failed email is persisted and returns retryable HTTP failure without a tight retry loop',async()=>{
 const time=Date.parse('2026-10-22T11:01:00Z'),rows=new Map();let sends=0;
 const ledger={async create(id,row){if(rows.has(id))return false;rows.set(id,row);return true;},async get(id){return rows.get(id)||null;}};
 const h=createNotificationWorker({env:{TSS_WHATSAPP_NOTIFICATION_WORKER:'approved',TSS_WHATSAPP_OWNER_EMAIL_NOTIFICATIONS:'approved',TSS_WHATSAPP_NOTIFICATION_START_AT:'2026-10-22T10:00:00Z'},authenticateJob:async()=>{},loadInventory:async()=>({events:[{key:'a'.repeat(64),kind:'message',receivedAt:'2026-10-22T11:00:00Z'}],operations:[],truncated:false}),ledger,now:()=>time,transport:async()=>{sends++;return {state:'FAILED'};}});
 for(let i=0;i<2;i++){const r={setHeader(){},end(x){this.body=JSON.parse(x);}};await h({method:'POST'},r);assert.equal(r.statusCode,503);assert.equal(r.body.failed,1);}
 assert.equal(sends,1);assert.equal([...rows.values()].filter(x=>x.kind==='notification_cycle'&&!x.healthy).length,2);
});
