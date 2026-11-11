import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverDeveloperSignals } from '../lib/tssIrcResearch.mjs';
const row = { id: 1, seller: { name: ' Valid Developer ' } };
const discover = body => discoverDeveloperSignals(async () => ({
  ok:true, status:200, json:async () => body
}), 'larnaca');

test('valid empty response remains successful and explicitly counted', async () => {
  const result = await discover({total:0,results:[]});
  assert.equal(result.total,0);
  assert.deepEqual(result.diagnostics,{rawResultCount:0,candidateCount:0,invalidRecordCount:0,missingSellerNameCount:0});
});
test('valid rows and numeric-string total preserve discovery semantics', async () => {
  const result = await discover({total:'3',results:[row]});
  assert.equal(result.total,3);
  assert.equal(result.candidates[0].sellerName,'Valid Developer');
  assert.equal(result.diagnostics.rawResultCount,1);
  assert.equal((await discover({results:[row]})).total,1);
});
for (const [name,body,code] of [
  ['null',null,'INVALID_ENVELOPE'],['array',[],'INVALID_ENVELOPE'],
  ['missing results',{},'RESULTS_NOT_ARRAY'],
  ['nested results',{data:{results:[row]}},'RESULTS_NOT_ARRAY'],
  ['object results',{results:{}},'RESULTS_NOT_ARRAY'],
  ['error envelope',{error:'secret upstream body'},'UPSTREAM_ERROR'],
  ['error alongside results',{error:'secret',results:[]},'UPSTREAM_ERROR'],
  ['failed flag',{success:false,results:[]},'UPSTREAM_ERROR'],
  ['ok false',{ok:false,results:[]},'UPSTREAM_ERROR'],
  ['error status',{status:'error',results:[]},'UPSTREAM_ERROR'],
  ['errors array',{errors:['secret'],results:[]},'UPSTREAM_ERROR'],
  ['empty first page with positive total',{total:17,results:[]},'EMPTY_PAGE_WITH_POSITIVE_TOTAL'],
  ['empty first page with positive string total',{total:'17',results:[]},'EMPTY_PAGE_WITH_POSITIVE_TOTAL'],
  ['negative total',{total:-1,results:[]},'INVALID_TOTAL'],
  ['contradictory zero',{total:0,results:[row]},'INVALID_TOTAL'],
  ['invalid total',{total:'unknown',results:[]},'INVALID_TOTAL'],
  ['null total',{total:null,results:[]},'INVALID_TOTAL'],
  ['fractional total',{total:1.1,results:[]},'INVALID_TOTAL'],
  ['unsafe total',{total:Infinity,results:[]},'INVALID_TOTAL'],
]) test(name+' is not successful zero',async () => {
  await assert.rejects(discover(body),error => {
    assert.equal(error.code,'INDEX_RESPONSE_'+code);
    assert.ok(!error.message.includes('secret'));
    return true;
  });
});
test('missing/blank/nonstring seller names and null rows block whole mixed batch with safe counts',async () => {
  await assert.rejects(discover({results:[row,{}, {seller:{name:' '}}, {seller:{name:4}},null]}), error => {
    assert.equal(error.code,'INDEX_RESPONSE_INVALID_RECORDS');
    assert.deepEqual(error.indexDiagnostics,{rawResultCount:5,candidateCount:1,invalidRecordCount:1,missingSellerNameCount:3});
    assert.ok(error.message.length<180);
    assert.ok(!error.message.includes('Valid Developer'));
    return true;
  });
});
test('invalid JSON yields safe code without body or parser details',async () => {
  await assert.rejects(discoverDeveloperSignals(async () => ({ok:true,status:200,json:async()=>{throw Error('secret');}}),'larnaca'),
    {message:'INDEX_RESPONSE_INVALID_JSON'});
});
test('alias response gets same validation, no further retries',async () => {
  let calls=0;
  await assert.rejects(discoverDeveloperSignals(async () => ++calls===1
    ? {ok:false,status:404}
    : {ok:true,status:200,json:async()=>({error:'secret'})},'larnaca'), {code:'INDEX_RESPONSE_UPSTREAM_ERROR'});
  assert.equal(calls,2);
});
test('HTTP failures other than 404 do not retry',async () => {
  let calls=0;
  await assert.rejects(discoverDeveloperSignals(async()=>{calls++;return {ok:false,status:429};},'larnaca'),{message:'INDEX_API_429'});
  assert.equal(calls,1);
});
test('optional no-error flags are accepted',async () => {
  assert.equal((await discover({error:null,errors:[],ok:true,results:[]})).total,0);
});
test('transport deadline remains active through body consumption',async()=>{
  await assert.rejects(discoverDeveloperSignals(async(_url,{signal})=>({
    ok:true,status:200,
    json:()=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('private body'),{name:'AbortError'})),{once:true}))
  }),'larnaca'),{message:'INDEX_TIMEOUT'});
});
