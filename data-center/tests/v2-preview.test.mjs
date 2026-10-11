import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as preflight from '../v2/review.mjs';

const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=file('v2/preview.html'),js=file('v2/preview.js');
const src=js.replace(/^import \{([^}]+)\} from '\.\/review\.mjs';/m,'const {$1}=__preflight;');
assert.notEqual(js,src,'V2 static module import must match expected dependency');

class Element {
 constructor(id){this.id=id;this.value='';this.textContent='';this.className='';
  this.disabled=false;this.children=[];this.handlers={};this.attributes={};}
 addEventListener(event,fn){this.handlers[event]=fn;}
 append(...elements){this.children.push(...elements);}
 replaceChildren(...elements){this.children=[...elements];}
 requestSubmit(){this.handlers.submit({preventDefault(){}});}
 reset(){}
}
function createBrowser(){
 const ids=['proposal','status','details','prepare','prepared','identity','reset','duplicate','conflict','clear'];
 const elements=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
 const names=['factType','attributePath','displayValue','valueJson','observedAt',
 'verificationStatus','freshnessStatus','sourceId','sourceRef','requestId',
 'evidenceId','auditId','conflictGroupId','actor','auditDate','reviewNotes'];
 const inputs=Object.fromEntries(names.map(name=>[name,new Element(name)]));
 elements.proposal.elements={namedItem:key=>inputs[key]||null};
 const document={getElementById:id=>elements[id],
  createElement:tag=>new Element(tag)};
 vm.runInNewContext(src,{__preflight:preflight,document,console,URL},{timeout:1000});
 return {elements,inputs,
  submit(){elements.proposal.requestSubmit();},
  click(id){elements[id].handlers.click();},
  input(name,value){inputs[name].value=value;elements.proposal.handlers.input();},
  output(){return elements.prepared.textContent},
  status(){return elements.status.textContent}};
}
test('V2 Preview is isolated from live V1, CRM, provider auth, network and persistent storage',()=>{
 const index=file('index.html'),app=file('app.js'),cfg=file('config.js');
 assert.match(html,/V2 · PREVIEW ONLY/);
 assert.match(html,/NOT PRODUCTION/);
 assert.match(html,/\.\/preview\.js/);
 assert.match(html,/\.\/preview\.css/);
 assert.match(html,/name="requestId"/);
 assert.match(html,/id="conflict"/);
 assert.match(html,/id="duplicate"/);
 assert.doesNotMatch(html,/accounts\.google\.com|api\.hubspot\.com|sheets\.googleapis\.com|TSS-CY-\d{3}/);
 assert.doesNotMatch(js,/\bfetch\s*\(|localStorage|sessionStorage|indexedDB|XMLHttpRequest|sendBeacon|google\.accounts|\.requestAccessToken\s*\(/);
 assert.doesNotMatch(app,/\.\/v2\/review|v2\/preview/);
 assert.match(cfg,/readOnly:\s*true/);
 assert.match(index,/Open Data Center/);
});

test('V2 synthetic editor validates and prepares only in-memory QA rows',()=>{
 const h=createBrowser();
 h.click('reset');
 h.submit();
 assert.match(h.status(),/LOCAL QA PREFLIGHT PASSED/);
 assert.equal(h.elements.prepare.disabled,false);
 h.click('prepare');
 const out=JSON.parse(h.output());
 assert.equal(out.destination,'ISOLATED_SYNTHETIC_QA_ONLY');
 assert.equal(out.writesPerformed,0);
 assert.equal(out.evidenceRow[0],'EV-QA-V2-0002');
 assert.equal(out.evidenceRow[14],'QA-IDC-V2-REQ-0002');
 assert.equal(out.auditRow[9],'PREPARED');
 assert.match(out.notice,/NOT A SHEETS WRITE/);
 assert.equal(h.elements.prepare.disabled,true);
});

test('duplicate demonstration blocks creation and locks prepare control',()=>{
 const h=createBrowser();h.click('duplicate');
 assert.match(h.status(),/BLOCKED/);
 assert.equal(h.elements.prepare.disabled,true);
 assert.equal(h.inputs.requestId.value,'QA-IDC-V2-REQ-20261011-001');
 const messages=h.elements.details.children.flatMap(x=>[
  x.textContent,...x.children.flatMap(y=>[y.textContent,...y.children.map(z=>z.textContent)])
 ]).join(' ');
 assert.match(messages,/requestId: existing QA Evidence or Audit request; never retry/);
 assert.doesNotMatch(messages,/must be a V2 QA ID/);
 assert.equal(h.output(),'No proposal prepared.');
});

test('conflict demonstration escalates human review and forbids staging',()=>{
 const h=createBrowser();h.click('conflict');
 assert.match(h.status(),/HUMAN REVIEW REQUIRED/);
 assert.equal(h.elements.prepare.disabled,true);
 assert.equal(h.output(),'No proposal prepared.');
});

test('tampering with real Company ID invalidates a previously approved preview',()=>{
 const h=createBrowser();h.click('reset');h.submit();
 assert.equal(h.elements.prepare.disabled,false);
 h.elements.identity.value='TSS-CY-001';
 h.elements.proposal.handlers.change();
 assert.equal(h.elements.prepare.disabled,true);
 h.click('prepare');
 assert.equal(h.output(),'No proposal prepared.');
 h.submit();
 assert.match(h.status(),/BLOCKED/);
});

test('V2 proposal requires verification and freshness classifications',()=>{
 const x={requestId:'QA-IDC-V2-REQ-4',evidenceId:'EV-QA-V2-4',auditId:'AUD-QA-V2-4',
  companyId:'QA-COMPANY-001',factType:'Synthetic',attributePath:'activity',
  valueJson:'"Sample"',displayValue:'Sample',sourceId:'QA-SRC-01',
  sourceRef:'synthetic://tss-idc/v2/4',observedAt:'2026-10-11',
  informationClass:'Internal QA Only',actor:'Internal QA',auditDate:'2026-10-11'};
 const result=preflight.preflightQaProposal(x,{
  knownCompanyIds:['QA-COMPANY-001'],existingEvidence:[],existingAudits:[]
 });
 assert.equal(result.status,'BLOCKED');
 assert.match(result.errors.join(' '),/verificationStatus: required/);
 assert.match(result.errors.join(' '),/freshnessStatus: required/);
});
