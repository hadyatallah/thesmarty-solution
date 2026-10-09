# TSS website to HubSpot CRM bridge (staged, not enabled)

STATUS: Prepared on a draft GitHub PR. This is NOT deployed or production accepted. The existing website, Apps Script, Master Workbook, Outlook and CRM continue unchanged.

## Source and operating contract

- The public form still submits to the existing Apps Script endpoint in script.js.
- Apps Script remains the authoritative processor and writes Companies, Contacts, Tasks and Activity to TSS CRM - Master Workbook.
- This isolated Vercel bridge reads Sheets through the official Google Sheets read-only API, using a service account with Viewer access to the workbook only.
- Only open Tasks with IDs like TSK-WEB-2026-0031, Source: Website, an original enquiry ID and timestamp after an explicit cutoff are eligible.
- Internal QA records (including COM-8ee64d5e and TSS-WEB-HS-QA), WhatsApp enquiries, completed tasks, older tasks and ambiguous matches are skipped or flagged for review.
- HubSpot company matching uses the original tss_company_id; contact matching uses an exact email address.
- The bridge never overwrites imported CRM properties. It creates an internal TODO task linked to the company and contact for each eligible new enquiry, with the original source timestamp and a due time of 17:00 Asia/Nicosia.
- The bridge does not send customers email, enroll marketing contacts, modify deals or change deal stages.
- A deterministic task subject and exact TSS Task ID marker protect ordinary serial retries. Collisions and partial failures halt processing.

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
6. Add scheduling only after acceptance; this PR adds NO cron job. Vercel Hobby allows once-daily crons; no upgrade is authorized.
7. Disable instantly by setting TSS_HUBSPOT_SYNC_ENABLED=false if acceptance fails. The website and original CRM remain fully usable.

## Known limitations and remaining gates

- The owner has not provisioned the required server credentials, and real HubSpot API integration has not yet been accepted.
- No automatic Production schedule or deployment is authorized by merely opening this PR.
- Subject + task marker provide serial replay checking but not atomic exactly-once behavior across simultaneous invocations. Invoke the endpoint serially only; add a durable lock before allowing concurrent runs.
- The October 9 QA reference TSS-2026-0030 is deliberately excluded. Its original Master Workbook task has already been closed and remains QA evidence.
- Consent to receive marketing must never be inferred from enquiry submissions or API-created contacts.
- Name collisions and unrelated existing contact/company associations require manual review rather than silent merges.
- Validate the latest HubSpot association API permissions and contact creation behavior using internal QA before claiming Production acceptance.
