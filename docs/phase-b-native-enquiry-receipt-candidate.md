# Phase B: native HubSpot enquiry receipts (ISOLATED DRAFT)
Status 2026-10-10: Pure offline receipt/matching code. It cannot fetch submissions or create Contacts, Tickets, Tasks, Companies or Deals. No secrets, OAuth, customer communications or Production changes.

## Source and authority
One native HubSpot General Business Enquiry form GUID d571803e-7777-4f28-94ea-b24df852245c. Kiti is /contact.html?enquiry=kiti with the native form field tss_enquiry_route = Kiti Residential Development Opportunity. Existing website acceptance is preserved. HubSpot portal 149509919 owns commercial information. Data Center Companies.id to HubSpot companies.tss_company_id is a research reference, not authorization for automatic prospect promotion.

## Receipt and association contract
Use ONLY the immutable original provider submission ID from the published form, and key as hubspot-native:<form-guid>:<provider-submission-id>. Preserve source timestamp, page, route and fingerprint. Separate submissions from one Contact remain separate. Fail closed for absent original ID, wrong form, conflicting reused ID, invalid date or missing native Kiti route. A plain General form may have a blank native route and remains General. Keep submitted message bodies in HubSpot, not public logs.

Find exactly one HubSpot Contact by verified email, excluding personal Android-imported contacts and ambiguous identities. Suppression remains a separate control. Output is a read-only plan, never a CRM write. Commercial Ticket pipeline 4209185979 with new/open stage 6206658800; Qualified for Follow-up 6206658803 is CLOSED. Never use Support Pipeline 0, create a Company/Deal from free text or send a customer email.

## B3 still unaccepted
The Ticket tss_enquiry_key property exists but its provider-enforced uniqueness is NOT confirmed. Company tss_company_key is missing. Search-before-create is not an atomic safeguard. Any future writer requires a durable cross-instance reservation in existing approved infrastructure, append-only source receipts, uncertain-outcome holds, replay control and exact Ticket/Contact association readback. Do not reopen deferred G4 Apps Script recovery by default.

HubSpot legacy GET /form-integrations/v1/submissions/forms/{form_guid} is a publicly documented candidate for retrieving source submission IDs, but actual portal permission, raw response, paging and future replacement are NOT verified. HubSpot announced end of support for legacy v1-v3 APIs in September 2027. Avoid a permanent dependency without a migration plan. This draft does not invoke that endpoint.

## Next gates
1. Official read-only source check against already preserved historical QA submissions. Verify immutable ID, source time and native Kiti route, without submitting again.
2. Verify Contact/Ticket permissions, Ticket key uniqueness and notification/workflow side effects before any CRM write.
3. Implement/test durable atomic receipt reservation using approved infrastructure, no new paid services.
4. Obtain separate owner authorization for exact synthetic provider writes and another explicit release approval for Production.
5. Independently read back source, Contact, Ticket, pipeline, association, audit and duplicate/uncertain recovery.
6. Verify active writers, Outlook/Gmail retention, job health and the configured website OpenAI API billing without chargeable calls.

## Offline tests only
Run: node --test tests/tssPhaseBNativeSubmissionReceipts.test.mjs
Run: node --check lib/tssPhaseBNativeSubmissionReceipts.mjs
Passing mocked tests does NOT establish live provider acceptance or concurrency safety.

Register: https://docs.google.com/document/d/1bsqCWq_DzuPFgolE-j1LVcQog0rdgHPzvQFq5FybZnw
Specification: https://docs.google.com/document/d/1-WyBphpAGDAbbc9si-uZG9KTL6xdgmvD54BUH93HbV0
