import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const script=readFileSync(new URL('../script.js',import.meta.url),'utf8');
test('retired API-paid public assistant endpoint is no longer deployed',()=>{
 assert.equal(existsSync(new URL('../api/tss-agent.js',import.meta.url)),false);
 assert.doesNotMatch(script,/TSS_AGENT_ENDPOINT|tss-agent-launch|\/api\/tss-agent|Render the assistant/);
});
test('analytics opt-in and safe tracking stay functional in shared public site shell',()=>{
 assert.match(script,/tss_analytics_consent_v1/);
 assert.match(script,/window\.tssTrackEvent_/);
 assert.match(script,/\bgtag\b/);
 assert.match(script,/tss-consent-accept/);
 assert.match(script,/tss-consent-reject/);
});
