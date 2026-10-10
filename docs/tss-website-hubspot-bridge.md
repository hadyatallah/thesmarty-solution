# TSS website to HubSpot CRM bridge (staged, not enabled)

STATUS: Bridge code exists on Production main, but HubSpot write synchronization remains DISABLED and has no live-write acceptance. This G4 hardening candidate is PREVIEW ONLY, on a separate Draft PR. The existing website, Apps Script, Master Workbook, Outlook and CRM continue unchanged.

## Source and operating contract

- The public form still submits to the existing Apps Script endpoint in script.js.
- Apps Script remains the authoritative processor and writes Companies, Contacts, Tasks and Activity to TSS CRM - Master Workbook.
- This isolated Vercel bridge reads Sheets through the official Google Sheets read-only API, using a service account with Viewer access to the workbook only.
- Only open Tasks with IDs like TSK-WEB-2026-0031, Source: Website, an original enquiry ID and timestamp after an explicit cutoff are eligible.
- Internal QA records (including COM-8ee64d5e and TSS-WEB-HS-QA), WhatsApp enquiries, completed tasks and older tasks remain excluded. **Otherwise eligible website enquiries with missing or ambiguous source Contacts block the entire batch** with review-needed status; they are never silently counted as ignored and never permit partial HubSpot writes.
- HubSpot company matching uses the original tss_company_id; contact matching uses an exact email address.
- The bridge never overwrites imported CRM properties. It creates an internal TODO task linked to the company and contact for each eligible new enquiry, with the original source timestamp and a due time of 17:00 Asia/Nicosia.
- The bridge does not send customers email, enroll marketing contacts, modify deals or change deal stages.
- A deterministic task subject and exact TSS Task ID marker protect ordinary serial retries. Collisions and partial failures halt processing. Even valid exact task correlation is not a substitute for provider-ID parity or complete association readback.
- G4 hardening adds a **fail-closed exclusive-write-lease requirement** before any HubSpot create call. The production handler deliberately supplies NO lease provider. Therefore enabling the existing write flag alone cannot create HubSpot records; an independently accepted durable cross-instance lease adapter is mandatory before live-write acceptance.

## Server-only environment configuration

Set the following in the existing Vercel project through restricted Production settings (never in this repository or a chat):

1. TSS_GOOGLE_SERVICE_ACCOUNT_JSON: Google Cloud service account JSON. Grant that service account VIEWER access only to the single TSS Master Workbook; its requested OAuth scope is spreadsheets.readonly.
2. TSS_MASTER_SPREADSHEET_ID: ID of the existing TSS Master Workbook.
3. TSS_HUBSPOT_SERVICE_KEY: HubSpot Settings > Integrations > Service Keys, scoped to Contacts, Companies, Tasks and required associations.
4. TSS_HUBSPOT_SYNC_START_AT: explicitly approved ISO8601 cutoff; prevents legacy data backfill.
5. TSS_HUBSPOT_OWNER_ID: the already verified owner ID for internal CRM tasks.
6. TSS_SYNC_RUN_SECRET: independent high-entropy secret for manual POST requests.

No credentials are presently configured for this bridge, and the production write flag TSS_HUBSPOT_SYNC_ENABLED defaults to disabled.

NEVER paste Service Keys, service account JSON, tokens or credentials in ChatGPT, code, GitHub or public site JavaScript.

## Safe acceptance sequence

1. Complete review and offline tests on this PR.
2. Provision only the narrow permissions above and leave the production write flag disabled.
3. Perform an authenticated POST to /api/tss-hubspot-enquiry-sync with header Authorization: Bearer <TSS_SYNC_RUN_SECRET> and JSON body {"mode":"preview"}. It reads the workbook and HubSpot but performs no writes.
4. Review the report and inspect source matches. The bridge considers at most ten new enquiries per call and stops at conflicts.
5. Following further explicit approval for live writes, set TSS_HUBSPOT_SYNC_ENABLED=true and invoke POST JSON {"mode":"commit"}. Independently validate the exact HubSpot records and associations.
6. A Vercel Hobby cron now runs once per day at **07:00 UTC** (subject to Hobby's within-the-hour scheduling variance). While TSS_HUBSPOT_SYNC_ENABLED=false, its authenticated GET is **read-only** and verifies the Google Sheets service account, the HubSpot Service Key, QA record associations and three association labels. It logs a sanitized status, not customer contents or credentials.
7. No unattended HubSpot writes are authorized until the owner separately approves switching TSS_HUBSPOT_SYNC_ENABLED=true after a successful read-only test and idempotency review. Set it to false to prevent writes at any time.
7. Disable instantly by setting TSS_HUBSPOT_SYNC_ENABLED=false if acceptance fails. The website and original CRM remain fully usable.

## Known limitations and remaining gates

- The owner has not provisioned the required server credentials, and real HubSpot API integration has not yet been accepted.
- A protected read-only Vercel Cron is scheduled to validate connectivity on the Hobby plan. It does not write records with the switch OFF; no higher frequency or paid services are enabled.
- Subject + task marker provide serial replay checking but not atomic exactly-once behavior across simultaneous invocations. G4 hardening now prevents ALL create calls when the server has no exclusive write lease. Preview tests use an **in-memory test-only lease**, which is NOT a deployable cross-instance lock and does NOT prove exactly-once semantics. Implement and verify a durable cross-instance lease using existing owner-approved infrastructure before authorizing any `commit` path. Do not use paid products or extend credential permissions without approval.
- The October 9 QA reference TSS-2026-0030 is deliberately excluded. Its original Master Workbook task has already been closed and remains QA evidence.
- Consent to receive marketing must never be inferred from enquiry submissions or API-created contacts.
- Name collisions and unrelated existing contact/company associations require manual review rather than silent merges. A contact marked `Personal - Android Import`, missing its exact source `tss_contact_id`, or mapped to a different `tss_contact_id` must never be silently reused for a TSS commercial enquiry.
- Validate the latest HubSpot association API permissions and contact creation behavior using internal QA before claiming Production acceptance.

## G4/G5 acceptance boundary — 9 October 2026

- PR #64 is an isolated, unmerged hardening Preview. Passing offline tests and a READY Vercel Preview do not establish authenticated browser acceptance or real HubSpot task-write acceptance.
- Provider-enforced exactly-once for website enquiry Tasks remains **unverified**. The current HubSpot read-only property inspection did not establish an existing provider-enforced unique source task ID. Subject matching is not an atomic uniqueness guarantee. The in-memory mock lease in tests is not a deployable shared lease. Use only an owner-approved durable lock or verified provider-enforced equivalent; do not add a paid storage service or grant new privileges without separate approval.
- The latest code fails closed when an otherwise eligible website Task lacks a uniquely matched Master Workbook source Contact, and refuses to reuse existing HubSpot Contacts lacking an exact matching `tss_contact_id`.
- **G5 structural limitation:** This bridge currently reads new website Tasks from the legacy Master Workbook after the existing Apps Script website backend writes them there. Even a G4-ready bridge would NOT by itself achieve G5's final legacy-commercial-tabs-read-only policy. G5 needs a separately accepted direct HubSpot intake or independently governed transit ledger before retiring legacy commercial writes.
- Do not enable HubSpot write sync, merge, deploy to Production, change OAuth, touch Outlook/Gmail cursors or contact customers as part of this Preview.
