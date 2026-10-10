# G5 Direct HubSpot Intake Candidate

Status: development candidate only. Production cutover is not authorized.

## What changed

- Added `/api/tss-commercial-intake` as a disabled-by-default Vercel route, rewritten through the existing `/api/crm` function to avoid increasing Vercel serverless function count.
- Added `lib/tssG5CommercialIntake.mjs` for direct website enquiry normalization, HubSpot contract verification, dry-run mode, guarded write mode, association creation and independent readback.
- Added offline tests for invalid submissions, duplicate anchors, retries/uncertain provider outcomes, partial writes, association failure, readback failure and replay behavior.

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

HubSpot's published validation rules say unique-value properties are configured during property creation, are limited to ten unique-value properties per object, and are not supported for every object family. The current official documentation does not list `TASK` as unsupported, but this portal's exact task-property create UI/API behavior still needs owner-approved verification before any live property change.

Existing `tss_company_id` and `tss_contact_id` cannot safely serve this G5 requirement because they are the legacy CRM import identity fields and the read-only connector did not expose evidence that they are enforced unique-value properties. `tss_source_system` is categorization metadata, not an identity key.

## Limits

- This candidate does not create HubSpot properties. That is a portal configuration change and needs separate approval.
- It does not send customer messages.
- It does not automatically qualify or promote an enquiry. The HubSpot Task body says commercial review only.
- The write path now creates Contact -> Company, Task -> Company and Task -> Contact default associations after unique-property upserts, then independently reads back the records and both Task associations before reporting success.
- Live HubSpot write acceptance was not performed because the restriction forbids live HubSpot writes.

## Read-only portal check on 2026-10-10

- Connected HubSpot user: `info@thesmartysolution.com`, owner/user ID `100713372`.
- Read/write availability is present for `COMPANY`, `CONTACT` and `TASK`.
- Existing TSS properties found include `tss_company_id`, `tss_contact_id` and `tss_source_system`.
- Required G5 unique properties `tss_company_key`, `tss_contact_key` and `tss_enquiry_key` were not found by read-only property search.
- Exact property lookups returned `propertiesNotFound` for all three required G5 key properties. Existing `tss_company_id`, `tss_contact_id`, `tss_source_system`, `domain`, `name`, `email`, `hs_task_subject`, `hs_task_body` and `hubspot_owner_id` were readable where expected.
- Therefore the G5 direct route must remain disabled. It is not safe to accept live direct intake until the unique-property contract is configured and verified.

## Proposed HubSpot property changes for owner approval

Do not create these until separately approved.

| Object | Internal name | Label | Field type | Rule |
|---|---|---|---|---|
| Company | `tss_company_key` | TSS G5 Company Key | Single-line text | Require unique values |
| Contact | `tss_contact_key` | TSS G5 Contact Key | Single-line text | Require unique values |
| Task | `tss_enquiry_key` | TSS G5 Enquiry Key | Single-line text | Require unique values |

If HubSpot rejects unique-value enforcement for `TASK`, the smallest safe alternative is not search-before-create. It is a separate server-owned reservation ledger in existing approved infrastructure, with an atomic insert/reservation step before the HubSpot task write and a held-for-review state for uncertain HubSpot outcomes. That alternative is not activated in this PR.

## Acceptance still required

- Verify the three HubSpot properties exist and have unique-value enforcement in the live portal.
- Approve and create missing unique properties, or approve the atomic reservation-ledger alternative if `TASK` uniqueness is unavailable.
- Run Vercel Preview with `TSS_G5_HUBSPOT_DIRECT_ENABLED=false` first.
- Run one approved internal-only live write only after the property contract and association behavior are verified.
- Only after accepted, update the browser form endpoint in a separate cutover PR.
