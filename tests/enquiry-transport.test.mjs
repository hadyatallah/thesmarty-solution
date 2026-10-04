import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../script.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function tssFormParams_'),source.indexOf('// Phase 7 adaptive'));
const endpoint=source.match(/const TSS_FORM_ENDPOINT = '([^']+)'/)[1];
const json=payload=>({ok:true,type:'cors',json:async()=>payload});
function harness(implementation,online=true,abort=true){
 const calls=[],timers=new Map();let next=0;
 const context=vm.createContext({URLSearchParams,Set,Promise,Error,
  AbortController:abort?AbortController:undefined,navigator:{onLine:online},window:{},
  setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id),
  fetch:async(url,opts)=>{calls.push({url,opts});return implementation(url,opts,context);}
 });
 vm.runInContext(`const TSS_FORM_ENDPOINT=${JSON.stringify(endpoint)};\n${code}\nglobalThis.api={submitTssEnquiry_,tssLockForm_,tssFormLocked_};`,context);
 return {context,calls,timers,api:context.api,send:()=>context.api.submitTssEnquiry_(new URLSearchParams({name:'Synthetic',email:'test@example.invalid',source:'https://fixture.test/contact.html?source=whatsapp',form_nonce:'fixture-nonce'})),timeout:()=>[...timers.values()][0].fn()};
}
for(const confirmationSent of [true,false])test('confirmed receipt preserves confirmation flag '+confirmationSent,async()=>{
 const h=harness(()=>json({ok:true,recorded:true,enquiryId:'TEST-1',confirmationSent})),r=await h.send();
 assert.equal(r.state,'confirmed');assert.equal(r.payload.confirmationSent,confirmationSent);assert.equal(h.timers.size,0);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,endpoint);assert.equal(h.calls[0].opts.method,'POST');
 assert.equal(h.calls[0].opts.body.get('source'),'https://fixture.test/contact.html?source=whatsapp');
 assert.equal(h.calls[0].opts.body.get('form_nonce'),'fixture-nonce');assert.equal(h.calls[0].opts.mode,undefined);
});
for(const payload of [null,{},[],{ok:true},{ok:true,recorded:false,enquiryId:'TEST'},
 {ok:true,recorded:true,enquiryId:''},{ok:true,recorded:true,enquiryId:'   '},{ok:true,recorded:true,enquiryId:55},
 {ok:false,recorded:true,code:'DUPLICATE'},{ok:false,code:'INTERNAL_ERROR'},{ok:'true',recorded:true,enquiryId:'TEST'}])test('unconfirmed payload is not receipt evidence '+JSON.stringify(payload),async()=>{
 const h=harness(()=>json(payload));assert.equal((await h.send()).state,'processing');assert.equal(h.timers.size,0);
});
for(const code of ['DUPLICATE','EXPIRED_FORM','FORM_VERIFICATION_REQUIRED','INVALID_EMAIL','INVALID_REQUEST','RATE_LIMITED','SERVICE_BUSY','SPAM_REJECTED','TOO_FAST'])test('explicit pre-write rejection stays actionable '+code,async()=>{
 const h=harness(()=>json({ok:false,code}));await assert.rejects(h.send(),e=>e.code===code);assert.equal(h.timers.size,0);
});
for(const status of [400,401,403,404,429,500,503,504])test('bare HTTP '+status+' cannot promise that no write occurred',async()=>{
 const h=harness(()=>({ok:false,status,type:'cors'}));assert.equal((await h.send()).state,'processing');assert.equal(h.calls.length,1);
});
test('pre-dispatch offline makes no request and allows correction',async()=>{
 const h=harness(()=>{throw Error('must not run');},false);await assert.rejects(h.send(),e=>e.code==='OFFLINE');assert.equal(h.calls.length,0);assert.equal(h.timers.size,0);
});
test('connection loss after dispatch is uncertain even when now offline',async()=>{
 const h=harness((u,o,c)=>{c.navigator.onLine=false;throw Error('network lost');});assert.equal((await h.send()).state,'processing');assert.equal(h.calls.length,1);
});
test('opaque response is uncertain',async()=>assert.equal((await harness(()=>({ok:true,type:'opaque'})).send()).state,'processing'));
test('malformed response body is uncertain',async()=>assert.equal((await harness(()=>({ok:true,type:'cors',json:async()=>{throw Error('invalid JSON');}})).send()).state,'processing'));
for(const where of ['fetch','body'])test('timeout bounds '+where+' without retrying',async()=>{
 let options;const h=harness((u,o)=>{options=o;return where==='fetch'?new Promise(()=>{}):{ok:true,type:'cors',json:()=>new Promise(()=>{})};});
 const p=h.send();await Promise.resolve();assert.equal([...h.timers.values()][0].ms,45000);h.timeout();
 assert.equal((await p).state,'processing');assert.equal(options.signal.aborted,true);assert.equal(h.calls.length,1);assert.equal(h.timers.size,0);
});
test('waiting limit still works without AbortController',async()=>{
 const h=harness(()=>new Promise(()=>{}),true,false),p=h.send();h.timeout();assert.equal((await p).state,'processing');assert.equal(h.calls[0].opts.signal,undefined);
});
test('late receipt does not change an already returned uncertain result',async()=>{
 let done;const h=harness(()=>new Promise(resolve=>{done=resolve;})),p=h.send();h.timeout();const r=await p;
 done(json({ok:true,recorded:true,enquiryId:'LATE'}));await Promise.resolve();assert.equal(r.state,'processing');assert.equal(h.calls.length,1);
});
test('field lock preserves disabled route controls and releases normal inputs',()=>{
 const h=harness(()=>{}),controls=[{disabled:false},{disabled:true},{disabled:false}],attrs={};
 const form={dataset:{},querySelectorAll:()=>controls,setAttribute:(k,v)=>attrs[k]=v};
 const release=h.api.tssLockForm_(form);assert.equal(h.api.tssFormLocked_(form),true);assert.ok(controls.every(x=>x.disabled));
 assert.equal(attrs['aria-busy'],'true');release();assert.deepEqual(controls.map(x=>x.disabled),[false,true,false]);assert.equal(attrs['aria-busy'],'false');assert.equal(h.api.tssFormLocked_(form),false);
});
test('uncertain lock survives releasing controls',()=>{
 const h=harness(()=>{}),form={dataset:{},querySelectorAll:()=>[],setAttribute(){}};
 const release=h.api.tssLockForm_(form);form.dataset.tssSubmissionState='processing';release();assert.equal(h.api.tssFormLocked_(form),true);
});
