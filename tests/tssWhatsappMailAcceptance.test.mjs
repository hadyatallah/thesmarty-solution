import test from 'node:test';
import assert from 'node:assert/strict';
import {createMailAcceptance,ACCEPTANCE_ID,ACCEPTANCE_APPROVAL} from '../lib/tssWhatsappMailAcceptance.mjs';
const env={VERCEL_ENV:'preview',TSS_WHATSAPP_OWNER_EMAIL_NOTIFICATIONS:'approved',TSS_WHATSAPP_MAIL_SCOPE_VERIFIED:'approved'};
function fixture(transport=async()=>({state:'SUBMITTED_UNVERIFIED'})){
 const rows=new Map(),tasks=[];let release;
 const ledger={create:async(id,row)=>{if(rows.has(id))return false;rows.set(id,row);return true;},get:async id=>rows.get(id)||null};
 const h=createMailAcceptance({env,ledger,transport,defer:p=>tasks.push(p),delay:()=>new Promise(r=>{release=r;}),now:()=>1000});
 return {h,rows,tasks,release:()=>release()};
}
test('acceptance defers fixed recipient test and concurrent requests cannot schedule two sends',async()=>{
 let calls=0;const f=fixture(async a=>{calls++;assert.equal(a.id,ACCEPTANCE_ID);assert.equal(a.kind,'acceptance_test');return {state:'SUBMITTED_UNVERIFIED'};});
 const results=await Promise.all([f.h.start({explicitApproval:ACCEPTANCE_APPROVAL}),f.h.start({explicitApproval:ACCEPTANCE_APPROVAL})]);
 assert.equal(results.filter(x=>x.duplicateSuppressed).length,1);assert.equal(calls,0);assert.equal(f.tasks.length,1);
 f.release();await Promise.all(f.tasks);assert.equal(calls,1);assert.equal((await f.h.status()).state,'SUBMITTED_UNVERIFIED');
 assert.equal((await f.h.start({explicitApproval:ACCEPTANCE_APPROVAL})).duplicateSuppressed,true);assert.equal(calls,1);
});
test('uncertain send and definitive failure are never automatically resent by acceptance',async()=>{
 for(const state of ['FAILED','UNKNOWN_REVIEW_REQUIRED']){
 let calls=0;const f=fixture(async()=>{calls++;return {state};});await f.h.start({explicitApproval:ACCEPTANCE_APPROVAL});f.release();await Promise.all(f.tasks);
 await f.h.start({explicitApproval:ACCEPTANCE_APPROVAL});assert.equal(calls,1);assert.equal((await f.h.status()).state,state);
 }
});
test('acceptance requires exact approval and Preview gates before any durable write',async()=>{
 const f=fixture();await assert.rejects(()=>f.h.start({explicitApproval:'send'}));assert.equal(f.rows.size,0);
 for(const patch of [{VERCEL_ENV:'production'},{TSS_WHATSAPP_OWNER_EMAIL_NOTIFICATIONS:'disabled'},{TSS_WHATSAPP_MAIL_SCOPE_VERIFIED:''}]){
 const h=createMailAcceptance({env:{...env,...patch},ledger:{create(){throw Error('must not write');}}});await assert.rejects(()=>h.start({explicitApproval:ACCEPTANCE_APPROVAL}),/mail_acceptance_disabled/);
 }
});
