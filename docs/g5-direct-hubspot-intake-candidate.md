# G5 Direct HubSpot Intake Candidate — Option 1: Ticket as Enquiry Review Item

**Status:** owner-approved **design direction**, staged Draft PR #65 only. Production cutover, HubSpot configuration changes and live CRM writes are NOT authorized by this code change.

## Owner decision (10 October 2026)

Use exactly one uniquely keyed HubSpot **Ticket** as the durable website-enquiry receipt **and** the human-review work item. Do **not** automatically create a separate HubSpot Task. Tasks may be created later by an authorized person for actual follow-up.

The original Task custom unique-property contract was blocked in HubSpot portal settings. Do not retry creating `tasks.tss_enquiry_key` or downgrade to search-before-create. The Ticket design remains conditional on a supported account-level Ticket unique property and dedicated commercial Ticket pipeline.

## Staged implementation

- `/api/tss-commercial-intake` is routed through `/api/crm` to respect the current Vercel serverless function count.
- Input normalization, restricted source validation, deterministic Company/Contact/Enquiry keys, server-side authorization and disabled-by-default mode remain in place.
- The G5 candidate performs no Google Sheets commercial writes or customer communications.
- **Property contract:** `companies.tss_company_key`, `contacts.tss_contact_key`, `tickets.tss_enquiry_key` must exist as single-line text properties with HubSpot-enforced unique values. All three remain uncreated/unverified in the live account.
- **Pipeline contract:** `TSS_G5_TICKET_PIPELINE_ID` and `TSS_G5_TICKET_NEW_STAGE_ID` must identify an independently verified, open stage in a dedicated Ticket pipeline. The default Support Pipeline (`0`) is explicitly prohibited. No dedicated commercial Ticket pipeline has been verified or created.
- The route checks both property and pipeline contracts before making any provider write.
- With writes enabled after separate approval, the Ticket is created first with its deterministic unique key and immutable request fingerprint. A duplicate/uncertain create response can be reconciled only through exact-key readback, including pipeline and payload fingerprint; uncertain unmatched outcomes remain held.
- **No Ticket upsert on replay:** a preexisting Ticket's reviewer-edited stage, subject and content cannot be reset by replaying the form.
- Company and Contact are upserted using their own provider-enforced unique properties, then Contact → Company, Ticket → Company and Ticket → Contact associations are made and independently read back.
- Missing IDs, ambiguous readback, mismatched fingerprints, incorrect pipeline, failed associations or uncertain provider responses fail closed for human review.
- No automatic lead qualification, marketing enrollment or customer message is permitted. Ticket status is governed by human review.

## Current verified HubSpot account baseline

Portal/account: `149509919`, connected user `info@thesmartysolution.com`.

Read/write object availability: Company, Contact, Ticket, Task.

Ticket pipelines discovered: only the default **Support Pipeline**, id `0`, stages New (`1`), Waiting on contact (`2`), Waiting on us (`3`), Closed (`4`).

Ticket properties `subject`, `content`, `hs_pipeline`, `hs_pipeline_stage` and `tss_source_system` are readable. `tss_enquiry_key` is not found. The account reports `accountType=STANDARD`; this is NOT sufficient evidence of a Free/Starter/Pro subscription tier, custom pipeline allowance, property-definition permissions, or available unique-key capacity.

Per HubSpot's published help, custom Ticket pipelines generally require Starter or higher under the relevant pricing model. No subscription upgrade, new pipeline or property creation is authorized or performed by this development PR.

## Next acceptance gates

1. Verify current HubSpot plan, available custom pipeline entitlement, property-definition permissions, and absence of existing workflow/notification rules that would send messages on Ticket creation or stage changes.
2. If a dedicated Ticket pipeline and three native unique-property definitions can be configured without new cost, present the exact pipeline stages and three property definitions for the appropriate **configuration approval**. Do not reuse or rename the default Support Pipeline.
3. Independently verify all live properties' `hasUniqueValue=true`, exact names/types and Ticket pipeline stage IDs.
4. Run complete offline CI, Preview disabled/dry-run tests, replay/concurrency/unknown-result tests.
5. Before any provider record or association write, request **separate explicit internal-only QA approval** identifying exact synthetic records, rollback/reconciliation and zero outbound communications.
6. Browser form cutover remains a separate PR and Production release gate after authenticated end-to-end acceptance.

**Do not merge PR #65, activate G5 direct intake, change Production, change legacy Apps Script, reset Gmail/Outlook cursors, send messages, create HubSpot records or purchase software.** Preserve G3/Outlook/PR63 acceptance and G4 deferred workstream.


## G5-2 Read-only Account Entitlement Check — 10 October 2026

**Verified via the owner-connected HubSpot account:** account \`149509919\`, \`info@thesmartysolution.com\`, company/contact/ticket record read/write available. HubSpot account metadata reports \`accountType=STANDARD\`, but does not disclose a Free, Starter, Professional or Enterprise subscription tier or the available remaining pipeline count.

- Ticket pipeline list: one **Support Pipeline**, id \`0\`; stages \`1\` New, \`2\` Waiting on contact, \`3\` Waiting on us, \`4\` Closed.
- Existing Ticket records: \`4\` out of \`4\` live Ticket search results are on Support Pipeline, including \`2\` in New and \`2\` Closed. These records must be preserved; do not alter or reuse the Support Pipeline.
- Property lookup: \`tickets.tss_enquiry_key\` is missing; ticket \`subject\`, \`content\`, \`hs_pipeline\`, \`hs_pipeline_stage\`, and \`tss_source_system\` are present.
- Published HubSpot documentation allows up to ten unique-value properties per supported object and expressly includes **Tickets** as objects eligible to use a unique custom property for imports. These documentation facts are not evidence that \`tss_enquiry_key\` is provisioned or that the connected account has property-setting permissions.
- HubSpot documentation for *Set up and manage object pipelines* identifies a streamlined/simplified pipeline-limit model with Free: **0** custom pipelines; Starter: **15**; Professional: **100**; Enterprise: **350**. Account-specific entitlement must be checked in the **official billing/plan screen or Data Management > Data Model > Limits > Pipelines**. Do not infer the tier from \`STANDARD\` or create/upgrade a plan.
- The connected HubSpot CRM tool cannot create property definitions, create pipelines, read billing entitlements, or enumerate workflows. **Support-ticket automation or notification suppression has NOT been verified.**

### Conditional configuration proposal — NOT YET AUTHORIZED

After confirming a dedicated Ticket pipeline is available **without new fees or plan upgrades**, and after ruling out unwanted automations/outbound customer communication, prepare the precise HubSpot configuration for approval:

| Object | Unique single-line text internal name | Proposed label |
| --- | --- | --- |
| Company | \`tss_company_key\` | TSS G5 Company Key |
| Contact | \`tss_contact_key\` | TSS G5 Contact Key |
| Ticket | \`tss_enquiry_key\` | TSS G5 Enquiry Key |

All three must have enforced \`hasUniqueValue=true\` at creation and be independently read back with the intended internal names and field types. The prior conditional approval named **Task**, not Ticket. Do **not** silently reuse it as authorization for creating a Ticket property.

Proposed dedicated Ticket pipeline: **TSS Commercial Enquiries**.

| Stage label | Intent | Open/closed |
| --- | --- | --- |
| New Enquiry | Received; awaiting human review | OPEN |
| Under Review | Human validation in progress | OPEN |
| Awaiting Information | Awaiting additional details | OPEN |
| Qualified for Follow-up | Human approved commercial follow-up | CLOSED |
| Closed - Not Proceeding | Rejected, withdrawn or not suitable | CLOSED |

These are **suggested labels**, not existing IDs; actual IDs must be read from HubSpot after any separately approved creation. No automatic customer emails, qualification workflow, task creation, support SLA, marketing enrollment, or assignment notifications should be enabled by this configuration.

**Execution limit:** no pipeline/property creation until entitlement, permissions and automation checks succeed and scoped configuration approval is recorded. If no dedicated commercial pipeline is possible without extra cost, stop Option 1 live activation and propose a no-cost alternative; do not use the default Support Pipeline or a nonunique search-before-create strategy.

References: https://knowledge.hubspot.com/object-settings/set-up-and-customize-pipelines and https://knowledge.hubspot.com/import-and-export/import-objects and https://knowledge.hubspot.com/properties/set-validation-rules-for-properties.
