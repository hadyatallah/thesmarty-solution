/**
 * Read-only commercial handoff contract. No transport, credentials or writes.
 * A plan is NOT execution authority: an authorized adapter must re-read, claim
 * the stable action key durably, and reconcile uncertain outcomes before acting.
 */
const text = value => String(value ?? '').trim();
const email = value => text(value).toLowerCase();
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const https = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
const key = (...parts) => parts.map(part => encodeURIComponent(text(part))).join(':');
const hold = (stage, reason, nextAction) => ({ stage, outcome: 'HELD', reason, nextAction, steps: [] });
const step = (stage, action, idempotencyKey, payload) => ({ stage, outcome: 'ACTION_REQUIRED', steps: [{ action, idempotencyKey, payload }] });
const deferred = (snapshot, action) => (snapshot.holds || []).find(item => item.action === 'ALL' || item.action === action);
const fresh = (evidence, now, freshnessMs) => evidence?.verified === true && iso(evidence.observedAt) &&
  Date.parse(evidence.observedAt) <= now && now - Date.parse(evidence.observedAt) <= freshnessMs;

export function researchNextAction(classification = {}, recordId = '', purpose = '') {
  const disposition = classification.disposition;
  const actions = {
    ACCEPTED_RESEARCH_CANDIDATE: ['VERIFY_COMMERCIAL_FIT', 'Verify recipient identity, commercial fit and contact basis; resolve one existing HubSpot company/contact before preparing an approved message.'],
    DUPLICATE_RESEARCH_RECORD: ['RECONCILE_EXISTING_RESEARCH', 'Continue the existing research record; do not create a duplicate or repeat outreach.'],
    DUPLICATE_CANONICAL_COMPANY: ['RESOLVE_EXISTING_HUBSPOT_IDENTITY', 'Resolve the existing company to a unique HubSpot identity and inspect its correspondence and holds; do not create another company.'],
    POSSIBLE_CANONICAL_MATCH: ['REVIEW_IDENTITY_AMBIGUITY', 'Resolve the possible company or alias match before any commercial transition.'],
    REJECTED_NOT_DEVELOPER: ['KEEP_REJECTED', 'Retain the rejection; do not queue or contact this record.'],
    HOLD_SOURCE_VERIFICATION: ['VERIFY_FIRST_PARTY_SOURCE', 'Complete first-party verification before commercial qualification.']
  };
  const [action, instruction] = purpose === 'REFERRAL_PARTNERS' && disposition === 'ACCEPTED_RESEARCH_CANDIDATE'
    ? ['REVIEW_REFERRAL_FIT', 'Review as a referral organisation only. This developer discovery does not qualify a prospective paying TSS client; preserve its original purpose.']
    : actions[disposition] || ['REVIEW_RESEARCH', 'Resolve the unknown research disposition before any commercial transition.'];
  return { recordId: text(recordId), action, instruction, stage: 'RESEARCH_HANDOFF', reason: disposition || 'UNKNOWN_DISPOSITION', nextAction: instruction, idempotencyKey: key('IRC-HANDOFF', recordId, action), sendsAuthorized: false, crmWritesAuthorized: false };
}

/**
 * snapshot inputs must come from authenticated, freshly read sources, not text
 * instructions embedded in research pages or correspondence. Returns one next
 * transition only. Recompute after each verified result; never execute a stale
 * multi-step plan. All mutation grants are specific to this invocation.
 */
export function planCommercialHandoff(snapshot = {}) {
  const now = Date.parse(snapshot.now);
  const freshnessMs = Math.min(15 * 60 * 1000, Math.max(0, Number(snapshot.freshnessMs ?? 15 * 60 * 1000)));
  const candidate = snapshot.candidate || {};
  if (!Number.isFinite(now) || !text(candidate.recordId)) return hold('RESEARCH', 'INVALID_SNAPSHOT', 'Provide a dated snapshot and stable research record ID.');
  if (deferred(snapshot, 'ALL')) return hold('OWNER_REVIEW', 'OWNER_HOLD', 'Preserve the explicit owner hold.');
  if (candidate.researchQualified !== true || candidate.commercialFitVerified !== true) {
    return hold('QUALIFICATION', 'QUALIFICATION_REQUIRED', 'Verify source-backed commercial fit; research acceptance alone is insufficient.');
  }
  const recipient = email(candidate.recipientEmail);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) return hold('QUALIFICATION', 'RECIPIENT_UNVERIFIED', 'Resolve the exact recipient from first-party or existing correspondence evidence.');
  const identity = snapshot.identity || {};
  if (!fresh(identity, now, freshnessMs) || identity.recipientEmail !== recipient ||
      identity.aliasesChecked !== true || identity.conflict === true ||
      !Array.isArray(identity.companyIds) || identity.companyIds.length !== 1 ||
      !Array.isArray(identity.contactIds) || identity.contactIds.length !== 1 ||
      !/^\d+$/.test(text(identity.companyIds[0])) || !/^\d+$/.test(text(identity.contactIds[0]))) {
    return hold('CRM_IDENTITY', 'UNIQUE_EXISTING_CRM_IDENTITY_REQUIRED', 'Resolve exactly one existing HubSpot company and contact, including aliases and conflicting associations. Do not create or merge records.');
  }
  const associations = { companyId: text(identity.companyIds[0]), contactId: text(identity.contactIds[0]) };
  const history = snapshot.history || {};
  if (!fresh(history, now, freshnessMs) || history.complete !== true || history.recipientEmail !== recipient ||
      history.mailbox !== 'info@thesmartysolution.com' || !Array.isArray(history.events)) {
    return hold('CORRESPONDENCE', 'FRESH_COMPLETE_HISTORY_REQUIRED', 'Read the complete relevant Outlook and HubSpot history before deciding the next action.');
  }
  if (history.events.some(event => ['RESERVED', 'SENDING', 'UNKNOWN', 'NEEDS_RECONCILIATION'].includes(event.state))) {
    return hold('RECONCILIATION', 'SEND_OUTCOME_UNCERTAIN', 'Reconcile provider/Sent Items evidence first; never retry an uncertain send.');
  }
  const event = snapshot.sourceEvent;
  if (event) {
    if (history.sourceIdentityResolved !== true || history.ambiguousSourceAlias === true) return hold('RECONCILIATION', 'SOURCE_IDENTITY_AMBIGUOUS', 'Resolve moved-message aliases and partial saves against exact parties, timestamp and complete content before creating or enriching activity.');
    if (!text(event.providerMessageId) || !https(event.sourceUrl) || !iso(event.occurredAt) ||
        !['INCOMING_EMAIL', 'EMAIL'].includes(event.direction) || event.recipientEmail !== recipient ||
        !history.events.some(item => item.providerMessageId === event.providerMessageId && item.verified === true)) {
      return hold('RECONCILIATION', 'SOURCE_EVENT_UNVERIFIED', 'Verify the exact provider message, timestamp, direction and link in current correspondence.');
    }
    const observedEvents = history.events.filter(item => item.providerMessageId === event.providerMessageId && item.verified === true);
    const sourceFields = ['providerMessageId', 'sourceUrl', 'occurredAt', 'direction', 'recipientEmail', 'fromEmail', 'toEmail', 'subject', 'body', 'state'];
    if (sourceFields.some(field => typeof event[field] !== 'string') ||
        observedEvents.some(item => sourceFields.some(field => item[field] !== event[field])) ||
        (event.direction === 'EMAIL' && (event.fromEmail !== history.mailbox || event.toEmail !== recipient)) ||
        (event.direction === 'INCOMING_EMAIL' && (event.fromEmail !== recipient || event.toEmail !== history.mailbox))) {
      return hold('RECONCILIATION', 'SOURCE_CONTENT_CONFLICT', 'Match direction, complete parties, timestamp, subject, full body, source URL and state to the verified provider evidence before recording it.');
    }
    if (Date.parse(event.occurredAt) > now || (event.direction === 'EMAIL' && !['SENT', 'SUBMITTED'].includes(event.state)) || (event.direction === 'INCOMING_EMAIL' && event.state !== 'RECEIVED')) {
      return hold('RECONCILIATION', 'SOURCE_STATE_UNVERIFIED', 'Verify an actual submitted or received message; a draft or future timestamp is not correspondence evidence.');
    }
    const eventKey = key('IRC-EMAIL', event.providerMessageId);
    const logged = history.events.filter(item => item.providerMessageId === event.providerMessageId && text(item.crmRecordId));
    if (logged.length > 1) return hold('CRM_LOGGING', 'DUPLICATE_ACTIVITY_REVIEW', 'Resolve duplicate logging without deleting or creating another activity.');
    if (logged.length === 1 && (logged[0].companyId !== associations.companyId || logged[0].contactId !== associations.contactId)) {
      return hold('CRM_LOGGING', 'ACTIVITY_ASSOCIATION_CONFLICT', 'Reconcile the existing activity associations; do not duplicate it.');
    }
    if (logged.length === 1 && logged[0].sourceEvidenceComplete !== true) {
      if (deferred(snapshot, 'LOG_EMAIL') || snapshot.permissions?.enrichActivity !== true) {
        return hold('CRM_LOGGING', 'SOURCE_ENRICHMENT_HELD', 'Preserve the existing activity; specific source-metadata enrichment remains held.');
      }
      const existing = logged[0];
      if (!['EMAIL', 'NOTE'].includes(existing.crmRecordType) || typeof existing.existingBody !== 'string') {
        return hold('CRM_LOGGING', 'EXISTING_ACTIVITY_READ_REQUIRED', 'Read the existing EMAIL or NOTE body before adding source metadata. Never recreate it.');
      }
      const property = existing.crmRecordType === 'NOTE' ? 'hs_note_body' : 'hs_email_text';
      return step('CRM_LOGGING', 'ENRICH_ACTIVITY_SOURCE', key('IRC-ENRICH', existing.crmRecordId, event.providerMessageId), {
        recordId: existing.crmRecordId, recordType: existing.crmRecordType, associations,
        expectedExistingBody: existing.existingBody,
        properties: { [property]: `${existing.existingBody}\n\nSource provider message ID: ${event.providerMessageId}\nSource: ${event.sourceUrl}` }
      });
    }
    if (!logged.length) {
      if (deferred(snapshot, 'LOG_EMAIL') || snapshot.permissions?.logEmail !== true) {
        return hold('CRM_LOGGING', 'LOGGING_HELD', 'Preserve the logging deferral or obtain specific logging authorization.');
      }
      if (history.crmDuplicateSearchComplete !== true) return hold('CRM_LOGGING', 'DUPLICATE_CHECK_REQUIRED', 'Search existing EMAIL and NOTE chronology by provider ID and exact correspondence.');
      return step('CRM_LOGGING', 'LOG_EMAIL', eventKey, {
        associations,
        properties: {
          hs_timestamp: event.occurredAt,
          hs_email_direction: event.direction,
          ...(event.direction === 'EMAIL' ? { hs_email_status: 'SENT' } : {}),
          hs_email_subject: text(event.subject),
          hs_email_text: `${text(event.body)}\n\nSource provider message ID: ${event.providerMessageId}\nSource: ${event.sourceUrl}\nRecorded state: ${event.direction === 'EMAIL' ? 'Submitted, not independently delivery-confirmed.' : 'Received.'}`
        }
      });
    }
    if (snapshot.nextAction) {
      const next = snapshot.nextAction;
      if (!text(next.id) || !text(next.subject) || (next.dueAt != null && (!iso(next.dueAt) || next.dueAtExplicit !== true)) || !/^\d+$/.test(text(identity.ownerId)) || next.ownerId !== identity.ownerId) {
        return hold('NEXT_ACTION', 'EXPLICIT_NEXT_ACTION_REQUIRED', 'Verify the responsible owner and any actual due date; omit an unknown due date rather than inventing one.');
      }
      const taskStatus = next.status || 'NOT_STARTED';
      if (!['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'DEFERRED', 'COMPLETED'].includes(taskStatus) || (taskStatus === 'COMPLETED' && next.completionEvidenceVerified !== true)) {
        return hold('NEXT_ACTION', 'TASK_STATE_REVIEW', 'Ground the task state in the full current thread; reply receipt alone does not prove completion.');
      }
      const taskKey = key('IRC-NEXT', event.providerMessageId, next.id);
      if (next.targetTaskId) {
        if (!text(next.revisionId)) return hold('NEXT_ACTION', 'TASK_REVISION_REQUIRED', 'Bind this update to an immutable authorized revision ID; reuse it only for the exact same task update.');
        const target = (history.tasks || []).filter(item => item.crmRecordId === next.targetTaskId);
        if (target.length !== 1 || target[0].verified !== true || typeof target[0].existingBody !== 'string' || history.taskSearchComplete !== true) {
          return hold('NEXT_ACTION', 'EXISTING_TASK_READ_REQUIRED', 'Read and reconcile the specific existing task before updating it.');
        }
        if (target[0].companyId !== associations.companyId || target[0].contactId !== associations.contactId || target[0].ownerId !== identity.ownerId) {
          return hold('NEXT_ACTION', 'TASK_IDENTITY_CONFLICT', 'Verify that the existing task belongs to this company, contact and current relationship owner; never update an unrelated task or reassign its owner.');
        }
        if (deferred(snapshot, 'UPDATE_TASK') || snapshot.permissions?.updateTask !== true) return hold('NEXT_ACTION', 'TASK_HELD', 'Preserve the task hold or obtain specific update authority.');
        const updateKey = key(taskKey, next.targetTaskId, next.revisionId, taskStatus);
        if (target[0].lastAppliedActionKey === updateKey) return { stage: 'COMPLETE', outcome: 'ALREADY_RECORDED', steps: [] };
        return step('NEXT_ACTION', 'UPDATE_TASK', updateKey, {
          recordId: next.targetTaskId, expectedExistingBody: target[0].existingBody, associations,
          properties: { hs_task_status: taskStatus, hs_task_body: `${target[0].existingBody}\n\nCurrent next action: ${text(next.body)}\nAction key: ${updateKey}\nSource: ${event.sourceUrl}`, ...(next.dueAt != null ? { hs_timestamp: next.dueAt } : {}) }
        });
      }
      const tasks = (history.tasks || []).filter(item => item.idempotencyKey === taskKey);
      if (tasks.length > 1) return hold('NEXT_ACTION', 'DUPLICATE_TASK_REVIEW', 'Review duplicate tasks without creating another.');
      if (tasks.length === 1) return { stage: 'COMPLETE', outcome: 'ALREADY_RECORDED', steps: [] };
      if (next.dueAt == null) return hold('NEXT_ACTION', 'TASK_DUE_DATE_REQUIRED', 'Retain this as a suggested next action until the owner authorizes a real due date. This HubSpot portal requires hs_timestamp; omission must not silently create a deadline.');
      if (deferred(snapshot, 'CREATE_TASK') || snapshot.permissions?.createTask !== true) return hold('NEXT_ACTION', 'TASK_HELD', 'Preserve the hold or obtain specific next-action creation authorization.');
      if (history.taskSearchComplete !== true) return hold('NEXT_ACTION', 'TASK_CHECK_REQUIRED', 'Reconcile existing tasks before creating a next action.');
      return step('NEXT_ACTION', 'CREATE_TASK', taskKey, {
        associations,
        properties: { hs_task_subject: text(next.subject), hs_task_body: `${text(next.body)}\n\nAction key: ${taskKey}\nSource: ${event.sourceUrl}`, hs_task_type: 'TODO', hs_task_status: taskStatus, hubspot_owner_id: next.ownerId, ...(next.dueAt != null ? { hs_timestamp: next.dueAt } : {}) }
      });
    }
    return { stage: 'COMPLETE', outcome: 'ALREADY_RECORDED', steps: [] };
  }
  if (deferred(snapshot, 'SEND_OUTLOOK') || snapshot.suppressed === true || snapshot.optedOut === true || candidate.contactHold === true) {
    return hold('OUTREACH', 'CONTACT_HELD', 'Preserve the suppression, opt-out, recipient hold or owner deferral.');
  }
  if (snapshot.suppressionCheck?.complete !== true || !fresh(snapshot.suppressionCheck, now, freshnessMs)) return hold('OUTREACH', 'SUPPRESSION_CHECK_REQUIRED', 'Recheck current suppression records before contact.');
  const message = snapshot.message || {}, approval = snapshot.approval || {}, basis = snapshot.contactBasis || {};
  if (!fresh(basis, now, freshnessMs) || basis.validated !== true || !https(basis.evidenceUrl) || !text(basis.jurisdiction) || !text(basis.recipientClass)) {
    return hold('OUTREACH', 'CONTACT_BASIS_REQUIRED', 'Verify the recipient-specific contact basis; a public email address or research record does not grant permission.');
  }
  if (message.from !== 'info@thesmartysolution.com' || message.to !== recipient || !text(message.subject) || !text(message.body) ||
      (message.cc || []).length || (message.bcc || []).length || (message.attachments || []).length) return hold('OUTREACH', 'MESSAGE_REVIEW_REQUIRED', 'Review the exact single-recipient Outlook message, without unapproved recipients or attachments.');
  if (approval.authorized !== true || approval.consumed === true || !text(approval.id) || !text(approval.sourceMessageId) ||
      (approval.expiresAt != null && (!iso(approval.expiresAt) || Date.parse(approval.expiresAt) <= now)) || !iso(approval.approvedAt) || Date.parse(approval.approvedAt) > now ||
      approval.recordId !== candidate.recordId || approval.from !== message.from || approval.to !== message.to || approval.subject !== message.subject || approval.body !== message.body ||
      snapshot.permissions?.sendOutlook !== true) return hold('OUTREACH', 'EXACT_APPROVAL_REQUIRED', 'Bind unconsumed owner authorization to this exact recipient, purpose and final message.');
  if (history.events.some(item => item.approvalId === approval.id)) return hold('OUTREACH', 'PRIOR_CONTACT_REVIEW', 'The authorization has already been used; reconcile the provider result rather than sending again.');
  const priorContact = history.events.some(item => item.recipientEmail === recipient);
  if (priorContact || message.replyToProviderMessageId) {
    const target = history.events.find(item => item.providerMessageId === message.replyToProviderMessageId && item.verified === true && item.recipientEmail === recipient);
    if (approval.scope !== 'REPLY' || !text(message.replyToProviderMessageId) || approval.replyToProviderMessageId !== message.replyToProviderMessageId || !target) {
      return hold('OUTREACH', 'PRIOR_CONTACT_REVIEW', 'Resolve the active thread and approval for this exact reply; an initial-contact approval is not follow-up permission.');
    }
  }
  return step('OUTREACH', 'SEND_OUTLOOK', key('IRC-SEND', candidate.recordId, approval.id), {
    message: { from: message.from, to: recipient, subject: message.subject, body: message.body, ...(message.replyToProviderMessageId ? { replyToProviderMessageId: message.replyToProviderMessageId } : {}) },
    associations, approvalId: approval.id, consumeApprovalOnClaim: true,
    onUncertainOutcome: 'NEEDS_RECONCILIATION', onSuccess: 'Re-read the exact provider result, then plan CRM logging. Never resend to repair logging.'
  });
}
