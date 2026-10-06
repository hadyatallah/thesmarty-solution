import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(
  fs.readFileSync(new URL('../evidence/p0/P0_SOURCE_AUTHORITY_MANIFEST_2026-10-06.json', import.meta.url))
);

test('old DEV authority identity is retained only as historical quarantine evidence',()=>{
  assert.equal(manifest.oldDev.artifactName,'P0AcceptanceFixtures.gs');
  assert.equal(manifest.oldDev.approvedAuthority.sizeBytes,43755);
  assert.equal(
    manifest.oldDev.approvedAuthority.sha256,
    '0a8f4a3ec5645de8631a428679e1cef5450c240faa917922ab8e625a569a29d9'
  );
  assert.equal(manifest.oldDev.observedNinthFile.classification,'P5');
  assert.match(manifest.oldDev.observedNinthFile.status,/QUARANTINED/);
  assert.equal(manifest.oldDev.currentReleaseBaseline,false);
});

test('accepted DEV2 P0 supersedes old DEV as current development baseline',()=>{
  const dev2=manifest.currentDevelopmentBaseline;
  assert.equal(dev2.environment,'Commercial Network DEV2');
  assert.equal(dev2.oldDevUsed,false);
  assert.equal(dev2.p0Foundation.status,'PASSED');
  assert.equal(dev2.p0Foundation.persistentCasesPassed,32);
  assert.equal(dev2.p0Foundation.persistentCasesFailed,0);
  assert.equal(dev2.currentReleaseBaseline,true);
});

test('P0.5 and P123 accepted subsets remain distinct from full release acceptance',()=>{
  const dev2=manifest.currentDevelopmentBaseline;
  assert.equal(dev2.p05NativeSubset.status,'PASSED_SUBSET');
  assert.equal(dev2.p05NativeSubset.casesPassed,16);
  assert.equal(dev2.p05NativeSubset.fullP05Status,'PENDING');
  assert.equal(dev2.p123BackendSubset.status,'PASSED_SUBSET');
  assert.equal(dev2.p123BackendSubset.casesPassed,16);
  assert.equal(dev2.p123BackendSubset.productionAccepted,false);
});

test('Data Center Phase 3 accepted scope is not reopened as an old write-plan blocker',()=>{
  assert.equal(manifest.companyDataCenter.phase3Status,'CLOSED_FOR_APPROVED_BOUNDED_PREVIEW_SCOPE');
  assert.equal(manifest.companyDataCenter.acceptedOn,'2026-10-03');
  assert.equal(manifest.companyDataCenter.productionPromotion,false);
  assert.equal(manifest.companyDataCenter.unresolvedFactsPreserved,true);
});

test('release rule protects old DEV but advances current path to full P0.5',()=>{
  const rule=manifest.releaseRule;
  assert.equal(rule.currentPathMayContinue,true);
  assert.equal(rule.doNotExecuteOldDev,true);
  assert.equal(rule.doNotOverwriteOldDev,true);
  assert.equal(rule.doNotRestartAcceptedP0WithoutNewEvidence,true);
  assert.equal(rule.nextGate,'FULL_P0_5_RELEASE_CANDIDATE_COMPATIBILITY');
  assert.match(rule.requirements.join('\n'),/accepted DEV2 checkpoint/i);
  assert.match(rule.requirements.join('\n'),/full P0\.5 compatibility/i);
});

test('private environment identifiers are omitted from the public evidence manifest',()=>{
  assert.equal(manifest.privacy.privateScriptWorkbookAndLibraryIdsOmittedFromPublicRepository,true);
  const raw=JSON.stringify(manifest);
  assert.doesNotMatch(raw,/1qvsyUWC7pojvhLL/);
  assert.doesNotMatch(raw,/file_000000/);
});
