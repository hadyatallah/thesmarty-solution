import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverDeveloperSignals } from '../lib/tssIrcResearch.mjs';
const read = body => discoverDeveloperSignals(async () => ({
  ok:true,status:200,json:async()=>body
}),'famagusta');

test('valid zero reports safe success evidence and omitted-total distinction',async()=>{
  for (const body of [{total:0,results:[]},{results:[]}]) {
    const d=(await read(body)).successDiagnostics;
    assert.equal(d.outcome,'NO_MATCHING_SOURCE_RESULTS');
    assert.equal(d.upstreamStatus,200);
    assert.equal(d.totalProvided,Object.hasOwn(body,'total'));
    assert.equal(d.total,0);
    assert.equal(d.rawResultCount,0);
    assert.equal(d.endpointVariant,'v1');
    assert.ok(Number.isInteger(d.elapsedMs)&&d.elapsedMs>=0&&d.elapsedMs<=60000);
  }
});
test('nonempty telemetry excludes body, arbitrary provider keys and seller data',async()=>{
  const d=(await read({results:[{seller:{name:'PRIVATE SELLER'}}],secret:'PRIVATE VALUE',diagnostics:{token:'SECRET'}})).successDiagnostics;
  assert.equal(d.outcome,'MATCHING_SOURCE_RESULTS');
  assert.equal(d.rawResultCount,1);
  assert.deepEqual(Object.keys(d).sort(),[
    'schemaVersion','outcome','upstreamStatus','elapsedMs','endpointVariant','totalProvided','total',
    'rawResultCount','candidateCount','invalidRecordCount','missingSellerNameCount'
  ].sort());
  assert.doesNotMatch(JSON.stringify(d),/PRIVATE|SECRET|token|seller/);
});
test('404 alias success records final endpoint without introducing retries',async()=>{
  let calls=0;
  const d=(await discoverDeveloperSignals(async()=>++calls===1
    ? {ok:false,status:404}
    : {ok:true,status:200,json:async()=>({total:0,results:[]})},'famagusta')).successDiagnostics;
  assert.equal(calls,2);
  assert.equal(d.endpointVariant,'api');
  assert.equal(d.upstreamStatus,200);
});
