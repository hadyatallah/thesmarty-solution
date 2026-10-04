import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot=process.env.TSS_SOURCE_ROOT || (fs.existsSync(path.join(root,'patched')) ? path.join(root,'patched') : root);
const swSource=fs.readFileSync(path.join(sourceRoot,'crm/service-worker.js'),'utf8');
const managerSource=fs.readFileSync(path.join(sourceRoot,'command-center/manager.js'),'utf8');

// Execute the real router body with explicit dependency doubles, without a CRM or network.
function managerHarness(){
 const calls=[];
 const remember=(name,value={})=>(...args)=>{calls.push({name,args});return value;};
 const crm={coverage:()=>({available:true}),dossier:remember('dossier'),weekly:remember('weekly'),quality:remember('quality'),attention:()=>({items:[{kind:'overdue',id:'fixture'}]}),rows:()=>[]};
 const growth={prepareDraft:remember('draft',{status:'Draft',approvalReady:true}),incoming:remember('incoming'),prospects:remember('prospects'),research:remember('research')};
 const operations={summary:remember('summary'),content:remember('content')};
 const context=vm.createContext({
  CRMAdapter:class {},companyLookupQuery:(q)=>q==='Show Example Company'? 'fixture':null,
  registry:{manager:{id:'router-test'}},approvalSummary:()=>({}),notificationItems:()=>[],
  isCommunicationDraftRequest:q=>(/\b(?:prepare|draft|write|compose|create|send)\b/i.test(q)&&/\b(?:email|message|whatsapp|introduction)\b/i.test(q))||/\b(?:follow[ -]?up|reply|respond)\b/i.test(q),
  communicationRequest:()=>({companyId:'fixture',channel:'email',purpose:'test'}),Date,Promise
 });
 const body=managerSource.replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'');
 vm.runInContext(body+'\nglobalThis.ManagerClass=Manager;',context);
 return {manager:new context.ManagerClass({crm,growth,operations}),calls};
}
const historical=[
 'Record the follow-up email I sent to Example Company yesterday',
 'Please log the September 23 sent email for Example Company',
 'Could you record the existing bilingual reply without sending it again?',
 'Add the sent email to the company timeline',
 'Save this already sent email to Email Activity',
 'Mark the email as sent',
 'Import the historical correspondence',
 'Reconcile the email activity for Example Company',
 'Please log the old email and draft another follow-up',
 'We need to record the previous follow-up message'
];
for(const query of historical)test('historical request cannot draft: '+query,async()=>{
 const h=managerHarness(),r=await h.manager.run(query);
 assert.equal(r.handled,true);
 assert.equal(r.results[0].data.code,'HISTORICAL_EMAIL_LOGGING_UNAVAILABLE');
 assert.equal(r.results[0].data.status,'unavailable');
 assert.equal(h.calls.length,0);
 assert.match(r.results[0].data.message,/no CRM activity was added/i);
 assert.equal(r.results[0].data.approvalReady,undefined);
});
for(const query of ['Draft an email to Example Company about logging service records','Prepare a follow-up email to Example Company','Write an email about historical building preservation','Send an email to Example Company about a new order'])test('normal drafting preserved: '+query,async()=>{
 const h=managerHarness(),r=await h.manager.run(query);
 assert.equal(r.handled,true);assert.equal(h.calls.filter(c=>c.name==='draft').length,1);
});
for(const [query,name] of [['Show Example Company','dossier'],['Check data quality','quality'],['Show important emails','incoming'],['Check integration health','summary']])test('normal read routing preserved: '+query,async()=>{
 const h=managerHarness();await h.manager.run(query);assert.equal(h.calls.filter(c=>c.name===name).length,1);assert.equal(h.calls.some(c=>c.name==='draft'),false);
});
test('invalid input remains rejected',async()=>{const h=managerHarness();await assert.rejects(h.manager.run(''),/INVALID_COMMAND/);await assert.rejects(h.manager.run('x'.repeat(3001)),/INVALID_COMMAND/);});

function swHarness({hit,foreignHit,cacheFailure=false,putFailure=false,response={ok:true,redirected:false,marker:'network',clone(){return {...this};}}}={}){
 const handlers={},calls=[],lifetime=[];
 const cache={addAll:async assets=>calls.push(['addAll',...assets]),match:async req=>{calls.push(['match',req.url]);return hit;},put:async()=>{calls.push(['put']);if(putFailure)throw Error('quota');}};
 const keys=['tss-crm-pwa-v1','tss-crm-pwa-v4','tss-crm-pwa-v5','analytics-fixture','tss-crm-pwa-not-owned'];
 const context=vm.createContext({URL,
  self:{location:{origin:'https://fixture.test'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>calls.push(['skipWaiting']),clients:{claim:async()=>calls.push(['claim'])}},
  caches:{open:async name=>{calls.push(['open',name]);if(cacheFailure)throw Error('storage');return cache;},keys:async()=>keys,delete:async key=>{calls.push(['delete',key]);return true;},match:async()=>foreignHit},
  fetch:async()=>{calls.push(['fetch']);return response;}
 });
 vm.runInContext(swSource,context);
 const event=(url='https://fixture.test/crm/icon.svg',method='GET')=>({request:{url,method},waitUntil:p=>lifetime.push(p),respondWith(p){this.response=p;}});
 return {handlers,calls,lifetime,event};
}
test('cache activation only deletes older owned CRM caches',async()=>{const h=swHarness();h.handlers.activate(h.event());await Promise.all(h.lifetime);assert.deepEqual(h.calls.filter(c=>c[0]==='delete').map(c=>c[1]),['tss-crm-pwa-v1','tss-crm-pwa-v4']);assert.equal(h.calls.at(-1)[0],'claim');});
test('install caches only icon and manifest before activation',async()=>{const h=swHarness();h.handlers.install(h.event());await Promise.all(h.lifetime);assert.deepEqual(h.calls.find(c=>c[0]==='addAll'),['addAll','/crm/manifest.webmanifest','/crm/icon.svg']);assert.equal(h.calls.at(-1)[0],'skipWaiting');});
test('cache read is scoped and ignores another application cache',async()=>{const h=swHarness({foreignHit:{marker:'foreign'}}),e=h.event();h.handlers.fetch(e);assert.equal((await e.response).marker,'network');await Promise.all(h.lifetime);assert.equal(h.calls.filter(c=>c[0]==='put').length,1);});
test('owned static cache hit avoids the network',async()=>{const h=swHarness({hit:{marker:'owned'}}),e=h.event();h.handlers.fetch(e);assert.equal((await e.response).marker,'owned');assert.equal(h.calls.some(c=>c[0]==='fetch'),false);});
for(const [u,m] of [['https://fixture.test/crm/','GET'],['https://fixture.test/crm/index.html','GET'],['https://fixture.test/api/outlook/status','GET'],['https://fixture.test/crm/assistant.js','GET'],['https://fixture.test/crm/icon.svg','POST'],['https://external.test/crm/icon.svg','GET']])test('request not intercepted: '+m+' '+u,()=>{const h=swHarness(),e=h.event(u,m);h.handlers.fetch(e);assert.equal(e.response,undefined);assert.equal(h.calls.length,0);});
for(const [name,resp] of [['HTTP error',{ok:false,redirected:false}],['redirected response',{ok:true,redirected:true}]])test('do not cache '+name,async()=>{const h=swHarness({response:{...resp,clone:()=>({})}}),e=h.event();h.handlers.fetch(e);await e.response;await Promise.all(h.lifetime);assert.equal(h.calls.some(c=>c[0]==='put'),false);});
test('cache unavailability does not break network static response',async()=>{const h=swHarness({cacheFailure:true}),e=h.event();h.handlers.fetch(e);assert.equal((await e.response).marker,'network');});
test('cache write failure does not create rejected lifetime promise',async()=>{const h=swHarness({putFailure:true}),e=h.event();h.handlers.fetch(e);assert.equal((await e.response).marker,'network');await Promise.all(h.lifetime);});
