import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryRoute, qualifyProspectBatch, PROSPECT_TARGET, PROSPECT_SOURCE } from '../lib/tssIrcProspects.mjs';
import { researchNextAction } from '../lib/tssIrcHandoff.mjs';
import handler from '../api/tss-irc-daily.js';
const observedAt = '2026-10-28T14:00:00Z';
const candidate = () => ({ name: 'Synthetic Agency', website: 'https://agency.example/',
  evidence: ['realEstateAgency', 'cyprusOperations', 'smallOrSolo', 'ownerLed'].map(claim => ({
    claim, value: 'SUPPORTED', url: 'https://agency.example/about', sourceType: 'FIRST_PARTY',
    observation: 'Synthetic reviewed claim for regression only.', reviewed: true, observedAt
  })) });
const batch = () => ({ observedAt, target: PROSPECT_TARGET, source: PROSPECT_SOURCE,
  existingRecords: [], screeningComplete: false, candidates: [candidate()] });
test('client source routing cannot reuse the developer API', () => {
  assert.equal(discoveryRoute('TSS_CLIENT_PROSPECTS').source, PROSPECT_SOURCE);
  assert.equal(discoveryRoute('TSS_CLIENT_PROSPECTS').serverDiscoveryAvailable, false);
  assert.equal(discoveryRoute('REFERRAL_PARTNERS').target, 'PROPERTY_DEVELOPERS');
  assert.equal(discoveryRoute('invented').outcome, 'PURPOSE_REQUIRED');
  assert.equal(researchNextAction({ disposition: 'ACCEPTED_RESEARCH_CANDIDATE' }, 'id', 'REFERRAL_PARTNERS').action, 'REVIEW_REFERRAL_FIT');
});
test('matched evidence is research review only even with caller permission flags', () => {
  const b = batch(); b.permissions = { sendOutlook: true }; const before = structuredClone(b);
  const r = qualifyProspectBatch(b);
  assert.equal(r.qualifiedForReview, 1); assert.equal(r.outreachReady, 0);
  assert.equal(r.results[0].commercialOutcome, 'HELD');
  assert.ok(r.results[0].operationalHolds.includes('INTERNAL_QA_LOGGING_HOLD'));
  assert.deepEqual(b, before);
});
test('wrong target/source cannot be counted as client discovery', () => {
  for (const change of [{target:'PROPERTY_DEVELOPERS'}, {source:'INDEX_AGENT_API'}]) {
    assert.throws(() => qualifyProspectBatch({...batch(), ...change}), /INVALID_PROSPECT_BATCH/);
  }
  const b = batch(); b.candidates[0].recordType = 'REFERRAL_ORGANISATION';
  assert.equal(qualifyProspectBatch(b).results[0].outcome, 'EXCLUDED');
});
test('unknown size/ownership is enrichment, explicit contrary evidence is exclusion', () => {
  const b = batch(); b.candidates[0].evidence.pop();
  assert.equal(qualifyProspectBatch(b).results[0].outcome, 'ENRICHMENT_REQUIRED');
  b.candidates[0].evidence[0].value = 'CONTRADICTED';
  assert.equal(qualifyProspectBatch(b).results[0].outcome, 'EXCLUDED');
});
test('links, unrelated domains, unreviewed and future evidence do not qualify', () => {
  for (const change of [{observation:''}, {reviewed:false}, {url:'https://directory.example/'}, {observedAt:'2099-01-01'}, {sourceType:'DIRECTORY'}]) {
    const b = batch(); Object.assign(b.candidates[0].evidence[0], change);
    assert.equal(qualifyProspectBatch(b).qualifiedForReview, 0);
  }
});
test('existing name aliases/domains and within-batch duplicates are held', () => {
  for (const existing of [{name:'SYNTHETIC AGENCY'}, {website:'https://www.agency.example/path'},
    {name:'Different legal name', website:'http://www.agency.example/path'},
    {name:'Different trading name', website:'agency.example'}, {aliases:['Synthetic Agency']}]) {
    const b = batch(); b.existingRecords = [existing];
    assert.equal(qualifyProspectBatch(b).results[0].outcome, 'DUPLICATE_HOLD');
  }
  const b = batch(); b.candidates.push(candidate());
  assert.equal(qualifyProspectBatch(b).results[1].outcome, 'DUPLICATE_HOLD');
});
test('conflicts and suppressions retain their holds', () => {
  const b = batch(); Object.assign(b.candidates[0], {identityConflict:true, suppressed:true, holds:['OWNER_HOLD']});
  const r = qualifyProspectBatch(b).results[0];
  assert.equal(r.outcome, 'IDENTITY_HOLD');
  assert.ok(r.operationalHolds.includes('SUPPRESSED')); assert.ok(r.operationalHolds.includes('OWNER_HOLD'));
});
test('empty and unqualified runs never report success', () => {
  const b = batch(); b.candidates = []; assert.equal(qualifyProspectBatch(b).outcome, 'NO_CANDIDATES');
  b.candidates = [{name:'Unknown'}]; assert.equal(qualifyProspectBatch(b).outcome, 'NO_QUALIFIED_CANDIDATES');
});
test('authenticated client route refuses the listing pipeline before any provider call', async () => {
  const previousFetch = globalThis.fetch, secret = process.env.CRON_SECRET;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error('UNEXPECTED_NETWORK'); };
  process.env.CRON_SECRET = 'synthetic-secret';
  const response = () => ({ status(n) { this.code=n; return this; }, setHeader() { return this; }, end(s) { this.body=JSON.parse(s); } });
  try {
    const res = response();
    await handler({method:'GET', headers:{authorization:'Bearer synthetic-secret'}, query:{purpose:'TSS_CLIENT_PROSPECTS'}}, res);
    assert.equal(res.code, 409); assert.equal(res.body.outcome, 'EXTERNAL_RESEARCH_REQUIRED');
    assert.equal(res.body.outreachReady, 0); assert.equal(calls, 0);
    const unauthenticated = response();
    await handler({method:'GET', headers:{}, query:{purpose:'TSS_CLIENT_PROSPECTS'}}, unauthenticated);
    assert.equal(unauthenticated.code, 401);
  } finally {
    globalThis.fetch = previousFetch;
    if (secret == null) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = secret;
  }
});
