import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('old browser CRM session shell cannot load after owner-authorized UI retirement', () => {
  assert.equal(existsSync(new URL('../crm/index.html',import.meta.url)),false);
});
test('Outlook still owns explicit authenticated API paths pending backend migration', () => {
  const outlook=readFileSync(new URL('../api/outlook/status.js',import.meta.url),'utf8');
  assert.match(outlook,/verifyCrmSession/);
  assert.equal(existsSync(new URL('../api/outlook/_lib.js',import.meta.url)),true);
});
