import test from 'node:test';
import assert from 'node:assert/strict';
import {installPhase3HoldImport} from '../crm/data-center-phase3-import.mjs';

const asOf='2026-10-09';
const records=[
 {id:'TSS-CY-001',name:'Synthetic One',source1:'https://example.org/one',researchDate:asOf},
 {id:'TSS-CY-002',name:'Synthetic Two',source1:'https://example.org/two',researchDate:asOf}
];
const data={schema:'tss-phase3-known-open-holds-v1',origin:'TSS_PHASE3_OWNER_PREVIEW',
 coverage:'KNOWN_OPEN_EXCEPTIONS_ONLY',asOf,holds:[
  {companyId:'TSS-CY-001',reasons:['IDENTITY_RELATIONSHIP']}
 ]};
function fixtureDOM(){
 const prior=globalThis.document;
 const created=[];
 const doc={createElement(tag){
   const item={tag,children:[],events:{},textContent:'',value:'',files:[],rows:0,
    append(...nodes){this.children.push(...nodes);},
    setAttribute(key,value){this[key]=value;},
    addEventListener(name,callback){this.events[name]=callback;}
   };
   created.push(item);return item;
 }};
 globalThis.document=doc;
 return {created,restore(){if(prior===undefined)delete globalThis.document;else globalThis.document=prior;}};
}
function file(value){const json=typeof value==='string'?value:JSON.stringify(value);
 return {size:json.length,async text(){return json;}};
}

test('owner-imported known exception updates only the in-memory research review output',async()=>{
 const dom=fixtureDOM();const accepted=[];
 try{
  const mount={children:[],append(...nodes){this.children.push(...nodes);}};
  const before=JSON.stringify(records);
  const ui=installPhase3HoldImport({mount,companies:records,asOf,
   isCurrent:()=>true,onApply:(next,manifest)=>accepted.push({next,manifest})});
  assert.equal(ui.input.type,'file');
  assert.equal(ui.input.accept,'.json,application/json');
  assert.equal(ui.textarea.tag,'textarea');
  assert.equal(ui.pasteButton.type,'button');
  assert.equal(mount.children.length,1);
  ui.input.files=[file(data)];
  await ui.input.events.change();
  assert.equal(accepted.length,1);
  assert.equal(accepted[0].manifest.count,1);
  assert.equal(accepted[0].next.held,1);
  assert.equal(accepted[0].next.companies.find(x=>x.id==='TSS-CY-001').gate,'IDENTITY_HOLD');
  assert.ok(accepted[0].next.companies.every(x=>x.outreachAuthorized===false&&x.readyForAutoHubspotPromotion===false));
  assert.match(ui.status.textContent,/not a complete hold inventory/i);
  assert.equal(ui.input.value,'');
  assert.equal(JSON.stringify(records),before);
 }finally{dom.restore();}
});

test('pasted known exception JSON uses the same validator and clears pasted private text after apply',()=>{
 const dom=fixtureDOM();const accepted=[];
 try{
  const before=JSON.stringify(records);
  const ui=installPhase3HoldImport({mount:{append(){}},companies:records,asOf,
   isCurrent:()=>true,onApply:(next,manifest)=>accepted.push({next,manifest})});
  ui.textarea.value=JSON.stringify(data);
  ui.pasteButton.events.click();
  assert.equal(accepted.length,1);
  assert.equal(accepted[0].manifest.count,1);
  assert.equal(accepted[0].next.held,1);
  assert.equal(accepted[0].next.companies.find(x=>x.id==='TSS-CY-001').gate,'IDENTITY_HOLD');
  assert.match(ui.status.textContent,/pasted JSON/i);
  assert.equal(ui.textarea.value,'');
  assert.equal(JSON.stringify(records),before);
 }finally{dom.restore();}
});

test('invalid or unknown hold files are rejected without changing the view',async()=>{
 const dom=fixtureDOM();const approved=[];
 try{
  const ui=installPhase3HoldImport({mount:{append(){}},companies:records,asOf,
    isCurrent:()=>true,onApply:(...args)=>approved.push(args)});
  ui.input.files=[file({...data,holds:[{companyId:'TSS-CY-999',reasons:['IDENTITY_RELATIONSHIP']}]})];
  await ui.input.events.change();
  assert.equal(approved.length,0);
  assert.match(ui.status.textContent,/MANIFEST_ID_NOT_IN_COMPANIES/);
  ui.input.files=[file({...data,asOf:'2026-01-01'})];
  await ui.input.events.change();
  assert.equal(approved.length,0);
  assert.match(ui.status.textContent,/MANIFEST_DATE_OUT_OF_RANGE/);
  ui.input.files=[{size:256001,text:async()=>{throw Error('Should never read a large file');}}];
  await ui.input.events.change();
  assert.equal(approved.length,0);
  assert.match(ui.status.textContent,/MANIFEST_TOO_LARGE/);
 }finally{dom.restore();}
});

test('invalid pasted hold JSON is rejected without clearing private text or applying changes',()=>{
 const dom=fixtureDOM();const approved=[];
 try{
  const ui=installPhase3HoldImport({mount:{append(){}},companies:records,asOf,
    isCurrent:()=>true,onApply:(...args)=>approved.push(args)});
  ui.textarea.value=JSON.stringify({...data,holds:[{companyId:'TSS-CY-999',reasons:['IDENTITY_RELATIONSHIP']}]});
  ui.pasteButton.events.click();
  assert.equal(approved.length,0);
  assert.match(ui.status.textContent,/Pasted JSON rejected: MANIFEST_ID_NOT_IN_COMPANIES/);
  assert.match(ui.textarea.value,/TSS-CY-999/);
 }finally{dom.restore();}
});

test('session loss while a selected file is being read prevents any hold update',async()=>{
 const dom=fixtureDOM();const accepted=[];
 try{
  let active=true,release;
  const ui=installPhase3HoldImport({mount:{append(){}},companies:records,asOf,
    isCurrent:()=>active,onApply:()=>accepted.push(1)});
  ui.input.files=[{size:128,text:()=>new Promise(resolve=>{release=resolve;})}];
  const pending=ui.input.events.change();
  active=false;
  release(JSON.stringify(data));
  await pending;
  assert.equal(accepted.length,0);
  assert.equal(ui.input.value,'');
 }finally{dom.restore();}
});
