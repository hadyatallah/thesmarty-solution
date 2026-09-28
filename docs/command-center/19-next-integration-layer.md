# TSS Command Center — next integration layer

Date: 23 September 2026

This document defines the next provider integrations without changing the released Command Center architecture. It is a staged implementation plan, not evidence that the integrations are live.

## 1. Microsoft 365 direct dispatch

### Objective

Allow an exact-approved Command Center email to be sent from `info@thesmartysolution.com` without moving the user to a separate ChatGPT/Work sending route.

### Required architecture

Manager / Growth Agent  
-> Action & Approval Gateway  
-> EmailDispatchAdapter  
-> Microsoft Graph  
-> Provider receipt reconciliation  
-> CRM Email Activity / audit

### Hard requirements

- OAuth credentials belong to the TSS application, not copied from a ChatGPT connector.
- Sender fixed to the authorized TSS mailbox unless a later configuration explicitly adds another sender.
- Exact approval binds recipient, subject, sender, complete body and attachment hashes.
- Recheck do-not-contact/suppression and recent communication immediately before dispatch.
- Recheck Cyprus business hours immediately before dispatch.
- Use provider-supported immutable IDs where available.
- Persist Graph acceptance reference before marking the action sent.
- If the result is uncertain, reconcile provider state before any retry.
- Never infer read/open status from provider acceptance.
- No background send from daily/weekly brief jobs.

### Acceptance

- internal-recipient send only
- approved action sends once
- rejected/expired approval sends nothing
- changed recipient/body invalidates approval
- outside-hours action remains pending/blocked
- timeout after provider write reconciles without duplicate
- provider 429/5xx bounded retry only when safe
- provider acceptance stored in audit and Email Activity

## 2. Operational evidence adapters

The Command Center currently reports unknown when business-event evidence is absent. This is correct. The next layer should add provider-backed receipts rather than infer health from schedules.

Adapters:

### Website enquiry
Evidence:
- persisted enquiry ID
- received timestamp
- CRM transfer status
- linked record receipts
- retry/backlog state

### Outlook ingestion
Evidence:
- last successful scan
- latest captured message time
- scanned/created/updated counts
- backlog / lease state
- safe error code

### Backup
Evidence:
- latest successful backup ID
- backup timestamp
- restore-test timestamp kept separately

### Deployment
Evidence:
- current Production commit
- deployment ID
- ready/error state
- rollback candidate

### Analytics
Evidence:
- provider access status
- last successful data refresh
- reporting period
- no contact PII

Each adapter needs a defined freshness window. Do not invent a universal SLA.

## 3. Social publication adapter

Do not restore unattended social publishing.

Only implement this adapter if it can reuse the approved interactive Meta publication route.

Required package:
- final asset hash
- exact image/video
- exact caption
- exact account(s)
- intended publish/schedule time and timezone
- factual/source review
- logo review
- exact human approval

State model:
Draft -> In Review -> Approved -> Scheduled -> Published / Failed / Cancelled

Uncertain result:
- query provider first
- do not blindly retry
- preserve platform receipt or URL when published

No public test publication without exact approval of the actual asset package.

## 4. Proactive Command Center schedules

Do not enable until provider evidence adapters are in place and event/restart tests pass.

Initial safe schedules:

### Daily brief
Read-only/preparation only.
- due/overdue work
- important communications
- new enquiries
- dormant opportunities
- failed jobs
- approvals waiting
- content awaiting review
- system evidence warnings

### Weekly commercial review
Read-only/preparation only.
- pipeline snapshot
- dormant work
- follow-up discipline
- prospect/research queue
- data quality
- enquiry flow
- communication coverage
- operational failures

No scheduled job may send email, WhatsApp or publish social content.

### Event hooks

Where provider events exist, prefer them over polling:
- new enquiry
- new captured email
- failed integration job
- overdue task
- approval decision
- publication result

Every event needs:
- source event ID
- idempotency key
- created time
- record reference
- stale/deleted-record handling
- bounded retry
- failed/dead-letter visibility

## 5. Android/PWA hardening

Required before expanding unattended use:
- installed app login persistence
- sign-out clears user state
- reconnect after network loss
- stale cached-state warning
- Command Center actions on phone/tablet widths
- approval dialog usable on phone
- no sensitive Command Center payload in public caches
- service worker does not remove caches owned by another TSS app

## 6. Manager command coverage

The released Manager already supports:
- what needs my attention / priorities / daily
- weekly or management report
- summarize / lookup account
- duplicates / incomplete / data problems
- important emails / replies / incoming
- who to contact / prospects
- research
- prepare email / WhatsApp / follow-up / introduction
- content / social / story / reel
- failures / health / integrations / Outlook / enquiry workflow
- approvals / notifications
- changed since yesterday
- overdue / dormant / no next action

Do not expand command aliases merely for wording variation unless production usage shows a real miss. Keep deterministic routing simple and auditable.

## 7. Release sequence

1. Direct Microsoft application OAuth and reconciliation in Preview.
2. Provider evidence adapters.
3. Android/PWA regression.
4. Optional social provider adapter.
5. Event/schedule live acceptance.
6. One batched Production release.

No paid plan, new provider subscription or widened authentication scope is authorized by this document alone.
