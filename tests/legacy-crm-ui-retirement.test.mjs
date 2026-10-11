import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('abandoned custom CRM and analytics interfaces and PWA assets are not deployed', () => {
  for (const path of [
    'crm/index.html',
    'crm/manifest.webmanifest',
    'crm/service-worker.js',
    'crm/icon.svg',
    'analytics/index.html'
  ]) {
    assert.equal(existsSync(new URL('../' + path, import.meta.url)), false, path);
  }
});

test('public site no longer advertises old custom CRM and analytics entry points', () => {
  const script = source('script.js');
  assert.doesNotMatch(script, /<a href="\/crm\/" rel="nofollow">Admin login<\/a>/);
  assert.doesNotMatch(script, /<a href="\/analytics\/" rel="nofollow">Analytics<\/a>/);
  const home=source('index.html');
  assert.doesNotMatch(home, /href="\/crm\/"|href="\/analytics\/"/);
});

test('native HubSpot Contact page remains isolated from the legacy Apps Script path', () => {
  const contact = source('contact.html');
  assert.match(contact, /data-form-id="d6b2a98a-ef6b-4a18-9c99-cf39ea2925e5"/);
  assert.match(contact, /https:\/\/js-eu1\.hsforms\.net\/forms\/embed\/149509919\.js/);
  assert.doesNotMatch(contact, /src="script\.js|data-tss-form/);
});

test('legacy CRM gateway and CRM-session Outlook capture routes are retired', () => {
  assert.equal(existsSync(new URL('../api/crm.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../api/outlook/status.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../api/outlook/_lib.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../server/outlook/status.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../lib/tssHubspotEnquiryHandler.mjs', import.meta.url)), false);
  assert.equal(existsSync(new URL('../lib/tssHubspotEnquirySync.mjs', import.meta.url)), false);
  const config = JSON.parse(source('vercel.json'));
  assert.equal(config.rewrites?.length || 0, 0);
  assert.equal(config.crons?.length || 0, 0);
});
