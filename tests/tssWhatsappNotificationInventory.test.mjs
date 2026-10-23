import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationOperationsInventory} from '../lib/tssWhatsappNotificationInventory.mjs';
import {seal} from '../lib/tssWhatsappLedger.mjs';
const doc=(r,indexed=true)=>({fields:{record:{stringValue:JSON.stringify(r)},...(indexed?{recordKind:{stringValue:r.kind}}:{})}});
function fixture({legacy=[],business=[],cycle=[],nextPageToken}={}){const rows=new Map(),queries=[];let lists=0;return {rows,queries,get lists(){return lists;},args:{ledger:{get:async id=>rows.get(id)||null,create:async(id,r)=>{if(rows.has(id))return false;rows.set(id,r);return true;}},getToken:async()=> 'PRIVATE',fetcher:async(url,o)=>{
 if(String(url).endsWith(':runQuery')){const q=JSON.parse(o.body).structuredQuery;queries.push(q);return Response.json((q.where?business:cycle).map(r=>({document:doc(r)})));}
 lists++;return Response.json({documents:legacy.map(r=>doc(r,false)),...(nextPageToken?{nextPageToken}:{} )});}}};}
test('business query and newest-cycle query avoid full heartbeat scans; legacy business records preserved once',async()=>{
 const old=seal({kind:'inbox_review',eventKey:'a'.repeat(64)}),business=seal({kind:'provider_outcome',actionId:'b'.repeat(64)}),cycle=seal({kind:'notification_cycle',at:1000});
 const f=fixture({legacy:[old,seal({kind:'notification_cycle',at:0})],business:[business],cycle:[cycle]});
 const a=await notificationOperationsInventory(f.args);assert.equal(a.operations.length,3);assert.equal(a.truncated,false);assert.equal(f.lists,1);
 await notificationOperationsInventory(f.args);assert.equal(f.lists,1);assert.equal(f.queries[1].limit,1);assert.equal(f.queries[1].orderBy[0].field.fieldPath,'notificationCycleAt');
 assert.equal(f.queries[0].where.fieldFilter.field.fieldPath,'recordKind');
});
test('incomplete legacy inventory never creates a misleading baseline or queries partial business records',async()=>{
 const f=fixture({nextPageToken:'more'});await assert.rejects(notificationOperationsInventory(f.args),/legacy_inventory_review_required/);assert.equal(f.rows.size,0);assert.equal(f.queries.length,0);
});
test('corrupt legacy or business audit records fail closed',async()=>{
 for(const settings of [{legacy:[{kind:'inbox_review',recordHash:'wrong'}]},{business:[{kind:'provider_outcome',recordHash:'wrong'}]}]){const f=fixture(settings);await assert.rejects(notificationOperationsInventory(f.args),/audit_integrity_failed/);}
});
