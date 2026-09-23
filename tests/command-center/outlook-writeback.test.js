import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync('command-center/apps-script/OutlookCrmWriteback.gs','utf8');

function runtime(){
 const data={
  Companies:[{id:'C1',name:'Acme',email:'hello@acme.test',communicationStatus:'Not contacted',version:'1'}],
  Contacts:[{id:'P1',companyId:'C1',email:'person@acme.test',version:'1'}],
  'Email Activity':[]
 };
 let locked=false,id=0;
 const lock={waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){assert.equal(locked,true);locked=false;}};
 const ctx=vm.createContext({
  Date,
  OWNER:'owner@example.test',
  Utilities:{getUuid:()=>('uuid-'+(++id)+'-12345678')},
  LockService:{getScriptLock:()=>lock},
  SpreadsheetApp:{flush(){}},
  requireSession_:token=>{if(token!=='valid')throw Error('AUTH_REQUIRED');},
  rows_:entity=>structuredClone(data[entity]||[]),
  append_:(entity,record)=>{assert.ok(locked);data[entity].push(structuredClone(record));},
  writeRecord_:(entity,record)=>{assert.ok(locked);const i=data[entity].findIndex(x=>x.id===record.id);data[entity][i]=structuredClone(record);},
  audit_:()=>assert.ok(locked),
  ccLock_:fn=>{lock.waitLock(20000);try{return fn();}finally{lock.releaseLock();}}
 });
 vm.runInContext(source,ctx);
 return {ctx,data};
}
const input={mailbox:'info@thesmartysolution.com',to:'person@acme.test',subject:'Test',messageId:'MSG-1',internetMessageId:'IM-1',actionId:'act-12345678',sentAt:'2026-09-23T08:33:23Z',bodyPreview:'Hello'};

test('OWB-01 requires valid CRM session',()=>{const r=runtime();assert.throws(()=>r.ctx.ccRecordEmailActivity('bad',input),/AUTH_REQUIRED/);assert.equal(r.data['Email Activity'].length,0);});
test('OWB-02 writes one sent email and updates linked CRM records',()=>{const r=runtime();const out=r.ctx.ccRecordEmailActivity('valid',input);assert.equal(out.status,'recorded');assert.equal(out.companyId,'C1');assert.equal(out.contactId,'P1');assert.equal(r.data['Email Activity'].length,1);assert.equal(r.data.Companies[0].communicationStatus,'Contacted');assert.equal(r.data.Companies[0].lastContact,'2026-09-23');assert.equal(r.data.Contacts[0].lastInteraction,'2026-09-23');});
test('OWB-03 duplicate provider message is idempotent',()=>{const r=runtime();r.ctx.ccRecordEmailActivity('valid',input);const out=r.ctx.ccRecordEmailActivity('valid',input);assert.equal(out.status,'exists');assert.equal(r.data['Email Activity'].length,1);});
test('OWB-04 unmatched recipient is logged but does not create company/contact',()=>{const r=runtime();const out=r.ctx.ccRecordEmailActivity('valid',{...input,to:'unknown@example.test',messageId:'MSG-2',actionId:'act-22222222'});assert.equal(out.syncStatus,'Unmatched');assert.equal(r.data.Companies.length,1);assert.equal(r.data.Contacts.length,1);assert.equal(r.data['Email Activity'][0].companyId,'');});
test('OWB-05 ambiguous recipient is held for review',()=>{const r=runtime();r.data.Companies.push({id:'C2',email:'hello@acme.test',version:'1'});const out=r.ctx.ccRecordEmailActivity('valid',{...input,to:'hello@acme.test',messageId:'MSG-3',actionId:'act-33333333'});assert.equal(out.syncStatus,'Review');assert.equal(r.data['Email Activity'][0].companyId,'');});
