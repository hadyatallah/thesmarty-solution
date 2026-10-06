import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const readback=JSON.parse(
  fs.readFileSync(new URL('../evidence/p0/DEV2_CURRENT_READBACK_2026-10-06.json', import.meta.url))
);

test('fresh DEV2 readback matches accepted canonical Company baseline',()=>{
  assert.equal(readback.environment,'Commercial Network DEV2');
  assert.equal(readback.sheetCount,27);
  assert.equal(readback.companies.count,2876);
  assert.equal(readback.companies.unique,2876);
  assert.equal(readback.companies.orderedChecksum,'1659140c087a961a');
  assert.equal(readback.companies.sortedChecksum,'82d918e59db50ae8');
});

test('fresh DEV2 readback matches accepted retained audit totals',()=>{
  assert.equal(readback.retainedAudit.activityCount,97);
  assert.equal(readback.retainedAudit.agentLedgerCount,36);
});

test('all six Commercial Network entity tabs are clean after accepted fixture cleanup',()=>{
  const entities=Object.entries(readback.commercialNetworkEntities);
  assert.equal(entities.length,6);
  for(const [name,state] of entities){
    assert.equal(state.nonemptyIds,0,name);
  }
});

test('fresh DEV2 readback advances current path without claiming Production acceptance',()=>{
  assert.equal(readback.interpretation.matchesAcceptedP123Readback,true);
  assert.equal(readback.interpretation.p0RestartRequired,false);
  assert.equal(readback.interpretation.oldDevRequired,false);
  assert.equal(readback.interpretation.productionAcceptance,false);
  assert.equal(readback.interpretation.nextGate,'FULL_P0_5_RELEASE_CANDIDATE_COMPATIBILITY');
});

test('public evidence omits private environment identifiers',()=>{
  assert.equal(readback.privacy.privateWorkbookAndScriptIdsOmitted,true);
  const raw=JSON.stringify(readback);
  assert.doesNotMatch(raw,/1Uftsxpxr/);
  assert.doesNotMatch(raw,/1k1q8g6r/);
});
