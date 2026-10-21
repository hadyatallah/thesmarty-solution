# TSS WhatsApp Admin Inbox — Production Readiness Gate
Date: 2026-10-21
Status: APPROVED FOR PRODUCTION CONFIGURATION PREPARATION; NOT APPROVED FOR NUMBER MIGRATION OR UNVERIFIED MERGE.

## Verified baseline
- PR #119 head at review: 26152a95d1759f1fcc3bb34ed687198c5f3d85db; six GitHub Actions suites PASS.
- Owner-reported Android preview acceptance includes sign-in, one synthetic inbox record, refresh and logout.
- Production Vercel environment has no TSS_ADMIN_SESSION_ENABLED, TSS_ADMIN_ORIGIN, TSS_ADMIN_SESSION_WRITER_SERVICE_ACCOUNT_EMAIL, TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL or TSS_WHATSAPP_INBOX_ENABLED (read-only inspection).
- Existing application lib/tssAdminSession.mjs sameOrigin() explicitly requires TSS_ADMIN_ORIGIN === https://whatsapp-preview.thesmartysolution.com. This must be corrected before production release.
- Existing Google WIF IAM grants were validated for preview identity only. Do not assume production principal can impersonate either writer or reader.

## Mandatory gates before merging or promoting
1. Choose and document the exact production Admin Login and Inbox URLs. Use the established www.thesmartysolution.com origin unless a verified routing requirement dictates otherwise. No production URL change by inference.
2. Refactor sameOrigin() to an explicit allowlist of approved exact origins keyed to deployment environment, with origin and Sec-Fetch-Site checks. Never trust arbitrary Host or forwarded headers. Keep CSRF and secure host-only cookie enforcement. Add tests for approved preview and production, unapproved origins, missing origin on state changes, and cross-site requests.
3. Confirm Google OAuth client authorized JavaScript origin includes the chosen production origin. Preserve all existing entries. Do not change OAuth client without an evidence-backed requirement.
4. Confirm exact Vercel production WIF OIDC subject and provider attribute conditions from the running configuration; verify that the reader and dedicated session writer have the minimum required production impersonation binding. Existing preview bindings are not evidence of production trust. Any new IAM binding must be reviewed, applied and independently read back. No keys or secrets in Vercel.
5. Verify existing custom-role permissions and database resource conditions. Firestore IAM does not automatically isolate a collection; enforce allowed collection names in application code. Keep the webhook create-only identity separate.
6. Configure only verified nonsecret production env vars after IAM and code readiness. Keep Research Center, Data Center and webhook configuration unchanged.
7. Run all six GitHub Actions suites plus new origin/session regression tests. Require owner-authenticated live production session create/readback, WhatsApp test-record display, refresh, logout, unauthorized denial and evidence of no sending.
8. Document rollback: restore prior production Vercel deployment and previous environment bindings, verify Data/Research/website remain operational. Rollback does not undo a WhatsApp phone-number migration, so number migration is separately prohibited here.
9. Do not merge PR #118. PR #119 remains draft until gates pass.

## Out of scope
- Meta app publication, migration/deregistration of +357 99 810330, customer messaging, paid services, expanded HubSpot privileges.
- No further Cloud Shell changes solely for the previously closed metadata warning.

## Evidence status
The preview was accepted based on owner testing; no independently captured production Google token or Firestore trace exists. Live expiry and pagination across multiple records remain untested; automated tests cover these behaviors. Do not claim production readiness from preview success.
