import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const loader = read('hubspot-native-forms.js');
const contact = read('contact.html');
const redirect = read('kiti-enquiry.html');
const opportunity = read('opportunity-kiti.html');
const NATIVE_ID = 'd571803e-7777-4f28-94ea-b24df852245c';
const KITI_VALUE = 'Kiti Residential Development Opportunity';

function setup(search, nativeFields = []) {
  const scripts = [], frames = [], events = {};
  let observer;
  const legacy = { hidden: false };
  const slot = {
    hidden: true,
    dataset: {},
    getAttribute(k) { return k === 'data-tss-hubspot-form' ? 'contact' : null; },
    appendChild(v) { frames.push(v); }
  };
  class Element {
    constructor(tag) { this.tagName = tag; this.attributes = {}; this.className = ''; this.async = false; }
    setAttribute(k, v) { this.attributes[k] = v; }
    querySelector(sel) { return sel === 'iframe' && this.iframeRendered ? {} : null; }
  }
  class FakeObserver {
    constructor(cb) { this.callback = cb; observer = this; }
    observe() {}
    disconnect() {}
  }
  let assigned = '';
  const form = {
    async getFormFieldValues() { return nativeFields.map(name => ({name, value: ''})); },
    async setFieldValue(name, value) { assigned = value; },
    async getFieldValue() { return assigned; }
  };
  const win = {
    location: { search },
    addEventListener(name, cb) { events[name] = cb; },
    HubSpotFormsV4: { getFormFromEvent() { return form; } }
  };
  const document = {
    readyState: 'complete',
    querySelectorAll(sel) { return sel === '[data-tss-hubspot-form]' ? [slot] : []; },
    querySelector(sel) { return sel === 'form[data-tss-form="contact"]' ? legacy : null; },
    createElement(tag) { return new Element(tag); },
    body: {},
    head: { appendChild(s) { scripts.push(s); } }
  };
  vm.runInNewContext(loader, { document, window: win, URL, URLSearchParams, MutationObserver: FakeObserver, setTimeout: () => {} });
  return {
    events, slot, legacy, scripts, frames,
    render() { frames[0].iframeRendered = true; observer.callback(); },
    async ready() { const cb = events['hs-form-event:on-ready']; if (cb) await cb({ detail: {formId: NATIVE_ID, instanceId: 'qa' }}); },
    get assigned() { return assigned; }
  };
}

test('single published General HubSpot form configured and Kiti GUID absent', () => {
  assert.match(loader, /enabled: true/);
  assert.match(loader, /portalId: '149509919'/);
  assert.match(loader, /contact: 'd571803e-7777-4f28-94ea-b24df852245c'/);
  assert.doesNotMatch(loader, /905f1307-a4f8-4dd1-a299-4caefd5aae01/);
  assert.match(loader, /embedScriptUrl: 'https:\/\/js-eu1\.hsforms\.net\/forms\/embed\/149509919\.js'/);
});

test('one-site-form path and Kiti URL redirect are preserved', () => {
  assert.match(contact, /data-tss-hubspot-form="contact"[^>]*hidden/);
  assert.match(contact, /data-tss-form="contact"/);
  assert.match(contact, /data-route="kiti"/);
  assert.match(redirect, /contact\.html\?enquiry=kiti/);
  assert.doesNotMatch(redirect, /data-tss-form="kiti"/);
  assert.match(opportunity, /contact\.html\?enquiry=kiti/);
});

test('ordinary General route mounts native iframe and hides legacy only after render', () => {
  const f = setup('');
  assert.equal(f.slot.hidden, true);
  assert.equal(f.legacy.hidden, false);
  assert.equal(f.scripts.length, 1);
  assert.equal(f.scripts[0].src, 'https://js-eu1.hsforms.net/forms/embed/149509919.js');
  f.render();
  assert.equal(f.slot.hidden, false);
  assert.equal(f.legacy.hidden, true);
});

test('Kiti is not silently submitted under General native route without the HubSpot field', async () => {
  const f = setup('?enquiry=kiti', []);
  f.render();
  await f.ready();
  assert.equal(f.slot.hidden, true);
  assert.equal(f.legacy.hidden, false);
  assert.equal(f.assigned, '');
});

test('Kiti native route must be set and independently read back before replacing legacy form', async () => {
  const f = setup('?enquiry=kiti', ['0-1/tss_enquiry_route']);
  f.render();
  assert.equal(f.legacy.hidden, false);
  await f.ready();
  assert.equal(f.assigned, KITI_VALUE);
  assert.equal(f.slot.hidden, false);
  assert.equal(f.legacy.hidden, true);
});

test('Kiti verification before iframe render is retained until rendered', async () => {
  const f = setup('?enquiry=kiti', ['0-1/tss_enquiry_route']);
  await f.ready();
  assert.equal(f.legacy.hidden, false);
  f.render();
  assert.equal(f.legacy.hidden, true);
});

test('HubSpot readiness for a different form cannot hide Kiti legacy form', async () => {
  const f = setup('?enquiry=kiti', ['0-1/tss_enquiry_route']);
  f.render();
  await f.events['hs-form-event:on-ready']({ detail: { formId: '905f1307-a4f8-4dd1-a299-4caefd5aae01' } });
  assert.equal(f.slot.hidden, true);
  assert.equal(f.legacy.hidden, false);
});

test('adapter does not submit or create provider records itself', () => {
  assert.doesNotMatch(loader, /fetch\(|XMLHttpRequest|hbspt\.forms\.create\(/);
  assert.match(loader, /hs-form-event:on-ready/);
  assert.match(loader, /HubSpotFormsV4/);
  assert.match(loader, /getFormFieldValues/);
  assert.match(loader, /getFieldValue/);
});
