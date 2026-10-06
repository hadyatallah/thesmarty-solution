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


test('ready Targeting Opportunity derives LAUNCH',()=>{
  const f=kitiFixture();
  f.mandate.authorityOutreach='Granted';
  assert.equal(deriveOperatingPhase(f.opportunity,f.mandate,f.matches),'LAUNCH');
});

test('early Opportunity derives PREPARE',()=>{
  const f=kitiFixture();
  f.opportunity.status='Under Review';
  f.opportunity.developmentStage='Preparation';
  assert.equal(deriveOperatingPhase(f.opportunity,f.mandate,f.matches),'PREPARE');
});

test('interested engagement derives CONVERT',()=>{
  const f=kitiFixture();
  f.matches[0].engagementState='Interested';
  assert.equal(deriveOperatingPhase(f.opportunity,f.mandate,f.matches),'CONVERT');
});

test('conflicting mandatory criterion requires review',()=>{
  assert.equal(aggregateMandatory([
    {type:'Mandatory',outcome:'Meets'},
    {type:'Mandatory',outcome:'Conflicting / Review Required'}
  ]),'REVIEW REQUIRED');
});

test('stale mandatory criterion stays incomplete',()=>{
  assert.equal(aggregateMandatory([
    {type:'Mandatory',outcome:'Meets'},
    {type:'Mandatory',outcome:'Stale / Revalidation Required'}
  ]),'INCOMPLETE');
});

test('complete mandatory pass with strong preferred evidence becomes Priority Review',()=>{
  const match={criteria:[
    {type:'Mandatory',outcome:'Meets'},
    {type:'Mandatory',outcome:'Meets'},
    {type:'Preferred',outcome:'Meets'},
    {type:'Preferred',outcome:'Meets'},
    {type:'Preferred',outcome:'Unknown'}
  ]};
  assert.equal(candidateQueueGroup(match),'Priority Review');
});

test('incomplete mandatory evidence becomes Research First',()=>{
  const match={criteria:[
    {type:'Mandatory',outcome:'Meets'},
    {type:'Mandatory',outcome:'Unknown'},
    {type:'Preferred',outcome:'Meets'}
  ]};
  assert.equal(candidateQueueGroup(match),'Research First');
});

test('inactive Mandate blocks outreach',()=>{
  const f=kitiFixture();
  f.mandate.status='Suspended';
  f.mandate.authorityOutreach='Granted';
  f.matches[0].qualificationState='Outreach Approved';
  const gate=outreachGate({mandate:f.mandate,match:f.matches[0]});
  assert.equal(gate.allowed,false);
  assert.match(gate.reason,/Active Mandate required/);
});

test('unknown recipient blocks otherwise authorized outreach',()=>{
  const f=kitiFixture();
  f.mandate.authorityOutreach='Granted';
  f.matches[0].qualificationState='Outreach Approved';
  const gate=outreachGate({mandate:f.mandate,match:f.matches[0],recipientKnown:false});
  assert.equal(gate.allowed,false);
  assert.match(gate.reason,/Recipient identity not confirmed/);
});

test('fully authorized fixture can expose only controlled communication workflow',()=>{
  const f=kitiFixture();
  f.mandate.authorityOutreach='Granted';
  f.matches[0].qualificationState='Outreach Approved';
  const gate=outreachGate({mandate:f.mandate,match:f.matches[0],suppressed:false,recipientKnown:true});
  assert.deepEqual(gate,{allowed:true,reason:'Controlled communication workflow available'});
});

test('requested D3 pack is reduced to D1 by Mandate ceiling',()=>{
  const p=packProjection({
    facts:{title:'Kiti',planning:'controlled'},
    requestedLevel:'D3',
    mandateCeiling:'D1',
    recipientLevel:'D3',
    fieldRules:{title:{minLevel:'D1'},planning:{minLevel:'D3'}}
  });
  assert.equal(p.effectiveLevel,'D1');
  assert.equal(p.included.title,'Kiti');
  assert.equal('planning' in p.included,false);
});

test('negative interest never also proposes Interested',()=>{
  const r=interpretMessage('We are not interested in this opportunity.');
  assert.ok(r.proposals.some(p=>p.field==='engagementState'&&p.value==='Not Interested'));
  assert.equal(r.proposals.some(p=>p.field==='engagementState'&&p.value==='Interested'),false);
});

test('possible executed NDA is detected without changing disclosure state',()=>{
  const r=interpretMessage('Please find the signed NDA attached.');
  assert.ok(r.detected.includes('Possible executed NDA received'));
  assert.equal(r.proposals.some(p=>/disclosure/i.test(p.field)),false);
});

test('restricted owner request is detected but not answered',()=>{
  const r=interpretMessage('Who owns the land?');
  assert.ok(r.detected.includes('Restricted identity requested'));
  assert.equal(r.proposals.length,0);
});

test('commercial term detection does not create a commercial commitment proposal',()=>{
  const r=interpretMessage('Our offer would be EUR 500,000.');
  assert.ok(r.detected.includes('Commercial term may be present'));
  assert.equal(r.proposals.some(p=>/accept|agreement|price|offer/i.test(p.field)),false);
});

test('exact locked site area passes claim validation',()=>{
  const failures=validateDraftClaims('The site is 859 m².',{siteArea:'Approx. 859 m²'});
  assert.equal(failures.some(x=>/site area/i.test(x)),false);
});

test('approved planning fact is not blocked by planning validator',()=>{
  const failures=validateDraftClaims('The project has full planning approval.',{planningApproval:true});
  assert.equal(failures.some(x=>/planning approval/i.test(x)),false);
});

test('approved financial projection flag permits projection wording',()=>{
  const failures=validateDraftClaims('Expected ROI is 18%.',{financialProjectionApproved:true});
  assert.equal(failures.some(x=>/financial projection/i.test(x)),false);
});
