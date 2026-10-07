import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHandler,hedgedBeginGoogleLogin} from '../api/crm.js';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function response(status,{json,location}={}){
  return {
    status,ok:status>=200&&status<300,
    headers:{get:k=>k.toLowerCase()==='location'?(location||null):null},
    async json(){if(json instanceof Error)throw json;return json;}
  };
}
function harness(fetcher,{method='POST',origin='https://www.thesmartysolution.com',body={fn:'beginGoogleLogin',args:[]}}={}){
  const state={status:null,body:null,headers:{}};
  const req={method,headers:{origin},body};
  const res={
    setHeader(k,v){state.headers[k]=v;return this;},
    status(n){state.status=n;return this;},
    json(v){state.body=v;return this;},
    end(){return this;}
  };
  return {run:()=>makeHandler(fetcher)(req,res),state};
}

test('frontend uses same-origin CRM gateway and no direct Apps Script login transport',()=>{
  const html=fs.readFileSync(path.join(root,'crm/index.html'),'utf8');
  assert.match(html,/const CRM_API='\/api\/crm'/);
  assert.doesNotMatch(html,/const CRM_API='https:\/\/script\.google\.com/);
});

test('beginGoogleLogin follows Apps Script receipt redirect server-side',async()=>{
  const calls=[];
  const fetcher=async(url,opts)=>{calls.push({url,method:opts.method});return calls.length===1
    ?response(302,{location:'https://script.googleusercontent.com/macros/echo?x=1'})
    :response(200,{json:{ok:true,result:{nonce:'fixture-nonce-1234567890'}}});};
  const h=harness(fetcher);await h.run();
  assert.equal(h.state.status,200);assert.equal(h.state.body.result.nonce,'fixture-nonce-1234567890');
  assert.deepEqual(calls.map(x=>x.method),['POST','GET']);
});

test('hedged bootstrap takes the first valid nonce after a slow or failed peer',async()=>{
  let n=0;
  const fetcher=async()=>{n++;if(n===1)return response(503);return response(200,{json:{ok:true,result:{nonce:'fixture-nonce-1234567890'}}});};
  const r=await hedgedBeginGoogleLogin(fetcher,JSON.stringify({fn:'beginGoogleLogin',args:[]}),{delays:[0,5],timeoutMs:50});
  assert.equal(r.value.result.nonce,'fixture-nonce-1234567890');assert.equal(n,2);
});

test('googleSignIn retries one definitive infrastructure HTTP failure',async()=>{
  let n=0;const fetcher=async()=>++n===1?response(503):response(200,{json:{ok:true,result:{token:'fixture',expiresAt:123}}});
  const h=harness(fetcher,{body:{fn:'googleSignIn',args:['credential','nonce']}});
  await h.run();assert.equal(h.state.status,200);assert.equal(n,2);assert.equal(h.state.body.result.token,'fixture');
});

test('googleSignIn is never replayed after an ambiguous network failure',async()=>{
  let n=0;const fetcher=async()=>{n++;throw Error('socket reset');};
  const h=harness(fetcher,{body:{fn:'googleSignIn',args:['credential','nonce']}});
  await h.run();assert.equal(h.state.status,502);assert.equal(n,1);assert.equal(h.state.body.retryable,true);
});

test('saveRecord is never replayed after an uncertain upstream failure',async()=>{
  let n=0;const fetcher=async()=>{n++;return response(503);};
  const h=harness(fetcher,{body:{fn:'saveRecord',args:['token','Companies',{id:'fixture'}]}});
  await h.run();assert.equal(h.state.status,502);assert.equal(n,1);
});

test('rejects unapproved origin and unsupported action without upstream call',async()=>{
  let n=0;const fetcher=async()=>{n++;return response(200,{json:{ok:true}});};
  const h1=harness(fetcher,{origin:'https://evil.example'});await h1.run();assert.equal(h1.state.status,403);
  const h2=harness(fetcher,{body:{fn:'deleteEverything',args:[]}});await h2.run();assert.equal(h2.state.status,400);
  assert.equal(n,0);
});

test('allows project preview origin for isolated acceptance',async()=>{
  const fetcher=async()=>response(200,{json:{ok:true,result:{nonce:'fixture-nonce-1234567890'}}});
  const h=harness(fetcher,{origin:'https://thesmarty-solution-agent-git-fix-crm-auth-gateway-20261005-tss21.vercel.app'});
  await h.run();assert.equal(h.state.status,200);
});

test('hedged bootstrap rejects redirects away from Google ContentService',async()=>{
  let n=0;const fetcher=async()=>{n++;return response(302,{location:'https://example.com/steal'});};
  await assert.rejects(
    hedgedBeginGoogleLogin(fetcher,JSON.stringify({fn:'beginGoogleLogin',args:[]}),{delays:[0,1,2],timeoutMs:25}),
    /UPSTREAM_UNAVAILABLE/
  );
  assert.equal(n,3);
});


test('getState is not replayed inside one slow gateway request',async()=>{
  let n=0;const fetcher=async()=>{n++;return response(503);};
  const h=harness(fetcher,{body:{fn:'getState',args:['token']}});
  await h.run();assert.equal(h.state.status,502);assert.equal(n,1);
});

test('gateway source uses staggered hedges only for login bootstrap',()=>{
  const source=fs.readFileSync(path.join(root,'api/crm.js'),'utf8');
  assert.match(source,/delays=\[0,2500,6000\]/);
  assert.match(source,/timeoutMs=18000/);
  assert.match(source,/if\(body\.fn==='beginGoogleLogin'\)/);
  assert.match(source,/body\.fn==='getState'\?45000/);
  assert.doesNotMatch(source,/hedgedBeginGoogleLogin\(fetcher,payload\)[\s\S]{0,300}saveRecord/);
});

test('Commercial Network target forwards only approved read actions to configured DEV2 backend',async()=>{
  const calls=[];
  const fetcher=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return response(200,{json:{ok:true,result:{commercialOpportunities:[]}}});};
  const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'cn-opportunity-workspace-preview-20261007',TSS_CN_DEV2_BACKEND:'https://script.google.com/macros/s/AKfyFixtureDev2/exec'};
  const state={status:null,body:null,headers:{}};
  const req={method:'POST',headers:{origin:'https://thesmarty-solution-agent-git-cn-opportunity-workspace-preview-20261007-tss21.vercel.app'},body:{target:'commercial-network-dev2',fn:'getCommercialNetworkState',args:['fixture-session',{purpose:'commercial-network',includeArchived:false}]}};
  const res={setHeader(k,v){state.headers[k]=v;return this;},status(n){state.status=n;return this;},json(v){state.body=v;return this;},end(){return this;}};
  await makeHandler(fetcher,{env})(req,res);
  assert.equal(state.status,200);assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://script.google.com/macros/s/AKfyFixtureDev2/exec');
  assert.equal(calls[0].body.fn,'getCommercialNetworkState');
  assert.equal(calls[0].body.target,undefined);
});

test('Commercial Network preview gateway exposes no write action',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return response(200,{json:{ok:true}});};
  const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'cn-opportunity-workspace-preview-20261007',TSS_CN_DEV2_BACKEND:'https://script.google.com/macros/s/AKfyFixtureDev2/exec'};
  const state={status:null,body:null,headers:{}};
  const req={method:'POST',headers:{origin:'https://www.thesmartysolution.com'},body:{target:'commercial-network-dev2',fn:'saveCommercialNetworkRecord',args:[]}};
  const res={setHeader(k,v){state.headers[k]=v;return this;},status(n){state.status=n;return this;},json(v){state.body=v;return this;},end(){return this;}};
  await makeHandler(fetcher,{env})(req,res);
  assert.equal(state.status,400);assert.equal(state.body.error,'ACTION_NOT_ALLOWED');assert.equal(calls,0);
});

test('Commercial Network DEV2 gateway fails closed when backend endpoint is not configured',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return response(200,{json:{ok:true}});};
  const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'cn-opportunity-workspace-preview-20261007'};
  const state={status:null,body:null,headers:{}};
  const req={method:'POST',headers:{origin:'https://www.thesmartysolution.com'},body:{target:'commercial-network-dev2',fn:'getCommercialNetworkState',args:[]}};
  const res={setHeader(k,v){state.headers[k]=v;return this;},status(n){state.status=n;return this;},json(v){state.body=v;return this;},end(){return this;}};
  await makeHandler(fetcher,{env})(req,res);
  assert.equal(state.status,503);assert.equal(state.body.error,'DEV2_BACKEND_NOT_CONFIGURED');assert.equal(calls,0);
});

