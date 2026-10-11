import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('retired authenticated CRM Data Center view is not served as a second application', () => {
  assert.equal(existsSync(new URL('../crm/index.html', import.meta.url)), false);
  assert.equal(existsSync(new URL('../analytics/index.html', import.meta.url)), false);
});
test('research engine remains retained for evidence preservation but not published by retired CRM shell', () => {
  assert.equal(existsSync(new URL('../crm/data-center-research-engine.mjs', import.meta.url)), true);
  const contact=readFileSync(new URL('../contact.html',import.meta.url),'utf8');
  assert.doesNotMatch(contact, /dataCenterResearchView|CRM_API|crm\/data-center/);
});
