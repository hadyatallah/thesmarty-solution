# Dedicated Admin session writer

Status: application prepared; Google Cloud IAM execution and live acceptance pending.

The owner approved a dedicated keyless `tss-admin-session-writer` identity on
21 October 2026 after live login reached `session_writer_exchange_failed`.
This supersedes reuse of the webhook identity in the earlier session design.

Admin session create/revoke now requires the exact
`TSS_ADMIN_SESSION_WRITER_SERVICE_ACCOUNT_EMAIL` identifier. Missing/wrong
configuration fails before WIF. No fallback to the webhook identity exists.
The dedicated reader remains unchanged. Both identities and collection/document
paths are pinned in the session module. All writes remain immutable POST creates.

## IAM execution

Google Cloud Console returned Site Unavailable in the execution browser. No
Google Cloud connector or authenticated gcloud executable was available.
Consequently, no IAM creation or binding has been claimed or performed here.

Use the one complete script `scripts/tss-admin-session-writer-iam.sh` in existing
Google Cloud Shell. With no arguments it performs read-only preflight. `--apply`
still performs preflight first and requires typing its exact confirmation phrase
before applying the already owner-approved change. `--verify` reads back only.

The script verifies project number, existing APIs, database region, provider
mapping, the exact subject already trusted by the reader, reader role permissions,
project/folder/organization allow bindings and any pre-existing writer/role.
Unknown permissions or conflicting roles stop execution. It never enables APIs,
changes billing, creates keys or gives the Cloud Shell user impersonation.

Proposed custom role: `projects/tss-crm-508908/roles/tssAdminSessionCreator`, with
only `datastore.entities.create`. Project binding is conditioned to
`projects/tss-crm-508908/databases/(default)`.

**Actual IAM scope:** document creation anywhere in the default database. The
two collection limit is application-enforced, not IAM-enforced. The exact Vercel
subject covers the project's preview environment across branches, not one branch.

Each mutation is read back. Repeated apply runs are idempotent. The report records
inherited allow-policy findings and explicitly separates trust configuration from
actual token exchange. Group membership, deny policies and principal access
boundaries remain outside that allow-policy audit. Live WIF/session/readback tests
must establish effective access. Provider, existing reader/webhook policy and
database metadata are compared before/after; they are not intentionally changed.

The sanitized completion report is written to
`tss-admin-session-writer-report.json` in the Cloud Shell working directory.
Do not report IAM PASS without that readback or equivalent live provider evidence.

## Verification

77 local Node tests pass, including the preserved session/Google account/security
cases and new identity-separation/failure tests. Four fake-CLI script tests verify
read-only default, exact grants, independent readback, idempotence, wrong-subject
denial and refusal to overwrite a broader role. These are not live IAM evidence.

No Meta, number, WhatsApp app, HubSpot, Research Center IAM or Production changes.
Live session creation, owner inbox records, refresh and logout remain pending.
