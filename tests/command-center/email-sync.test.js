import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('command-center/apps-script/EmailSync.gs','utf8');
function runtime(){
 const props=new Map([['EMAIL_ENABLED','true'],['EMAIL_ENABLED_AT','1']]);
 const data={Companies:[{id:'C1',email:'qa@example.test'}],Tickets:[]};
 let locked=false,calls=0,ids=0;
 const lock={waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){assert.equal(locked,true);locked=false;}};
 const p={getProperty:k=>props.get(k)??null,setProperty(k,v){assert.ok(locked);props.set(k,v);},deleteProperty(k){assert.ok(locked);props.delete(k);}};
 const msg={id:'m1',threadId:'t1',internalDate:'1000',payload:{headers:[{name:'From',value:'QA <qa@example.test>'},{name:'Subject',value:'Enquiry'}]}};
 const r={props,data,msg,onApi:null,onAppend:null,locked:()=>locked,calls:()=>calls};
 const ctx=vm.createContext({Date,PropertiesService:{getScriptProperties:()=>p},LockService:{getScriptLock:()=>lock},Utilities:{getUuid:()=>`id-${++ids}`,formatDate:()=> '2026-09-25'},OWNER:'owner@example.test',
  googleApi_:path=>{assert.equal(locked,false,'remote Gmail fetch must not hold CRM lock');calls++;if(r.onApi)return r.onApi(path);return path.startsWith('messages?')?{messages:[{id:'m1'}]}:msg;},
  rows_:entity=>{assert.ok(locked);return structuredClone(data[entity]);},
  append_:(entity,record)=>{assert.ok(locked);data[entity].push(structuredClone(record));if(r.onAppend)r.onAppend();},
  writeRecord_:(entity,record)=>{assert.ok(locked);data[entity][data[entity].findIndex(x=>x.id===record.id)]=structuredClone(record);},audit_:()=>assert.ok(locked)});
 vm.runInContext(source,ctx);r.run=()=>ctx.syncEmail_();return r;
}
test('SYNC-01 fetches Gmail without holding CRM lock and writes under shared lock',()=>{const r=runtime();assert.equal(r.run().created,1);assert.equal(r.locked(),false);assert.equal(r.data.Tickets[0].companyId,'C1');assert.equal(r.props.has('EMAIL_SYNC_LEASE'),false);});
test('SYNC-02 overlapping scan skips without API call, write or lease replacement',()=>{const r=runtime();const lease=JSON.stringify({runId:'other',expiresAt:Date.now()+600000});r.props.set('EMAIL_SYNC_LEASE',lease);assert.equal(r.run().status,'already_running');assert.equal(r.calls(),0);assert.equal(r.props.get('EMAIL_SYNC_LEASE'),lease);});
test('SYNC-03 CRM edits during remote reads are preserved by fresh authoritative read',()=>{const r=runtime();r.data.Tickets.push({id:'T1',threadId:'t1',notes:'Original',status:'Closed',name:'Keep'});r.onApi=path=>{r.data.Tickets[0].notes='Concurrent operator note';return path.startsWith('messages?')?{messages:[{id:'m1'}]}:r.msg;};assert.equal(r.run().updated,1);assert.match(r.data.Tickets[0].notes,/Concurrent operator note/);assert.equal(r.data.Tickets[0].status,'In progress');assert.equal(r.data.Tickets[0].name,'Keep');});
test('SYNC-04 repeated message does not duplicate ticket or append message twice',()=>{const r=runtime();r.run();const first=JSON.stringify(r.data.Tickets);assert.equal(r.run().created,0);assert.equal(JSON.stringify(r.data.Tickets),first);});
test('SYNC-05 provider failure leaves cursor unchanged and releases owned lease',()=>{const r=runtime();const scan=JSON.stringify({scanStart:10,after:0,token:'page2'});r.props.set('EMAIL_SCAN',scan);r.onApi=()=>{throw Error('Provider unavailable');};assert.throws(r.run,/Provider unavailable/);assert.equal(r.props.get('EMAIL_SCAN'),scan);assert.equal(r.props.has('EMAIL_SYNC_LEASE'),false);assert.equal(r.data.Tickets.length,0);assert.equal(r.locked(),false);});
test('SYNC-06 stale worker cannot write or clear a replacement lease',()=>{const r=runtime();const lease=JSON.stringify({runId:'replacement',expiresAt:Date.now()+600000});r.onApi=()=>{r.props.set('EMAIL_SYNC_LEASE',lease);return {messages:[]};};assert.throws(r.run,/LEASE_LOST/);assert.equal(r.data.Tickets.length,0);assert.equal(r.props.get('EMAIL_SYNC_LEASE'),lease);});
test('SYNC-07 disabled capture during fetch prevents application and cursor advancement',()=>{const r=runtime();r.onApi=()=>{r.props.set('EMAIL_ENABLED','false');return {messages:[]};};assert.throws(r.run,/STATE_CHANGED/);assert.equal(r.props.has('EMAIL_LAST_OK'),false);assert.equal(r.data.Tickets.length,0);});
test('SYNC-08 pagination remains bounded to two pages and preserves remaining cursor',()=>{const r=runtime();let pages=0;r.onApi=()=>({messages:[],nextPageToken:'page'+(++pages+1)});assert.equal(r.run().morePending,true);assert.equal(pages,2);assert.equal(JSON.parse(r.props.get('EMAIL_SCAN')).token,'page3');assert.equal(r.props.has('EMAIL_LAST_OK'),false);});
test('SYNC-09 partial sheet write replay reconciles existing message marker',()=>{const r=runtime();r.onAppend=()=>{throw Error('Receipt lost');};assert.throws(r.run,/Receipt lost/);assert.equal(r.props.has('EMAIL_LAST_OK'),false);r.onAppend=null;assert.equal(r.run().created,0);assert.equal(r.data.Tickets.length,1);});
test('SYNC-10 expired lease is recoverable; active CRM lock remains required',()=>{const r=runtime();r.props.set('EMAIL_SYNC_LEASE',JSON.stringify({runId:'old',expiresAt:1}));assert.equal(r.run().created,1);assert.equal(r.locked(),false);});
