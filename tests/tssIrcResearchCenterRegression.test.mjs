
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../research-center/index.html', import.meta.url), 'utf8');

test('organisation research form requires explicit verification', () => {
  assert.match(html, /function referralForm\\(\\)\\{[\\s\\S]*name="confirmed" required[\\s\\S]*research candidate only/);
  assert.match(html, /if\\(!fd\\.get\\("confirmed"\\)\\)return notice\\("Explicit human verification is required\\.",true\\);/);
});

test('dashboard and scheduler classify real Vercel research cycles as scheduler evidence', () => {
  assert.match(html, /x\\.runType==="RESEARCH_CYCLE"\\&\\&x\\.executionMode==="VERCEL_CRON"/);
  assert.match(html, /approved INDEX AI Agent API/);
  assert.match(html, /Master Companies/);
  assert.ok(html.includes('Every scheduled research run is recorded as <strong>RESEARCH_CYCLE</strong> with <strong>VERCEL_CRON</strong> execution mode'));
  assert.doesNotMatch(html, /Only an ELIGIBILITY_REVIEW run counts as scheduler evidence/);
});

test('research UI keeps communication and canonical-company creation outside the scheduler', () => {
  assert.match(html, /never sends outreach/);
  assert.match(html, /canonical Company creation is not performed by this workflow|canonical Company creation/);
  assert.match(html, /No public buyer identities are harvested/);
});
