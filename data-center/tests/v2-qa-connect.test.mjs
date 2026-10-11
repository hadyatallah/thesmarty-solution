import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL('../v2/'+name,import.meta.url),'utf8');
const code=read('qa-connect.js');
const html=read('qa-connect.html');
const script=code.replace(
 /^import \{([^}]+)\} from '\.\/qa-gateway\.mjs';/m,
 'const {$1}=__mockGateway;'
);
assert.notEqual(script,code,'expected exact ES module import');

class Elem {
 constructor(key){this.key=key;this.value='';this.textContent='';this.disabled=false;
  this.checked=false;this.handlers={};this.children=[];}
 addEventListener(key,fn){this.handlers[key]=fn;}
}
const fields={
 requestId:'QA-IDC-V2-REQ-BROWSER-0001',evidenceId:'EV-QA-V2-BROWSER-0001',
 auditId:'AUD-QA-V2-BROWSER-0001',companyId:'QA-COMPANY-001',
 factType:'QA Process Acceptance',attributePath:'browserQaAcceptance',
 displayValue:'Synthetic UI QA write only',sourceId:'QA-SRC-001',
 sourceRef:'synthetic://tss-idc/v2/browser-gate-0001',observedAt:'2026-10-11'
};
function harness({email='thesmartysolution@gmail.com',verified=true}={}){
 const ids=['owner','snapshot','result','outcome','connect','lock','read',
 'preflight','submit','reconcile','consent','phrase','proposal'];
 const elements=Object.fromEntries(ids.map(id=>[id,new Elem(id)]));
 const inputs=Object.fromEntries(Object.entries(fields).map(([k,v])=>{const node=new Elem(k);node.value=v;return [k,node];}));
 elements.proposal.elements={namedItem:key=>inputs[key]||null};
 const calls={identity:0,reads:0,preflights:0,writes:0,verifyFailed:false};
 const fakeGateway={
  makeQaGateway(){
   return {
    async verifyGoogleOwner(token){
     calls.identity++;
     assert.equal(token,'owner-test-token');
     if(email!=='thesmartysolution@gmail.com'||!verified){
      calls.verifyFailed=true;throw Error('Only TSS owner authorized');}
    },
    async read(){calls.reads++;return {evidence:[],audits:[]};},
    preflight(draft,snapshot){
     calls.preflights++;
     return {status:'QA_READY',errors:[],warnings:[],draft};
    },
    async appendOnce({token,draft,confirmation}){
     assert.equal(token,'owner-test-token');
     assert.equal(confirmation,'WRITE SYNTHETIC QA ONLY');
     assert.equal(draft.companyId,'QA-COMPANY-001');
     calls.writes++;
     return {status:'QA_APPEND_VERIFIED',requestId:draft.requestId};
    }
   };
  },
  QA_OWNER:'thesmartysolution@gmail.com',
  QA_BOOK:'1X1EQpRLRK-ErvHXHxZ8Jp1rvV-SIW8GaKelVuCbzFkk'
 };
 let googleConfig=null,tokenOptions=null;
 const window={
  TSS_IDC_CONFIG:{allowedEmail:'thesmartysolution@gmail.com',readOnly:true,googleClientId:'1234-preview.apps.googleusercontent.com'},
  google:{accounts:{oauth2:{
   initTokenClient(config){googleConfig=config;return {requestAccessToken(options){tokenOptions=options;}};}
  }}}
 };
 const document={getElementById:key=>{assert.ok(elements[key],key);return elements[key];}};
 const context={__mockGateway:fakeGateway,window,document,console,fetch:()=>{throw Error('Unexpected real fetch')}};
 vm.runInNewContext(script,context,{timeout:2000});
 return {elements,calls,window,
  click:id=>elements[id].handlers.click(),
  change:id=>elements[id].handlers.change(),
  input:id=>elements[id].handlers.input(),
  get googleConfig(){return googleConfig;},
  get tokenOptions(){return tokenOptions;},
  async grant(){await googleConfig.callback({access_token:'owner-test-token'});}
 };
}
test('QA-only owner page is separate from read-only Production V1 and uses explicit user action',()=>{
 const h=harness();
 assert.equal(h.calls.reads,0);
 assert.equal(h.calls.writes,0);
 assert.equal(h.elements.submit.disabled,true);
 assert.equal(h.elements.read.disabled,true);
 assert.match(html,/NOT PRODUCTION/);
 assert.match(html,/WRITE SYNTHETIC QA ONLY/);
 assert.doesNotMatch(html,/main\/app\.js|Company data|BEGIN PRIVATE KEY/);
 assert.doesNotMatch(code,/localStorage|sessionStorage|indexedDB|oauth2\.revoke/);
});
test('Google owner token scope is requested only on Connect button, separate from V1',async()=>{
 const h=harness();
 assert.equal(h.googleConfig,null);
 h.click('connect');
 assert.match(h.googleConfig.scope,/userinfo\.email/);
 assert.match(h.googleConfig.scope,/auth\\/spreadsheets$/);
 assert.doesNotMatch(h.googleConfig.scope,/spreadsheets\.readonly/);
 assert.equal(h.googleConfig.login_hint,'thesmartysolution@gmail.com');
 assert.equal(h.tokenOptions.prompt,'');
 assert.equal(h.elements.read.disabled,true);
 await h.grant();
 assert.equal(h.calls.identity,1);
 assert.equal(h.elements.read.disabled,false);
 assert.equal(h.calls.reads,0);
});
test('wrong verified owner cannot read QA or enable append',async()=>{
 const h=harness({email:'unauthorized@example.com'});
 h.click('connect');await h.grant();
 assert.equal(h.calls.verifyFailed,true);
 assert.equal(h.calls.reads,0);assert.equal(h.calls.writes,0);
 assert.equal(h.elements.submit.disabled,true);
});
test('QA UI requires explicit provider read, consent and exact phrase before one write',async()=>{
 const h=harness();h.click('connect');await h.grant();
 assert.equal(h.elements.submit.disabled,true);
 await h.click('read');
 assert.equal(h.calls.reads,1);
 await h.click('preflight');
 assert.equal(h.calls.preflights,1);
 assert.equal(h.elements.submit.disabled,true);
 h.elements.consent.checked=true;h.change('consent');
 assert.equal(h.elements.submit.disabled,true);
 h.elements.phrase.value='WRITE SYNTHETIC QA ONLY';h.input('phrase');
 assert.equal(h.elements.submit.disabled,false);
 await h.click('submit');
 assert.equal(h.calls.writes,1);
 assert.equal(h.elements.submit.disabled,true);
 await h.click('submit');
 assert.equal(h.calls.writes,1);
 await h.click('reconcile');
 assert.equal(h.calls.reads,2);
 assert.match(h.elements.outcome.textContent,/READ_ONLY_RECONCILIATION/);
});
test('Lock QA removes memory session and disables all submission actions',async()=>{
 const h=harness();h.click('connect');await h.grant();
 await h.click('read');
 await h.click('lock');
 assert.equal(h.elements.submit.disabled,true);
 assert.equal(h.elements.read.disabled,true);
 assert.match(h.elements.owner.textContent,/cleared/);
 assert.equal(h.calls.writes,0);
});
