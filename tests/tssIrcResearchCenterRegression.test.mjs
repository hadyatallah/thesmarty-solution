
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../research-center/index.html', import.meta.url), 'utf8');

test('organisation research form requires explicit verification', () => {
  assert.ok(html.includes('name="confirmed" required'));
  assert.ok(html.includes('Explicit human verification is required.'));
  assert.ok(html.includes('research candidate only'));
});

test('dashboard and scheduler classify real Vercel research cycles as scheduler evidence', () => {
  assert.ok(html.includes('x.runType==="RESEARCH_CYCLE"&&x.executionMode==="VERCEL_CRON"'));
  assert.ok(html.includes('approved INDEX AI Agent API'));
  assert.ok(html.includes('Master Companies'));
  assert.ok(html.includes('Every scheduled research run is recorded as <strong>RESEARCH_CYCLE</strong> with <strong>VERCEL_CRON</strong> execution mode'));
  assert.ok(!html.includes('Only an ELIGIBILITY_REVIEW run counts as scheduler evidence'));
});

test('research UI keeps communication and canonical-company creation outside the scheduler', () => {
  assert.ok(html.includes('never sends outreach'));
  assert.ok(html.includes('canonical Company creation'));
  assert.ok(html.includes('No public buyer identities are harvested'));
});
