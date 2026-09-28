# Responsibility matrix

| Module | Built responsibility | Execution authority |
|---|---|---|
| Manager | Route common requests, aggregate results, retain failures | Read/preparation only in browser |
| CRMAdapter | Exact/ambiguous lookup, dossier, attention, quality, weekly snapshot | No writes |
| GrowthAgent | CRM-first eligibility, exact email matching, triage suggestions, fit reasoning, email/WhatsApp drafts | No sending or automatic qualification |
| OperationsAgent | Evidence-based service health and social concepts | No live monitoring fetch or publication |
| Gateway | Exact approval, concurrency, idempotency, execution state, audit contract | Server service only, not live |
| WorkflowEngine | Deduplicated events, bounded retries, notification contract | Safe handlers only, not scheduled |
| Existing CRM assistant | Existing AI interpretation and confirmed core edits | Existing validated backend; legacy path |
| Hady | Approve exact external actions and release candidate | Human commercial and release authority |

## Candidate 0.2.0 update

The native private Apps Script binding now derives owner/session authority server-side and persists action/audit transitions. Shared browser controls stage and separately approve exact changes. This is staged and partially tested, not a production release. Specialist prompt IDs remain unchanged; no new model/provider credentials or permissions were added. See the current architecture and implementation report for deployment status.
