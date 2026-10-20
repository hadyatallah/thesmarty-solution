import test from 'node:test';
import assert from 'node:assert/strict';
import { localResearchDay } from '../api/tss-irc-daily.js';
import { messageFor, eligibility } from '../lib/tssIrcEligibility.mjs';

test('research day follows Cyprus date across midnight and DST changes', () => {
  assert.equal(localResearchDay(new Date('2026-10-20T21:30:00Z')), '2026-10-21');
  assert.equal(localResearchDay(new Date('2026-10-25T21:30:00Z')), '2026-10-25');
  assert.equal(localResearchDay(new Date('2026-10-25T22:30:00Z')), '2026-10-26');
});
test('both approved templates end with the complete approved signature', () => {
  const signature='Kind regards,\n\nHady Atallah\nThe Smarty Solution LTD\nPhone: +357 99 810 330\ninfo@thesmartysolution.com\nwww.thesmartysolution.com\n\nConnect · Develop · Invest.';
  for (const messageTemplate of ['buyer-v1','partner-v1']) assert.ok(messageFor({messageTemplate}).body.endsWith(signature));
});
test('post-send no-approval and suppressed records remain ineligible', () => {
  assert.equal(eligibility({queueId:'IRC-MSG-001',status:'READY',sendApproved:'FALSE'},{}).reason,'NOT_APPROVED');
  assert.equal(eligibility({queueId:'IRC-MSG-001',status:'READY',sendApproved:'TRUE',recipientEmail:'hold@example.com'}, {suppressed:new Set(['hold@example.com'])}).reason,'SUPPRESSED');
});
