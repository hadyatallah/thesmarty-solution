# Live checkpoint — 21 October 2026

This checkpoint supersedes the earlier 20 October "unprovisioned" status for the resources listed here. Do not interpret the earlier text below as current for IAM or secret provisioning.

- Google project `tss-crm-508908`: dedicated `tss-whatsapp-webhook` service account, secret-level accessor, restricted create-only Firestore role and Vercel OIDC impersonation were saved and read back by the owner in Cloud Shell.
- Firestore `(default)`, Standard/Native, `europe-west1`, exists. **Valid signed event persistence and independent readback remain PENDING.**
- Secret Manager `tss-whatsapp-webhook-config` version **2** was created by owner rotation. The Meta App Secret and private verify token stay external to Vercel/GitHub.
- Vercel production configuration uses the dedicated WhatsApp service-account identifier and Secret Manager numeric version 2. The Research Center service-account setting was not replaced.
- PR #117 contains fixes for JavaScript regex escapes, Vercel OIDC retrieval, extracting `getAccessToken().token`, and avoiding Vercel's lazy `req.body` getter before raw-body signature verification.
- **Live deployed checks passed:** GET with a deliberately wrong verify token returns **403**; POST with intentionally invalid SHA-256 HMAC returns **401**. GitHub Actions separately passed webhook unit tests.
- Most recently verified functional production deployment: `dpl_EpheAFAak7rWodc2PBgKkuo3aqym`, commit `48fecc1f839a1c2fb7253ce871a91c06b72ccd1b`. Subsequent branch-only CI edits do not alter this runtime.
- Test-only webhook gate currently enabled for the Secret Manager allowlist, containing only WABA `2882413005471663` and phone `1378287792033123`. **No real customer or production WABA is registered or subscribed.**
- Vercel Runtime Logs documentation says Search Params may appear in request metadata. Do not assume Meta's verification-token query string is redacted. Rotate the handshake token after verification or document and approve a compensating control.
- Meta callback **Verify and save**, `messages` subscriptions, unpublished-app resolution and genuine inbound events are **NOT DONE**.
- TSS production +357 99 810330 remains in WhatsApp Business; no migration or customer sends are authorized yet.

## Next acceptance action

Use the owner's locally executed synthetic signed acceptance helper to send the same test-only signed webhook payload twice and read the resulting Firestore document independently under the owner's account. This tests **real persistence and retry/dedupe** without revealing the App Secret or sending WhatsApp messages. Record the returned statuses; do not claim it passed before execution.

---

# WhatsApp webhook checkpoint | 20 October 2026

Status: implemented, locally tested and deployed INACTIVE to Production. NOT Meta-accepted or ready for number migration.

Initial implementation commit: `7adaf84887c8e6b9e13b66212002c4abfb780a6c`. Draft PR: https://github.com/hadyatallah/thesmarty-solution/pull/117

Verified Production deployment: `dpl_26H1d6nqvRPohEoGtB5dPieBUzSw`, READY. Deployment reference: https://vercel.com/tss21/thesmarty-solution-agent/26H1d6nqvRPohEoGtB5dPieBUzSw

Public candidate callback: https://www.thesmartysolution.com/api/tss-whatsapp-webhook

Live HTTPS GET and POST returned 503 `Webhook inactive`. Independent Vercel fetch confirmed GET 503 and Cache-Control no-store at 19:35:55 UTC on 20 October 2026. No valid Meta challenge or signed POST was attempted against Production because no approved secret/store is configured. Homepage, Admin Login, Data Center, Research Center and Contact page returned HTTP 200. These are route/HTML smoke checks, not authenticated app or scheduled-job execution proof.

## Release base and isolation

Base is deployed Production commit `bab6eba92b0de3e345d1d86bfb5e0faa46b72f33` on `fix/research-center-keyless-production`, not main. Main still contains the older service-account JSON implementation. Do not merge this branch into main without reconciling the existing keyless repair. PR #71's offline preparation was inspected. Its SHA1-capable verifier and in-memory Set are unsuitable for this endpoint. The receiver retains the same message/status envelope concepts with stricter validation and persistent atomic insertion.

No existing app, publisher, Research Center, HubSpot, Outlook, schedule, or website implementation files were changed. The package lock was synchronized with the already-declared keyless dependencies after CI exposed a pre-existing mismatch. No new package was added to package.json. No outbound Graph API calls, HubSpot writes, app publication or number registration exist in this receiver.

## Endpoint and security

Route: `/api/tss-whatsapp-webhook`. Disabled unless `TSS_WHATSAPP_WEBHOOK_ENABLED=true`. While inactive, GET and POST return 503. This is routing evidence only, not webhook acceptance.

GET checks a single subscribe mode, verify token and challenge. POST accepts only SHA256 HMAC over untouched bytes, uses timing-safe comparison, limits bodies to 512 KiB, validates message/status schema and allows only explicitly configured WABA/phone-ID pairs. Secrets and private payloads are never logged by application code. Audit messages contain fixed codes and counts only.

The hosting platform may log request URLs independently. Before activation, verify/redact hosting access logs and query strings so Meta's GET verification token is not retained. No control over platform request-log redaction has been verified in this assignment.

## Secret and persistence proposal, NOT provisioned

Reuse existing Vercel OIDC → Google WIF → impersonated service-account access. There is no JSON-key or environment-secret fallback.

The optional adapter expects an existing authorized Secret Manager version holding JSON fields `appSecret`, `verifyToken`, `allowedPairs` (each pair has `wabaId`, `phoneNumberId`). The token must have at least 32 characters and be generated securely outside source control. Pin the Secret Manager numeric version. Do not put values in Vercel, GitHub or chat.

Nonsecret resource-path settings only:

- `TSS_WHATSAPP_SECRET_VERSION`: full numeric Secret Manager version resource.
- `TSS_WHATSAPP_FIRESTORE_PARENT`: existing approved Firestore documents parent.
- Existing `GCP_*` WIF identifiers, already used by Research Center.

Firestore is a proposed technical inbox, not a commercial CRM. It is NOT confirmed existing or authorized. Do not create a database, enable paid services, expand IAM, or enable this receiver without a separate verified authorization. No such change was made. If an existing approved atomic store is available, replace this adapter rather than creating unnecessary infrastructure.

Atomic document creation uses a SHA256 event identity as document ID and writes the event and dedupe marker together. Only explicit ALREADY_EXISTS is a duplicate. All other write errors return 503. A partial batch retry resumes missing records without rewriting existing events. Status events include status and timestamp in identity so sent/delivered/read are distinct. Inbound message identity ignores timestamp to avoid replay duplication. Events remain `held_for_review`. There is no worker or autonomous reply processor.

Private message contents live only in the proposed restricted inbox, never in application logs or commercial CRM. Before activation, verify store access, encryption, retention, audit access and residency. No retention deletion is automated. Deleting dedupe records permits old deliveries to be ingested again. Future workers need their own atomic claim/lease and side-effect idempotency controls.

## Test evidence

`local-tests.tap` records 22 passing tests (10 webhook/adapter tests and 12 existing regression checks). Provider calls in adapter tests are mocked. Concurrency/restart tests share a mock atomic store. They do not prove live cloud durability or IAM permissions.

Passed: valid/invalid/missing/duplicate GET verification parameters, valid/invalid/malformed/SHA1/tampered/raw Unicode HMAC, message/status metadata, duplicate concurrent deliveries, partial write and retry, malformed JSON/schema, unauthorized account, oversize/parsed-body rejection, inactive/missing configuration, provider-error capture, secret-provider denial, ambiguous 409 rejection, network-call security settings, Admin Login/native forms/Research UI checks.

Pre-existing failure: `tests/tssIrcCronAcceptance.test.mjs` returns GOOGLE_OIDC_CONFIGURATION_INCOMPLETE because the fixture is not adapted to keyless auth. Reproduced on untouched base `bab6eba`. No Research Center code or test altered to conceal it.

## Blocking acceptance gates

- Google Console returned Site Unavailable in this browser. Existing Secret Manager resources, IAM and atomic inbox availability are not verified.
- Meta dashboard navigation timed out. Current subscription/publication state has NOT been checked. The owner's supplied checkpoint says unpublished and unconfigured.
- No real App Secret or verify token obtained or configured. No successful public challenge or signed POST, live persistent dedupe, dashboard webhook test, or real inbound delivery claimed.
- Current Graph API version and exact number-migration flow must be revalidated against official Meta guidance and dashboard before migration. This receiver makes no versioned Graph API request and invents no migration parameters.

## Activation and controlled migration sequence

1. Restore authenticated Google/Meta access. Inspect existing Secret Manager, IAM and an atomic inbox. Return for owner approval if new permissions/resources/cost are necessary. Resolve platform GET-token logging before activation.
2. Store App Secret and random verify token directly in the approved external secret manager. Configure only nonsecret paths on Vercel. First allow ONLY test WABA `2882413005471663` + test phone ID `1378287792033123`, not the Cyprus number.
3. Verify live secret retrieval and persistence using synthetic data. Run valid/invalid GET/HMAC, partial failures, replay and concurrent duplicate tests over HTTPS. Independently read back inbox records. Enable only after these pass.
4. In existing Meta app, set the exact verified callback URL and external verify token. Complete Verify and save, subscribe to messages, verify test WABA app subscription and trigger dashboard-generated tests. Record them as test-only acceptance.
5. Separately review publication requirements, billing and costs with owner. Do not publish automatically. A dashboard test does not establish real inbound customer delivery.
6. Only after owner separately authorizes migration, verify current Meta direct-registration prerequisites, number ownership, two-step verification requirements, SMS/voice availability, expected downtime and current official deregistration/registration flow. Do not delete the Business App account based solely on this checklist.
7. During the approved cutover window, follow Meta's verified direct migration flow for +357 99 810330. Record the actual production phone ID, authorize the exact production WABA/phone pair, subscribe the correct WABA and test real inbound receipt, persistence and statuses. Keep replies manual/reviewed. Commercial HubSpot functions remain gated separately.

## Rollback

Before migration: disable webhook flag or revert only webhook changes. No mobile account rollback is needed because the number is untouched. Returning 503 causes retries, so prolonged downtime has provider retry/retention limits. No zero-loss guarantee is made.

Do not roll the whole site back to main: it would undo the deployed keyless repair. Rollback reference for this assignment is Production deployment `dpl_JC9oNgasYaqAJTs4FvcH4RhRanzn` / commit `bab6eba`.

Stop activation/cutover for signature mismatch, unapproved sender IDs, secret-provider failures, persistence failures, unexplained duplicates, customer-data logging or broken existing app checks. After number migration, reverting website code does not restore Business App registration. Recovery must follow Meta's then-current supported registration process and can involve downtime.

## Official references inspected

- https://developers.facebook.com/docs/graph-api/webhooks/getting-started/ (search result available, detailed fetch rate limited)
- https://github.com/fbsamples/whatsapp-api-examples/blob/main/signature-validation-with-webhooks-payloads/app.py
- https://docs.cloud.google.com/secret-manager/docs/access-secret-version
- https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/createDocument

Secret Manager access needs pre-existing suitable authorization, such as secret-level Secret Accessor. WIF alone does not grant this. Firestore REST v1 createDocument supplies a caller-selected documentId. Neither official documentation nor mocked tests proves these resources are enabled for TSS.
