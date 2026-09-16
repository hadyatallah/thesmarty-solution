import test from 'node:test';
import assert from 'node:assert/strict';
import { automationReadiness } from '../lib/automation-readiness.js';
import { userApprovalBinding } from '../lib/qa.js';

function fixture() {
  const now = Date.parse('2026-09-16T12:00:00Z');
  const queue = Array.from({length:10}, (_,i)=>({id:`initial-${i+1}`,format:i===8?'story':i===9?'reel':'feed',platforms:i<8?['instagram','facebook']:['instagram'],caption:'Exact caption',asset:{sha256:'a'.repeat(64)}}));
  const policy={version:1,requiredCount:10,approver:'Hady',firstPostIds:queue.map(i=>i.id),approvals:{}};
  const history=queue.map(i=>({id:i.id,format:i.format,platform:i.platforms.join('+'),phase:'verified',instagram:{mediaId:'123'},...(i.format==='feed'?{facebook:{postId:'456'}}:{}),verification:Object.fromEntries(i.platforms.map(p=>[p,{id:p==='instagram'?'123':'456',sha256:'b'.repeat(64)}])),publishedReview:Object.fromEntries(i.platforms.map(p=>[p,{passed:true,reviewer:'Actual export inspection',assetSha256:'b'.repeat(64)}]))}));
  for (const i of queue) policy.approvals[i.id]={approvedBy:'Hady',approvedAt:'2026-09-16T11:00:00Z',authorizationReference:'Explicit user approval',contentSha256:userApprovalBinding(i)};
  const config={schedulerEnabled:true,verifiedLivePublication:'initial-1',approvedFormats:['feed','story','reel'],formatVerifications:{feed:'initial-1',story:'initial-9',reel:'initial-10'}};
  const plan={formats:{feed:{monthlyTarget:16},story:{monthlyTarget:20},reel:{monthlyTarget:8}}};
  return {config,policy,queue,history,plan,now};
}
const check=f=>automationReadiness(f.config,f.policy,f.queue,f.history,f.plan,f.now);
test('automation authorization waits for every exact approval and inspected format',()=>{
  const f=fixture(); delete f.policy.approvals['initial-6']; f.config.approvedFormats=['feed'];
  const r=check(f); assert.equal(r.publishingEnabled,false);assert.equal(r.mode,'readiness-checks');assert.equal(r.initialApproved,9);assert.deepEqual(r.missingFormats,['story','reel']);
});
test('changing an earlier approved caption closes the automation launch gate',()=>{
  const f=fixture();f.queue[0].caption='Changed caption';assert.equal(check(f).publishingEnabled,false);
});
test('all ten exact approvals and verified formats enable the authorized schedule',()=>{
  const f=fixture();assert.equal(check(f).publishingEnabled,true);f.config.schedulerEnabled=false;assert.equal(check(f).publishingEnabled,false);
});
test('an unresolved publication or mismatched actual asset closes the gate',()=>{
  const f=fixture();f.history.push({id:'uncertain',phase:'needs_review'});assert.equal(check(f).publishingEnabled,false);f.history.pop();f.history[8].publishedReview.instagram.assetSha256='c'.repeat(64);assert.equal(check(f).publishingEnabled,false);
});
