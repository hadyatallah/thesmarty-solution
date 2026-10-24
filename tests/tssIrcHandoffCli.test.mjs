import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const run=input=>spawnSync(process.execPath,['scripts/tss-irc-handoff.mjs'],{input,encoding:'utf8',cwd:new URL('..',import.meta.url)});
test('existing connector consumer can invoke bounded offline planner',()=>{
 const result=run(JSON.stringify({now:'2026-10-24T08:00:00Z',candidate:{recordId:'IRC-ORG-TEST'}}));
 assert.equal(result.status,0,result.stderr);
 const planned=JSON.parse(result.stdout);assert.equal(planned.outcome,'HELD');assert.equal(planned.reason,'QUALIFICATION_REQUIRED');assert.deepEqual(planned.steps,[]);
});
test('invalid snapshot is rejected without echoing private input',()=>{
 const result=run('private text not JSON');assert.equal(result.status,1);assert.equal(result.stdout,'');assert.doesNotMatch(result.stderr,/private text/);
});
