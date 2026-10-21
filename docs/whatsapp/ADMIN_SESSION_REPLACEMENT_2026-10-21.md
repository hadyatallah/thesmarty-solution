# WhatsApp Admin session replacement

Date: 21 October 2026. Preview only. Not live-accepted.

## Architecture

The existing Admin Google OAuth token client exchanges an email-only access token
with `POST /api/tss-admin-session`. Google tokeninfo is checked server-side for
exact client audience, expiry, verified email and the pinned owner. No new OAuth
scope, client secret or service-account key is introduced.

An opaque 256-bit session cookie is host-only, HttpOnly, Secure, SameSite Strict
and valid for at most 15 minutes. Only its SHA-256 hash is persisted. Session
identity, origin, expiry and hashed CSRF proof are held in the existing Firestore
database in `tss_admin_sessions`. Logout creates an immutable revocation in
`tss_admin_revocations` and reads it back before reporting success. Google OAuth
tokens are discarded after verification and are never saved in Firestore.

Session state uses the existing create-only webhook service identity for immutable
session/tombstone creation and the existing dedicated reader for GET operations.
This does not change the webhook ingestion code or IAM. It is a limited reuse of
the existing writer identity, not a new grant. Live preview must demonstrate both
identities' current WIF and collection permissions. A denial is a blocker requiring
specific IAM approval, never a reason to grant browser users datastore access.

`GET /api/tss-whatsapp-inbox` requires this server session in its deployed wrapper.
The old bearer verifier remains only as a reusable test/reference path in the
library. The deployed route never falls back to it. Firestore message reads use
the dedicated reader, a fixed collection, GET only and at most 30 records per page.

The WhatsApp screen no longer loads Google GIS. It restores the Admin cookie,
supports refresh, pagination, current-loaded-record search/filtering, event details
and copy-only reply drafts. It has no send action or outbound WhatsApp API call.

Data Center and Research Center retain their existing independently enforced
Google Sheets OAuth. They link back to Admin. Migrating their actual data access
to the shared session is deferred until the new mechanism is live-verified.

## Security and operations

- Login POST requires pinned same origin, JSON and a custom request header.
- Logout DELETE requires same origin and a session-bound CSRF value.
- Session status is no-store. No Google token is returned in it.
- A failed authenticated read clears displayed private records.
- Session expiry also clears an open inbox. A stale in-flight response cannot
  restore records after locking.
- Revocation survives server restarts because it is not an in-memory list.
- Session documents expire logically after 15 minutes. Physical deletion/TTL is
  not provisioned and remains a separately approved housekeeping action.
- Preview flags are branch-scoped. Production, Meta and phone registration are
  unchanged. Existing PR #118 remains draft and unmerged.

## Evidence before deployment

70 local tests pass: new session tests, existing WhatsApp suites, Data Center
authentication/model tests, and private workspace navigation tests.
These are synthetic automated tests, not proof of live Google/Firestore access.

The existing stable preview was observed redirecting to Vercel login before the
application executed. This establishes an edge access gate for that browser, not
the root cause of all earlier HTTP 401 reports. Existing adapter unit tests verify
that STS and impersonation produce a reader access token, but live reader results
remain pending owner authentication and provider acceptance.

## Rollback

Point the stable preview alias back to `dpl_58wyp5KxEEsMUWcEwF3GtkRkjfgG`, disable
the replacement branch's session flag, and retain PR #118. No Production change
or data-record rollback is required. Existing session records remain inaccessible
after expiry. No messages are changed, deleted or sent.
