import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const e=JSON.parse(
  fs.readFileSync(new URL('../evidence/p0/P05_CHAT_EXECUTABLE_COMPATIBILITY_2026-10-06.json',import.meta.url))
);

test('chat-executable candidate checkpoint pins exact accepted frontend commit and CI',()=>{
  assert.equal(e.chatExecutableCheckpoint.acceptedCommit,'2e0af29998029955fa8d7e9078b62fb639b4f6c8');
  assert.equal(e.chatExecutableCheckpoint.githubActionsRun,94);
  assert.equal(e.chatExecutableCheckpoint.conclusion,'PASS');
  assert.equal(e.chatExecutableCheckpoint.nodeTests.passed,423);
  assert.equal(e.chatExecutableCheckpoint.nodeTests.failed,0);
});

test('P0.5 evidence does not pretend the missing native source package is available',()=>{
  const n=e.candidateSeparation.nativeAppsScriptCandidate;
  assert.equal(n.state,'BLOCKED_BY_CURRENT_CHAT_SOURCE_PACKAGE_ACCESS');
  assert.equal(n.rawSourcePackageAvailableThroughCurrentConnectors,false);
  assert.equal(n.acceptedInstalledPayloadSha256,'0c53279adc0ec9606725eb2282b65b9ace88e88171c5b8192ad2c59f29b88993');
  assert.match(n.prohibitedWorkaround,/Do not reconstruct/i);
});

test('repository compatibility can pass while full P0.5 remains open',()=>{
  assert.equal(e.gateResults['P05-B'].status,'PASS_REPOSITORY_SCOPE');
  assert.equal(e.gateResults['P05-C'].status,'PASS_FRONTEND_SCOPE');
  assert.equal(e.gateResults['P05-D'].status,'PASS_REPOSITORY_SCOPE');
  assert.equal(e.gateResults['P05-G'].status,'PASS_REPOSITORY_SCOPE_ONLY');
  assert.equal(e.gateResults['P05-A'].status,'PARTIAL_BLOCKED');
  assert.equal(e.gateResults['P05-F'].status,'BLOCKED_BY_AVAILABLE_CHAT_CONNECTORS');
  assert.equal(e.gateResults['P05-H'].status,'NOT_STARTED_NOT_AUTHORIZED');
});

test('Production and external actions remain outside this checkpoint',()=>{
  assert.equal(e.chatExecutableCheckpoint.externalAction,false);
  assert.equal(e.chatExecutableCheckpoint.productionChanged,false);
  assert.match(e.nextAction,/RAW_22_FILE_DEV2_SOURCE_CHECKPOINT/);
});

test('public checkpoint does not expose private Google resource IDs',()=>{
  assert.equal(e.privacy.privateGoogleIdsOmitted,true);
  const raw=JSON.stringify(e);
  assert.doesNotMatch(raw,/1Uftsxpxr/);
  assert.doesNotMatch(raw,/1k1q8g6r/);
});
