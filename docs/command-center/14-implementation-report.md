# Implementation report — candidate 0.3.0, 22 September 2026

Progress report, not final acceptance. The authenticated Preview is working. Google origin mismatch and browser sign-in are resolved. Production website/main and the Version 10 public deployment have not been promoted. 153 local tests pass; see exact hashes in test-evidence.json. Component tests are not substitutes for the remaining live acceptance.

| Major function | Status | Verified scope |
|---|---|---|
| Manager and CRM intelligence | IMPLEMENTED, PARTIALLY TESTED | Existing CRM snapshots, deterministic lookup/attention/dossier; authenticated UI |
| Shared native approval gateway | IMPLEMENTED, PARTIALLY TESTED | Exact approved synthetic create succeeded; rejected proposal stayed cancelled; durable audit |
| Bilingual email drafts | IMPLEMENTED, PARTIALLY TESTED | Live English/Greek draft, info@thesmartysolution.com; no send |
| Prospect/history checks and email triage | IMPLEMENTED, PARTIALLY TESTED | Synthetic coverage and available captured Email Activity; not a live Outlook inbox |
| Current public research provider | NOT IMPLEMENTED | Interface exists; runtime provider absent |
| Application email sending | NOT IMPLEMENTED | Native backend rejects send; business-hour contract tested with mocks |
| WhatsApp assistance | IMPLEMENTED, PARTIALLY TESTED | Draft and existing Business App contact/manual logging; no inbox/API |
| Operations evidence normalization | IMPLEMENTED, PARTIALLY TESTED | Unknown/partial evidence preserved; full live health feeds absent |
| Content preparation | IMPLEMENTED, PARTIALLY TESTED | Concepts/format/approval rules; final assets and actual platform dispatch absent |
| Command Center social publishing | NOT IMPLEMENTED | Existing approved manual Meta workflow preserved |
| Daily/weekly preparation | IMPLEMENTED, PARTIALLY TESTED | Native daily job completed and duplicate request reused receipt |
| Proactive schedules and event hooks | NOT IMPLEMENTED | Tested handlers, intentionally not activated before live phase gates |
| Commercial multi-tenancy | PROPOSED ONLY | Logical scope design only; no CRM migration |

## What actually changed

One existing CRM interface calls a Manager and logical CRM, Growth, Operations modules. Shared native Apps Script proposals, approvals, execution claims, ledger and jobs use the existing workbook and record validator. A narrow same-origin Vercel proxy handles six Command Center methods, forwards the existing session, and never retries uncertain writes. Preview authentication cookies are preserved only on same-origin calls. Sanitized diagnostics exclude tokens and message bodies.

The email-sync repair in command-center/apps-script/EmailSync.gs replaces the existing private syncEmail_ function; it is not a second trigger. Gmail reads occur outside the shared CRM write lock. A fenced scan lease prevents overlapping new runs; records are reread under the original lock before application. Cursor and message deduplication are preserved. The repair passed a live empty-scan check and is deployed to candidate Version 12 (22:11 UTC), with the same authenticated endpoint. Production Version 10 remains unchanged. Large live batch concurrency is not yet exercised.

Manager reporting now marks missing translations as partial and unavailable email history as unavailable. This UI change is included in the next batched Preview build.

## Live evidence

See live-acceptance-2026-09-22.json. One authorized cancelled synthetic task, TAS-af063c45, was created at 21:59:41.888 UTC. Refreshed task count is nine, previously eight; no duplicate QA task was present. No company, contact, due date or commercial state was changed. Rejected proposal 498c5f764800784fdc3ea7105a10b55b did not create a task. Bilingual draft retest passed at 22:03:22 UTC. Nothing was emailed or published.

The earlier 182.869-second Gmail run overlapped requests ending near their 20-second lock wait. Draft preparation succeeded once that run ended. This supports lock contention as the cause of those failures; it does not prove every earlier transport failure had the same cause.

## Acceptance answers

1. **Everyday Manager use:** Preview read/preparation use is available; the complete system is not accepted for Production.
2. **CRM summaries:** Tested deterministic reads can be used with their stated coverage limits; unavailable history must remain explicit.
3. **CRM writes:** Native create/update supports exact approval and existing schema/version validation. One cancelled internal task passed live acceptance. No send, delete, merge or financial capability is enabled.
4. **Research:** Current-source runtime research is not operational.
5. **Email:** Draft only; sending remains disabled. English and Greek and info@thesmartysolution.com are verified in one live draft.
6. **WhatsApp:** Preparation, existing contact action and manual logging. No automatic inbox reading or sending.
7. **Social:** Existing manual workflow remains; Command Center publication is not operational.
8. **Proactive workflows:** On-demand stored daily preparation works; schedules/events remain disabled.
9. **Manual work:** Exact action review, research verification, final creative assets, sending/publication, provider reconciliation and remaining integration acceptance.
10. **Future TSS Flow reuse:** Adapters, approval policy, identity/coverage rules, audit/job contracts, prompts and evaluation suite. Commercial tenancy remains separate.

No new paid services, recurring costs or hosting upgrades were introduced. Existing authentication remains enabled. Rollback: revert the candidate Git branch changes; retain Version 10 production; restore only the prior syncEmail_ from the private backup to undo the Head repair. Do not delete ledger rows or replay uncertain writes. Disable future schedules before rolling back a version that created them (none enabled now).

Next action: verify the repaired background capture under concurrent CRM reads, finish the remaining live integration gates, then promote a clear tested release candidate under the user's existing Production authorization. No further general release approval is needed; exact external messages still require their own approval.


Live sync check: repaired Head completed at 22:08:44.536 UTC in 4.478 seconds, zero matching messages and zero record changes; lease cleared and scan success marker advanced. This validates a real empty scan, not large-batch concurrency. Synthetic concurrency/failure tests passed.
