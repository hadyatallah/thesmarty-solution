import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kitiFixture,
  deriveOperatingPhase,
  aggregateMandatory,
  candidateQueueGroup,
  effectiveDisclosure,
  outreachGate,
  packProjection,
  interpretMessage,
  validateDraftClaims
} from '../crm/kiti-pilot-model.js';

test('Kiti research-only fixture derives LOAD',()=>{
  const f=kitiFixture();
  assert.equal(deriveOperatingPhase(f.opportunity,f.mandate,f.matches),'LOAD');
});

test('mandatory criteria aggregate PASS when all mandatory meet',()=>{
  const f=kitiFixture();
  assert.equal(aggregateMandatory(f.matches[0].criteria),'PASS');
});

test('mandatory Unknown keeps aggregate INCOMPLETE',()=>{
  assert.equal(aggregateMandatory([
    {type:'Mandatory',outcome:'Meets'},
    {type:'Mandatory',outcome:'Unknown'}
  ]),'INCOMPLETE');
});

test('mandatory failure blocks regardless of preferred fit',()=>{
  const match={criteria:[
    {type:'Mandatory',outcome:'Does Not Meet'},
    {type:'Preferred',outcome:'Meets'},
    {type:'Preferred',outcome:'Meets'}
  ]};
  assert.equal(candidateQueueGroup(match),'Blocked');
});

test('appetite Unknown remains Unknown in fixture',()=>{
  const f=kitiFixture();
  const appetite=f.matches[0].criteria.find(c=>c.name==='Current appetite');
  assert.equal(appetite.outcome,'Unknown');
});

test('outreach blocked without granted authority',()=>{
  const f=kitiFixture();
  const gate=outreachGate({mandate:f.mandate,match:f.matches[0]});
  assert.equal(gate.allowed,false);
  assert.match(gate.reason,/Outreach authority not granted/);
});

test('qualified is not enough for outreach',()=>{
  const f=kitiFixture();
  f.mandate.authorityOutreach='Granted';
  f.matches[0].qualificationState='Qualified';
  assert.equal(outreachGate({mandate:f.mandate,match:f.matches[0]}).allowed,false);
});

test('suppression blocks even Outreach Approved candidate',()=>{
  const f=kitiFixture();
  f.mandate.authorityOutreach='Granted';
  f.matches[0].qualificationState='Outreach Approved';
  assert.equal(outreachGate({mandate:f.mandate,match:f.matches[0],suppressed:true}).allowed,false);
});

test('effective disclosure uses lowest ceiling',()=>{
  assert.equal(effectiveDisclosure({mandateCeiling:'D4',recipientLevel:'D2',documentLevel:'D3'}),'D2');
});

test('restricted Kiti fields never enter pack projection',()=>{
  const p=packProjection({
    facts:{title:'Kiti',landownerIdentity:'secret',confidentialStudies:'secret'},
    requestedLevel:'D4',
    mandateCeiling:'D4',
    recipientLevel:'D4',
    fieldRules:{title:{minLevel:'D1'},landownerIdentity:{restricted:true},confidentialStudies:{restricted:true}}
  });
  assert.equal(p.included.title,'Kiti');
  assert.equal('landownerIdentity' in p.included,false);
  assert.equal('confidentialStudies' in p.included,false);
});

test('message interest does not propose qualification change',()=>{
  const r=interpretMessage('We are interested. Can you send planning information?');
  assert.ok(r.detected.includes('Expressed interest'));
  assert.ok(r.proposals.some(p=>p.field==='engagementState'&&p.value==='Interested'));
  assert.equal(r.qualificationChange,null);
});

test('JV question is question only, not preference',()=>{
  const r=interpretMessage('Would the owner consider a JV?');
  assert.ok(r.detected.includes('JV structure queried'));
  assert.equal(r.proposals.some(p=>/preference|commercialStructure/i.test(p.field)),false);
});

test('do-not-contact instruction is detected',()=>{
  const r=interpretMessage('Please remove me from your list and do not contact me again.');
  assert.ok(r.proposals.some(p=>p.field==='suppression'&&p.value==='Do not contact'));
});

test('unsupported planning claim is blocked',()=>{
  const failures=validateDraftClaims('The project has full planning approval.',{});
  assert.ok(failures.some(x=>/planning approval/i.test(x)));
});

test('unsupported financial projection is blocked',()=>{
  const failures=validateDraftClaims('Expected ROI is 18%.',{});
  assert.ok(failures.some(x=>/financial projection/i.test(x)));
});

test('locked site area mismatch is detected',()=>{
  const failures=validateDraftClaims('The site is 900 m².',{siteArea:'Approx. 859 m²'});
  assert.ok(failures.some(x=>/site area/i.test(x)));
});
