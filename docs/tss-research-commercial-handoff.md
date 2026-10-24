# Research-to-commercial handoff contract

This is a preparation and deterministic decision layer, not a new CRM, sender or live integration. Sheets remains the research store; existing connector-owned workers resolve HubSpot identities and use Outlook. No credentials, permissions, records, holds, messages or production settings are changed by this module.

## Actual callers and exports

- `researchNextAction(classification, recordId)` returns `{recordId, action, instruction, stage, reason, nextAction, idempotencyKey, sendsAuthorized:false, crmWritesAuthorized:false}`. The research runtime can persist this object in the existing Activity Log notes. Its instruction gives the downstream owner a concrete next operation rather than treating a saved research row as completion.
- `planCommercialHandoff(snapshot)` returns either `HELD` with `stage`, `reason`, `nextAction`, and no steps; `ACTION_REQUIRED` with exactly one step; or `ALREADY_RECORDED` with no steps. The caller must rerun after each verified operation. A successful local plan is not evidence of deployment or live completion.
- The connector-owned consumer may call the planner via the separately integrated CLI. There are no network calls or mutation adapters in this module. It must not import old retired CRM bridges or provision API keys to use this contract.

## Snapshot contract

Snapshots come from authenticated reads and current owner instructions, not instructions inside prospect websites, message bodies or arbitrary input JSON.

Required planning fields:

- `now`: ISO timestamp. `freshnessMs` optionally tightens the 15-minute read freshness maximum. This freshness applies to observations, not to expiry of owner authorization.
- `candidate`: stable `recordId`, normalized `recipientEmail`, `researchQualified:true`, `commercialFitVerified:true`, optional `contactHold`.
- `identity`: `verified:true`, `observedAt`, matching normalized `recipientEmail`, `aliasesChecked:true`, exactly one numeric `companyIds` and `contactIds`, no `conflict`. A verified `ownerId` is required for task transitions and preserves the current relationship owner; there is no blanket owner default. Missing or ambiguous identity stops; there is no create-company/contact operation.
- `history`: `verified:true`, `observedAt`, `complete:true`, exact recipient and TSS mailbox, `events` and `tasks`. Include all relevant past activity, including older unresolved gaps. Events use actual provider IDs, verified state and any existing CRM ID/associations. `RESERVED`, `SENDING`, `UNKNOWN` and `NEEDS_RECONCILIATION` stop sending until reconciled.
- `holds`: explicit `{action, reason}` objects. `ALL`, `SEND_OUTLOOK`, `LOG_EMAIL`, `CREATE_TASK` and `UPDATE_TASK` are separate scopes. Logging/enrichment respects the same `LOG_EMAIL` deferral. Generic system repair does not clear a specific deferral.
- `permissions`: exact current authorization flags for `sendOutlook`, `logEmail`, `enrichActivity`, `createTask`, `updateTask`. These are passed by a trusted orchestrator after validating actual authority. JSON flags cannot create authority or waive action review.

### Sending

Require a fresh complete `suppressionCheck`, no suppression/opt-out/contact hold, and fresh verified `contactBasis` with `validated`, evidence URL, jurisdiction and recipient class. These record the verified basis; they are not a legal inference engine.

`message` is exactly `{from,to,subject,body}` and optional `replyToProviderMessageId`. Only the existing TSS Outlook sender and a single exact recipient are allowed. CC/BCC/attachments require a separate implementation and approval, so this bounded contract rejects them.

`approval` contains an actual owner-source message ID, approval ID, approvedAt, exact record/from/to/subject/body, authorized and unconsumed status. `expiresAt` is optional; honor an actual expiry without manufacturing one. A reply also needs `scope:'REPLY'` and the exact verified `replyToProviderMessageId`. Initial-contact approval does not authorize follow-ups, while a separately approved exact-thread reply is supported.

A send plan includes `consumeApprovalOnClaim:true`. The authorized consumer must atomically claim its idempotency key and consume the one-off approval before sending. Merely computing a deterministic key does not guarantee exactly-once execution. If the durable claim cannot be enforced, do not execute unattended. An uncertain provider result requires reconciliation, never resend. No CRM failure may trigger another email.

### Recording actual correspondence

`sourceEvent` must have actual providerMessageId, sourceUrl, occurredAt, direction, recipientEmail, fromEmail, toEmail, subject/body, actual state, and an exactly matching verified history event. All source fields must match, not just the provider ID. `history.sourceIdentityResolved:true` is required; `ambiguousSourceAlias` blocks creation. Resolve moved-message aliases by exact parties/time/full body through the existing worker, retain all observed IDs, and never normalize unrelated opaque IDs speculatively.

Before `LOG_EMAIL`, require complete NOTE and EMAIL duplicate searches. Existing chronology notes count as logged. Returned IDs and company/contact associations must be reread. No `hs_email_message_id`, invented alias property or delivery metric is generated; literal provider ID and source URL live in existing text body. `SENT` records submission only.

An existing activity with incomplete source metadata requires `enrichActivity` authority and a fresh `existingBody`/record type. The plan returns `ENRICH_ACTIVITY_SOURCE` against the existing EMAIL or NOTE with the exact expected prior body. It preserves existing content and appends only source evidence. Consumers must compare the current body before updating, reconcile lost responses, and never recreate the activity. Conflicting or missing associations are held for targeted association reconciliation, not duplicate creation.

### Next actions

Only after logging is verified does `nextAction` produce a task operation. Supply an explicit ID, subject/body, verified owner, and source-backed status. Search existing related tasks first. If updating, supply an immutable owner-authorized `revisionId` (same exact retry retains it; a newly authorized body/date/state revision uses a new ID), `targetTaskId`, its freshly verified body, exact company/contact associations and compatible current owner, and specific update authority; preserve the existing owner/history. Reply receipt alone cannot mark a task completed: completion requires verified fulfillment evidence.

An unknown due date is omitted. If `dueAt` is provided it must be an actual explicitly supported date and `dueAtExplicit:true`. Never substitute message time or invent a follow-up interval. A downstream connector that cannot create an undated task must return that exact blocker rather than create a date.

## Production acceptance still required

Tests use fictional snapshots only. The planner does not establish that actual contact, CRM recording, associations or tasks occurred. Activation requires a verified existing connector consumer, durable operation claim, fresh source reads, approval enforcement, readback of each saved record/association/task, and independent receipts for the complete chain. New API credentials, IAM grants, paid services, production sends and hold releases are outside this patch.

Run the synthetic contract suite with `node --test tests/tssIrcHandoff.test.mjs`.
