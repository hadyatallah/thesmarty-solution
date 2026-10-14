import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('public website footer exposes both private research entry points', () => {
  const script = read('script.js');
  assert.match(script, /className = 'tss-private-workspaces'/);
  assert.match(script, /href="\/admin">Intelligent Data Center<\/a>/);
  assert.match(script, /href="\/research-center\/">International Research Center<\/a>/);
  assert.match(read('style.css'), /\.tss-private-workspaces\{/);
  const contact = read('contact.html');
  assert.match(contact, /href="\/admin">Intelligent Data Center<\/a>/);
  assert.match(contact, /href="\/research-center\/">International Research Center<\/a>/);
});

test('existing admin redirects stay targeted to the Data Center', () => {
  const cfg = JSON.parse(read('vercel.json'));
  for (const source of ['/admin', '/admin/']) {
    const redirects = cfg.redirects.filter((item) => item.source === source);
    assert.equal(redirects.length, 1);
    assert.equal(redirects[0].destination, '/data-center/');
  }
});

test('both workspaces link to each other without changing Google sign-in', () => {
  const dataCenter = read('data-center/index.html');
  const research = read('research-center/index.html');
  assert.match(dataCenter, /href="\/research-center\/"/);
  assert.match(research, /href="\/data-center\/"/);
  assert.match(research, /Google sign-in/);
  assert.match(research, /thesmartysolution@gmail\.com/);
});
