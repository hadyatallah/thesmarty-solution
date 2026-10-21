# WhatsApp Admin Inbox: production release package

21 October 2026. Recommendation: **NOT READY for production release** until external gates below are verified. PR #119 stays draft and unmerged; PR #118 stays unmerged. This package authorizes neither release nor phone migration.

## Implementation and security

`approvedOrigin()` selects only an exact, pinned origin using Vercel's server-side `VERCEL_ENV` and requires the configured `TSS_ADMIN_ORIGIN` to match. Preview accepts `https://whatsapp-preview.thesmartysolution.com`; production accepts `https://www.thesmartysolution.com`. Missing, swapped or arbitrary configuration fails closed, including GET session/inbox authentication. Host and forwarded headers never determine the origin. POST/DELETE retain exact Origin, Sec-Fetch-Site and CSRF checks.

Stored session origin must match that environment's approved origin, including on GET inbox reads. A copied valid preview cookie cannot authenticate against production and vice versa, even though session storage is shared. Cookies remain host-only `__Host-tss_admin`, HttpOnly, Secure, SameSite=Strict, Path=/, at most 900 seconds. Durable immutable revocation remains unchanged. Existing preview sessions retain their original valid origin.

Google owner/audience/expiry verification, dedicated reader/writer separation, fixed session/revocation collection allowlist and copy-only reply behavior remain unchanged. No webhook or Data/Research Center browser OAuth implementation changed in this readiness change. Data/Research Center still use their existing Sheets authorization; full migration is deferred.

## Production URLs and OAuth gate

- Admin: https://www.thesmartysolution.com/admin-login/
- Inbox: https://www.thesmartysolution.com/whatsapp-inbox/
- Both are static directory routes present on the release candidate; no new routing rule required.
- Chosen OAuth client: `103840050410-dlhipb15600ot54jk7m6qj0olrbms7i4.apps.googleusercontent.com`.
- Authorized production JavaScript origin must include exactly `https://www.thesmartysolution.com`. Current Console configuration is not accessible in this session, so this is **unverified**, not missing by assumption. No OAuth change made. Existing public/client code is insufficient evidence of Console allowlisting.
- Inbox reuses the Admin session; it introduces no Google sign-in interface.

## Keyless production IAM gate

Expected subject, derived from the verified Vercel team/project and documented subject format:
`owner:tss21:project:thesmarty-solution-agent:environment:production`.

Member:
`principal://iam.googleapis.com/projects/103840050410/locations/global/workloadIdentityPools/vercel-research-center/subject/owner:tss21:project:thesmarty-solution-agent:environment:production`.

Existing provider evidence: issuer `https://oidc.vercel.com/tss21`, mapping `google.subject=assertion.sub`, no attributeCondition. This is prior preview IAM evidence; fresh production policy readback and runtime token exchange remain required.

The controlled script `scripts/tss-admin-production-iam.sh` defaults to read-only preflight. `--apply` first performs the same preflight, prints exact missing bindings, and requires `APPLY TSS PRODUCTION WIF`. It may add only `roles/iam.workloadIdentityUser` for the member above to the existing reader and writer service-account policies. It never creates identities, roles, keys, APIs or project grants, and never changes the pool/provider, webhook, HubSpot or Research identities. Existing unusual trust, broader data permissions, provider conditions or unexpected project/database settings block execution.

Every binding is independently read back; a fresh final snapshot verifies data grants, provider, database configuration and webhook trust unchanged, and verifies reader/writer trust differs only by the approved member. Metadata etag/earliestVersionTime are excluded only from database configuration comparison; updateTime remains protected. Script is idempotent. A partial failure records successful changes and blocks completion. No Cloud Shell user impersonation privileges are granted.

Actual privilege scope: writer `datastore.entities.create` on `(default)`, collection restrictions enforced in application code; reader `datastore.entities.get/list` is project-scoped under existing role. Neither is IAM collection isolation. Direct service-account/public ancestor grants are inspected; groups, deny policies and principal access boundaries are not proven by this audit. Live production token exchange remains unproven until separately approved production execution.

## Vercel configuration manifest

Inspected project `prj_cE3DscdrTYuqHlqILGqIoZrRcaWm`, team `tss21`. No production values changed during this readiness work: IAM verification is a prerequisite.

After IAM/OAuth gates pass, create **production-only, nonsecret plain configuration** for the following absent keys. Independently read back each value. Do not modify existing preview branch overrides.

| Key | Production value |
| --- | --- |
| TSS_ADMIN_SESSION_ENABLED | true |
| TSS_ADMIN_ORIGIN | https://www.thesmartysolution.com |
| TSS_ADMIN_SESSION_WRITER_SERVICE_ACCOUNT_EMAIL | tss-admin-session-writer@tss-crm-508908.iam.gserviceaccount.com |
| TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL | tss-whatsapp-inbox-reader@tss-crm-508908.iam.gserviceaccount.com |
| TSS_WHATSAPP_READER_AUTH_READY | true |
| TSS_WHATSAPP_INBOX_ENABLED | true |
| TSS_WHATSAPP_OWNER_EMAIL | thesmartysolution@gmail.com |
| TSS_WHATSAPP_GOOGLE_CLIENT_ID | 103840050410-dlhipb15600ot54jk7m6qj0olrbms7i4.apps.googleusercontent.com |

Existing effective production values already match and must be preserved:
`GCP_PROJECT_NUMBER=103840050410`, `GCP_WORKLOAD_IDENTITY_POOL_ID=vercel-research-center`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=vercel`, `TSS_WHATSAPP_FIRESTORE_PARENT=projects/tss-crm-508908/databases/(default)/documents`. Vercel provides `VERCEL_ENV`; do not set or override it manually. No token, key or service-account credential is added.

## Automated verification

Local: 78 Node tests pass, 8 existing writer-IAM tests pass, 7 production-IAM tests pass. Covers both origins, hostile Host/forwarded substitutions, missing/wrong origin, cross-site mutations, bidirectional cookie isolation, expiry, owner rejection, CSRF, durable logout, reader/writer separation, WIF, Firestore failures, inbox pages/refresh, no sending, webhook HMAC/replay and Data Center behavior. New tests are included in the existing inbox Actions workflow with both IAM script checks; six relevant Actions suites must pass on the exact final candidate. CI IDs are recorded in the release evidence/PR after execution, never inferred from older commits.

## Deployment sequence (separate release approval required)

1. Obtain sanitized production IAM report with `IAM_READBACK_PASS`; verify OAuth production origin readback. Configure/read back production manifest only then.
2. Require all six relevant CI suites passing on exact PR head. Recheck head lease, reviewed diff, base and live deployment. Current PR base equals production release baseline `7a7fa6b1958bcfea4a02d082e26937438eff6a66`. Do not merge into another production branch by inference.
3. Obtain explicit approval for exact commit and production deployment. Avoid a merge that auto-deploys before approval. Stage a build using production environment in the existing project, with domain assignment skipped. This is a production deployment and is not authorized by readiness work alone.
4. Verify build/runtime configuration and unauthenticated API denial on staged build. Exact production-origin login must run on the approved www hostname; do not broaden origin allowlist for random deployment URLs. Do not promote a preview as evidence of production credentials.
5. Promote the approved production build, then perform owner-authenticated smoke checks below. Keep rollback ready throughout.
6. Merge only the separately approved PR/head through the agreed release branch procedure. Do not merge PR #118.

## Production smoke gates

Owner signs in on Android at the Admin URL and sees all three workspaces. Record successful server identity verification, writer WIF exchange/session create, independent reader readback and cookie issuance without logging tokens/cookies/CSRF. Inbox opens without a second login, returns successful authenticated API status and existing synthetic event. Refresh works. Logout durably denies reused session and re-entry succeeds. Anonymous/private browser receives 401 for both private APIs; unauthorized Google account is rejected. Check Data/Research actual Sheets flows and public pages. Assert there is no send action/Graph API request. Multi-page live acceptance remains conditional on enough existing records; no customer messages or fixtures should be generated to force it. Preview owner acceptance is not production acceptance.

## Rollback and risk

Current production rollback candidate: `dpl_6EjwQmZ7WLkPW2t5fG66ikijeb8o`, release commit `7a7fa6b1958bcfea4a02d082e26937438eff6a66`, inspected READY and rollback eligible. Recheck immediately before release. On failure restore this deployment via Vercel rollback, verify all existing domains still target it and public/Data/Research/webhook behavior is healthy. Rollback can disable automatic domain assignment; explicitly review before any subsequent promotion.

Restore/remove only the eight new production config entries above to their prior absent state. Preserve all pre-existing WIF, webhook and Research settings. Old deployment behavior is recovered without Firestore migration or document deletion. Immutable new session/revocation records can expire in place; do not delete business data. A separate approved cleanup may remove only the newly added production reader/writer subject if required; do not remove existing preview trust. No IAM rollback is required to restore old application behavior because neither old code path uses these dedicated credentials.

Risk: shared Firestore database and project-wide reader scope persist from accepted architecture; application allowlists and environment-origin checks enforce record access. Provider/Console access blocks independent production IAM/OAuth verification here. Live production exchange and data acceptance cannot precede separately approved deployment. No Meta configuration, WhatsApp Business number/App, HubSpot data, APIs, billing or outbound messages changed.

## Remaining owner-controlled evidence

One controlled Cloud Shell invocation can perform IAM preflight, exact confirmation, apply and readback. Return its sanitized JSON report. OAuth Console needs one read-only confirmation that the existing client includes the production www origin; do not add anything unless absent. After these gates, production config and final approval preparation can continue. No repeated preview acceptance or closed metadata diagnostics are needed.
