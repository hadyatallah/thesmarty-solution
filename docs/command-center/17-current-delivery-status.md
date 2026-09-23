# TSS Command Center — current delivery status

23 September 2026. The core TSS Command Center release is now in Production. This document separates the live production scope from provider integrations and autonomous workflows that remain intentionally limited.

## Production release

- GitHub PR #10 merged to `main`.
- Production merge commit: `96c0cb7bf98b7bd500a142126243881cbb39f2bc`.
- Vercel production deployment: `dpl_BnVwQTaU4ic1w9b82LEZuTqRCik6`.
- Production deployment state: READY.
- Vercel production check after release: no runtime error clusters observed.
- Production CRM route returned HTTP 200 and served the new Command Center client.
- `/api/crm-command` and `/api/crm-research` are live and reject unsupported/invalid requests.
- Apps Script Command Center backend remains Version 12 on the approved candidate endpoint.
- Existing TSS CRM data source, Google login, website enquiry workflow, PWA, WhatsApp Business App workflow and existing schedules remain in place.
- No PostgreSQL migration, new paid platform or commercial multi-tenant deployment was introduced.

## Implemented architecture

Existing CRM interface -> one Manager -> logical CRM/Data, Growth/Communications and Operations/Content modules -> common snapshot/adapters -> native Apps Script proposal/approval/execute ledger -> existing CRM backend and approved external workflows.

The specialist modules are internal implementation units. The user interacts with one TSS assistant.

## Function status

| Function | Production classification | Evidence / limitation |
|---|---|---|
| Manager routing and CRM read intelligence | LIVE | Deterministic routing, authenticated CRM snapshots and production client deployed |
| CRM account summaries / attention / dormant / data quality | LIVE | Existing CRM remains authoritative; history coverage is shown when partial |
| Native exact approval, schema/version checks and audit | LIVE, CONTROLLED | Live exact-approved synthetic create and rejected proposal verified before release |
| Controlled CRM create/update | LIVE, CONTROLLED | Exact human approval required; delete/merge/send/publish are not automatic |
| Email-sync lock repair | LIVE BACKEND CANDIDATE | Version 12 repair passed synthetic concurrency tests and a live empty scan; large-batch live contention still not proven |
| Bilingual email drafting | LIVE | English/Greek draft verified with info@thesmartysolution.com; draft is not a send |
| Existing Work Outlook connector | AVAILABLE OUTSIDE CRM | Can be used after exact approval and business-hours check; no CRM OAuth dispatch binding |
| Direct CRM website email dispatch | NOT IMPLEMENTED | Microsoft application OAuth + dispatch/reconciliation adapter still required |
| Current-source research inside CRM | LIVE, LIMITED | Authenticated public HTTPS website metadata with dated sources; not full public-web research |
| WhatsApp assistance | LIVE, MANUAL-BOUNDARY | Drafts, direct contact action and existing manual logging; no inbox/API automation |
| Operations monitoring | LIVE, PARTIAL EVIDENCE | Normalizes available receipts/logs; several provider feeds still report unknown when evidence is absent |
| Social content preparation | LIVE | Concepts/formats/approval rules; existing interactive publication workflow retained |
| Direct Command Center social publication | NOT IMPLEMENTED | No provider dispatch adapter in CRM |
| Stored daily/weekly reports | LIVE | Durable job, idempotency and saved report display verified |
| New Command Center schedules/events | BUILT, NOT ENABLED | Intentionally withheld until remaining live event/delivery gates are proven |
| Existing TSS schedules | PRESERVED | Existing routines remain separate from the new gateway unless explicitly migrated |
| Commercial TSS Flow reuse | DESIGN REUSE ONLY | Agent boundaries, adapters and controls are reusable; commercial tenancy is separate |

## Post-release audit and hardening

- Production Vercel deployment is READY and commit status is successful.
- No Vercel runtime error clusters were present during the post-release check.
- TSS CRM Master Workbook remains accessible in Asia/Nicosia timezone.
- Agent Ledger is present and contains durable job/action evidence.
- Daily backup for 23 September 2026 is recorded as successful.
- The prior Management Dashboard renewal/expansion false-positive formula was corrected so only populated opportunity rows can count. The dashboard now returns 0 for the current data and the original warning is marked resolved.
- The legacy Gmail-capture warning from 20 September remains unresolved until the underlying legacy capture path is confirmed filtered or disabled. Do not mark it resolved based only on the newer Outlook/Command Center work.

## Email operating rule

Use `info@thesmartysolution.com`. Prepare English first and professional Greek suitable for Cyprus. Exact recipient, subject, sender and full final body require approval immediately before send. Current business-hours rule: Monday–Friday 09:00–17:00 Asia/Nicosia, DST-aware; public holidays are not configured. Recheck time at dispatch. Never blindly retry an uncertain send.

The CRM itself does not yet have direct Microsoft dispatch credentials. The connected Outlook tool in ChatGPT/Work is a separate authorized route.

## Tests

The released candidate contains 162/162 passing component tests. Live acceptance evidence separately covers:
- exact-approved CRM create executed once
- rejected proposal did not execute
- bilingual draft preparation
- stored daily brief / idempotency
- live empty email-sync scan
- authenticated ledger access

These tests support the released core scope. They do not establish direct CRM email sending, WhatsApp API automation, social provider dispatch, full operational provider feeds, Android installed-PWA regression or new proactive schedule delivery.

## Current acceptance answers

1. **Manager daily use:** live for CRM reads, analysis, preparation and controlled internal actions.
2. **CRM summaries:** usable with displayed freshness/coverage limits.
3. **CRM changes:** exact-approved create/update only through the shared gateway; no autonomous destructive changes.
4. **Research:** authenticated company-website evidence is live; full public-source research is not embedded in CRM.
5. **Email:** bilingual drafting is live. Direct CRM sending is not. Existing connected Outlook route is separate.
6. **WhatsApp:** drafts/contact/manual logging only. No Business App inbox read or API automation.
7. **Social:** content preparation is live; existing interactive publishing route remains external to the Command Center.
8. **Proactive workflows:** existing TSS schedules remain; new Command Center schedules are still disabled.
9. **Manual work:** exact external approval, provider execution, source review and unresolved outcome reconciliation.
10. **TSS Flow reuse:** Manager/specialist boundaries, adapters, approval/audit/jobs, deterministic controls and test harness are reusable.

## Recovery

Frontend rollback: revert merge commit `96c0cb7bf98b7bd500a142126243881cbb39f2bc` or redeploy the previous production candidate `8fc2cdfc121fb9550fb3512f6f998bac61900e46` if a release rollback is required.

Backend rollback remains separate:
- Apps Script Version 12 can be reverted to Version 11.
- If rolling back the email-sync repair, restore the prior private `syncEmail_` implementation and verify the active Head trigger separately.
- Preserve Agent Ledger history.
- Never replay an uncertain external action.

## Next integration priorities

1. Microsoft 365 direct-send adapter with immutable message IDs, exact approval binding, business-hours enforcement and uncertain-send reconciliation.
2. Provider-backed operational health feeds for enquiry transfer, inbox ingestion, backup, analytics and deployment receipts.
3. Social publication adapter only if the existing approved publication route can be reused without restoring unattended publishing.
4. Android phone/tablet installed-PWA regression.
5. New Command Center schedules only after live event idempotency, restart/recovery and no-external-action-without-approval gates pass.
