import test from 'node:test';
import assert from 'node:assert/strict';
import { nicosiaDay, seasonActive, safeFailureCode, safeIndexDiagnostics } from '../lib/tssIrcRuntime.mjs';
import { discoverDeveloperSignals } from '../lib/tssIrcResearch.mjs';
import handler from '../api/tss-irc-daily.js';
test('season gates select one daily research trigger across Nicosia DST changes',()=>{
  for(const [iso,season] of [['2026-03-28T07:00:00Z','winter'],['2026-03-29T06:00:00Z','summer'],['2026-10-24T06:00:00Z','summer'],['2026-10-25T07:00:00Z','winter']]){
    const d=new Date(iso);
    assert.equal(seasonActive(season,d),true);
    assert.equal(seasonActive(season==='summer'?'winter':'summer',d),false);
    assert.equal(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Nicosia',hour:'2-digit',hourCycle:'h23'}).format(d),'09');
  }
  assert.equal(nicosiaDay(new Date('2026-10-21T22:00:00Z')),'2026-10-22');
});
test('diagnostics never expose arbitrary provider bodies or credentials',()=>{
  assert.equal(safeFailureCode(Error('secret=private bearer-token')),'RUNTIME_PROVIDER_FAILURE');
  assert.equal(safeFailureCode({response:{status:403},message:'private data'}),'GOOGLE_AUTH_HTTP_403');
  assert.equal(safeFailureCode(Error('INDEX_API_429')),'INDEX_API_429');
});
test('real zero-result schema is valid, malformed success is a failure',async()=>{
  const f=body=>async()=>({ok:true,status:200,json:async()=>body});
  assert.equal((await discoverDeveloperSignals(f({results:[],total:0}),'larnaca')).total,0);
  await assert.rejects(discoverDeveloperSignals(f({error:'invalid'}),'larnaca'),/INDEX_RESPONSE_SCHEMA_INVALID/);
  await assert.rejects(discoverDeveloperSignals(f({results:[],total:2}),'larnaca'),/INDEX_RESPONSE_RESULTS_MISSING/);
});
const res=()=>({status(n){this.statusCode=n;return this},setHeader(){return this},end(body){this.body=JSON.parse(body)}});
test('production execution rejects anonymous, cross-origin and unsupported requests before provider calls',async()=>{
  for(const [method,headers,status] of [['GET',{},401],['POST',{origin:'https://attacker.example'},503],['DELETE',{},405]]){
    const r=res();await handler({method,headers},r);assert.equal(r.statusCode,status);
  }
});

test('persistence boundary drops extra or inconsistent provider metadata',()=>{
 const error=Object.assign(Error('INDEX_API_502'),{indexDiagnostics:{upstreamStatus:502,elapsedMs:7,responseType:'text/html',retryAfterSeconds:120,body:'SECRET',authorization:'SECRET'}});
 assert.deepEqual(safeIndexDiagnostics(error),{upstreamStatus:502,elapsedMs:7,responseType:'text/html',retryAfterSeconds:120});
 error.indexDiagnostics.upstreamStatus=429;assert.equal(safeIndexDiagnostics(error),undefined);
 assert.equal(safeIndexDiagnostics(Error('SECRET')),undefined);
});
