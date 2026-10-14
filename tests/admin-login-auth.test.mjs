import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../admin-login/app.js', import.meta.url), 'utf8');
const owner = 'thesmartysolution@gmail.com';

class Element {
  constructor() {
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.handlers = {};
    this.classList = { toggle() {} };
  }
  addEventListener(name, handler) { this.handlers[name] = handler; }
}

function createHarness({ email = owner, emailVerified = true, googleAvailable = true } = {}) {
  const ids = ['verifyPanel', 'workspacePanel', 'verifyButton', 'lockButton', 'verifiedIdentity', 'notice'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  const choices = [new Element(), new Element()];
  elements.workspacePanel.querySelectorAll = () => choices;
  const state = { authConfig: null, authOptions: null, calls: [] };
  const window = { TSS_IDC_CONFIG: { googleClientId: '1234567890-test.apps.googleusercontent.com', allowedEmail: owner } };
  if (googleAvailable) {
    window.google = { accounts: { oauth2: { initTokenClient(options) {
      state.authConfig = options;
      return { requestAccessToken(next) { state.authOptions = next; } };
    } } } };
  }
  const fetch = async (url, options) => {
    state.calls.push({ url, options });
    return { ok: true, json: async () => ({ email, email_verified: emailVerified }) };
  };
  vm.runInNewContext(source, { window, document: { getElementById(id) { return elements[id]; } }, fetch }, { timeout: 2000 });
  return {
    state, elements, choices,
    begin() { elements.verifyButton.handlers.click(); },
    async respond(token = 'synthetic-token') { await state.authConfig.callback({ access_token: token }); },
    get unlocked() { return elements.workspacePanel.hidden === false; }
  };
}

test('Admin Login starts locked, without calls to Google Sheets or storing tokens', async () => {
  const h = createHarness();
  assert.equal(h.unlocked, false);
  assert.equal(h.state.calls.length, 0);
  h.begin();
  assert.equal(h.unlocked, false);
  assert.equal(h.state.authConfig.scope, 'https://www.googleapis.com/auth/userinfo.email');
  assert.equal(h.state.authConfig.login_hint, owner);
  assert.equal(h.state.authOptions.login_hint, owner);
  assert.equal(h.state.authOptions.prompt, '');
  assert.equal(h.state.calls.length, 0);
  await h.respond();
  assert.equal(h.unlocked, true);
  assert.equal(h.state.calls.length, 1);
  assert.match(h.state.calls[0].url, /googleapis\.com\/oauth2\/v3\/userinfo/);
  assert.equal(h.elements.verifiedIdentity.textContent, 'Verified: ' + owner);
  h.elements.lockButton.handlers.click();
  assert.equal(h.unlocked, false);
  assert.equal(h.elements.verifiedIdentity.textContent, 'Verified account');
});

test('wrong verified email never opens workspaces', async () => {
  const h = createHarness({ email: 'stranger@example.org' });
  h.begin();
  await h.respond();
  assert.equal(h.unlocked, false);
  assert.match(h.elements.notice.textContent, /not authorized/);
  let blocked = false;
  h.choices[0].handlers.click({ preventDefault() { blocked = true; } });
  assert.equal(blocked, true);
});

test('unverified owner email never opens workspaces', async () => {
  const h = createHarness({ emailVerified: false });
  h.begin();
  await h.respond();
  assert.equal(h.unlocked, false);
  assert.match(h.elements.notice.textContent, /not authorized/);
});

test('no Google client fails closed without redirect or fallback', () => {
  const h = createHarness({ googleAvailable: false });
  h.begin();
  assert.equal(h.unlocked, false);
  assert.equal(h.state.calls.length, 0);
  assert.match(h.elements.notice.textContent, /has not loaded/);
});
