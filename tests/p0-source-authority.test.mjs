import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(new URL('../evidence/p0/P0_SOURCE_AUTHORITY_MANIFEST_2026-10-06.json', import.meta.url)));

test('P0 authority manifest pins exact approved fixture identity',()=>{
  assert.equal(manifest.authority.artifactName,'P0AcceptanceFixtures.gs');
  assert.equal(manifest.authority.sizeBytes,43755);
  assert.equal(manifest.authority.sha256,'0a8f4a3ec5645de8631a428679e1cef5450c240faa917922ab8e625a569a29d9');
  assert.equal(manifest.authority.totalLines,484);
  assert.equal(manifest.authority.status,'SOLE_APPROVED_P0_FIXTURE_AUTHORITY');
});

test('live ninth file stays quarantined and non-executable',()=>{
  assert.equal(manifest.quarantine.classification,'P5');
  assert.match(manifest.quarantine.status,/DO_NOT_EXECUTE/);
  assert.match(manifest.quarantine.status,/DO_NOT_OVERWRITE/);
  assert.equal(manifest.releaseRule.mayExecute,false);
});

test('legacy P0DevAcceptance is explicitly not the install authority',()=>{
  assert.equal(manifest.separateLegacyArtifact.artifactName,'P0DevAcceptance.gs');
  assert.equal(manifest.separateLegacyArtifact.status,'SEPARATE_OCT1_RUNNER_NOT_INSTALL_AUTHORITY');
});

test('pre-install baseline pins all eight expected core files',()=>{
  const expected=[
    'appsscript.json','Code.gs','CommandCenter.gs','CommercialNetwork.gs',
    'HttpAcceptance.gs','P0AcceptanceAuthBridge.gs','P0DevIsolationDiagnostic.gs','UntitledAiDiagnostic.gs'
  ];
  assert.deepEqual(Object.keys(manifest.preInstallEightFileBaseline).sort(),expected.sort());
  for(const [name,entry] of Object.entries(manifest.preInstallEightFileBaseline)){
    assert.ok(entry.bytes>0,name);
    assert.match(entry.sha256,/^[a-f0-9]{64}$/i,name);
  }
});

test('release rule requires source recapture and hash verification before execution',()=>{
  const rule=manifest.releaseRule.requirements.join('\n');
  assert.match(rule,/stable raw saved-source export/i);
  assert.match(rule,/Do not execute/i);
  assert.match(rule,/Do not overwrite/i);
  assert.match(rule,/SHA-256/i);
  assert.match(rule,/persistent acceptance/i);
});
