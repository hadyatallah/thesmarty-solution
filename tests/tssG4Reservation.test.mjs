import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';
import { makeG4ReservationAdapter } from '../lib/tssG4ReservationAdapter.mjs';

const serviceCode = readFileSync(new URL('../integrations/apps-script/TssG4Reservation.gs',
  import.meta.url), 'utf8');
const secret = 'test-only-secret-not-for-any-real-environment-1234567';
const digest = s => createHash('sha256').update(String(s)).digest('hex');
function makeService() {
  const values = new Map([
    ['TSS_G4_RESERVATIONS_ENABLED', 'true'],
    ['TSS_G4_RESERVATION_SECRET_SHA256', digest(secret)]
  ]);
  let held = false;
  const context = createContext({
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => values.get(key) ?? null,
      setProperty: (key, value) => { values.set(key, value); }
    }) },
    LockService: { getScriptLock: () => ({
      tryLock: () => { if (held) return false; held = true; return true; },
      releaseLock: () => { held = false; }
    }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_alg, s) => [...createHash('sha256').update(String(s)).digest()],
      getUuid: () => randomUUID()
    },
    Date, JSON, String, Array
  });
  new Script(serviceCode, { filename: 'TssG4Reservation.gs' }).runInContext(context);
  return { dispatch: request => context.tssG4ReservationDispatch_(request), values,
    holdStore: () => { held = true; }, releaseStore: () => { held = false; } };
}

test('reservation module is syntax-valid and remains a dispatcher without doPost', () => {
  assert.match(serviceCode, /function tssG4ReservationDispatch_/);
  assert.doesNotMatch(serviceCode, /function\s+doPost\s*\(/);
});

test('disabled/unauthenticated reservations never write persistent state', () => {
  const svc = makeService();
  svc.values.set('TSS_G4_RESERVATIONS_ENABLED', 'false');
  assert.equal(svc.dispatch({action:'reserve',taskId:'TSK-WEB-2026-0031',secret}).code,
    'RESERVATION_SERVICE_DISABLED');
  svc.values.set('TSS_G4_RESERVATIONS_ENABLED', 'true');
  assert.equal(svc.dispatch({action:'reserve',taskId:'TSK-WEB-2026-0031',secret:'wrong'}).code,
    'RESERVATION_UNAUTHORIZED');
  assert.equal(svc.dispatch({action:'reserve',taskId:'OTHER-1',secret}).code,
    'INVALID_TASK_ID');
  assert.equal([...svc.values.keys()].filter(x=>x.startsWith('TSS_G4_RES_')).length, 0);
});

test('first claim persists and competing writers cannot acquire the same task', () => {
  const svc=makeService(), taskId='TSK-WEB-2026-0031';
  const first=svc.dispatch({action:'reserve',taskId,secret});
  assert.equal(first.ok,true);
  assert.equal(first.state,'reserved');
  assert.equal(svc.dispatch({action:'reserve',taskId,secret}).code,'RESERVATION_HELD');
  const summary=svc.dispatch({action:'inspect',taskId,secret});
  assert.equal(summary.state,'reserved');
  assert.equal(summary.token,undefined);
  assert.equal(svc.dispatch({action:'settle',taskId,token:'wrong',outcome:'verified',secret}).code,
    'RESERVATION_TOKEN_MISMATCH');
  assert.equal(svc.dispatch({action:'reserve',taskId:'TSK-WEB-2026-0032',secret}).ok,true);
  assert.equal(svc.dispatch({action:'settle',taskId,token:first.token,
    outcome:'verified',hubspotTaskId:'123',secret}).state,'committed');
  assert.equal(svc.dispatch({action:'reserve',taskId,secret}).code,'ENQUIRY_ALREADY_COMMITTED');
});

test('uncertain writes remain durably held for manual review; no automatic expiry', () => {
  const svc=makeService(), taskId='TSK-WEB-2026-0031';
  const first=svc.dispatch({action:'reserve',taskId,secret});
  assert.equal(svc.dispatch({action:'settle',taskId,token:first.token,
    outcome:'review_required',secret}).state,'review_required');
  assert.equal(svc.dispatch({action:'reserve',taskId,secret}).code,'RESERVATION_HELD');
  assert.equal(svc.dispatch({action:'settle',taskId,token:first.token,
    outcome:'verified',secret}).code,'RESERVATION_NOT_ACTIVE');
});

test('reservations fail closed if atomic store lock is unavailable', () => {
  const svc=makeService();
  svc.holdStore();
  assert.equal(svc.dispatch({action:'reserve',taskId:'TSK-WEB-2026-0031',secret}).code,
    'RESERVATION_STORE_BUSY');
  svc.releaseStore();
  assert.equal(svc.dispatch({action:'reserve',taskId:'TSK-WEB-2026-0031',secret}).ok,true);
});

test('server adapter reserves and settles via authenticated official Apps Script URL', async () => {
  const svc=makeService(), operations=[];
  const fetcher=async (url, opts) => {
    operations.push({url,method:opts.method});
    const payload=svc.dispatch(JSON.parse(opts.body));
    return {ok:true,status:200,json:async()=>payload};
  };
  const adapter=makeG4ReservationAdapter({
    url:'https://script.google.com/macros/s/TEST_STANDALONE_123/exec',
    secret,fetcher
  });
  const lease=await adapter.acquire('TSK-WEB-2026-0031');
  await assert.rejects(adapter.acquire('TSK-WEB-2026-0031'),/RESERVATION_HELD/);
  await lease.release({status:'verified',taskId:'300'});
  await assert.rejects(adapter.acquire('TSK-WEB-2026-0031'),/ENQUIRY_ALREADY_COMMITTED/);
  assert.equal(operations.every(x=>x.method==='POST'),true);
  assert.equal(svc.dispatch({action:'inspect',taskId:'TSK-WEB-2026-0031',secret}).state,
    'committed');
});

test('adapter never retries an uncertain reservation settlement', async () => {
  let total=0;
  const fetcher=async (_url, opts)=>{
    total++;
    if (total===1) return {ok:true,status:200,json:async()=>({
      ok:true,state:'reserved',token:'test-opaque-claim',taskId:'TSK-WEB-2026-0031'
    })};
    throw new Error('network lost after provider write');
  };
  const adapter=makeG4ReservationAdapter({
    url:'https://script.google.com/macros/s/TEST_STANDALONE_123/exec',secret,fetcher
  });
  const lease=await adapter.acquire('TSK-WEB-2026-0031');
  await assert.rejects(lease.release({status:'verified'}),/network lost/);
  assert.equal(total,2);
});

test('adapter rejects insecure endpoints and untrusted redirects', async () => {
  assert.throws(()=>makeG4ReservationAdapter({url:'https://evil.example/exec',secret}),
    /RESERVATION_URL_INVALID/);
  assert.throws(()=>makeG4ReservationAdapter({
    url:'https://script.google.com/macros/s/TEST_STANDALONE_123/exec',secret:'short'
  }),/RESERVATION_SECRET_MISSING/);
  let calls=0;
  const adapter=makeG4ReservationAdapter({
    url:'https://script.google.com/macros/s/TEST_STANDALONE_123/exec',secret,
    fetcher:async()=>{calls++;return {ok:false,status:302,headers:{
      get:()=> 'https://evil.example/reservation'} }; }
  });
  await assert.rejects(adapter.acquire('TSK-WEB-2026-0031'),
    /RESERVATION_RESPONSE_REDIRECT_INVALID/);
  assert.equal(calls,1);
});
