
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../research-center/index.html', import.meta.url), 'utf8');

test('organisation research form requires explicit verification', () => {
  assert.ok(html.includes('name="confirmed" required'));
  assert.ok(html.includes('Explicit human verification is required.'));
  assert.ok(html.includes('research candidate only'));
});

test('dashboard separates cron labels from independently verified invocation', () => {
  assert.ok(html.includes('x.runType==="RESEARCH_CYCLE"&&x.executionMode==="VERCEL_CRON"'));
  assert.ok(html.includes('approved INDEX AI Agent API'));
  assert.ok(html.includes('Master Companies'));
  assert.ok(html.includes('The label alone does not prove an unattended invocation.'));
  assert.ok(!html.includes('Only an ELIGIBILITY_REVIEW run counts as scheduler evidence'));
});

test('research UI keeps communication and canonical-company creation outside the scheduler', () => {
  assert.ok(html.includes('never sends outreach'));
  assert.ok(html.includes('canonical Company creation'));
  assert.ok(html.includes('No public buyer identities are harvested'));
});


test('UI uses latest scheduled failure, not an older success or later manual recovery', () => {
  const start=html.indexOf('function runDiagnostic('), end=html.indexOf('function draw()',start);
  const all={runs:[
    {runType:'RESEARCH_CYCLE',executionMode:'VERCEL_CRON',startedAt:'2026-10-23T06:43:00Z',outcome:'RESEARCH_CYCLE_COMPLETE'},
    {runType:'RESEARCH_CYCLE',executionMode:'VERCEL_CRON',startedAt:'2026-10-24T06:43:00Z',outcome:'BLOCKED',details:'{"stage":"DISCOVERY","code":"INDEX_TIMEOUT"}'},
    {runType:'RESEARCH_CYCLE',executionMode:'AUTOMATION_MANUAL',startedAt:'2026-10-24T08:00:00Z',outcome:'RESEARCH_CYCLE_COMPLETE'}
  ]};
  const result=vm.runInNewContext(html.slice(start,end)+';({stats:stats(),diagnostic:runDiagnostic(stats().lastScheduled)})',{all});
  assert.equal(result.stats.schedulerBlocked,true);
  assert.equal(result.stats.lastScheduled.outcome,'BLOCKED');
  assert.equal(result.stats.lastSuccessfulScheduled.startedAt,'2026-10-23T06:43:00Z');
  assert.equal(result.diagnostic,'DISCOVERY / INDEX_TIMEOUT');
  assert.ok(html.includes('s.schedulerBlocked?"Last attempt failed"'));
});


test('after the local cron window an old success is not shown as current health', () => {
 const start=html.indexOf('function runDiagnostic('),end=html.indexOf('function handoffPanel()',start);
 const all={runs:[{runId:'IRC-RES-2026-10-23',runType:'RESEARCH_CYCLE',executionMode:'VERCEL_CRON',startedAt:'2026-10-23T06:43:00Z',outcome:'RESEARCH_CYCLE_COMPLETE'}]};
 class FixedDate extends Date {constructor(...args){super(...(args.length?args:['2026-10-24T08:00:00Z']));}}
 const result=vm.runInNewContext(html.slice(start,end)+';stats()',{all,Date:FixedDate});
 assert.equal(result.schedulerStale,true);
 assert.equal(result.schedulerBlocked,false);
});
