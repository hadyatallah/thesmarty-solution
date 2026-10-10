import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const loader = read('hubspot-native-forms.js');
const contact = read('contact.html');
const kiti = read('kiti-enquiry.html');

test('native HubSpot form integration is disabled in the accepted code', () => {
  assert.match(loader, /enabled: false/);
  assert.match(loader, /embedScriptUrl: ''/);
  assert.match(loader, /contact: ''/);
  assert.match(loader, /kiti: ''/);
  assert.match(loader, /if \(!config\.enabled\) return/);
});

test('disabled integration performs no network or live DOM changes', () => {
  const document = {
    readyState: 'complete',
    querySelectorAll() { throw new Error('unapproved provider mount'); },
    head: { appendChild() { throw new Error('network script injection'); } }
  };
  assert.doesNotThrow(() => vm.runInNewContext(loader, { document, URL }));
});

for (const [route, html] of [['contact', contact], ['kiti', kiti]]) {
  test(route + ' page preserves legacy enquiry form and has a hidden native slot', () => {
    assert.match(html, new RegExp('<form data-tss-form="' + route + '"'));
    assert.match(html, new RegExp('data-tss-hubspot-form="' + route + '"[^>]*hidden'));
    assert.match(html, /hubspot-native-forms\.js\?v=g5-native-draft/);
    assert.match(html, /script\.js\?v=20260927-footer-links/);
  });
}

test('adapter cannot create or send provider records by itself', () => {
  assert.doesNotMatch(loader, /fetch\(|XMLHttpRequest|hbspt\.forms\.create\(/);
  assert.match(loader, /hs-form-frame/);
  assert.match(loader, /data-portal-id/);
  assert.match(loader, /data-form-id/);
  assert.match(loader, /js-eu1\.hsforms\.net/);
});
