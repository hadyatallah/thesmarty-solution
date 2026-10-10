# G5 Direct HubSpot Intake Candidate

Status: development candidate only. Production cutover is not authorized.

## What changed

- Added `/api/tss-commercial-intake` as a disabled-by-default Vercel route, rewritten through the existing `/api/crm` function to avoid increasing Vercel serverless function count.
- Added `lib/tssG5CommercialIntake.mjs` for direct website enquiry normalization, HubSpot contract verification, dry-run mode and guarded write mode.
- Added offline tests for invalid submissions, duplicate anchors, retries/uncertain provider outcomes and readback failure.

## Current website paths

- Public contact forms still submit to the existing Apps Script endpoint in `script.js`.
- The current Apps Script path records the enquiry into the legacy CRM and may send confirmation email.
- The existing G4 bridge reads website Tasks from the Master Workbook and can dry-run/check HubSpot, but it still depends on Apps Script-created CRM records.
- The G5 candidate bypasses legacy CRM writes, but it is not wired into the browser form and is not enabled.
- The route is isolated by query dispatch inside `/api/crm`; existing CRM and G4 bridge behavior remain unchanged.

## HubSpot safety contract

The direct path is accepted only if HubSpot has unique-value properties available and verified:

| Object | Required unique property | Purpose |
|---|---|---|
| Company | `tss_company_key` | Company duplicate anchor |
| Contact | `tss_contact_key` | Contact duplicate anchor |
| Task | `tss_enquiry_key` | Enquiry receipt and replay anchor |

The route verifies those properties before any write. If the contract is missing, it returns `NOT_CONFIGURED_OR_DISABLED`.

## Limits

- This candidate does not create HubSpot properties. That is a portal configuration change and needs separate approval.
- It does not send customer messages.
- It does not automatically qualify or promote an enquiry. The HubSpot Task body says commercial review only.
- Association creation between the upserted Company, Contact and Task remains an open acceptance item. The initial candidate proves the duplicate anchor first.
- Live HubSpot write acceptance was not performed because the restriction forbids live HubSpot writes.

## Read-only portal check on 2026-10-10

- Connected HubSpot user: `info@thesmartysolution.com`, owner/user ID `100713372`.
- Read/write availability is present for `COMPANY`, `CONTACT` and `TASK`.
- Existing TSS properties found include `tss_company_id`, `tss_contact_id` and `tss_source_system`.
- Required G5 unique properties `tss_company_key`, `tss_contact_key` and `tss_enquiry_key` were not found by read-only property search.
- Therefore the G5 direct route must remain disabled. It is not safe to accept live direct intake until the unique-property contract is configured and verified.

## Acceptance still required

- Verify the three HubSpot properties exist and are unique in the live portal.
- Decide whether HubSpot property creation is acceptable if any property is missing.
- Extend write mode to attach verified associations after the duplicate anchor is proven.
- Run Vercel Preview with `TSS_G5_HUBSPOT_DIRECT_ENABLED=false` first.
- Run one approved internal-only live write only after the property contract and association behavior are verified.
- Only after accepted, update the browser form endpoint in a separate cutover PR.
