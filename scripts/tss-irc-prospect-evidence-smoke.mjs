// Dated public-source observations for an offline smoke test, NOT discovery seeds.
// No private CRM/Outlook records, contact addresses or restricted identity IDs.
import { qualifyProspectBatch, PROSPECT_SOURCE, PROSPECT_TARGET } from '../lib/tssIrcProspects.mjs';
const observedAt = '2026-10-28T14:45:00Z';
function sample(name, website, path, observations, extra = {}) {
  return { name, website, ...extra, evidence: Object.entries(observations).map(([claim, observation]) => ({
    claim, observation, value: 'SUPPORTED', sourceType: 'FIRST_PARTY', reviewed: true,
    url: new URL(path, website).href, observedAt
  })) };
}
const result = qualifyProspectBatch({ observedAt, source: PROSPECT_SOURCE, target: PROSPECT_TARGET,
  existingRecords: [], screeningComplete: false,
  candidates: [
    sample('Tandy Realty', 'https://tandyrealty.com.cy/', 'about-us/', {
      realEstateAgency: 'The page identifies Tandy Realty as the licensed agency trade name of Tandy Christoforou Realty Ltd.',
      cyprusOperations: 'The company gives a Nicosia, Cyprus business address.',
      smallOrSolo: 'The business describes itself as boutique; this is a qualitative segment signal, not verified headcount.',
      ownerLed: 'The company describes a family-run operation; individual ownership and legal mapping still require review.'
    }, { holds: ['PUBLIC_IDENTITY_REVIEW_REQUIRED'] }),
    sample('T. Sarikas Property Professionals Ltd', 'https://sarikasproperties.com/', 'about-us/', {
      realEstateAgency: 'The page describes sales, rentals and a real estate agency.',
      cyprusOperations: 'The company states Cyprus operations and a Paphos address.',
      ownerLed: 'The page describes a family-run business involving the founder, daughter and granddaughter.'
      // Historical small-venture language does not establish present scale.
    }),
    sample('KAZO Real Estate', 'https://kazo.com.cy/', 'our-team', {
      realEstateAgency: 'The page offers real estate buying, selling and rental services.',
      cyprusOperations: 'The team serves Limassol and gives a Cyprus business address.',
      ownerLed: 'The team page identifies Vyron Christoforou as CEO and founder.'
      // Six profiles are observed, not asserted to be complete company headcount.
    })
  ] });
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
