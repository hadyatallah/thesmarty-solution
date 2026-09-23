# TSS Command Center — Production Release Audit

Date: 23 September 2026  
System: The Smarty Solution CRM / TSS Command Center  
Release commit: `96c0cb7bf98b7bd500a142126243881cbb39f2bc`  
Production deployment: `dpl_BnVwQTaU4ic1w9b82LEZuTqRCik6`

## Release result

The TSS Command Center core release was promoted to Production after the approved Work candidate was merged through PR #10.

Production is serving the new CRM client and the Vercel deployment reached READY. The post-release Vercel error check reported no runtime error clusters.

## Verified production surfaces

- CRM route: HTTP 200.
- Manager/Command Center client included in Production CRM.
- `/api/crm-command`: live, POST-only, unsupported GET returns 405.
- `/api/crm-research`: live, validation active; request without website returns 400.
- Existing Google authentication remains in place.
- Existing CRM Apps Script source of truth remains unchanged in architecture.
- Agent Ledger remains durable in the TSS CRM workbook.
- Existing website, enquiry, WhatsApp V1A and PWA foundations remain in place.

## Data and operational checks

TSS CRM Master Workbook:
- title: TSS CRM - Master Workbook
- timezone: Asia/Nicosia
- Companies capacity: 3,000 rows
- Agent Ledger present
- Email Activity present
- System Control present
- Automation Log present
- Management Dashboard present

Observed operational evidence:
- Daily backup for 23 September 2026 recorded successful.
- Prior Command Center daily brief stored successfully and reused its idempotent job receipt.
- Live gateway evidence contains one exact-approved cancelled QA task and one rejected proposal.
- Live bilingual draft evidence exists. No external email was sent by that acceptance test.

## Hardening correction completed after release

The Management Dashboard had a known false-positive renewal/expansion signal. The prior formula could count stray values outside populated opportunity rows.

The formula was replaced with a bounded `SUMPRODUCT` expression that only counts rows where an Opportunity ID exists. Current result is 0, matching the three populated opportunities and their empty client-health/renewal/expansion fields.

The original Automation Log warning was marked resolved and a successful correction entry was recorded. No opportunity record was changed.

## Known unresolved operational warning

A 20 September 2026 Automation Log warning states that a legacy Gmail capture path created a non-customer Facebook security notification as a CRM Ticket.

This remains unresolved in this audit because the underlying legacy capture path has not been independently verified as filtered or disabled. The newer Command Center and Outlook work does not prove that legacy path is gone.

## Safety boundary retained

Production does not authorize:
- autonomous email sending
- WhatsApp Business App inbox reading
- WhatsApp API dispatch
- autonomous social publication
- automatic destructive CRM merge/delete
- automatic financial commitments
- automatic Production deployment from agent requests

Controlled CRM create/update actions continue to require exact approval through the shared gateway.

## Test evidence

The released source contains 162 passing component tests covering Manager routing, CRM rules, approval controls, transport, security, research, email hours, email-sync behavior, Apps Script behavior, reports and UI safety.

Live evidence additionally covers:
- exact-approved CRM create
- rejected action
- bilingual draft
- stored daily brief and idempotency
- live empty email-sync scan

Remaining live gates are provider-specific and do not invalidate the released read/analysis/preparation/controlled-write core.

## Rollback

Frontend rollback candidate remains the prior production main commit:
`8fc2cdfc121fb9550fb3512f6f998bac61900e46`.

Backend rollback must be handled independently:
- Version 12 -> Version 11 if needed
- restore prior private email-sync source before any Head-trigger rollback
- preserve Agent Ledger and audit history
- reconcile uncertain external effects before any retry

## Next hardening priorities

1. Direct Microsoft 365 application dispatch with exact approval and provider reconciliation.
2. Operational evidence adapters for enquiry transfer, Outlook ingestion heartbeat/backlog, backup, analytics and deployment.
3. Android installed-PWA regression.
4. Social provider dispatch only through the approved human-controlled route.
5. New scheduled Command Center workflows only after event/restart/idempotency live acceptance.
