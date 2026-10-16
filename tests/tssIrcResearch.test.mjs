
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoveryUrl,
  discoverDeveloperSignals,
  extractFirstPartyUrl,
  verifyFirstPartySource,
  matchMasterCompany,
  classifyCandidate,
  candidateSummary,
  normalizeDomain
} from '../lib/tssIrcResearch.mjs';

const response = (status, body, contentType='text/html') => ({
  ok: status >= 200 && status < 300,
  status,
  url: 'https://example.test/',
  headers: { get: key => key.toLowerCase() === 'content-type' ? contentType : '' },
  json: async () => body,
  text: async () => typeof body === 'string' ? body : JSON.stringify(body)
});

test('discovery uses the documented INDEX AI Agent API and required bounded filters', () => {
  const url = discoveryUrl('larnaca', 10);
  assert.match(url, /^https:\/\/agent\\.index\\.cy\/v1\/listings\\?/);
  assert.match(url, /seller_type=developer/);
  assert.match(url, /district=larnaca/);
  assert.match(url, /listed_within_days=30/);
  assert.match(url, /limit=10/);
});

test('discovery falls back only to the documented API alias on 404', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url.includes('/v1/')) return response(404, {});
    return response(200, {
      total: 2,
      results: [
        { id: 1, url: 'https://index.cy/sale/1', seller: { name: 'Example Developer', type: 'developer', url: 'https://index.cy/member/example' }, district: 'larnaca' },
        { id: 2, url: 'https://index.cy/sale/2', seller: { name: 'Second Developer', type: 'developer', url: 'https://index.cy/member/second' }, district: 'larnaca' }
      ]
    }, 'application/json');
  };
  const result = await discoverDeveloperSignals(fetchFn, 'larnaca', 10);
  assert.equal(result.total, 2);
  assert.equal(result.candidates.length, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes('/api/listings?'));
});

test('first-party verification requires an external site and developer/Cyprus evidence', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url.includes('/member/')) {
      return response(200, '<html><a href="https://example-developer.cy/">Website</a></html>');
    }
    return response(200, '<html><title>Example Developer Cyprus</title><body>Property developer and residential developments in Cyprus.</body></html>');
  };
  const result = await verifyFirstPartySource(fetchFn, 'https://index.cy/member/example');
  assert.equal(result.verified, true);
  assert.equal(result.reason, 'FIRST_PARTY_DEVELOPER_VERIFIED');
  assert.equal(normalizeDomain(result.firstPartyURL), 'example-developer.cy');
  assert.equal(calls.length, 2);
});

test('master matching distinguishes exact canonical matches from unresolved possible matches', () => {
  const master = [
    ['id','name','category','district','email','phone','website'],
    ['TSS-CY-100','Example Developer Ltd','Developer','Larnaca','','','https://example-developer.cy/'],
    ['TSS-CY-101','Example Developments','Developer','Paphos','','','https://other.cy/']
  ];
  const exact = matchMasterCompany({ sellerName:'Example Developer Ltd', siteName:'Example Developer', firstPartyURL:'https://example-developer.cy/' }, master);
  assert.equal(exact.kind, 'EXACT');
  assert.equal(exact.companyId, 'TSS-CY-100');

  const possible = matchMasterCompany({ sellerName:'Example Developments Limited', siteName:'Example Developments Limited', firstPartyURL:'https://new.cy/' }, master);
  assert.equal(possible.kind, 'POSSIBLE');
  assert.equal(possible.companyId, 'TSS-CY-101');
});

test('classification blocks duplicate research records and canonical duplicates before acceptance', () => {
  const master = [
    ['id','name','category','district','email','phone','website'],
    ['TSS-CY-100','Existing Developer Ltd','Developer','Larnaca','','','https://existing.cy/']
  ];
  const research = [
    ['referralId','organisationName','legalName','country','website','publicEmail','organisationType','canonicalCompanyId','sourceURL','sourceObservedAt','verification'],
    ['IRC-ORG-0099','Existing Research Org','','Cyprus','https://existing-research.cy/','','PROPERTY DEVELOPER','','','', '']
  ];
  const firstParty = { verified:true, reason:'FIRST_PARTY_DEVELOPER_VERIFIED' };

  const duplicateResearch = classifyCandidate({sellerName:'Existing Research Org', siteName:'', firstPartyURL:'https://existing-research.cy/'}, firstParty, master, research);
  assert.equal(duplicateResearch.disposition, 'DUPLICATE_RESEARCH_RECORD');
  assert.equal(candidateSummary(duplicateResearch), 'HELD');

  const duplicateMaster = classifyCandidate({sellerName:'Existing Developer Ltd', siteName:'', firstPartyURL:'https://existing.cy/'}, firstParty, master, research);
  assert.equal(duplicateMaster.disposition, 'DUPLICATE_CANONICAL_COMPANY');
  assert.equal(candidateSummary(duplicateMaster), 'HELD');

  const accepted = classifyCandidate({sellerName:'New Developer', siteName:'New Developer', firstPartyURL:'https://new.cy/'}, firstParty, master, research);
  assert.equal(accepted.disposition, 'ACCEPTED_RESEARCH_CANDIDATE');
  assert.equal(candidateSummary(accepted), 'ACCEPTED');
});
