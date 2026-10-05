import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHandler} from '../api/crm.js';
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
    :response(200,{json:{ok:true,result:{nonce:'fixture'}}});};
  const h=harness(fetcher);await h.run();
  assert.equal(h.state.status,200);assert.equal(h.state.body.result.nonce,'fixture');
  assert.deepEqual(calls.map(x=>x.method),['POST','GET']);
});

test('read-only auth bootstrap retries one transient upstream HTTP failure',async()=>{
  let n=0;
  const fetcher=async()=>++n===1?response(503):response(200,{json:{ok:true,result:{nonce:'fixture'}}});
  const h=harness(fetcher);await h.run();
  assert.equal(h.state.status,200);assert.equal(n,2);
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
  const fetcher=async()=>response(200,{json:{ok:true,result:{nonce:'fixture'}}});
  const h=harness(fetcher,{origin:'https://thesmarty-solution-agent-git-fix-crm-auth-gateway-20261005-tss21.vercel.app'});
  await h.run();assert.equal(h.state.status,200);
});

test('blocks redirect away from Google ContentService',async()=>{
  let n=0;const fetcher=async()=>{n++;return response(302,{location:'https://example.com/steal'});};
  const h=harness(fetcher);await h.run();assert.equal(h.state.status,502);assert.equal(n,1);assert.equal(h.state.body.error,'REDIRECT_BLOCKED');
});
