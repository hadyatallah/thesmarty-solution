import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,response,ORIGIN,SESSION_COOKIE} from './session-support.mjs';
import {withBrowserSession} from '../server/crm-session/core.js';
test('cookie adapter preserves prototype-backed Node request headers and original body',async()=>{
 const h=harness(),m=(await h.login()).value.result;let got;
 const original={session:m.marker,id:'fixture'};
 const request=Object.create({get headers(){return this._headers;},markerMethod(){return 'retained';}});
 request.method='POST';request.body=original;request._headers={origin:ORIGIN,host:'api.thesmartysolution.com',cookie:SESSION_COOKIE+'='+h.jar[SESSION_COOKIE],'x-tss-crm-request':'1','x-tss-crm-csrf':m.csrf};
 const wrapped=withBrowserSession(async(req,res)=>{got={headers:req.headers,body:req.body,method:req.markerMethod()};res.status(200).json({ok:true});},'session',{env:h.env,call:h.call,now:h.clock()});
 const r=response();await wrapped(request,r);
 assert.equal(r.value.ok,true);assert.equal(got.headers,request.headers);assert.equal(got.method,'retained');assert.match(got.body.session,/^synthetic-native-bearer/);assert.equal(request.body,original);assert.equal(request.body.session,m.marker);
});
