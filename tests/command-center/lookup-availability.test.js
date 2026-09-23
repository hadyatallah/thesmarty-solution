import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CRMAdapter} from '../../command-center/crm.js';
import {companyLookupQuery} from '../../command-center/company-lookup.js';
import {commandCenter} from '../../crm/command-center.js';
import {fixture} from './support.js';

// All records are synthetic. No live CRM, provider, mailbox or send endpoint.
function snapshot(){
 const f=fixture();f.aiEnabled=true;
 f.records.Companies[0]={...f.records.Companies[0],id:'SYN-ELITE',name:'Elite Cyprus Relocation',email:'hello@elite.example.test'};
 f.records.Contacts=[{id:'SYN-CONTACT',companyId:'SYN-ELITE',name:'Synthetic Contact',email:'person@example.test'}];
 f.records['Email Activity']=[{messageId:'SYN-MESSAGE',companyId:'SYN-ELITE',direction:'Received',subject:'Synthetic relocation enquiry',messageDate:'2026-09-22'}];
 return f;
}
function harness(f=snapshot(),provider=async()=>{throw Error('The free AI limit is temporarily reached. Please try again later.');}){
 const calls=[],status={textContent:'',title:''};
 const nodes={aiQuestion:{value:''},aiAnswer:{innerHTML:''},aiForm:{querySelector:()=>({disabled:false})}};
 const storage=new Map();
 const c=vm.createContext({state:f,window:{TSSCommandCenter:commandCenter},document:{querySelectorAll:()=>[status]},URL,Set,Date,console,
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 AI_PENDING_KEY:'p',AI_CHAT_KEY:'c',AI_UNDO_KEY:'u',AI_ACTION_KEY:'a',aiPendingPlan:null,aiConversation:[],aiContextSelection:{entity:'',id:'',label:''},
 el:id=>nodes[id],esc:v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),
 call:async(method,...args)=>{calls.push(method);return provider(method,...args);}});
 vm.runInContext(readFileSync(new URL('../../crm/assistant.js',import.meta.url),'utf8'),c);
 return {c,f,calls,status,nodes,submit:async text=>{nodes.aiQuestion.value=text;await c.handleAssistantSubmit({preventDefault(){},submitter:{disabled:false}});return nodes.aiAnswer.innerHTML;}};
}
for(const query of ['Elite Cyprus Relocation','elite cyprus relocation','Elite Cyprus','Elite','SYN-ELITE','hello@elite.example.test','Look up Elite Cyprus Relocation','Find Elite Cyprus Relocation','Search for Elite Cyprus Relocation','Show me Elite Cyprus Relocation','Open the company Elite Cyprus Relocation','"Elite Cyprus Relocation"','Tell me about Elite Cyprus Relocation']){
 test('LOOKUP local route: '+query,async()=>{
  const h=harness();const before=JSON.stringify(h.f);
  const html=await h.submit(query);
  assert.match(html,/Elite Cyprus Relocation/);assert.match(html,/Synthetic Contact/);assert.match(html,/Synthetic relocation enquiry/);
  assert.deepEqual(h.calls,[]);assert.equal(JSON.stringify(h.f),before);
  assert.equal(h.c.assistantAiStatus().text,'AI configured');
 });
}
test('LOOKUP unknown name is a local no-match, including when AI is disabled',async()=>{
 for(const query of ['Unknown Redwood Holdings','Find Unknown Redwood Holdings']){
  const h=harness();h.f.aiEnabled=false;const html=await h.submit(query);
  assert.match(html,/No matching company in the loaded CRM data/);assert.deepEqual(h.calls,[]);
 }
});
test('LOOKUP ambiguous prefix does not select a company or change any records',async()=>{
 const h=harness();h.f.records.Companies.push({id:'SYN-ELITE-2',name:'Elite Cyprus Services'});
 const html=await h.submit('Elite Cyprus');assert.match(html,/More than one company matches/);
 assert.match(html,/SYN-ELITE-2/);assert.match(html,/SYN-ELITE/);assert.deepEqual(h.calls,[]);
});
test('LOOKUP duplicate exact names require disambiguation',async()=>{
 const h=harness();h.f.records.Companies.push({...h.f.records.Companies[0],id:'SYN-DUP'});
 assert.match(await h.submit('Elite Cyprus Relocation'),/More than one company matches/);assert.deepEqual(h.calls,[]);
});
test('LOOKUP unavailable population is not reported as an absent company',async()=>{
 const h=harness();h.f.coverage.Companies.available=false;h.f.records.Companies=[];
 const html=await h.submit('Elite Cyprus Relocation');assert.match(html,/Company records are unavailable/);
 assert.doesNotMatch(html,/No matching company/);assert.deepEqual(h.calls,[]);
});
test('LOOKUP account names containing command keywords still match exactly',async()=>{
 const h=harness();h.f.records.Companies.push({id:'SYN-BRAND',name:'Outlook Homes'});
 const html=await h.submit('Outlook Homes');assert.match(html,/SYN-BRAND/);assert.deepEqual(h.calls,[]);
});
test('LOOKUP routes do not swallow write requests, pasted emails or filtered entity searches',()=>{
 const crm=new CRMAdapter(snapshot());
 for(const query of ['Create a new task','Update Elite Cyprus Relocation','Send an email to Elite Cyprus Relocation','I spoke to Elite Cyprus Relocation today','Elite Cyprus Relocation contacted today','Find companies with no next action','Find tasks for Elite Cyprus Relocation','Show contacts for Elite Cyprus Relocation','What needs my attention?','Why did the company not reply?','Subject: Elite Cyprus Relocation\nPlease update the account']){
  assert.equal(companyLookupQuery(query,crm),null,query);
 }
});
test('LOOKUP preserves existing non-AI attention and data-quality commands',async()=>{
 for(const query of ['What needs my attention?','Check data quality','Find companies with no next action']){
  const h=harness();h.f.aiEnabled=false;
  const html=await h.submit(query);assert.ok(html);assert.ok(!h.calls.includes('askAssistant'));
 }
});
test('LOOKUP managed email keeps its exact approval path, not a company search',async()=>{
 const h=harness(snapshot(),async method=>method==='askAssistant'?{answer:'τη συνεργασία'}:{});
 const html=await h.submit('Send an email to Elite Cyprus Relocation about collaboration');
 assert.match(html,/Approve and send/);assert.match(html,/Draft only/);
 assert.ok(!h.calls.some(x=>/send|execute|saveRecord/i.test(x)));
});
test('STATUS configuration alone is not labelled connected or available',()=>{
 const h=harness();assert.equal(h.c.assistantAiStatus().text,'AI configured');
 assert.match(h.c.assistantWorkspaceHtml(),/Availability has not been checked/);
 assert.doesNotMatch(h.c.assistantWorkspaceHtml(),/AI connected/);
});
test('STATUS a real quota rejection updates the badge and preserves local search',async()=>{
 const h=harness();await assert.rejects(h.c.assistantCall('askAssistant','test'),/free AI limit/);
 assert.equal(h.status.textContent,'AI limited');assert.equal(h.calls.length,1);
 assert.match(await h.submit('Elite Cyprus Relocation'),/SYN-ELITE/);
 assert.equal(h.calls.length,1);assert.equal(h.c.assistantAiStatus().text,'AI limited');
});
test('STATUS other failures do not invent a quota diagnosis',async()=>{
 const h=harness(snapshot(),async()=>{throw Error('Authentication expired');});
 await assert.rejects(h.c.assistantCall('askAssistant','test'),/Authentication expired/);
 assert.equal(h.status.textContent,'AI unavailable');assert.ok(h.f.aiEnabled);
});
test('STATUS successful retry clears the previous AI failure',async()=>{
 let attempt=0;const h=harness(snapshot(),async()=>{if(!attempt++)throw Error('429 rate limit');return {answer:'Actual successful response'};});
 await assert.rejects(h.c.assistantCall('askAssistant','test'));await h.c.assistantCall('askAssistant','test');
 assert.equal(h.status.textContent,'AI available');assert.match(h.status.title,/last AI request, not remaining allowance/);
});
test('STATUS empty provider answer is unavailable, never a successful check',async()=>{
 const h=harness(snapshot(),async()=>({answer:''}));
 await assert.rejects(h.c.assistantCall('askAssistant','test'),/no answer/);assert.equal(h.status.textContent,'AI unavailable');
});
test('STATUS non-AI backend calls do not change AI health',async()=>{
 const h=harness(snapshot(),async()=>({version:'synthetic'}));await h.c.assistantCall('ccState');
 assert.equal(h.c.assistantAiStatus().text,'AI configured');
});
test('RELEASE entry scripts and nested manager import use their exact content versions',()=>{
 const read=p=>readFileSync(new URL('../../'+p,import.meta.url));
 const version=p=>{const b=read(p);return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex').slice(0,12);};
 const index=read('crm/index.html').toString(),cc=read('crm/command-center.js').toString();
 for(const p of ['crm/assistant.js','crm/command-center.js'])assert.ok(index.includes('/'+p+'?v='+version(p)),p);
 assert.ok(cc.includes('../command-center/manager.js?v='+version('command-center/manager.js')));
});
