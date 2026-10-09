import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSyncHandler } from '../lib/tssHubspotEnquiryHandler.mjs';

const env = {
  CRON_SECRET: 'test-cron-only-token',
  TSS_SYNC_RUN_SECRET: 'test-manual-only-token',
  TSS_HUBSPOT_SYNC_ENABLED: 'false'
};

function mockResponse() {
  return { code: 0, value: null, headers: {},
    setHeader(k,v) { this.headers[k] = v; return this; },
    status(v) { this.code = v; return this; },
    json(v) { this.value = v; return this; }
  };
}
const passed = { mode:'dry_run', connection:{ status:'verified' }, considered:0, ignored:{}, results:[] };

test('Vercel authorized GET invokes read-only connection probe even with flag OFF', async () => {
  const calls = [];
  const handler = makeSyncHandler(async(_env,options) => {
    calls.push(options);
    return passed;
  }, env);
  const res = mockResponse();
  await handler({ method:'GET', headers:{ authorization:'Bearer test-cron-only-token' } },res);
  assert.equal(res.code, 200);
  assert.equal(res.value.connection.status, 'verified');
  assert.deepEqual(calls,[{write:false}]);
});
test('GET refuses missing key and the manual POST token', async () => {
  const calls=[];
  const handler=makeSyncHandler(async()=>{calls.push('called');return passed;},env);
  for (const headers of [{}, {authorization:'Bearer test-manual-only-token'}]){
    const res=mockResponse();
    await handler({method:'GET',headers},res);
    assert.equal(res.code,401);
  }
  assert.equal(calls.length,0);
});
test('POST preview uses separate manual token and never writes',async()=>{
  const calls=[];
  const handler=makeSyncHandler(async(_env,opts)=>{calls.push(opts);return passed;},env);
  const res=mockResponse();
  await handler({method:'POST',headers:{authorization:'Bearer test-manual-only-token'},body:{mode:'preview'}},res);
  assert.equal(res.code,200);
  assert.deepEqual(calls,[{write:false}]);
});
test('write attempts cannot bypass disabled flag',async()=>{
  const handler=makeSyncHandler(async(_env,opts)=>{
    if(opts.write)throw new Error('Production writes remain disabled');
    return passed;
  },env);
  const res=mockResponse();
  await handler({method:'POST',headers:{authorization:'Bearer test-manual-only-token'},body:{mode:'commit'}},res);
  assert.equal(res.code,503);
  assert.equal(res.value.status,'not_configured_or_disabled');
});
