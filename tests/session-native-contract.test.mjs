// Native response contract learned from a preserved source snapshot. These are synthetic
// adapter tests, not proof that a particular live deployment uses that source.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validNativeCheck,MAX_MS,resolveBrowserSession} from '../server/crm-session/core.js';
import {harness,ORIGIN,SESSION_COOKIE} from './session-support.mjs';
const NOW=1791118800000;
test('expiry-only native session result is accepted without fabricated success flags',()=>assert.deepEqual(validNativeCheck({expiresAt:NOW+60000},NOW),{expiresAt:NOW+60000}));
for(const v of [true,{valid:true},{authenticated:true},{ok:true}])test('generic success without native expiry is rejected: '+JSON.stringify(v),()=>assert.throws(()=>validNativeCheck(v,NOW),/NATIVE_CONTRACT_UNVERIFIED/));
for(const v of ['1791118860000',NaN,Infinity,1791118860000.5])test('non-integer/non-numeric native expiry is rejected: '+String(v),()=>assert.throws(()=>validNativeCheck({expiresAt:v},NOW),/NATIVE_CONTRACT_UNVERIFIED/));
for(const expiry of [NOW,NOW-1,Math.floor(NOW/1000)])test('expired or wrong-unit expiry cannot establish access: '+expiry,()=>assert.throws(()=>validNativeCheck({expiresAt:expiry},NOW),/AUTH_REQUIRED/));
for(const negative of [{valid:false},{authenticated:false},{ok:false},{email:'other@example.invalid'}])test('explicit denial or wrong owner overrides future expiry: '+JSON.stringify(negative),()=>assert.throws(()=>validNativeCheck({expiresAt:NOW+60000,...negative},NOW),/AUTH_REQUIRED/));
test('login preserves expiry-only contract through native revalidation',async()=>{const h=harness(),r=await h.login();assert.equal(r.value.ok,true);assert.equal(r.value.result.expiresAt,h.clock()+MAX_MS);assert.equal(h.calls.filter(x=>x.fn==='checkSession').length,1);});
test('login uses the earlier expiry returned by the second native check',async()=>{const h=harness();h.behavior.check={expiresAt:h.clock()+60000};const r=await h.login(true);assert.equal(r.value.ok,true);assert.equal(r.value.result.expiresAt,h.clock()+60000);assert.match(r.headers['set-cookie'][0],/Max-Age=60$/);});
test('resume cannot display a later expiry than the latest native check',async()=>{const h=harness(),r=await h.login();h.behavior.check={expiresAt:h.clock()+45000};const resumed=await h.invoke({op:'resume'});assert.equal(resumed.value.ok,true);assert.equal(resumed.value.result.expiresAt,h.clock()+45000);assert.equal(resumed.value.result.marker,r.value.result.marker);assert.equal(resumed.headers['set-cookie'],undefined);});
test('expired native result is rejected even when the sealed cookie is unexpired',async()=>{const h=harness();await h.login();h.behavior.check={expiresAt:h.clock()};const r=await h.invoke({op:'resume'});assert.equal(r.value.error,'AUTH_REQUIRED');});
test('native check cannot stretch the cookie beyond its original expiry',async()=>{const h=harness(),r=await h.login();h.behavior.check={expiresAt:h.clock()+MAX_MS*2};const resumed=await h.invoke({op:'resume'});assert.equal(resumed.value.result.expiresAt,r.value.result.expiresAt);});
test('server-only legacy adapter returns an expiry capped by native check',async()=>{const h=harness(),m=(await h.login()).value.result;h.behavior.check={expiresAt:h.clock()+30000};const req={method:'POST',headers:{origin:ORIGIN,host:'api.thesmartysolution.com',cookie:SESSION_COOKIE+'='+h.jar[SESSION_COOKIE],'x-tss-crm-request':'1','x-tss-crm-csrf':m.csrf}};const s=await resolveBrowserSession(req,m.marker,{env:h.env,call:h.call,now:h.clock()});assert.equal(s.expiresAt,h.clock()+30000);});
