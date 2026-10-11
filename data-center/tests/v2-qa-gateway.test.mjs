import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeQaGateway,QA_BOOK,QA_TABS,QaGateError,EVIDENCE_HEADERS,AUDIT_HEADERS} from '../v2/qa-gateway.mjs';

const draft=Object.freeze({
 requestId:'QA-IDC-V2-REQ-TEST-20261011-77',
 evidenceId:'EV-QA-V2-TEST-20261011-77',
 auditId:'AUD-QA-V2-TEST-20261011-77',
 companyId:'QA-COMPANY-001',candidateId:'',
 factType:'QA Research Activity',attributePath:'isolatedGatewayQa77',
 valueJson:'"Synthetic only"',displayValue:'Synthetic only',
 sourceId:'QA-SRC-001',sourceRef:'synthetic://tss-idc/v2/gateway-test-77',
 observedAt:'2026-10-11',verificationStatus:'UNVERIFIED',
 freshnessStatus:'Review Due',informationClass:'Internal QA Only',
 conflictGroupId:'',reviewNotes:'Synthetic acceptance',
 actor:'Internal QA',auditDate:'2026-10-11'
});
const headers=[EVIDENCE_HEADERS,AUDIT_HEADERS];
const seed=[[
 ['EV-QA-SEED-001','QA-COMPANY-001','QA-CANDIDATE-001','Developer Role',
  'developerRoles','"Synthetic Developer"','Synthetic seed only','QA-SRC-001',
  'synthetic://tss-idc/write-gate/seed','2026-10-11','UNVERIFIED','Current',
  'Internal QA Only','','QA-IDC-SEED-001','1']
],[
 ['AUD-QA-SEED-001','2026-10-11','Internal QA','SEED','Evidence Observation',
  'EV-QA-SEED-001','QA-IDC-SEED-001','0','1','PREPARED','Seed record',
  'synthetic://tss-idc/write-gate/seed']
]];
function mock({email='thesmartysolution@gmail.com',verified=true,
  postError=false,incompletePost=false,invalidMetadata=false}={}){
 const state={calls:[],sheets:seed.map(rows=>rows.map(x=>[...x])),posts:0};
 const respond=(data,status=200)=>({ok:status===200,status,json:async()=>data});
 const fetcher=async(url,options={})=>{
  const u=String(url);
  const method=options.method||'GET';
  state.calls.push({url:u,method,auth:options.headers?.Authorization});
  if(u.includes('/userinfo'))return respond({email,email_verified:verified});
  assert.ok(u.startsWith('https://sheets.googleapis.com/v4/spreadsheets/'+QA_BOOK));
  assert.equal(options.headers.Authorization,'Bearer synthetic-owner-token');
  if(u.endsWith('?fields=spreadsheetId,sheets(properties(sheetId,title))')){
   return respond({spreadsheetId:QA_BOOK,sheets:[
    {properties:{sheetId:QA_TABS.evidence.id,title:invalidMetadata?'Other':'Evidence QA'}},
    {properties:{sheetId:QA_TABS.audit.id,title:'Audit QA'}}
   ]});
  }
  if(u.includes('values:batchGet'))return respond({valueRanges:state.sheets.map((rows,i)=>({values:[
   [...headers[i]],...rows.map(r=>[...r])
  ]}))});
  if(u.endsWith(':batchUpdate')){
   state.posts++;
   if(postError)throw Error('Network uncertain; do not retry');
   const req=JSON.parse(options.body);
   assert.equal(method,'POST');assert.equal(req.requests.length,2);
   assert.equal(req.requests[0].appendCells.sheetId,QA_TABS.evidence.id);
   assert.equal(req.requests[1].appendCells.sheetId,QA_TABS.audit.id);
   if(!incompletePost){
    req.requests.forEach((r,i)=>state.sheets[i].push(r.appendCells.rows[0].values.map(
     v=>v.userEnteredValue.stringValue)));
   }
   return respond({replies:incompletePost?[]:[{},{}]});
  }
  throw Error('Unexpected mock URL '+u);
 };
 return {state,fetcher};
}
const instantiate=(f)=>makeQaGateway({fetcher:f.fetcher,now:()=>Date.UTC(2026,9,11,18)});

test('QA gateway uses only pinned isolated sheet, exact two tab IDs, and GET for preflight',async()=>{
 const f=mock(),gate=instantiate(f);
 const snapshot=await gate.read('synthetic-owner-token');
 assert.equal(snapshot.evidence.length,1);
 assert.equal(snapshot.audits.length,1);
 assert.equal(f.state.calls.filter(x=>x.method==='POST').length,0);
 assert.ok(f.state.calls.every(x=>!x.url.includes('1mZ7vd2UoGXlyxzwZ8Man593UhlLGt2uS1kIS3ZAWPsU')));
 assert.ok(f.state.calls.every(x=>!x.url.includes('10XZutSMt75LWv1DaMXGPg0uLlvqriCVNbwwH4xhx6J4')));
});

test('owner must be verified before even reading Google Sheets on a WRITE request',async()=>{
 const f=mock({email:'unauthorized@example.com'}),gate=instantiate(f);
 await assert.rejects(gate.appendOnce({token:'synthetic-owner-token',
  draft,confirmation:'WRITE SYNTHETIC QA ONLY'}),/Only the TSS owner/);
 assert.equal(f.state.calls.length,1);assert.equal(f.state.posts,0);
 assert.equal(gate.spent,true);
 await assert.rejects(gate.appendOnce({token:'synthetic-owner-token',
  draft,confirmation:'WRITE SYNTHETIC QA ONLY'}),/already been used/);
});

test('unverified owner, missing phrase, and stale schema fail before any POST',async()=>{
 const f1=mock({verified:false}),g1=instantiate(f1);
 await assert.rejects(g1.appendOnce({token:'synthetic-owner-token',draft,
  confirmation:'WRITE SYNTHETIC QA ONLY'}),/Only the TSS owner/);
 assert.equal(f1.state.posts,0);
 const f2=mock(),g2=instantiate(f2);
 await assert.rejects(g2.appendOnce({token:'synthetic-owner-token',draft,
  confirmation:'NOT MY INTENTION'}),/authorization phrase/);
 assert.equal(f2.state.calls.length,0);
 const f3=mock({invalidMetadata:true}),g3=instantiate(f3);
 await assert.rejects(g3.appendOnce({token:'synthetic-owner-token',draft,
  confirmation:'WRITE SYNTHETIC QA ONLY'}),/tab name or ID mismatch/);
 assert.equal(f3.state.posts,0);
});

test('one explicit QA append creates one evidence row and matching recorded audit, then verifies',async()=>{
 const f=mock(),gate=instantiate(f);
 const result=await gate.appendOnce({token:'synthetic-owner-token',
  draft,confirmation:'WRITE SYNTHETIC QA ONLY'});
 assert.equal(result.status,'QA_APPEND_VERIFIED');
 assert.equal(result.writesPerformed,2);
 assert.equal(result.requestId,draft.requestId);
 assert.equal(result.evidenceRows,2);assert.equal(result.auditRows,2);
 assert.equal(f.state.posts,1);
 assert.equal(f.state.sheets[0][1][14],draft.requestId);
 assert.equal(f.state.sheets[1][1][6],draft.requestId);
 assert.equal(f.state.sheets[1][1][9],'RECORDED');
 assert.equal(gate.spent,true);
 await assert.rejects(gate.appendOnce({token:'synthetic-owner-token',
  draft,confirmation:'WRITE SYNTHETIC QA ONLY'}),/already been used/);
 assert.equal(f.state.posts,1);
});

test('existing evidence OR audit request ID prevents replay even with distinct gateway',async()=>{
 for(const t of [0,1]){
  const f=mock();
  f.state.sheets[t].push(t===0?[
   'EV-QA-V2-REPLAY','','','','','','','','','','','','','',
   draft.requestId,'1'
  ]:[
   'AUD-QA-V2-REPLAY','','','','','',draft.requestId,'','','','',''
  ]);
  const result=await instantiate(f).appendOnce({token:'synthetic-owner-token',
   draft,confirmation:'WRITE SYNTHETIC QA ONLY'});
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.writesPerformed,0);
  assert.equal(f.state.posts,0);
 }
});

test('ambiguous POST failure triggers only independent readback, never retry',async()=>{
 const f=mock({postError:true}),gate=instantiate(f);
 const result=await gate.appendOnce({token:'synthetic-owner-token',draft,
  confirmation:'WRITE SYNTHETIC QA ONLY'});
 assert.equal(result.status,'UNCERTAIN');
 assert.equal(f.state.posts,1);
 assert.equal(gate.spent,true);
 assert.ok(f.state.calls.filter(x=>x.method==='POST').length===1);
});

test('incomplete provider replies cannot be mistaken for a verified append',async()=>{
 const f=mock({incompletePost:true}),gate=instantiate(f);
 const result=await gate.appendOnce({token:'synthetic-owner-token',draft,
  confirmation:'WRITE SYNTHETIC QA ONLY'});
 assert.equal(result.status,'UNCERTAIN');assert.equal(f.state.posts,1);
});

test('QA connector contains no new backend, privileged token persistence, or write to canonical/archive',()=>{
 const code=readFileSync(new URL('../v2/qa-gateway.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(code,/localStorage|sessionStorage|indexedDB|refresh_token|client_secret|private_key|script\.google\.com/);
 assert.match(code,/QA_BOOK='1X1EQpRLRK-ErvHXHxZ8Jp1rvV-SIW8GaKelVuCbzFkk'/);
 assert.doesNotMatch(code,/spreadsheetId:\s*cfg\.masterSpreadsheetId|updateCells:|deleteDimension:|findReplace:/);
 assert.match(code,/WRITE SYNTHETIC QA ONLY/);
});
