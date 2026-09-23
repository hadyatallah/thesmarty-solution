import test from 'node:test';
import assert from 'node:assert/strict';
import {emailWindowOpen} from '../../command-center/email-hours.js';
import {Gateway} from '../../command-center/gateway.js';
import {TestStore} from './support.js';
test('P2-22 Cyprus business hours observe winter and summer time and exact boundaries',()=>{
 for(const [iso,expected] of [['2026-01-05T06:59:59Z',false],['2026-01-05T07:00:00Z',true],['2026-01-05T14:59:59Z',true],['2026-01-05T15:00:00Z',false],['2026-09-22T05:59:59Z',false],['2026-09-22T06:00:00Z',true],['2026-09-22T13:59:59Z',true],['2026-09-22T14:00:00Z',false],['2026-09-26T09:00:00Z',false],['2026-09-27T09:00:00Z',false],['2026-03-30T06:00:00Z',true],['2026-10-26T07:00:00Z',true]])assert.equal(emailWindowOpen(new Date(iso)),expected,iso);
 assert.equal(emailWindowOpen(new Date('invalid')),false);
});
test('P2-23 approved out-of-hours email is held without provider dispatch and needs valid approval later',async()=>{
 let now=new Date('2026-09-22T18:00:00Z'),calls=0;const store=new TestStore(),ctx={tenantId:'tss',actor:'test'};
 const gateway=new Gateway({store,clock:()=>now,authorize:async()=>true,adapter:{validate:async()=>{},execute:async()=>{calls++;return {receipt:'synthetic'}}}});
 const action=await gateway.propose(ctx,{source:'growth',requestId:'hours-test',entity:'Email',operation:'send',fields:{from:'info@thesmartysolution.com',to:'internal@example.test',body:'Synthetic only',businessHours:false},expectedOutcome:'Synthetic email receipt'});
 await gateway.approve(ctx,action.id,action.payloadHash);
 await assert.rejects(gateway.execute(ctx,action.id),/EMAIL_OUTSIDE_BUSINESS_HOURS/);assert.equal(calls,0);
 now=new Date('2026-09-23T06:00:00Z');await assert.rejects(gateway.execute(ctx,action.id),/APPROVAL_REQUIRED/);assert.equal(calls,0);
 await gateway.approve(ctx,action.id,action.payloadHash);await gateway.execute(ctx,action.id);assert.equal(calls,1);
});
test('P2-24 final dispatch check blocks an email crossing closing time during validation',async()=>{
 let now=new Date('2026-09-22T13:59:59Z'),calls=0;
 const gateway=new Gateway({store:new TestStore(),clock:()=>now,authorize:async()=>true,adapter:{validate:async()=>{now=new Date('2026-09-22T14:00:00Z')},execute:async()=>{calls++;return {receipt:'synthetic'}}}});
 const ctx={tenantId:'tss',actor:'test'},a=await gateway.propose(ctx,{source:'growth',requestId:'closing-time',entity:'Email',operation:'send',fields:{},expectedOutcome:'Synthetic'});
 await gateway.approve(ctx,a.id,a.payloadHash);const result=await gateway.execute(ctx,a.id);assert.equal(result.status,'failed');assert.equal(result.errorCode,'EMAIL_OUTSIDE_BUSINESS_HOURS');assert.equal(calls,0);
});
