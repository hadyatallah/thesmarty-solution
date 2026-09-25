import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const endpoint = source.match(/const TSS_FORM_ENDPOINT = '([^']+)'/)[1];
const formCode = source.slice(source.indexOf('function tssFormParams_'), source.indexOf('// Render the assistant'));

function fixture(result, overrides = {}, contactChoice = null) {
  const fields = {
    name: 'Website verification', email: 'test@example.invalid', phone: '+357 99 810330',
    company: 'Test only', profile: 'Property developer', structure: 'Development partnership',
    message: 'Residential development experience. Please share the Kiti brief.', timing: '',
    capital: 'Prefer not to state at this stage', privacy_consent: 'Agreed', website: '',
    form_started_at: '1000', form_elapsed_ms: '5000', form_nonce: 'test-nonce-123456',
    ...overrides
  };
  const status = { dataset: {}, textContent: '' };
  const button = { textContent: 'Request Investment Brief', disabled: false };
  const requests = [], events = [];
  let submit;
  const form = {
    dataset: { tssForm: contactChoice ? 'contact' : 'kiti' }, fields, resets: 0,
    addEventListener(type, callback) { if (type === 'submit') submit = callback; },
    reportValidity: () => true,
    querySelector: selector => selector === '#interest' ? { selectedOptions: [{ textContent: contactChoice }] } : selector.startsWith('button') ? button : status,
    reset() { this.resets++; },
    dispatchEvent: event => events.push(event.type)
  };
  const context = vm.createContext({
    URLSearchParams,
    FormData: class extends Map { constructor(f) { super(Object.entries(f.fields)); } },
    CustomEvent: class { constructor(type) { this.type = type; } },
    navigator: { onLine: true },
    window: { location: { href: 'https://www.thesmartysolution.com/opportunity-kiti.html#enquire' } },
    document: { querySelector: () => null, querySelectorAll: () => [form] },
    setTimeout: () => {},
    fetch: async (url, options) => { requests.push({ url, options }); if (result instanceof Error) throw result; return result; }
  });
  vm.runInContext(`const TSS_FORM_ENDPOINT = ${JSON.stringify(endpoint)};\n${formCode}`, context);
  context.window.tssTrackEvent_ = () => {};
  if (contactChoice) {
    context.window.tssBuildCommercialEnquiryMessage_ = (data) => {
      const route = String(data.get('interest') || 'Commercial Review');
      const original = String(data.get('message') || '').trim();
      return ['Service route: ' + route, original ? 'Additional context:\n' + original : ''].filter(Boolean).join('\n');
    };
  }
  return { form, status, requests, events, context, send: () => submit({ preventDefault() {} }) };
}
const json = payload => ({ ok: true, type: 'cors', json: async () => payload });

test('embedded Kiti form preserves phone, proof, qualification and routing in one request', async () => {
  const f = fixture(json({ ok: true, recorded: true, enquiryId: 'TSS-TEST-0001', confirmationSent: true }));
  await f.send();
  assert.equal(f.requests.length, 1);
  const { url, options } = f.requests[0];
  assert.equal(url, endpoint);
  assert.equal(options.method, 'POST');
  const body = new URLSearchParams(options.body.toString());
  assert.equal(body.get('phone'), '+357 99 810330');
  assert.equal(body.get('form_nonce'), 'test-nonce-123456');
  assert.equal(body.get('form_elapsed_ms'), '5000');
  assert.equal(body.get('website'), '');
  assert.equal(body.get('interest'), 'Investor / Development Opportunity');
  assert.equal(body.get('source_opportunity'), 'Kiti Residential Development Opportunity');
  assert.equal(body.get('source'), 'https://www.thesmartysolution.com/opportunity-kiti.html#enquire');
  assert.match(body.get('message'), /Role: Property developer/);
  assert.match(body.get('message'), /Privacy consent: Agreed/);
  assert.match(body.get('message'), /Background and what they would like to assess:\nResidential development experience/);
  assert.equal(f.status.dataset.state, 'success');
  assert.match(f.status.textContent, /TSS-TEST-0001/);
  assert.deepEqual(f.events, ['tss:submission-confirmed']);
  assert.equal(f.form.resets, 1);
});

test('legacy separate experience field is still included if supplied', async () => {
  const f = fixture(json({ ok: true }), { experience: 'Completed residential developments' });
  await f.send();
  assert.match(f.requests[0].options.body.get('message'), /Development \/ investment background: Completed residential developments/);
});

test('recorded enquiry without confirmed email does not claim email was sent', async () => {
  const f = fixture(json({ ok: true, recorded: true, enquiryId: 'TSS-TEST-0002', confirmationSent: false }));
  await f.send();
  assert.equal(f.status.dataset.state, 'success');
  assert.match(f.status.textContent, /confirmation email could not be verified/);
  assert.doesNotMatch(f.status.textContent, /email has been sent/);
});

test('unreadable or unconfirmed responses retain form values and show processing', async () => {
  for (const response of [{ ok: true, type: 'opaque' }, json({ ok: true }), new Error('Network response unavailable')]) {
    const f = fixture(response);
    await f.send();
    assert.equal(f.status.dataset.state, 'processing');
    assert.equal(f.form.resets, 0);
    assert.deepEqual(f.events, ['tss:submission-processing']);
    assert.doesNotMatch(f.status.textContent, /has been received/);
  }
});

test('spam, duplicate, rate limit, offline and HTTP failures never show success', async () => {
  for (const code of ['SPAM_REJECTED', 'DUPLICATE', 'RATE_LIMITED']) {
    const f = fixture(json({ ok: false, code }));
    await f.send();
    assert.equal(f.status.dataset.state, 'error');
    assert.equal(f.form.resets, 0);
    assert.equal(f.events.length, 0);
  }
  const http = fixture({ ok: false, status: 500 });
  await http.send();
  assert.equal(http.status.dataset.state, 'error');
  const offline = fixture(new Error('offline'));
  offline.context.navigator.onLine = false;
  await offline.send();
  assert.match(offline.status.textContent, /offline/);
});


test('Phase 7 contact routes preserve the selected commercial category and structured message', async () => {
  for (const category of ['Business Growth','Market Entry & Representation','Strategic Connections','Opportunity Development','Business Systems','Commercial Review']) {
    const f = fixture(json({ok:true,recorded:true,enquiryId:'TSS-TEST'}), { interest:category, message:'Synthetic enquiry for contract testing only.' }, category);
    await f.send();
    const body=f.requests[0].options.body;
    assert.equal(body.get('interest'),category);
    assert.ok(body.get('message').startsWith('Service route: '+category));
    assert.match(body.get('message'), /Synthetic enquiry for contract testing only/);
    assert.equal(body.get('form_nonce'),'test-nonce-123456');
    assert.equal(f.status.dataset.state,'success');
  }
});
