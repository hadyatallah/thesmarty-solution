import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('legacy /admin route stays on private owner-authenticated Data Center', () => {
  const cfg = JSON.parse(read('vercel.json'));
  for (const source of ['/admin', '/admin/']) {
    const matches = cfg.redirects.filter(x => x.source === source);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].destination, '/data-center/');
    assert.equal(matches[0].permanent, false);
  }
  assert.ok(!cfg.redirects.some(x => x.source === '/crm/' || x.source === '/crm'));
});

test('single Admin Login button and verified two-workspace chooser replace legacy entry', () => {
  const shared = read('script.js');
  const contact = read('contact.html');
  const gateway = read('admin-login/index.html');
  const auth = read('admin-login/app.js');
  const pages = ['index.html', 'divisions.html', 'how-we-work.html', 'about.html',
    'opportunities.html', 'opportunity-kiti.html', 'privacy.html'];
  for (const page of pages) {
    assert.match(read(page), /src="script\.js/);
  }
  assert.match(shared, /href="\/admin-login\/">Admin Login<\/a>/);
  assert.match(contact, /href="\/admin-login\/">Admin Login<\/a>/);
  assert.match(gateway, /id="workspacePanel"[^>]*hidden/);
  assert.match(gateway, /href="\/data-center\/"/);
  assert.match(gateway, /href="\/research-center\/"/);
  assert.match(auth, /email_verified !== true/);
});

test('public contact is still HubSpot native without legacy CRM scripts', () => {
  const html = read('index.html') + read('contact.html');
  assert.doesNotMatch(html, /script\.google\.com|\/api\/crm|TSS_FORM_ENDPOINT/);
  assert.doesNotMatch(html, /tss-hubspot-enquiry-sync/);
  assert.match(read('contact.html'), /data-form-id="d6b2a98a-ef6b-4a18-9c99-cf39ea2925e5"/);
});
