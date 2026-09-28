import test from 'node:test';
import assert from 'node:assert/strict';
let serial=0;
const moduleForTest=()=>import('../../crm/outlook-send.js?inline-test='+(++serial));
const message={from:'info@thesmartysolution.com',to:'internal@example.test',subject:'Synthetic QA',text:'Hi, this is a test.\n\nΚαλημέρα σας, αυτό είναι δοκιμή.\n\nThe Smarty Solution\nConnect · Develop · Invest.\ninfo@thesmartysolution.com\n+35799810330\nhttps://www.thesmartysolution.com'};
function element(text=''){
 const attrs=new Map(),classes=new Set();
 return {textContent:text,disabled:false,isConnected:true,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),getAttribute:k=>attrs.get(k),classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),toggle:(k,on)=>on?classes.add(k):classes.delete(k)}};
}
function cardForTest(){
 const nodes=Object.fromEntries(Object.entries(message).map(([k,v])=>['[data-email-'+k+']',element(v)]));
 nodes['[data-email-status]']=element();nodes['[data-email-stage]']=element('Draft only · email');
 return {card:{isConnected:true,querySelector:s=>nodes[s]},button:element('Approve and send'),status:nodes['[data-email-status]'],nodes,getSession:()=> 'synthetic-session'};
}
const proposal=(changes={})=>({...message,id:'synthetic-action',hash:'synthetic-hash',expiresAt:new Date(Date.now()+600000).toISOString(),...changes});
const response=(data,ok=true)=>({ok,json:async()=>data});
const success=()=>response({ok:true,status:'succeeded',receipt:{reconciled:true,sentDateTime:'2026-09-23T11:05:44Z'}});
async function withFetch(mock,fn){const saved=globalThis.fetch;globalThis.fetch=mock;try{return await fn();}finally{globalThis.fetch=saved;}}

test('INLINE-01 final email is visible once with one approval and no popup',async()=>{
 const m=await moduleForTest(),html=m.renderEmailDraft({...message,channel:'email',approvalReady:true});
 assert.equal((html.match(/data-email-approve/g)||[]).length,1);
 assert.equal((html.match(/Connect · Develop · Invest\./g)||[]).length,1);
 assert.match(html,/Approve and send/);assert.doesNotMatch(html,/<dialog|Review exact Outlook send|\[Your Name\]/);
 assert.ok(html.indexOf(message.to)<html.indexOf('data-email-approve'));
 assert.ok(html.indexOf('data-email-text')<html.indexOf('data-email-approve'));
});
test('INLINE-02 incomplete, untranslated and WhatsApp drafts cannot dispatch',async()=>{
 const m=await moduleForTest();
 for(const extra of [{approvalReady:false},{channel:'whatsapp'},{from:''},{to:''},{subject:''},{text:''}]){
  assert.doesNotMatch(m.renderEmailDraft({...message,channel:'email',approvalReady:true,...extra}),/data-email-approve/);
 }
});
test('INLINE-03 markup in messages is escaped and text remains complete',async()=>{
 const m=await moduleForTest();
 const html=m.renderEmailDraft({...message,text:'<img src=x onerror=alert(1)> & exact text',channel:'email',approvalReady:true});
 assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);assert.match(html,/&amp; exact text/);
});
test('INLINE-04 one approval uses the existing proposal and exact approval endpoints once',async()=>{
 const m=await moduleForTest(),ui=cardForTest(),calls=[];
 await withFetch(async(url,options)=>{calls.push({url,options});return calls.length===1?response({ok:true,proposal:proposal()}):success();},()=>m.sendApprovedEmail(ui));
 assert.equal(calls.length,2);assert.match(calls[0].url,/\/send\/propose$/);assert.match(calls[1].url,/\/send\/approve$/);
 assert.deepEqual(JSON.parse(calls[0].options.body),{session:'synthetic-session',message:{to:message.to,subject:message.subject,text:message.text}});
 assert.deepEqual(JSON.parse(calls[1].options.body),{session:'synthetic-session',id:'synthetic-action',hash:'synthetic-hash'});
 assert.ok(calls.every(c=>c.options.credentials==='include'&&c.options.cache==='no-store'));
 assert.equal(ui.button.textContent,'Sent');assert.equal(ui.button.disabled,true);assert.equal(ui.button.getAttribute('aria-busy'),undefined);
 assert.match(ui.status.textContent,/Confirmed in Outlook Sent Items/);assert.doesNotMatch(ui.status.textContent,/CRM updated|delivered/i);
});
test('INLINE-05 server changes to any approved field block dispatch',async()=>{
 for(const field of ['from','to','subject','text']){
  const m=await moduleForTest(),ui=cardForTest();let count=0;
  await withFetch(async()=>{count++;return response({ok:true,proposal:proposal({[field]:message[field]+' changed'})});},()=>m.sendApprovedEmail(ui));
  assert.equal(count,1);assert.match(ui.status.textContent,/Not sent.*changed/);
 }
});
test('INLINE-06 invalid and expired proposals never reach dispatch',async()=>{
 for(const changes of [{id:''},{hash:''},{expiresAt:'invalid'},{expiresAt:'2020-01-01T00:00:00Z'}]){
  const m=await moduleForTest(),ui=cardForTest();let count=0;
  await withFetch(async()=>{count++;return response({ok:true,proposal:proposal(changes)});},()=>m.sendApprovedEmail(ui));
  assert.equal(count,1);assert.match(ui.status.textContent,/Not sent/);
 }
});
test('INLINE-07 a changed or closed visible draft cancels the pending approval',async()=>{
 for(const mutate of [ui=>ui.nodes['[data-email-text]'].textContent+='changed',ui=>ui.card.isConnected=false,ui=>ui.button.isConnected=false]){
  const m=await moduleForTest(),ui=cardForTest();let count=0;
  await withFetch(async()=>{count++;mutate(ui);return response({ok:true,proposal:proposal()});},()=>m.sendApprovedEmail(ui));
  assert.equal(count,1);assert.match(ui.status.textContent,/Not sent.*changed/);
 }
});
test('INLINE-08 changing or losing the signed-in session blocks dispatch',async()=>{
 const m=await moduleForTest(),ui=cardForTest();let session='before',count=0;ui.getSession=()=>session;
 await withFetch(async()=>{count++;session='after';return response({ok:true,proposal:proposal()});},()=>m.sendApprovedEmail(ui));
 assert.equal(count,1);assert.match(ui.status.textContent,/Not sent.*session changed/);
});
test('INLINE-09 double clicks and simultaneous second emails are blocked while checking',async()=>{
 const m=await moduleForTest(),ui=cardForTest(),other=cardForTest();let release,count=0;
 await withFetch(async()=>{count++;if(count===1)return new Promise(resolve=>release=resolve);return success();},async()=>{
  const pending=m.sendApprovedEmail(ui);
  assert.equal(ui.button.disabled,true);assert.equal(ui.button.textContent,'Checking…');assert.equal(ui.button.getAttribute('aria-busy'),'true');
  await m.sendApprovedEmail(ui);await m.sendApprovedEmail(other);assert.equal(count,1);
  release(response({ok:true,proposal:proposal()}));await pending;assert.equal(count,2);
 });
});
test('INLINE-10 preflight failure makes no dispatch request and never retries automatically',async()=>{
 const m=await moduleForTest(),ui=cardForTest();let count=0;
 await withFetch(async()=>{count++;return response({ok:false,error:'EMAIL_RECIPIENT_SUPPRESSED'},false);},()=>m.sendApprovedEmail(ui));
 assert.equal(count,1);assert.match(ui.status.textContent,/Do not contact/);assert.equal(ui.button.disabled,false);
});
test('INLINE-11 outside-hours response is displayed inline without an automatic retry',async()=>{
 const m=await moduleForTest(),ui=cardForTest();let count=0;
 await withFetch(async()=>++count===1?response({ok:true,proposal:proposal()}):response({ok:false,error:'EMAIL_OUTSIDE_BUSINESS_HOURS'},false),()=>m.sendApprovedEmail(ui));
 assert.equal(count,2);assert.match(ui.status.textContent,/Not sent.*business hours/);assert.match(ui.status.textContent,/No automatic retry/);
});
test('INLINE-12 uncertain dispatch cannot be retried, even after rendering the same draft again',async()=>{
 for(const failure of [()=>{throw Error('network lost');},()=>({ok:true,json:async()=>{throw Error('invalid JSON');}}),()=>response({ok:false,error:'EMAIL_SEND_FAILED'},false)]){
  const m=await moduleForTest(),ui=cardForTest();let count=0;
  await withFetch(async()=>++count===1?response({ok:true,proposal:proposal()}):failure(),async()=>{
   await m.sendApprovedEmail(ui);await m.sendApprovedEmail(ui);await m.sendApprovedEmail(cardForTest());
  });
  assert.equal(count,2);assert.equal(ui.button.disabled,true);assert.match(ui.status.textContent,/not confirmed.*Do not resend/);assert.doesNotMatch(ui.status.textContent,/Not sent/);
 }
});
test('INLINE-13 accepted is distinct from confirmed and leaves no resend button',async()=>{
 const m=await moduleForTest(),ui=cardForTest();let count=0;
 await withFetch(async()=>++count===1?response({ok:true,proposal:proposal()}):response({ok:true,status:'accepted',receipt:{acceptedAt:new Date().toISOString(),reconciled:false}}),()=>m.sendApprovedEmail(ui));
 assert.equal(count,2);assert.equal(ui.button.disabled,true);assert.equal(ui.button.textContent,'Accepted');assert.match(ui.status.textContent,/confirmation is pending/);
});
test('INLINE-14 successful same-draft repetition does not produce a second send',async()=>{
 const m=await moduleForTest();let count=0;
 await withFetch(async()=>++count===1?response({ok:true,proposal:proposal()}):success(),async()=>{
  await m.sendApprovedEmail(cardForTest());await m.sendApprovedEmail(cardForTest());
 });assert.equal(count,2);
});
test('INLINE-15 old cached review-only callers cannot send automatically',async()=>{
 const m=await moduleForTest();let calls=0;
 await withFetch(async()=>{calls++;throw Error('must not call');},()=>assert.rejects(m.prepareOutlookSend({session:'test',message}),/Refresh the CRM/));assert.equal(calls,0);
});
test('INLINE-16 rendering and mounting never send and binding remains single',async()=>{
 const m=await moduleForTest(),savedDocument=globalThis.document;let binds=0,calls=0;
 globalThis.document={addEventListener:()=>{binds++;}};
 try{await withFetch(async()=>{calls++;},async()=>{m.renderEmailDraft({...message,channel:'email',approvalReady:true});m.bindOutlookApprovals({session:()=> 'test'});m.bindOutlookApprovals({session:()=> 'test-new'});});}finally{globalThis.document=savedDocument;}
 assert.equal(binds,1);assert.equal(calls,0);
});

test('INLINE-17 Command Center rendering uses the same inline email card',async()=>{
 const {readFileSync}=await import('node:fs');
 const {default:vm}=await import('node:vm');
 const m=await moduleForTest();
 const source=readFileSync(new URL('../../crm/command-center.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 const context=vm.createContext({renderEmailDraft:m.renderEmailDraft,bindOutlookApprovals:m.bindOutlookApprovals});
 vm.runInContext(source,context);
 const html=context.renderResult({status:'completed',at:'2026-09-23',results:[{section:'Communications',status:'success',data:{...message,channel:'email',approvalReady:true}}]});
 assert.equal((html.match(/data-email-approve/g)||[]).length,1);
 assert.doesNotMatch(html,/data-email-review|Review exact Outlook send|<dialog/);
 assert.match(html,/Approve and send/);
});
