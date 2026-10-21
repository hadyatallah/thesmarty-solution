# TSS WhatsApp operational readiness, 21 October 2026

**Decision: NO-GO for number migration or real outbound messaging.** The accepted Admin Inbox remains useful, but a fresh ingestion check found a new production failure. No Meta publication, registration, account deletion, payment method or customer message was performed.

## Current production and repair

- Accepted production Inbox: owner Android sign-in, existing synthetic record, refresh, logout and re-entry evidence remains recorded in PR #119.
- Fresh check: Admin HTML 200; anonymous session/inbox APIs 401. Webhook GET without challenge returned **503**. This is a dependency failure, not an expected invalid-challenge denial.
- Vercel log on dpl_H19Ah5hQWSp5HPw2YY855FcbGQcu: whatsapp_webhook/dependency_unavailable/SECRET_UNAVAILABLE. No payload or credentials logged.
- Shared adapter requested datastore-only impersonated tokens for the webhook, but Secret Manager requires cloud-platform OAuth scope. PR #120 restores that scope only when the existing webhook credential key is selected. Existing IAM still bounds access. Reader/writer stay datastore-only. No HMAC, ingestion schema, dedupe or IAM changes.
- PR #120 merged as 8cd5e734e247f7b7d522b5cb1c976f6456b00996. Source commit 35a051269dbdf2df2c2cc6f3159aea88c21529b3. Relevant CI passed: 39614540535 inbox and 39614540528 webhook (push counterparts 39614533324 / 39614533421).
- Production deployment attempt was rejected with HTTP 402, code api-deployments-free-per-day, more than 100 deployments, retryAfter 86400. No upgrade or quota bypass attempted. Vercel CLI is unavailable here and would not resolve the same resource limit. Git integration produced a READY **preview** dpl_HurVbGTAo8oBQwwAunKgTD89yhav; it must not be promoted without rebuilding with production configuration.
- Therefore repair is merged but NOT live on production, and successful Secret Manager retrieval / webhook initialization after repair is NOT proven. No claim of restored signed persistence is made.

## Operational implementation in the readiness PR

### Owner-authorized reply preparation, disabled by default

New POST /api/tss-whatsapp-operations uses the existing owner session, exact environment origin, session CSRF and server-side reader. Default/unset mode rejects. Only VERCEL_ENV=preview with TSS_WHATSAPP_REPLY_MODE=dry-run can validate a draft. The server reloads the selected fixed-collection event rather than trusting client recipient data. It permits only test WABA 2882413005471663 and test phone ID 1378287792033123 plus an explicit TSS_WHATSAPP_TEST_RECIPIENTS allowlist. The production number is always denied. Strict request schema rejects recipient overrides, arbitrary actions and invalid text. The owner UI exposes a validation action, never a send action.

Result includes sent=false and a digest binding event, exact recipient and exact text. Metadata-only application audit records the event key/digest, never content, phone number, cookie or token. Repeated validation has no transmission or database side effect.

**This is a review/dry-run workflow, not a live outbound sender.** No Meta token provisioning, Graph transport or send-enabled mode is included. Implementing a live sender requires a separately approved narrowly scoped sender identity, external-secret path, atomic durable claim/outcome audit, per-draft approval, recipient consent/window rules, cost approval and test-recipient transmission. Existing session writer must not be reused for business audits. An ambiguous provider timeout must become manual review, never an automatic retry. No exactly-once delivery guarantee is claimed. Customer sending remains prohibited.

### Owner notifications using the existing browser service

Browser notifications now distinguish new messages, provider-error events and system/refresh failures with generic content. Initial load and older-page append do not produce false new-message alerts. Keys are deduplicated and notifications throttled. No message contents or sender identifiers enter OS notifications. Logout clears private view and alert state. Existing owner opt-in is retained; no permission is requested automatically.

An owner-only health endpoint probes the pinned public webhook URL without tokens, query parameters or signed payloads. Exact HTTP 400 Invalid challenge indicates dependency initialization only. All other statuses fail closed. This is not a signature, Firestore-write, subscription or end-to-end delivery test. The endpoint does not expose secret contents. The open browser checks health alongside its existing one-minute refresh when alerts are enabled and the tab is visible.

**Limits:** tab must be open, visible, unlocked and within the 15-minute owner session. No background, closed-tab, email, SMS or 24/7 alert guarantee. Unit fixtures exercise notification delivery callbacks, not a live Android OS notification. Real browser opt-in/notification acceptance awaits deployment. A production migration needs an approved dependable out-of-band failure channel. No existing approved persistent email/push runtime integration was verified, so no new service, credential or cron was invented. No notification email was sent.

### Retention/deletion/audit preparation, not activated

A pure retention planner produces review candidates only. It respects legal holds, refuses invalid periods, preserves dedupe and cannot delete even if policyApproved=true. No TTL, DELETE, PATCH, Firestore cleanup writer or scheduled deletion exists in this change.

Submit these proposed policy decisions, not legal conclusions:

| Decision | Proposed starting point | Activation condition |
| --- | --- | --- |
| Message bodies/media metadata | Review for redaction after 90 days | Owner policy approval, lawful hold/rights review and dedicated redactor permissions |
| Minimal event/dedupe tombstones | At least 30 days after payload redaction, subject to confirmed Meta retry window | Separate approval, privacy review and replay test; never delete alongside payload blindly |
| Operational action audit | 365 days, minimal metadata only | Owner approval and verified immutable durable storage / restricted audit reader |
| Expired Admin sessions/revocations | Candidate review after 30 days | Separate approval and proof old/expired tokens remain invalid |
| Access/deletion requests | Owner review, identity verification, scoped dry-run, explicit execution approval | No bulk collection deletion, legal hold override or automatic HubSpot cascade |
| Backup/exports | Encrypted restricted archive with separately agreed expiry | Owner approves location, users and restore/delete policy |

These periods are proposals. Application stdout is not an immutable durable audit archive. Existing Vercel/Google log retention and query-string redaction are not verified. Expired sessions are rejected today but not automatically physically deleted. Enabling deletion would require a new approved least-privilege identity; no existing reader/writer permissions were expanded. Deleting event identity can allow historical replay ingestion. No legal retention compliance claim is made.

## Read-only Meta account evidence

Observed through authenticated Meta UI on 21 October 2026:

- Portfolio thesmartysolution, ID 360592650162259.
- App The Smarty Solution Publisher, ID 1707395857227784, **Unpublished**. Go-live page says all required app settings are complete and asks review of Instagram, Pages and WhatsApp use cases. Publish was not clicked. Do not assume a Tech Provider requirement for this own-business integration; dashboard describes that path for data from other businesses.
- Production messaging account/WABA thesmartysolution, ID **2247151412732806**, owned by this portfolio, business verification **Verified**, account **Approved**.
- Production WABA summary: **No payment method found**, **No Currency found**, time zone America/Indiana/Indianapolis. No setting changed. Do not treat an approved WABA as billing-ready.
- Production WABA phone inventory lists one connected **+1 555-474-2600** placeholder/test-style number. **+357 99 810330 was not present in this inventory**. This is not permission to remove or replace the listed asset.
- Separate test messaging account/WABA 2882413005471663 is Approved/Verified and also has no payment method. Test-only inbox pairing remains 1378287792033123. Do not confuse test or linked phone asset IDs with the production WABA.
- Meta also displays new business-scoped user-ID rollout information. Revalidate recipient addressing requirements before enabling a real sender; the dry-run is deliberately restricted to existing test phone-shaped records.

Sources observed:
- https://business.facebook.com/latest/settings/whatsapp_account/?business_id=360592650162259&selected_asset_id=2247151412732806&selected_asset_type=whatsapp-business-account
- https://business.facebook.com/latest/whatsapp_manager/phone_numbers/?business_id=360592650162259&tab=phone-numbers&nav_ref=whatsapp_manager&asset_id=2247151412732806
- https://developers.facebook.com/apps/1707395857227784/go_live/?business_id=360592650162259

## Pricing and billing: unresolved cost gate

Official public marketing pricing page still describes free service/in-window utility messages, while current reports point to changed non-template pricing effective 1 October 2026. The authoritative detailed Meta developer pricing/non-template pages could not be fetched (429 / inaccessible). **No current Cyprus/international recipient rate, allowance or zero-cost entitlement has been verified.** Do not authorize any actual test or customer API send based on older free-window assumptions. No numeric rate is invented. The WABA has no payment method and no currency, independently observed. Payment setup, billing terms and any spending cap need separate explicit owner approval. Test recipient traffic is not assumed cost-free.

Official reference URLs:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages
- https://business.whatsapp.com/products/platform-pricing
- https://docs.cloud.google.com/secret-manager/docs/reference/rest/v1/projects.secrets.versions/access (cloud-platform scope requirement)

## Direct Business App-to-Cloud API cutover runbook, BLOCKED before destructive step

This is the selected direct-migration route, without coexistence or a second number. It is not an executable authorization. Meta's current direct-migration reference identifies deletion of the existing App account before registration. Full current instructions were rate-limited, so exact current UI prompts, Graph version and recovery timing must be verified before execution. No guessed registration command is supplied.

1. **Before scheduling:** restore webhook dependency access and prove signed test ingestion/replay/readback using existing test-only allowed pair. Accept the owner notification service and real test-only reply path with durable audit/idempotency. Confirm current pricing, billing approval, app publication requirements and sender permissions. Review production WABA 2247151412732806 ownership and selection. Do not register the Cyprus number while any gate is open.
2. **Archive first:** owner exports required chats and media to an approved restricted archive and opens a sample export to verify it. Keep an inventory of important conversations, groups, labels, contacts, attachments and App settings. A mobile/cloud backup is not a Cloud API import path and must not be the sole archive for a deletion-based cutover. Obtain explicit acknowledgement that history and App features may not migrate. Do not promise cloud-backup restoration after account deletion.
3. **Cutover window:** owner physically holds +357 99 810330 and can receive SMS/voice, knows the existing two-step-verification/recovery details and has authorized admins available. Confirm current Meta registration PIN and verification requirements on screen without sharing secrets in chat. Reserve a 60-minute internal maintenance window as a planning allowance, not a provider guarantee. Downtime starts at App deregistration/deletion and ends only after verified inbound/outbound acceptance. It may last longer if registration fails. Agree an email contact fallback before cutover.
4. **Hard stop:** show the exact account/number, deletion/history consequences, billing impact, recovery limitations and current Meta instructions to the owner. Require explicit per-action approval for account deletion, number migration and app publication separately. Owner performs any destructive App account deletion and security credential entry. Do not uninstall the App, remove backups, delete a WABA or deregister any existing phone as a diagnostic.
5. **Only in the approved window:** follow Meta's then-current direct Business App migration procedure for the existing number. If it requires Settings > Account > Delete my account, stop for the owner-controlled destructive action. Then add/verify/register the **same** +357 99 810330 under the selected production WABA using SMS/voice and the required PIN in the supported UI. Record the newly issued phone-number ID. Use no guessed historical ID and no copied test phone ID. If a prerequisite differs, stop rather than improvising.
6. **Bind production ingestion:** update the existing external secret's allowedPairs to exactly the approved production WABA/new phone ID, preserving any separately approved test pair. New secret version and permitted pair changes need explicit reviewed configuration approval. Subscribe the correct app/WABA to messages, confirm signature checks remain enforced, and read back subscription and number state. Never relax the account allowlist to receive a first message.
7. **Acceptance:** one specifically approved owner-controlled test contact sends an inbound message to the migrated number. Verify real persisted record, refresh, generic notification, exactly one owner-approved reply to that test contact, status events, billing result, logout and unauthorized denial. No customer test or automatic reply. Check public site, Data/Research and existing webhook behavior. Open customer operations only after separate acceptance.
8. **Abort/recovery:** before deletion, cancel with App intact. After deletion/registration, website rollback does **not** restore App registration or chat history. Stop sends, preserve evidence and coordinate the then-current Meta-supported deregistration/re-registration process. Recovery can require OTP, PIN/reset waiting periods, account-state resolution or support. No immediate reversal, zero downtime, history restoration or queued-message recovery is guaranteed. Do not delete the production WABA as rollback.

Official migration reference:
https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/migrate-existing-whatsapp-number-to-a-business-account/

## Approval decisions and release gates

- **No-cost action now:** wait for/reset deployment quota through supported provider process, then deploy only tested production webhook fix with production configuration and recheck dependency initialization. No upgrade authorized. This quota is owner/provider-controlled and cannot be completed in this session.
- Review readiness PR code. Dry-run may be enabled on its preview only with explicit owner-controlled test recipient(s). No actual WhatsApp transmission is requested by that flag.
- Choose/approve dependable closed-tab failure notifications using an existing approved runtime service or approve a narrowly scoped integration. Existing browser-only alerts are insufficient as the sole migration safety channel.
- Approve or amend retention/deletion/audit periods and durable audit/redactor implementation before activation. No deletion today.
- Verify current detailed Meta rate card and decide budget/payment method/terms before any chargeable action.
- Authorize publication only after reviewing **all** app use cases; publishing affects the shared publisher app too. No publication today.
- Finally approve the exact direct cutover and history/recovery risk immediately before irreversible action. No migration today.

No-go remains until these are resolved. Existing Admin authentication/IAM/DNS and accepted number/App state were not reconfigured.
