import test from 'node:test';
import assert from 'node:assert/strict';
import { automationReadiness } from '../lib/automation-readiness.js';
import { userApprovalBinding } from '../lib/qa.js';
import authorizationPolicy from '../user-approval-policy.json' with { type: 'json' };

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

function waive(f) {
  const authorization = { ...structuredClone(authorizationPolicy.automationAuthorization), authorizedAt: '2026-09-16T11:00:00Z' };
  f.config.automationAuthorization = authorization;
  f.policy.automationAuthorization = structuredClone(authorization);
  f.policy.version = 2;
  f.policy.approvals = Object.fromEntries(Object.entries(f.policy.approvals).slice(0, 5));
  f.history = f.history.slice(0, 5);
  f.config.formatVerifications = { feed: 'initial-1' };
  return f;
}
test('explicit launch waiver enables QA automation without inventing approvals or live format proofs', () => {
  const f = waive(fixture()), before = JSON.stringify(f.policy.approvals), result = check(f);
  assert.equal(result.publishingEnabled, true);
  assert.equal(result.mode, 'automatic_after_qa');
  assert.equal(result.initialApproved, 5);
  assert.equal(result.initialVerified, 5);
  assert.equal(result.manualInitialApprovalsRequired, false);
  assert.deepEqual(result.liveFormatVerificationPending, ['story', 'reel']);
  assert.equal(result.waivedLaunchGates.length, 3);
  assert.equal(JSON.stringify(f.policy.approvals), before);
});
test('launch waiver cannot suppress unresolved publication quarantine or missing feed evidence', () => {
  const f = waive(fixture());
  f.history.push({id: 'uncertain-story', phase: 'needs_review'});
  assert.equal(check(f).publishingEnabled, false);
  f.history.pop();
  f.history[0].publishedReview.instagram.assetSha256 = 'c'.repeat(64);
  assert.equal(check(f).publishingEnabled, false);
});
test('launch waiver rejects mismatched policies, future authorization and unsupported platform scope', () => {
  for (const mutate of [
    f => { f.policy.automationAuthorization.authorizationReference = 'A different authorization record'; },
    f => { f.config.automationAuthorization.authorizedAt = f.policy.automationAuthorization.authorizedAt = '2026-09-17T00:00:00Z'; },
    f => { f.config.automationAuthorization.platformsByFormat.story.push('facebook'); f.policy.automationAuthorization.platformsByFormat.story.push('facebook'); },
    f => { delete f.policy.automationAuthorization; }
  ]) {
    const f = waive(fixture()); mutate(f); assert.equal(check(f).publishingEnabled, false);
  }
});
