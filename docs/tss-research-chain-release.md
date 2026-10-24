# Research chain repair: release boundary

This candidate is based on production bb6a9b7fafd97985855eea5a0928f0e0fa3e7ca8, not legacy main. Target the existing release/irc-production-20261021 branch. No production release or sending activation is included.

## Actual wiring

- api/tss-irc-daily.js invokes researchNextAction for each inspected candidate, including existing research matches. Its existing Activity Log row stores a structured research-commercial-handoff/v1 object with sourceRunId, recordId, stable action key, next stage and instruction. Columns and authentication are unchanged. This does not import research into CRM or manufacture send approval.
- research-center/index.html reads the existing Activity Log and displays these handoffs. The dashboard and scheduler use the latest scheduled attempt, not only successful attempts. A missing current-day record after the local 09:00–09:59 window is unverified, never healthy by inference.
- Discovery errors preserve bounded classifications for timeout, network failure, HTTP rejection, invalid JSON and invalid schema. No response body, token or provider error text is persisted. A pre-write failure records BLOCKED in Runs and updates Overview. Before the data batch, Runs receives WRITE_VERIFICATION_PENDING. Completion is finalized only after exact research/evidence/activity and dashboard readback. A partial or ambiguous write remains pending and blocks later research writes until reconciled; it is never marked successful. Authentication failure before workbook access still requires an external observer; absence of a failure row is not success.
- scripts/tss-irc-handoff.mjs reads one bounded JSON snapshot from standard input and invokes planCommercialHandoff. It has no network or credentials. Its output is an instruction for an already-authorized consumer, not permission to act.

## One accountable commercial consumer

Use the existing task named TSS Exhibitions & Buyer Partnerships. Do not create another task, sender, CRM or schedule. Its saved automation ID and actual current schedule must be verified by the owner/coordinator before integration. Intended cadence is once daily at 09:00 Europe/Nicosia, not the historical six daily batches.

Required integration into that existing consumer, pending saved-task review:
1. Read today's Runs and Settings. If research is paused, report paused without invoking it. At 09:00 the Vercel execution may still be pending until 09:59; wait/recheck in the same existing execution rather than treating a 09:05 empty scan as final or creating a second schedule. Continue unrelated authorized reconciliation while waiting. After the window, a missing record is a missed-run condition, not permission to trigger research. A BLOCKED record gets the exact stage/code and no success claim.
2. Read candidate handoffs from Activity Log and original research/evidence. Use sourceRunId plus action key for receipt identity. Re-read candidate holds, current suppressions, actual Outlook correspondence and existing HubSpot identities. Research acceptance is not commercial qualification or contact permission.
3. Build the bounded snapshot documented in tss-research-commercial-handoff.md. Run the offline planner or follow its exact validated contract. Re-read before each action. If no unique existing CRM association exists, retain an explicit identity-resolution action. This release never creates or merges companies/contacts.
4. Preserve specific owner deferrals, suppression and current approval requirements. Generic repair approval does not release a record-specific hold. The reconciliation-only task never sends; separate authorized acquisition actions remain subject to their exact grants. Do not change confirmation settings or retry a denied operation through another route.
5. Before any authorized mutation, reconcile the stable key against current history. Use the existing single-owner execution, not concurrent writers. Without a durable claim and complete preflight readback, execution is NO-GO. For uncertain sends, inspect provider evidence and do not resend. For partial CRM saves, repair only missing authorized metadata/associations.
6. Append a receipt in existing Activity Log columns after independent verification: sourceRunId, handoff key, source message identifier, exact CRM record/task IDs, outcome, pending gates and observed time. Use append allocation, not stale row counts. Receipt is operational evidence, never fresh permission. Do not advance fully reconciled coverage past an unresolved gap.
7. Follow-up tasks use the real thread's next action and actual due date only. No automatic reply is created from task text. Verify saved status and associations separately from email submission.

## Preserved capabilities and unavailable adapters

Existing keyless Microsoft transport is for WhatsApp owner operational notifications, hardwired from/to the owner mailbox and allowlisted operational kinds. It is not repurposed for commercial outreach. Native HubSpot form embeds are intake, not a general server CRM-writing client. No new credentials, scopes, IAM, paid service or WhatsApp change is introduced.

## Acceptance before activation

- Review this draft PR and require explicit merge/deploy approval.
- Verify existing consumer saved prompt, scope and schedule; integration is not accepted merely because this document exists.
- After approved deployment, observe a real scheduled research run and saved handoff. Zero candidates prove runtime/persistence only, not commercial conversion.
- Prove one appropriately authorized real transition through unique CRM identity, exact approved provider submission, nonduplicated activity, verified associations and meaningful next action. No test email or live CRM import is authorized by offline test success.
- Prove duplicate replay, uncertain provider response, partial association save, owner hold and failure visibility.
- Provider failure diagnosis remains open until current evidence establishes its cause. New classifications improve future diagnosis; they do not retroactively identify an old generic error.
