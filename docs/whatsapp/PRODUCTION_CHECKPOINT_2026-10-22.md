# WhatsApp production checkpoint,22 October 2026

## Released repair

PR #120 merged into release/tss-unified-privacy-20261021 as 8cd5e734.
The newer Research Center production branch did not contain that change.
PR #125 applies exactly its two files on the verified 9b1c767 production baseline.
No operational features from draft PR #121 were included.

- Release PR:https://github.com/hadyatallah/thesmarty-solution/pull/125
- Production commit:5594f072aa53283cff2ed59e973422ac00ff9168
- Deployment:dpl_AgbqFV6TF95k6y2xogESY2EAxrk5, READY, production aliases verified.
- Retained pre-repair baseline:dpl_AAWm3wGixCrLNxzm7RqWnVsT1r7g /9b1c767a0e8a114b032a31de30dc7476acc2b840.
- PR CI runs 39768927598 and 39768927541passed. Push counterparts39768905672 and 39768905686passed.
- Local scope release: 85 Node tests passed. Readiness overlay with current production: 126 Node tests and 15 Python IAM fixture tests passed before the private helper's 5 additional unit tests.

## Live observations

At11:15 UTC (14:15 Nicosia), bare webhook GET returned 400/Invalid challenge.
The handler loads and validates Secret Manager configuration before this response,
so dependency initialization is restored. Wrong challenge token returned 403.
Invalid HMAC POST returned 401. Anonymous Inbox and Admin session GETs returned 401.
Data Center returned 200. Existing owner Google Admin sign-in succeeded and the
production Inbox displayed the existing October 20 synthetic event through Firestore.
No new signed event was injected by this session and no outbound message was sent.

The corrected scope is cloud-platform only for the existing webhook identity.
Reader and session writer remain datastore-only. No IAM/env/secret/allowlist changes.
READY and the existing record do not prove new signed persistence or replay.

## Exact remaining authenticated test dependency

Google Cloud Console and the official Cloud Shell entry both rendered
Site Unavailable in the Work browser. One Console reload did not recover access.
No authenticated local gcloud or GCP connector is available. Do not expose the
app secret, verification token, Google credentials, browser cookies or message
contents to work around this restriction. No diagnostic backdoor was added.

scripts/tss-whatsapp-private-acceptance.py is a concrete owner Cloud Shell helper.
It reads existing secret version 2 into process memory, checks the unchanged exact
test allowlist, accepts/rejects correct/wrong challenges, checks invalid HMAC,
posts one uniquely identified signed synthetic inbound event, independently reads
the expected Firestore document, replays it and checks unchanged create/update
times, and rejects independently wrong WABA and phone IDs. It prints only fixed
test results and the synthetic event key/timestamps. It never calls Meta Graph,
changes IAM/settings, sends WhatsApp messages or writes credentials to files.
The owner can run it within the existing authorized Google Cloud Shell session.
Then the Admin Inbox must refresh and confirm that exact new event key/message.
Do not count the helper's unit fixtures as live signed acceptance.

## Fresh Meta state

Authenticated app 1707395857227784 remains Unpublished. Publish page reports required
app settings complete and requires review of all three use cases, including
Instagram/Pages. WhatsApp management/messaging permissions say Ready for testing,
not accepted production sending. No permission, publication or billing action ran.

Account 2247151412732806 is shown as a Messaging account owned by thesmartysolution,
Verified and Approved. No currency/payment method is configured. UI timezone is
America/Indiana/Indianapolis. Current Meta UI distinguishes WhatsApp accounts
(phone ownership) from messaging accounts(templates/payment). Reconfirm exact
Graph/WABA/subscription identity before any future production allowlist change.
Its inspected Manager inventory contains one connected +1 555-474-2600and does
not contain +357 99 810330. The Cyprus number was not migrated or registered here.
Existing test-only fixture pair remains 2882413005471663 / 1378287792033123.

## Current pricing and migration verification

Official developer search results now state service-message charging effective
1 October 2026. Official WhatsApp FAQ states the first 1,000 service messages per
business phone number are free monthly, with charges afterward. The general
marketing pricing page still claims free service messages. Treat the dated
developer pricing update as the relevant change, but do not infer this account's
remaining allowance, current Cyprus/international rate, tax or spend ceiling.
Detailed pricing/rate-card and registration/migration pages returned 429 on direct
retrieval. No numeric rate or test-send cost is invented and no charge is approved.

Sources checked22 October 2026:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages
- https://business.whatsapp.com/resources/faq
- https://business.whatsapp.com/products/platform-pricing
- https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/migrate-existing-whatsapp-number-to-a-business-account/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration

Official migration search confirms the direct App-number route involves account
deletion unless using partner onboarding. The existing 8-step migration runbook in
OPERATIONAL_GO_NO_GO_2026-10-21.md remains a gated checklist, not an activation
instruction. Exact current registration fields/PIN/API version and recovery
timelines must be verified before owner-controlled deletion. Website rollback
cannot restore Business App registration or history. No cutover is authorized.

## Open release gates

1. Private signed helper and exact new Admin readback.
2. Live preview-only draft/alert checks with explicit test recipient. Keep disabled.
3. Durable outbound approval/claim/outcome audit and private sender credential
   access. Do not reuse the session writer or broaden IAM without approval.
4. Dependable closed-browser notifications and independent datastore-outage alert.
   Connected ChatGPT Outlook authorization is not Vercel mail authorization.
5. Retention policy, current cost/budget/billing, shared-app publication and direct
   number cutover are distinct owner decisions. No deletion, publication or migration.

GO for the limited dependency-scope repair. Full webhook persistence acceptance
and number migration remain NO-GO until their respective gates pass.
