import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('old status dashboard UI is removed without a replacement custom CRM', () => {
  assert.equal(existsSync(new URL('../crm/index.html',import.meta.url)),false);
  assert.equal(existsSync(new URL('../analytics/index.html',import.meta.url)),false);
});
test('native HubSpot Contact and Outlook endpoint remain present', () => {
  const contact=readFileSync(new URL('../contact.html',import.meta.url),'utf8');
  assert.match(contact,/class="hs-form-frame"/);
  assert.equal(existsSync(new URL('../api/outlook/status.js',import.meta.url)),true);
});
