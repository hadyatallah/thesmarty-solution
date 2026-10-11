import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as model from '../model.mjs';
import {evaluateRealProposal} from '../v2/real-review.mjs';
const read=p=>readFileSync(new URL('../v2/'+p,import.meta.url),'utf8');
const src=read('real-read.js');
const code=src.replace(
 /^import \{([^}]+)\} from '\.\.\/model\.mjs';/m,'const {$1}=__model;'
).replace(
 /^import \{([^}]+)\} from '\.\/real-review\.mjs';/m,'const {$1}=__realReview;'
);
assert.notEqual(src,code,'module imports were not resolved');

class Node {
 constructor(tag='div'){this.tag=tag;this.value='';this.textContent='';this.hidden=false;
  this.disabled=false;this.className='';this.handlers={};this.children=[];
  this.style={};}
 addEventListener(key,handler){this.handlers[key]=handler;}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
}
const companies=[['id','name','category','district','email','phone','website','instagram','status','priority','researchLevel','source1'],
 ['TSS-CY-001','Synthetic Developer','Developer','Larnaca','','','','','','','Profiled','']];
const evidences=[['evidenceId','companyId','candidateId','factType','attributePath','valueJson','displayValue','sourceId','sourceRef','sourcePublishedAt','observedAt','verificationStatus','freshnessStatus','informationClass','supersedesEvidenceId','conflictGroupId','capturedBy','reviewNotes','createdAt','updatedAt','version'],
 ['EV-001','TSS-CY-001','','Developer Role','developerRoles','"Residential Developer"','Residential Developer','SRC-001','https://example.invalid/projects','','2026-09-27','SOURCE SUPPORTED','Review Due','Reusable TSS Intelligence','','','','','','','1']];
const profiles=[['companyId','reconciliationRunId','disposition','canonicalIdentityState','developerRoleVerification','contractorRoleVerification','operatingStatus','developmentActivity','geographyAssessment','duplicateReviewState','researchDepth','evidenceState','researchGaps','updatedAt','version'],
 ['TSS-CY-001','RR-001','Needs Review','Supported','','','','','','','','','','','1']];
function create({email='thesmartysolution@gmail.com',verified=true,failSources=false}={}){
 const ids=['connect','refresh','lock','search','matches','facts','workspace','identity',
  'sourceStatus','selected','dossier','proposal','check','decision','issues','draft'];
 const el=Object.fromEntries(ids.map(x=>[x,new Node(x)]));
 const inputKeys=['factType','attributePath','displayValue','sourceRef','observedAt',
  'verificationStatus','freshnessStatus','informationClass','reviewNotes'];
 const inputs=Object.fromEntries(inputKeys.map(x=>[x,new Node(x)]));
 Object.assign(inputs,{
  factType:Object.assign(new Node('factType'),{value:'Development Activity'}),
  attributePath:Object.assign(new Node('attributePath'),{value:'developmentActivity'}),
  displayValue:Object.assign(new Node('displayValue'),{value:'Observed commercialization'}),
  sourceRef:Object.assign(new Node('sourceRef'),{value:'https://example.invalid/new'}),
  observedAt:Object.assign(new Node('observedAt'),{value:'2026-10-11'}),
  verificationStatus:Object.assign(new Node('verificationStatus'),{value:'SOURCE SUPPORTED'}),
  freshnessStatus:Object.assign(new Node('freshnessStatus'),{value:'Current'}),
  informationClass:Object.assign(new Node('informationClass'),{value:'Reusable TSS Intelligence'}),
  reviewNotes:Object.assign(new Node('reviewNotes'),{value:'Official company website'})
 });
 el.proposal.elements={namedItem:k=>inputs[k]||null};
 const calls={userinfo:0,sheets:0,posts:0};
 let callback=null;
 const google={accounts:{oauth2:{initTokenClient(opts){
  callback=opts.callback;
  return {requestAccessToken(){}};}}}};
 const win={TSS_IDC_CONFIG:{
  googleClientId:'12345-test.apps.googleusercontent.com',allowedEmail:'thesmartysolution@gmail.com',
  readOnly:true,masterSpreadsheetId:'master-test',researchSpreadsheetId:'archive-test'},
  google};
 const document={getElementById:key=>el[key],createElement:tag=>new Node(tag)};
 const fetch=async(url,opts={})=>{
  const u=String(url);
  assert.equal(opts.headers?.Authorization,'Bearer example-access-token');
  if(u.includes('/userinfo')){calls.userinfo++;
   return {ok:true,status:200,json:async()=>({email,email_verified:verified})};}
  if(u.includes('values:batchGet')){calls.sheets++;
   if(failSources)return {ok:false,status:403};
   return {ok:true,status:200,json:async()=>({valueRanges:u.includes('master-test')
    ?[{values:companies}]:[{values:evidences},{values:profiles}]})};
  }
  calls.posts++;throw Error('Unexpected non-read-only call '+u);
 };
 vm.runInNewContext(code,{__model:model,__realReview:{evaluateRealProposal},
  document,window:win,fetch,URLSearchParams,Date,console},{timeout:1500});
 return {el,inputs,calls,connect:()=>el.connect.handlers.click(),
  grant:async()=>callback({access_token:'example-access-token'}),
  click:id=>el[id].handlers.click(),scope:()=>google};
}
test('V2 live review source has no writes, persistent bearer tokens or automatic Google reads',()=>{
 const h=create();
 assert.equal(h.calls.userinfo,0);assert.equal(h.calls.sheets,0);assert.equal(h.calls.posts,0);
 assert.equal(h.el.workspace.hidden,true);
 assert.match(read('real-read.html'),/NO WRITES/);
 assert.doesNotMatch(src,/method:\s*['"]POST|localStorage|sessionStorage|refresh_token|spreadsheet\.write|\/api\/crm/);
});
test('wrong account is denied before loading any source Companies or evidence',async()=>{
 const h=create({email:'unauthorized@example.com'});
 h.connect();await h.grant();
 assert.equal(h.calls.userinfo,1);assert.equal(h.calls.sheets,0);
 assert.equal(h.el.workspace.hidden,true);assert.equal(h.calls.posts,0);
});
test('owner read-only sign-in loads canonical Company and allows in-memory fact review',async()=>{
 const h=create();
 h.connect();await h.grant();
 assert.equal(h.calls.userinfo,1);
 assert.equal(h.calls.sheets,2);
 assert.equal(h.el.workspace.hidden,false);
 h.el.search.value='synthetic';
 h.el.search.handlers.input();
 assert.ok(h.el.matches.children.length>0);
 const choose=h.el.matches.children.find(x=>x.tag==='button');
 assert.ok(choose,'Canonical Company should appear');
 choose.handlers.click();
 assert.match(h.el.dossier.textContent,/TSS-CY-001/);
 h.el.proposal.handlers.submit({preventDefault(){}});
 assert.match(h.el.decision.textContent,/READY_FOR_OWNER_REVIEW/);
 assert.match(h.el.draft.textContent,/writesPerformed/);
 assert.equal(h.calls.posts,0);
 h.click('lock');
 assert.equal(h.el.workspace.hidden,true);
 assert.equal(h.el.facts.children.length,0);
 assert.equal(h.el.matches.children.length,0);
 assert.equal(h.calls.posts,0);
});
test('failed owner source read locks session and erases incomplete data',async()=>{
 const h=create({failSources:true});
 h.connect();await h.grant();
 assert.equal(h.el.workspace.hidden,true);
 assert.match(h.el.sourceStatus.textContent,/locked/);
 assert.equal(h.el.facts.children.length,0);
});
