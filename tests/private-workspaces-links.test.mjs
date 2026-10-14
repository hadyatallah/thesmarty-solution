import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('shared public footer and standalone Contact page expose one Admin Login entry', () => {
  const script = read('script.js');
  const contact = read('contact.html');
  const css = read('style.css');
  assert.match(script, /href="\/admin-login\/">Admin Login<\/a>/);
  assert.match(contact, /href="\/admin-login\/">Admin Login<\/a>/);
  assert.match(css, /\.tss-admin-login/);
  assert.doesNotMatch(script, /tss-private-workspaces/);
  assert.doesNotMatch(contact, /tss-private-workspaces/);
  assert.match(contact, /data-form-id="d6b2a98a-ef6b-4a18-9c99-cf39ea2925e5"/);
});

test('Admin Login verifies owner email with Google before showing two choices', () => {
  const html = read('admin-login/index.html');
  const app = read('admin-login/app.js');
  assert.match(html, /id="workspacePanel"[^>]*hidden/);
  assert.match(html, /href="\/data-center\/"/);
  assert.match(html, /href="\/research-center\/"/);
  assert.match(html, /id="verifyButton"/);
  assert.match(app, /email_verified !== true/);
  assert.match(app, /account\.email \|\| ''\)\.toLowerCase\(\) !== allowed/);
  assert.match(app, /https:\/\/www\.googleapis\.com\/auth\/userinfo\.email/);
  assert.doesNotMatch(app, /spreadsheets\.readonly|spreadsheets\.append|sessionStorage|localStorage/);
});

test('existing /admin route and original app authorization remain unchanged', () => {
  const cfg = JSON.parse(read('vercel.json'));
  for (const source of ['/admin', '/admin/']) {
    const redirects = cfg.redirects.filter((item) => item.source === source);
    assert.equal(redirects.length, 1);
    assert.equal(redirects[0].destination, '/data-center/');
  }
  const dataCenter = read('data-center/index.html');
  const research = read('research-center/index.html');
  assert.match(dataCenter, /class="button workspace-switch" href="\/research-center\/"/);
  assert.match(research, /class="btn switch" href="\/data-center\/"/);
  assert.match(research, /href="\/data-center\/"/);
  assert.match(research, /Google sign-in/);
});
