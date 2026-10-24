import test from 'node:test';
import assert from 'node:assert/strict';
import { researchNextAction, planCommercialHandoff } from '../lib/tssIrcHandoff.mjs';
const now = '2026-10-24T08:00:00Z';
const fresh = { verified: true, observedAt: now };
const fixture = () => ({
  now,
  candidate: { recordId: 'IRC-ORG-TEST', recipientEmail: 'team@example.test', researchQualified: true, commercialFitVerified: true },
  identity: { ...fresh, recipientEmail: 'team@example.test', aliasesChecked: true, ownerId: '789', companyIds: ['123'], contactIds: ['456'] },
  history: { ...fresh, complete: true, recipientEmail: 'team@example.test', mailbox: 'info@thesmartysolution.com', events: [], crmDuplicateSearchComplete: true, sourceIdentityResolved: true, taskSearchComplete: true, tasks: [] },
  suppressionCheck: { ...fresh, complete: true },
  contactBasis: { ...fresh, validated: true, evidenceUrl: 'https://example.test/invitation', jurisdiction: 'UK', recipientClass: 'Corporate' },
  message: { from: 'info@thesmartysolution.com', to: 'team@example.test', subject: 'Requested introduction', body: 'Synthetic approved introduction.' },
  approval: { authorized: true, id: 'APPROVAL-TEST', sourceMessageId: 'owner-message-test', recordId: 'IRC-ORG-TEST', from: 'info@thesmartysolution.com', to: 'team@example.test', subject: 'Requested introduction', body: 'Synthetic approved introduction.', approvedAt: now, expiresAt: '2026-10-24T09:00:00Z' },
  permissions: { sendOutlook: true, logEmail: true, createTask: true }
});
const withEvent = () => {
  const s = fixture();
  s.sourceEvent = { providerMessageId: 'provider/id', sourceUrl: 'https://outlook.office365.com/message/test', occurredAt: '2026-10-23T12:00:00Z', direction: 'EMAIL', fromEmail: 'info@thesmartysolution.com', toEmail: 'team@example.test', state: 'SUBMITTED', recipientEmail: 'team@example.test', subject: 'Test', body: 'Synthetic body' };
  s.history.events = [{ ...s.sourceEvent, verified: true, state: 'SUBMITTED' }];
  return s;
};
test('research acceptance produces an explicit next action, never sending or CRM authority', () => {
  const result = researchNextAction({ disposition: 'ACCEPTED_RESEARCH_CANDIDATE' }, 'IRC-ORG-X');
  assert.equal(result.action, 'VERIFY_COMMERCIAL_FIT');
  assert.equal(result.sendsAuthorized, false);
  assert.equal(result.crmWritesAuthorized, false);
  assert.deepEqual(result, researchNextAction({ disposition: 'ACCEPTED_RESEARCH_CANDIDATE' }, 'IRC-ORG-X'));
  assert.equal(researchNextAction({ disposition: 'REJECTED_NOT_DEVELOPER' }).action, 'KEEP_REJECTED');
});
test('empty or research-only input fails closed', () => {
  assert.equal(planCommercialHandoff().outcome, 'HELD');
  const s = fixture(); s.candidate.commercialFitVerified = false;
  assert.equal(planCommercialHandoff(s).reason, 'QUALIFICATION_REQUIRED');
});
test('one exact approved message produces only one stable Outlook action, with no mutation', () => {
  const s = fixture(), before = structuredClone(s);
  const result = planCommercialHandoff(s);
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0].action, 'SEND_OUTLOOK');
  assert.equal(result.steps[0].payload.consumeApprovalOnClaim, true);
  assert.deepEqual(s, before);
  assert.deepEqual(result, planCommercialHandoff(s));
});
test('missing, multiple, stale or alias-unchecked CRM identities never create records', () => {
  for (const change of [{ companyIds: [] }, { contactIds: ['456','789'] }, { observedAt: '2026-10-24T07:00:00Z' }, { aliasesChecked: false }, { conflict: true }]) {
    const s = fixture(); Object.assign(s.identity, change);
    assert.equal(planCommercialHandoff(s).reason, 'UNIQUE_EXISTING_CRM_IDENTITY_REQUIRED');
  }
});
test('incomplete and future-dated history fail closed', () => {
  for (const change of [{ complete: false }, { observedAt: '2026-10-24T09:00:00Z' }, { mailbox: 'wrong@example.test' }]) {
    const s = fixture(); Object.assign(s.history, change);
    assert.equal(planCommercialHandoff(s).reason, 'FRESH_COMPLETE_HISTORY_REQUIRED');
  }
});
test('uncertain submissions must reconcile, not retry', () => {
  for (const state of ['RESERVED','SENDING','UNKNOWN','NEEDS_RECONCILIATION']) {
    const s = fixture(); s.history.events.push({ state });
    assert.equal(planCommercialHandoff(s).reason, 'SEND_OUTCOME_UNCERTAIN');
  }
});
test('suppression, opt-out, holds and absent suppression checks stop sending', () => {
  for (const flag of ['suppressed','optedOut']) { const s = fixture(); s[flag] = true; assert.equal(planCommercialHandoff(s).reason, 'CONTACT_HELD'); }
  const s = fixture(); s.holds = [{ action: 'SEND_OUTLOOK', reason: 'Owner deferred' }];
  assert.equal(planCommercialHandoff(s).reason, 'CONTACT_HELD');
  s.holds = []; s.suppressionCheck.complete = false;
  assert.equal(planCommercialHandoff(s).reason, 'SUPPRESSION_CHECK_REQUIRED');
});
test('public address, READY or an approval flag alone is not contact authority', () => {
  const s = fixture(); s.contactBasis = { status: 'READY', publicEmail: true };
  assert.equal(planCommercialHandoff(s).reason, 'CONTACT_BASIS_REQUIRED');
});
test('one-off approval must be exact, unexpired, unconsumed and explicitly permitted', () => {
  for (const change of [{ consumed: true }, { body: 'Different' }, { to: 'other@example.test' }, { expiresAt: now }, { sourceMessageId: '' }]) {
    const s = fixture(); Object.assign(s.approval, change);
    assert.equal(planCommercialHandoff(s).reason, 'EXACT_APPROVAL_REQUIRED');
  }
  const s = fixture(); s.permissions.sendOutlook = false;
  assert.equal(planCommercialHandoff(s).reason, 'EXACT_APPROVAL_REQUIRED');
});
test('previous contact or used authorization cannot become a repeated first send', () => {
  for (const event of [{ recipientEmail: 'team@example.test', state: 'SUBMITTED' }, { approvalId: 'APPROVAL-TEST', state: 'SUBMITTED' }]) {
    const s = fixture(); s.history.events.push(event);
    assert.equal(planCommercialHandoff(s).reason, 'PRIOR_CONTACT_REVIEW');
  }
});
test('unapproved CC or attachment changes are rejected', () => {
  const s = fixture(); s.message.cc = ['other@example.test'];
  assert.equal(planCommercialHandoff(s).reason, 'MESSAGE_REVIEW_REQUIRED');
});
test('verified sent event routes to CRM logging, not send; provider ID retained in body', () => {
  const s = withEvent(), result = planCommercialHandoff(s), action = result.steps[0];
  assert.equal(action.action, 'LOG_EMAIL');
  assert.equal(action.payload.properties.hs_timestamp, s.sourceEvent.occurredAt);
  assert.match(action.payload.properties.hs_email_text, /Source provider message ID: provider\/id/);
  assert.equal('hs_email_message_id' in action.payload.properties, false);
  assert.match(action.payload.properties.hs_email_text, /not independently delivery-confirmed/);
});
test('owner logging deferral and unknown source evidence remain held', () => {
  const s = withEvent(); s.holds = [{ action: 'LOG_EMAIL', reason: 'Owner defer' }];
  assert.equal(planCommercialHandoff(s).reason, 'LOGGING_HELD');
  s.holds = []; s.history.events = [];
  assert.equal(planCommercialHandoff(s).reason, 'SOURCE_EVENT_UNVERIFIED');
});
test('existing correct log is a no-op; duplicate or wrong associations require review', () => {
  const s = withEvent(); Object.assign(s.history.events[0], { crmRecordId: '999', sourceEvidenceComplete: true, companyId: '123', contactId: '456' });
  assert.equal(planCommercialHandoff(s).outcome, 'ALREADY_RECORDED');
  s.history.events[0].contactId = '789';
  assert.equal(planCommercialHandoff(s).reason, 'ACTIVITY_ASSOCIATION_CONFLICT');
  s.history.events.push({ ...s.history.events[0], crmRecordId: '998' });
  assert.equal(planCommercialHandoff(s).reason, 'DUPLICATE_ACTIVITY_REVIEW');
});
test('next action requires explicit real due date and uses existing portal task fields', () => {
  const s = withEvent(); Object.assign(s.history.events[0], { crmRecordId: '999', sourceEvidenceComplete: true, companyId: '123', contactId: '456' });
  s.nextAction = { id: 'review-reply', subject: 'Review reply', body: 'Synthetic next step', dueAt: '2026-10-27T09:00:00Z', ownerId: '789' };
  assert.equal(planCommercialHandoff(s).reason, 'EXPLICIT_NEXT_ACTION_REQUIRED');
  s.nextAction.dueAtExplicit = true;
  const action = planCommercialHandoff(s).steps[0];
  assert.equal(action.action, 'CREATE_TASK');
  assert.equal(action.payload.properties.hs_timestamp, '2026-10-27T09:00:00Z');
  assert.equal(action.payload.properties.hs_task_status, 'NOT_STARTED');
  s.history.tasks.push({ idempotencyKey: action.idempotencyKey, crmRecordId: 'task-1' });
  assert.equal(planCommercialHandoff(s).outcome, 'ALREADY_RECORDED');
});

test('known partial activity saves enrich only source metadata, without duplicating correspondence', () => {
  const s = withEvent(); Object.assign(s.history.events[0], { crmRecordId: '999', companyId: '123', contactId: '456', crmRecordType: 'EMAIL', existingBody: 'Original complete body', sourceEvidenceComplete: false });
  assert.equal(planCommercialHandoff(s).reason, 'SOURCE_ENRICHMENT_HELD');
  s.permissions.enrichActivity = true;
  const action = planCommercialHandoff(s).steps[0];
  assert.equal(action.action, 'ENRICH_ACTIVITY_SOURCE');
  assert.equal(action.payload.recordId, '999');
  assert.equal(action.payload.expectedExistingBody, 'Original complete body');
  assert.ok(action.payload.properties.hs_email_text.startsWith('Original complete body\n\nSource provider'));
});
test('a legacy NOTE is valid correspondence evidence and is never duplicated as EMAIL', () => {
  const s = withEvent(); Object.assign(s.history.events[0], { crmRecordId: '999', companyId: '123', contactId: '456', crmRecordType: 'NOTE', sourceEvidenceComplete: true });
  assert.equal(planCommercialHandoff(s).outcome, 'ALREADY_RECORDED');
});

test('authorization without an explicit expiry does not invent a new expiry', () => {
  const s = fixture(); delete s.approval.expiresAt;
  assert.equal(planCommercialHandoff(s).steps[0].action, 'SEND_OUTLOOK');
});
test('explicit exact-thread reply approval works, while initial approval cannot be reused', () => {
  const s = fixture(); s.history.events.push({ providerMessageId: 'inbound-1', recipientEmail: 'team@example.test', state: 'RECEIVED', verified: true });
  s.message.replyToProviderMessageId = 'inbound-1';
  assert.equal(planCommercialHandoff(s).reason, 'PRIOR_CONTACT_REVIEW');
  s.approval.scope = 'REPLY'; s.approval.replyToProviderMessageId = 'inbound-1';
  const action = planCommercialHandoff(s).steps[0];
  assert.equal(action.action, 'SEND_OUTLOOK');
  assert.equal(action.payload.message.replyToProviderMessageId, 'inbound-1');
});
test('unresolved moved-message aliases block duplicate activity creation', () => {
  const s = withEvent(); s.history.ambiguousSourceAlias = true;
  assert.equal(planCommercialHandoff(s).reason, 'SOURCE_IDENTITY_AMBIGUOUS');
});
test('an undated next action is held because the portal requires a real authorized due date', () => {
  const s = withEvent(); Object.assign(s.history.events[0], { crmRecordId: '999', sourceEvidenceComplete: true, companyId: '123', contactId: '456' });
  s.nextAction = { id: 'review-reply', subject: 'Review reply', body: 'Synthetic next step', ownerId: '789' };
  const result = planCommercialHandoff(s);
  assert.equal(result.reason, 'TASK_DUE_DATE_REQUIRED');
  assert.equal(result.outcome, 'HELD');
  assert.deepEqual(result.steps, []);
});

test('verified existing task updates preserve body and owner, and cannot infer completion', () => {
  const s = withEvent(); Object.assign(s.history.events[0], { crmRecordId: '999', sourceEvidenceComplete: true, companyId: '123', contactId: '456' });
  s.nextAction = { id: 'await-materials', subject: 'Await requested materials', body: 'Await reply without inventing a deadline.', ownerId: '789', targetTaskId: 'task-1', revisionId: 'owner-revision-1', status: 'WAITING' };
  s.history.tasks = [{ crmRecordId: 'task-1', verified: true, companyId: '123', contactId: '456', ownerId: '789', existingBody: 'Prior task history' }];
  assert.equal(planCommercialHandoff(s).reason, 'TASK_HELD');
  s.permissions.updateTask = true;
  const action = planCommercialHandoff(s).steps[0];
  assert.equal(action.action, 'UPDATE_TASK');
  assert.equal(action.payload.properties.hs_task_status, 'WAITING');
  assert.ok(action.payload.properties.hs_task_body.startsWith('Prior task history'));
  assert.equal('hubspot_owner_id' in action.payload.properties, false);
  s.nextAction.status = 'COMPLETED';
  assert.equal(planCommercialHandoff(s).reason, 'TASK_STATE_REVIEW');
});

test('drafts cannot masquerade as submitted correspondence and future events are held', () => {
  const s = withEvent(); s.history.events[0].state = 'DRAFT'; s.sourceEvent.state = 'DRAFT';
  assert.equal(planCommercialHandoff(s).reason, 'SOURCE_STATE_UNVERIFIED');
  s.history.events[0].state = 'SUBMITTED'; s.sourceEvent.state = 'SUBMITTED'; s.sourceEvent.occurredAt = '2026-10-25T08:00:00Z'; s.history.events[0].occurredAt = s.sourceEvent.occurredAt;
  assert.equal(planCommercialHandoff(s).reason, 'SOURCE_STATE_UNVERIFIED');
});
test('verified task update replay is a no-op rather than duplicate appended chronology', () => {
  const s = withEvent(); Object.assign(s.history.events[0], { crmRecordId: '999', sourceEvidenceComplete: true, companyId: '123', contactId: '456' });
  s.nextAction = { id: 'await-materials', subject: 'Await requested materials', body: 'Await reply.', ownerId: '789', targetTaskId: 'task-1', revisionId: 'owner-revision-1', status: 'WAITING' };
  s.history.tasks = [{ crmRecordId: 'task-1', verified: true, companyId: '123', contactId: '456', ownerId: '789', existingBody: 'Prior task history' }];
  s.permissions.updateTask = true;
  const action = planCommercialHandoff(s).steps[0];
  s.history.tasks[0].lastAppliedActionKey = action.idempotencyKey;
  assert.equal(planCommercialHandoff(s).outcome, 'ALREADY_RECORDED');
});

test('same provider ID cannot validate conflicting source direction, parties, timestamp or content', () => {
  const changes = { direction: 'INCOMING_EMAIL', fromEmail: 'attacker@example.test', toEmail: 'other@example.test', recipientEmail: 'other@example.test', occurredAt: '2026-10-23T13:00:00Z', subject: 'Different subject', body: 'Different body', sourceUrl: 'https://outlook.office365.com/message/other', state: 'FAILED' };
  for (const [field, value] of Object.entries(changes)) {
    const s = withEvent(); s.sourceEvent[field] = value;
    assert.equal(planCommercialHandoff(s).outcome, 'HELD', field);
    assert.deepEqual(planCommercialHandoff(s).steps, [], field);
  }
});
test('source parties must match direction even if contradictory fields appear identically in both snapshots', () => {
  const s = withEvent(); s.sourceEvent.fromEmail = 'other@example.test'; s.history.events[0].fromEmail = 'other@example.test';
  assert.equal(planCommercialHandoff(s).reason, 'SOURCE_CONTENT_CONFLICT');
});
test('existing task identity and owner must match the resolved relationship', () => {
  for (const change of [{ companyId: '999' }, { contactId: '999' }, { ownerId: '999' }, { ownerId: undefined }]) {
    const s = withEvent(); Object.assign(s.history.events[0], { crmRecordId: '999', sourceEvidenceComplete: true, companyId: '123', contactId: '456' });
    s.nextAction = { id: 'await-materials', subject: 'Await requested materials', body: 'Await reply.', ownerId: '789', targetTaskId: 'task-1', revisionId: 'owner-revision-1', status: 'WAITING' };
    s.history.tasks = [{ crmRecordId: 'task-1', verified: true, companyId: '123', contactId: '456', ownerId: '789', existingBody: 'Prior task history', ...change }];
    s.permissions.updateTask = true;
    assert.equal(planCommercialHandoff(s).reason, 'TASK_IDENTITY_CONFLICT');
  }
});
test('new tasks do not default to a blanket owner when relationship owner is unknown', () => {
  const s = withEvent(); Object.assign(s.history.events[0], { crmRecordId: '999', sourceEvidenceComplete: true, companyId: '123', contactId: '456' });
  delete s.identity.ownerId;
  s.nextAction = { id: 'review', subject: 'Review', body: 'Review reply', ownerId: '789' };
  assert.equal(planCommercialHandoff(s).reason, 'EXPLICIT_NEXT_ACTION_REQUIRED');
});

test('task update revision keys distinguish authorized body/date changes from exact retries', () => {
  const s = withEvent(); Object.assign(s.history.events[0], { crmRecordId: '999', sourceEvidenceComplete: true, companyId: '123', contactId: '456' });
  s.nextAction = { id: 'await-materials', subject: 'Await requested materials', body: 'Await reply.', ownerId: '789', targetTaskId: 'task-1', status: 'WAITING' };
  s.history.tasks = [{ crmRecordId: 'task-1', verified: true, companyId: '123', contactId: '456', ownerId: '789', existingBody: 'Prior task history' }];
  s.permissions.updateTask = true;
  assert.equal(planCommercialHandoff(s).reason, 'TASK_REVISION_REQUIRED');
  s.nextAction.revisionId = 'owner-revision-1';
  const first = planCommercialHandoff(s).steps[0];
  assert.equal(planCommercialHandoff(s).steps[0].idempotencyKey, first.idempotencyKey);
  s.history.tasks[0].lastAppliedActionKey = first.idempotencyKey;
  assert.equal(planCommercialHandoff(s).outcome, 'ALREADY_RECORDED');
  s.nextAction.revisionId = 'owner-revision-2';
  s.nextAction.body = 'Await revised materials agreed in the new owner instruction.';
  s.nextAction.dueAt = '2026-10-28T09:00:00Z'; s.nextAction.dueAtExplicit = true;
  const revised = planCommercialHandoff(s).steps[0];
  assert.equal(revised.action, 'UPDATE_TASK');
  assert.notEqual(revised.idempotencyKey, first.idempotencyKey);
  assert.equal(revised.payload.properties.hs_timestamp, s.nextAction.dueAt);
});
