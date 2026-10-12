import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as model from '../model.mjs';
import * as request from '../research-request.mjs';

// This is a synthetic browser/Google adapter. It tests the actual app.js
// auth and refresh callbacks without touching Google, HubSpot or Production.
const original=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const script=original.replace(
 /^import \{([^}]+)\} from '\.\/model\.mjs';/m,
 'const {$1}=__model;'
).replace(
 /^import \{([^}]+)\} from '\.\/research-request\.mjs';/m,
 'const {$1}=__request;'
);
assert.notEqual(script,original,'App module loader must have been replaced');

class Node {
 constructor(tag='div'){
  this.tag=tag;this.textContent='';this.hidden=false;this.disabled=false;
  this.children=[];this.handlers={};this.dataset={};this.style={};
  this.classList={toggle(){},add(){}};
 }
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 get firstChild(){return this.children[0];}
 addEventListener(name,handler){this.handlers[name]=handler;}
 setAttribute(){}
 removeAttribute(){}
 scrollIntoView(){}
}
const owner='thesmartysolution@gmail.com';
const master='TEST-MASTER-SHEET';
const research='TEST-RESEARCH-SHEET';
const names=['dashboard','companies','projects','candidates','evidence','review','handover'];
const privateRows=[
 {values:[['candidateId','discoveredName'],['RC-SYN-1','Synthetic Research Candidate']]},
 {values:[['sourceId','sourceName'],['SRC-SYN-1','Synthetic Official Source']]},
 {values:[['evidenceId','companyId','attributePath','displayValue','verificationStatus','freshnessStatus'],['EV-SYN-1','TSS-CY-001','developerRole','Reported','SOURCE SUPPORTED','Current']]},
 {values:[['relationshipId','fromCompanyId','toCompanyId']]},
 {values:[['projectId','projectName','observedStatus'],['DP-SYN-1','Synthetic Project','Unknown']]},
 {values:[['roleId','projectId','companyId']]},
 {values:[['companyId','disposition','researchGaps'],['TSS-CY-001','Needs Review','Verify identity']]}
];
const companies=[{values:[
 ['id','name','category','district','email','phone','website','instagram','status','priority','researchLevel','source1'],
 ['TSS-CY-001','Synthetic Developer','Developer','Larnaca','','','https://example.invalid','','','','Basic','']
]}];

function createHarness({email=owner,verified=true,initialSheetsFailure=false}={}){
 const elements=new Map();
 for(const selector of ['#content','#notice','#loginCard','#loginMessage','#auth','#refresh','#identity','#location','#viewTitle','#viewIntro','.privacy']){
  elements.set(selector,new Node(selector));
 }
 const buttons=names.map(view=>{const b=new Node('button');b.dataset.view=view;return b;});
 const state={calls:[],email,verified,failSheets:initialSheetsFailure,failResearch:false,
  userinfoStatus:200, sheetsStatus:200,tokenConfig:null,tokenOptions:null};
 const doc={
  querySelector(selector){const n=elements.get(selector);if(!n)throw Error('Unmocked selector '+selector);return n;},
  querySelectorAll(selector){if(selector==='.nav button')return buttons;throw Error('Unmocked selector list '+selector);},
  createElement(tag){return new Node(tag);},
  createTextNode(str){const n=new Node('#text');n.textContent=String(str);return n;}
 };
 const window={
  TSS_IDC_CONFIG:{googleClientId:'1234567890-test.apps.googleusercontent.com',allowedEmail:owner,
   masterSpreadsheetId:master,researchSpreadsheetId:research,readOnly:true},
  google:{accounts:{oauth2:{initTokenClient(config){
   state.tokenConfig=config;
   return {requestAccessToken(options){state.tokenOptions=options;}};
  }}}},
  addEventListener(){}
 };
 const fetch=async(url,options)=>{
  const link=String(url);
  state.calls.push({url:link,method:options?.method||'GET',auth:options?.headers?.Authorization||''});
  if(link.includes('/oauth2/v3/userinfo')){
   return {ok:state.userinfoStatus===200,status:state.userinfoStatus,
    json:async()=>({email:state.email,email_verified:state.verified})};
  }
  if(link.includes('/values:batchGet')){
   if(state.failSheets||state.failResearch&&link.includes(research))
    return {ok:false,status:state.sheetsStatus===200?503:state.sheetsStatus};
   return {ok:true,status:200,
    json:async()=>({valueRanges:link.includes(master)?companies:privateRows})};
  }
  throw Error('Unexpected fetch '+link);
 };
 const context={__model:model,__request:request,document:doc,window,navigator:{clipboard:{writeText:async value=>{state.copied=String(value);}}},location:{protocol:'https:'},
  URL,URLSearchParams,fetch,console};
 vm.runInNewContext(script,context,{timeout:2000});
 return {state,context,elements,buttons,
  begin(){elements.get('#auth').handlers.click();assert.ok(state.tokenConfig,'Google client was not initialized');},
  async respond(){await state.tokenConfig.callback({access_token:'synthetic-access-token'});},
  get locked(){return elements.get('#content').hidden;},
  get sheetReads(){return state.calls.filter(c=>c.url.includes('/values:batchGet'));},
  get notice(){return elements.get('#notice').textContent;},
  get loginLabel(){return elements.get('#auth').textContent;}
 };
}

test('wrong verified Google account is rejected before ANY private Sheets request',async()=>{
 const h=createHarness({email:'unauthorized@example.com'});
 h.begin();await h.respond();
 assert.equal(h.sheetReads.length,0);
 assert.equal(h.locked,true);
 assert.equal(h.elements.get('#identity').textContent,'Not connected');
 assert.match(h.notice,/not authorized/i);
 assert.equal(h.loginLabel,'Open Data Center');
});

test('unverified Google identity is also rejected before reading any Sheets',async()=>{
 const h=createHarness({verified:false});
 h.begin();await h.respond();
 assert.equal(h.sheetReads.length,0);
 assert.equal(h.locked,true);
 assert.match(h.notice,/not authorized/i);
});

test('owner authentication reads only the two approved Google spreadsheets',async()=>{
 const h=createHarness();
 h.begin();
 assert.match(h.state.tokenConfig.scope,/spreadsheets\.readonly/);
 assert.doesNotMatch(h.state.tokenConfig.scope,/spreadsheets(?!\.readonly)/);
 assert.equal(h.state.tokenOptions.prompt,'');
 assert.equal(h.state.tokenOptions.login_hint,owner);
 await h.respond();
 assert.equal(h.sheetReads.length,2);
 assert.ok(h.sheetReads.every(c=>c.method==='GET'));
 assert.ok(h.sheetReads.every(c=>c.auth==='Bearer synthetic-access-token'));
 assert.equal(h.locked,false);
 assert.equal(h.elements.get('#identity').textContent,owner);
 assert.equal(h.loginLabel,'Lock App');
 assert.match(h.notice,/Source read complete/);
});

test('Lock App clears visible private content and does not call Google revoke',async()=>{
 const h=createHarness();h.begin();await h.respond();
 assert.ok(h.elements.get('#content').children.length>0);
 const previousCalls=h.state.calls.length;
 h.elements.get('#auth').handlers.click();
 assert.equal(h.locked,true);
 assert.equal(h.elements.get('#content').children.length,0);
 assert.equal(h.elements.get('#identity').textContent,'Not connected');
 assert.equal(h.elements.get('#refresh').disabled,true);
 assert.equal(h.loginLabel,'Open Data Center');
 assert.equal(h.state.calls.length,previousCalls);
});

test('failed first load clears access and never displays a partial Company snapshot',async()=>{
 const h=createHarness({initialSheetsFailure:true});
 h.begin();await h.respond();
 assert.equal(h.locked,true);
 assert.equal(h.sheetReads.length,1);
 assert.match(h.notice,/Session locked/);
 assert.equal(h.loginLabel,'Open Data Center');
});

test('failed refresh clears the PREVIOUS private snapshot and forces new auth',async()=>{
 const h=createHarness();h.begin();await h.respond();
 assert.equal(h.locked,false);
 assert.ok(h.elements.get('#content').children.length>0);
 h.state.failResearch=true;
 await h.context.loadAll();
 assert.equal(h.sheetReads.length,4);
 assert.equal(h.locked,true);
 assert.equal(h.elements.get('#content').children.length,0);
 assert.equal(h.elements.get('#identity').textContent,'Not connected');
 assert.equal(h.elements.get('#refresh').disabled,true);
 assert.match(h.notice,/Session locked/);
});

test('incomplete research response on refresh also locks session (no stale fallback)',async()=>{
 const h=createHarness();h.begin();await h.respond();
 // Simulate Google returning an incomplete payload by replacing fetch for
 // this invocation with a restricted adapter bound to the same harness.
 h.context.fetch=async(url,options)=>{
  h.state.calls.push({url:String(url),auth:options?.headers?.Authorization||''});
  if(String(url).includes(master))return {ok:true,status:200,json:async()=>({valueRanges:companies})};
  return {ok:true,status:200,json:async()=>({valueRanges:privateRows.slice(0,2)})};
 };
 await h.context.loadAll();
 assert.equal(h.locked,true);
 assert.match(h.notice,/Incomplete research evidence response/);
});

test('all seven Data Center views render with synthetic authorized research data',async()=>{
 const h=createHarness();
 h.begin();await h.respond();
 const headings=['Dashboard','Companies','Developers & Projects','Research Queue',
  'Evidence & Sources','Review Queue','HubSpot Handover'];
 for(let i=0;i<h.buttons.length;i++){
  h.buttons[i].handlers.click();
  assert.equal(h.elements.get('#location').textContent,headings[i]);
  assert.equal(h.locked,false);
  assert.ok(h.elements.get('#content').children.length>0,'Empty view '+headings[i]);
 }
 assert.equal(h.sheetReads.length,2,'Navigation must not secretly re-fetch or write');
});

test('Company directory search and exact dossier render without mixing other identities',async()=>{
 const h=createHarness();
 h.begin();await h.respond();
 h.buttons.find(b=>b.dataset.view==='companies').handlers.click();
 const walk=n=>[n,...n.children.flatMap(child=>child instanceof Node?walk(child):[])];
 const nodes=()=>walk(h.elements.get('#content'));
 const search=nodes().find(n=>n.tag==='input'&&n.placeholder?.startsWith('Search companies'));
 assert.ok(search,'Expected Company search input');
 search.value='does-not-exist';
 search.handlers.input();
 const renderedText=()=>nodes().map(n=>n.textContent).join(' ');
 assert.match(renderedText(),/No matching rows/);
 search.value='developer larnaca';
 search.handlers.input();
 assert.match(renderedText(),/Synthetic Developer/);
 const companyButton=nodes().find(n=>n.tag==='button'&&n.textContent==='Synthetic Developer');
 assert.ok(companyButton,'Expected exact Company dossier action');
 companyButton.handlers.click();
 assert.match(renderedText(),/TSS-CY-001/);
 assert.match(renderedText(),/Verify identity/);
 assert.equal(h.sheetReads.length,2,'Company dossier must join in-memory research only');
});


test('Company action copies only its name, with zero user-entered research fields',async()=>{
 const h=createHarness();h.begin();await h.respond();
 const before=h.state.calls.length;
 h.buttons.find(b=>b.dataset.view==='companies').handlers.click();
 const walk=n=>[n,...n.children.flatMap(child=>child instanceof Node?walk(child):[])];
 const nodes=()=>walk(h.elements.get('#content'));
 nodes().find(n=>n.tag==='button'&&n.textContent==='Synthetic Developer').handlers.click();
 const section=nodes().find(n=>n.className==='request-section');
 assert.ok(section);
 const all=walk(section);
 assert.equal(all.filter(n=>n.tag==='input'&&n.className==='quick-request').length,0);
 assert.equal(all.filter(n=>n.tag==='textarea'&&n.className==='quick-request').length,0);
 assert.equal(all.filter(n=>n.className==='request-field').length,0);
 const copy=all.find(n=>n.tag==='button'&&n.textContent==='Copy Company name');
 assert.ok(copy);
 await copy.handlers.click();
 assert.equal(h.state.copied,'Synthetic Developer');
 assert.equal(h.state.calls.length,before,'Copy must not call Google, HubSpot or any browser API');
 const fallback=all.find(n=>n.className==='request-preview');
 assert.equal(fallback.value,'Synthetic Developer');
 assert.equal(fallback.hidden,true,'Clipboard success needs no extra form');
});

test('new Company still receives only its exact name and no stored Company fields',async()=>{
 const h=createHarness();h.begin();await h.respond();
 h.buttons.find(b=>b.dataset.view==='companies').handlers.click();
 const walk=n=>[n,...n.children.flatMap(child=>child instanceof Node?walk(child):[])];
 const nodes=()=>walk(h.elements.get('#content'));
 nodes().find(n=>n.tag==='button'&&n.textContent==='Synthetic Developer').handlers.click();
 const section=nodes().find(n=>n.className==='request-section');
 const copy=walk(section).find(n=>n.tag==='button'&&n.textContent==='Copy Company name');
 await copy.handlers.click();
 assert.ok(!h.state.copied.includes('TSS-CY-001'),'Only the Company name goes to clipboard');
 assert.ok(!h.state.copied.includes('Larnaca'));
});
