import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('retired CRM offline PWA assets are gone instead of cached as an active application', () => {
  for(const name of ['index.html','manifest.webmanifest','service-worker.js','icon.svg']){
    assert.equal(existsSync(new URL('../crm/'+name,import.meta.url)),false,name);
  }
});
test('website still uses native provider form and preserves navigation JS', () => {
  const contact=readFileSync(new URL('../contact.html',import.meta.url),'utf8');
  const script=readFileSync(new URL('../contact-site.js',import.meta.url),'utf8');
  assert.match(contact,/d6b2a98a-ef6b-4a18-9c99-cf39ea2925e5/);
  assert.match(script,/aria-expanded/);
});
