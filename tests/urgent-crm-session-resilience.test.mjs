import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'crm/index.html'),'utf8');

test('normal browser receives a bounded trusted-session window',()=>{
  assert.match(html,/const TRUSTED_BROWSER_SESSION_MAX_MS=8\*60\*60\*1000/);
  assert.match(html,/const ttl=isInstalledApp\(\)\?TRUSTED_SESSION_MAX_MS:TRUSTED_BROWSER_SESSION_MAX_MS/);
});

test('reload no longer signs the CRM session out',()=>{
  assert.match(html,/window\.addEventListener\('pagehide',\(\)=>\{rememberTrustedSession\(\)\}\)/);
  const pagehide=html.match(/window\.addEventListener\('pagehide',[\s\S]*?\);/);
  assert.ok(pagehide);
  assert.doesNotMatch(pagehide[0],/signOut|clearSession/);
});

test('valid saved server session restores without mandatory checkSession round trip',()=>{
  assert.match(html,/if\(sessionExpiry&&Date\.now\(\)<sessionExpiry\)\{/);
  assert.match(html,/const cached=loadCachedState\(\)/);
  assert.match(html,/render\(\);refresh\(\);return true/);
});

test('expired saved session is verified before reuse and invalid auth still clears locally',()=>{
  assert.match(html,/await rpc\('checkSession',sessionToken\)/);
  assert.match(html,/AUTH_REQUIRED\|SESSION_CHANGED/);
  assert.match(html,/clearSession\(true\);return false/);
});

test('background expiry check applies to browser and installed app without data writes',()=>{
  assert.match(html,/let sessionCheckInFlight=false/);
  assert.match(html,/rpc\('checkSession',sessionToken\)/);
  assert.doesNotMatch(html,/setInterval\([\s\S]{0,700}saveRecord/);
});

test('login copy no longer promises logout on reload',()=>{
  assert.doesNotMatch(html,/CRM access ends when you leave or reload this page/);
  assert.match(html,/keeps the secure CRM session while it remains valid/);
});
test('successful Google authentication can render only previously authenticated cached state before live refresh',()=>{
  assert.match(html,/const cached=loadCachedState\(\);if\(cached\)\{state=cached\.state/);
  assert.match(html,/render\(\);refresh\(\);return/);
});
