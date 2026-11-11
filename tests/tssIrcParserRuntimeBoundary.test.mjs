import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverDeveloperSignals} from '../lib/tssIrcResearch.mjs';
import {safeFailureCode,safeIndexDiagnostics} from '../lib/tssIrcRuntime.mjs';
const discover = body=>discoverDeveloperSignals(async()=>({ok:true,status:200,json:async()=>body}),'larnaca');
for(const [body,code,diagnostics] of [
  [{results:[{}]},'INDEX_RESPONSE_INVALID_RECORDS',{rawResultCount:1,candidateCount:0,invalidRecordCount:0,missingSellerNameCount:1}],
  [{results:[{seller:{name:'good'}}],total:0},'INDEX_RESPONSE_INVALID_TOTAL',{rawResultCount:1}],
  [{results:[],total:17},'INDEX_RESPONSE_EMPTY_PAGE_WITH_POSITIVE_TOTAL',{rawResultCount:0}]
]) test('actual caller runtime boundary preserves '+code,async()=>{
  let error;try{await discover(body);}catch(e){error=e;}
  assert.equal(safeFailureCode(error),code);
  assert.deepEqual(safeIndexDiagnostics(error),diagnostics);
  // These are the exact fields the daily handler serializes into Runs.
  const persisted=JSON.parse(JSON.stringify({stage:'DISCOVERY',code:safeFailureCode(error),diagnostics:safeIndexDiagnostics(error)}));
  assert.equal(persisted.code,code);
  assert.deepEqual(persisted.diagnostics,diagnostics);
});
test('runtime only preserves allowlisted nonnegative integer counts',()=>{
  const error=Object.assign(Error('INDEX_RESPONSE_INVALID_RECORDS'),{indexDiagnostics:{
    rawResultCount:4,candidateCount:-1,invalidRecordCount:'2',missingSellerNameCount:NaN,
    authorization:'SECRET',body:'SECRET',upstreamStatus:200
  }});
  assert.deepEqual(safeIndexDiagnostics(error),{rawResultCount:4});
  error.message='UNTRUSTED';
  assert.equal(safeIndexDiagnostics(error),undefined);
});
test('existing HTTP diagnostics behavior preserved',()=>{
  const error=Object.assign(Error('INDEX_API_502'),{indexDiagnostics:{upstreamStatus:502,elapsedMs:7,responseType:'text/html',body:'SECRET'}});
  assert.deepEqual(safeIndexDiagnostics(error),{upstreamStatus:502,elapsedMs:7,responseType:'text/html'});
});
