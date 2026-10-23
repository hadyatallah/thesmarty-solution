> Historical 21 October checkpoint. See PRODUCTION_CHECKPOINT_2026-10-22.md for the released scope repair and current acceptance evidence. Retention and activation proposals below remain unapproved.

# TSS WhatsApp | Operational decision package (no activation)
Date: 21 October 2026
Status: **NO-GO for production phone migration**. This document does not authorize payment, publishing, sending, retention deletion or number migration.

## Verified checkpoint
- Production Admin Inbox accepted and remains on deployment `dpl_H19Ah5hQWSp5HPw2YY855FcbGQcu` (PR #119).
- Production webhook GET failed with HTTP 503 / Secret Manager access. Merged PR #120 corrects the webhook OAuth scope, but the correction is not deployed to production due to Vercel daily free deployment quota. CI alone is not live verification.
- PR #121 contains preview-only, default-disabled reply preparation, browser-visible notification improvements and a non-destructive retention planner. Its head has passing tests but no deployed operational acceptance.
- Production WABA `2247151412732806` was verified/approved in Meta; app remains unpublished; payment method and current rates are unverified; number `+357 99 810330` remains in WhatsApp Business App.

## Work that can be done without a deployment
1. Keep PR #121 draft and preserve current accepted production deployment. Do not delete Vercel deployments to evade the daily quota or lose rollback evidence.
2. On first available permitted deployment, release the already-merged PR #120 scope correction under the existing production release controls. Test incorrect webhook challenge rejection, valid challenge, signed test-only POST, Firestore readback, replay deduplication, and ensure no customer messages. Record exact deployment and upstream status. Do not assume a preview READY state is a production deployment.
3. Review the proposed policies below. None is activated by approving this document.
4. Review a reliable out-of-band alert channel. Browser alerts while open/unlocked are insufficient after Business App cutover. Prefer the existing approved TSS mail infrastructure only if it supports secure automated server-originated notifications without a new credential, provider or fee. Require delivery and failure tests.
5. Keep outbound Graph sending disabled until a separate test-only sender, approved recipient, durable audit, provider timeout handling and explicit budget are accepted.

## Owner decisions required before activation
| Decision | Proposed policy / acceptance criterion | Current state |
| --- | --- | --- |
| Message content | Review for redaction at 90 days, except legal holds or outstanding enquiries | Proposed, not approved |
| Dedupe records | Retain at least 30 days beyond content redaction, subject to verified Meta retry window and replay test | Proposed |
| Audit | 365 days, minimal immutable metadata, no body or token | Proposed; durable store not built |
| Admin sessions | Review expired session/revocation records after 30 days; prove revocation cannot be undone | Proposed |
| Subject deletion | Identity-verified request, scoped preview, legal-hold check and separately authorized execution | Proposed |
| Alerts | Out-of-band notification for new inbound events and webhook/store failure, with retry and delivery evidence | Not implemented |
| Outbound test | Explicit test recipient, Meta pricing/limits confirmed, audit/idempotency, no automatic resend on ambiguous timeout | Not authorized |
| Billing | Review official current rates and approve payment method and spend cap before any charge | Pending |
| Meta publication | Review current required settings and request separate approval | Pending |
| Phone migration | Separately approve destructive direct Business App-to-Cloud API cutover, history-loss risk and recovery limits | Prohibited until go/no-go |

## Release and risk controls
- Keep production webhook, existing number and Business App unchanged until a separately authorized cutover.
- Preserve webhook HMAC verification, strict WABA/phone allowlist, replay controls, read-only inbox, create-only webhook identity, keyless Google authentication and Research/Data Center behavior.
- No new paid services, keys in Vercel/GitHub, broad IAM, third-party outreach, Meta publication or customer messages.
- If the first post-quota deployment fails live signed ingestion, revert to the last accepted deployment, preserve logs/evidence and remain NO-GO.
- Do not claim full WhatsApp operations readiness until receive, review, human-authorized reply, durable audit, retention controls, out-of-band failure alert and pricing are demonstrated.

## Evidence to record on next deployment
Production deployment ID and commit; webhook GET statuses; signed test POST and dedupe outcomes; Firestore readback; no outbound Graph calls; owner notification behavior; relevant CI runs; rollback confirmation.
