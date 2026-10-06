import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEV2_CN_BACKEND_CONTRACT,
  mapBackendCriterionResult,
  mapBackendMandatoryResult,
  normalizeCandidateEvaluation,
  createKitiDev2Client,
  syntheticDev2RpcFixture
} from '../crm/kiti-pilot-backend.js';

test('backend adapter pins accepted DEV2 public contract names',()=>{
  assert.equal(DEV2_CN_BACKEND_CONTRACT.read,'getCommercialNetworkState');
  assert.equal(DEV2_CN_BACKEND_CONTRACT.candidates,'getCommercialNetworkCandidates');
  assert.equal(DEV2_CN_BACKEND_CONTRACT.prepareTransition,'prepareCommercialNetworkTransition');
  assert.equal(DEV2_CN_BACKEND_CONTRACT.communicationGate,'getCommercialNetworkCommunicationGate');
});

test('accepted backend Satisfied/Failed/Unknown map into pilot display vocabulary',()=>{
  assert.equal(mapBackendCriterionResult({result:'Satisfied'}),'Meets');
  assert.equal(mapBackendCriterionResult({result:'Failed'}),'Does Not Meet');
  assert.equal(mapBackendCriterionResult({result:'Unknown'}),'Unknown');
});

test('backend contradictory evidence maps to Review Required without changing backend contract',()=>{
  const c={result:'Unknown',evidence:[{issue:'Contradictory evidence'}]};
  assert.equal(mapBackendCriterionResult(c),'Conflicting / Review Required');
});

test('backend stale evidence maps to revalidation required',()=>{
  const c={result:'Unknown',evidence:[{issue:'Stale evidence'}]};
  assert.equal(mapBackendCriterionResult(c),'Stale / Revalidation Required');
});

test('mandatory aggregate is derived from mapped evidence, not a numeric score',()=>{
  assert.equal(mapBackendMandatoryResult({criteria:[
    {type:'Mandatory',result:'Satisfied'},
    {type:'Mandatory',result:'Unknown',evidence:[{issue:'Contradictory evidence'}]}
  ]}),'REVIEW REQUIRED');
  assert.equal(mapBackendMandatoryResult({criteria:[
    {type:'Mandatory',result:'Failed'}
  ]}),'FAIL');
  assert.equal(mapBackendMandatoryResult({criteria:[
    {type:'Mandatory',result:'Unknown'}
  ]}),'INCOMPLETE');
  assert.equal(mapBackendMandatoryResult({criteria:[
    {type:'Mandatory',result:'Satisfied'}
  ]}),'PASS');
});

test('candidate normalization preserves backend evidence and appetite Unknown',()=>{
  const n=normalizeCandidateEvaluation({
    version:'tss-cn-workflow-v1',
    companyId:'TSS-CY-001',mandateId:'MAN-SYN',mandatoryCriteriaResult:'Satisfied',
    criteria:[
      {id:'role',label:'Developer Role',type:'Mandatory',result:'Satisfied',evidence:[{recordId:'CNR-1'}]},
      {id:'appetite',label:'Current appetite',type:'Informational',result:'Unknown',evidence:[],gap:'Evidence needed'}
    ],
    gaps:[{id:'appetite',type:'Informational',label:'Current appetite',reason:'Evidence needed'}],
    suppressed:false,externalAction:false
  });
  assert.equal(n.mandatoryCriteriaResult,'PASS');
  assert.equal(n.criteria.find(c=>c.name==='Current appetite').outcome,'Unknown');
  assert.equal(n.externalAction,false);
  assert.equal(n.criteria[0].evidence[0].recordId,'CNR-1');
});

test('readState calls only accepted read contract with purpose',async()=>{
  const f=syntheticDev2RpcFixture();
  const client=createKitiDev2Client(f.rpc);
  const state=await client.readState('TOKEN',{purpose:'commercial-network'});
  assert.equal(state.permissions.externalCommunication,false);
  assert.deepEqual(f.calls.map(c=>c.name),['getCommercialNetworkState']);
  assert.equal(f.calls[0].args[1].purpose,'commercial-network');
});

test('candidate read maps accepted backend result without mutation',async()=>{
  const f=syntheticDev2RpcFixture();
  const client=createKitiDev2Client(f.rpc);
  const result=await client.readCandidates('TOKEN','MAN-KITI',{companyId:'TSS-CY-001'});
  assert.equal(result.candidates.length,1);
  assert.equal(result.candidates[0].companyId,'TSS-CY-001');
  assert.equal(result.candidates[0].mandatoryCriteriaResult,'PASS');
  assert.equal(result.candidates[0].criteria.find(c=>c.name==='Current appetite').outcome,'Unknown');
  assert.deepEqual(f.calls.map(c=>c.name),['getCommercialNetworkCandidates']);
});

test('prepareQualificationTransition uses proposal contract and never calls save or execute',async()=>{
  const f=syntheticDev2RpcFixture();
  const client=createKitiDev2Client(f.rpc);
  const proposal=await client.prepareQualificationTransition('TOKEN','MAT-SYN','Qualified With Gaps',{
    expectedVersion:'3',requestId:'REQ-1',reason:'Human reviewed evidence',disclosureLevel:'D1',recipientContactId:'CON-SYN'
  });
  assert.equal(proposal.status,'proposed');
  assert.deepEqual(f.calls.map(c=>c.name),['prepareCommercialNetworkTransition']);
  assert.equal(f.calls.some(c=>['saveCommercialNetworkRecord','ccDecide','ccExecute'].includes(c.name)),false);
});

test('communication gate remains read-only and returns blocked external send',async()=>{
  const f=syntheticDev2RpcFixture();
  const client=createKitiDev2Client(f.rpc);
  const gate=await client.communicationGate('TOKEN','MAT-SYN');
  assert.equal(gate.allowed,false);
  assert.equal(gate.externalSend,false);
  assert.equal(gate.controlledWorkflowOnly,true);
  assert.deepEqual(f.calls.map(c=>c.name),['getCommercialNetworkCommunicationGate']);
});

test('adapter rejects missing token and write-like calls are not exposed',async()=>{
  const f=syntheticDev2RpcFixture();
  const client=createKitiDev2Client(f.rpc);
  await assert.rejects(()=>client.readState(''),/TOKEN_REQUIRED/);
  assert.equal('saveCommercialNetworkRecord' in client,false);
  assert.equal('approve' in client,false);
  assert.equal('execute' in client,false);
  assert.equal(f.calls.length,0);
});

test('proposal requires optimistic version and request ID before any RPC',async()=>{
  const f=syntheticDev2RpcFixture();
  const client=createKitiDev2Client(f.rpc);
  await assert.rejects(()=>client.prepareQualificationTransition('TOKEN','MAT-SYN','Qualified',{}),/VERSION_REQUIRED/);
  await assert.rejects(()=>client.prepareQualificationTransition('TOKEN','MAT-SYN','Qualified',{expectedVersion:'1'}),/REQUEST_REQUIRED/);
  assert.equal(f.calls.length,0);
});
