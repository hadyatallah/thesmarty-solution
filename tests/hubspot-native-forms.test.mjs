import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const loader = read('hubspot-native-forms.js');
const contact = read('contact.html');
const kiti = read('kiti-enquiry.html');

test('native HubSpot form integration uses the verified updated-editor embeds', () => {
  assert.match(loader, /enabled: true/);
  assert.match(loader, /portalId: '149509919'/);
  assert.match(loader, /region: 'eu1'/);
  assert.match(loader, /embedScriptUrl: 'https:\/\/js-eu1\.hsforms\.net\/forms\/embed\/149509919\.js'/);
  assert.match(loader, /contact: 'd571803e-7777-4f28-94ea-b24df852245c'/);
  assert.match(loader, /kiti: '905f1307-a4f8-4dd1-a299-4caefd5aae01'/);
});

test('enabled integration prepares native frames and preserves legacy form until render', () => {
  const appendedScripts = [];
  const frames = [];
  const legacy = { hidden: false };
  const slot = {
    hidden: true,
    dataset: {},
    getAttribute(name) { return name === 'data-tss-hubspot-form' ? 'contact' : null; },
    appendChild(frame) { frames.push(frame); }
  };
  class Element {
    constructor(tag) {
      this.tagName = tag;
      this.attributes = {};
      this.className = '';
      this.async = false;
      this.onerror = null;
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelector() { return null; }
  }
  class MutationObserverMock {
    observe() {}
    disconnect() {}
  }
  const document = {
    readyState: 'complete',
    querySelectorAll(selector) { return selector === '[data-tss-hubspot-form]' ? [slot] : []; },
    querySelector(selector) { return selector === 'form[data-tss-form="contact"]' ? legacy : null; },
    createElement(tag) { return new Element(tag); },
    body: {},
    head: { appendChild(node) { appendedScripts.push(node); } }
  };

  vm.runInNewContext(loader, { document, URL, MutationObserver: MutationObserverMock, setTimeout });

  assert.equal(frames.length, 1);
  assert.equal(frames[0].className, 'hs-form-frame');
  assert.equal(frames[0].attributes['data-region'], 'eu1');
  assert.equal(frames[0].attributes['data-portal-id'], '149509919');
  assert.equal(frames[0].attributes['data-form-id'], 'd571803e-7777-4f28-94ea-b24df852245c');
  assert.equal(slot.hidden, true);
  assert.equal(legacy.hidden, false);
  assert.equal(appendedScripts[0].src, 'https://js-eu1.hsforms.net/forms/embed/149509919.js');
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
