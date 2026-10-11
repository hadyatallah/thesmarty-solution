# TSS custom CRM retirement — native HubSpot website cutover

Decision (10 October 2026): preserve the Google Sheets Master Workbook and the Data Center research/evidence Preview; retire the original TSS custom CRM; retain HubSpot as the commercial CRM and ChatGPT as the primary management interface. No second CRM.

## Verified before any production change
- Current Production-source `contact.html` is a simple TSS contact form with name, email, optional company and phone, country, timing, message, required privacy acknowledgment, and optional unchecked marketing consent. Its `interest` is currently a hidden field `Commercial Review`. **It currently has no visible Kiti dropdown.**
- `kiti-enquiry.html` redirects to `contact.html`. Do not recreate a separate Kiti form.
- Current `script.js` posts website enquiries to the legacy Apps Script endpoint via `TSS_FORM_ENDPOINT`, and its client has a processing/uncertain-outcome guard. `anti-spam.js` also depends on the form markers and events.
- HubSpot portal 149509919 has a published native `TSS General Business Enquiry` form, form GUID `d571803e-7777-4f28-94ea-b24df852245c`, with one recorded internal QA submission at readback. The ordinary connected HubSpot tool can read metadata, **not its exact field/step/consent settings**.
- Historical native form implementation was reverted from Production when the updated-editor embed exposed an internal `TSS Enquiry Route` step and `Next` button rather than a simple contact form. Do not reintroduce the known-broken embed.
- `vercel.json` configures a daily `/api/tss-hubspot-enquiry-sync` cron, rewritten through `/api/crm`; `api/crm.js` connects to the legacy CRM Apps Script backend. Some Outlook endpoints call CRM-session verification. Do not delete these while dependencies remain.
- Neither current HubSpot form metadata nor existing QA Contact conversion counts establish native form -> commercial Ticket creation or single-event idempotency. Do not claim these are accepted.

## Owner's intended final behavior
1. One simple website Contact Us form, mobile usable, without internal technical labels or a multi-step routing screen. One enquiry-type selection should include `Kiti Residential Development Opportunity` only if the owner retains that choice; no separate Kiti form.
2. Accepted submission lands **directly** in HubSpot as an original HubSpot form submission associated with the right Contact, preserving source and enquiry route. No cross-sourcing through the legacy CRM or Google Apps Script.
3. Clear privacy acknowledgment, optional marketing permission default OFF; no unauthorized marketing enrollment, auto-outreach, Company creation, or Deal creation.
4. Inform the visitor only after HubSpot confirms the submission. Never blindly retry an uncertain write. Internal owner notification/follow-up behavior must be verified, not assumed.
5. Existing website, Outlook email, WhatsApp and Google Sheets research remain available throughout.

## Cutover order and stop checks
1. In **owner-authenticated official HubSpot Forms editor**, inspect the published General form's exact field schema, privacy setup, route options, notifications and page steps. Correct the native form to a **single-page simple layout** before embedding. The connected HubSpot read tool alone cannot make this edit. Do not add a second active form.
2. Stage only the approved native embed on a protected Vercel Preview. Remove or disable the legacy website submit handler on that route **only when** native capture is the sole visible path. Avoid double-submission and do not alter other site pages.
3. Read-only preview acceptance on mobile and desktop: one form, no `Next` or internal `TSS Enquiry Route` label, correct Kiti selection when chosen, all required fields, clear privacy choice, optional marketing unchecked, no duplicate legacy fallback visible.
4. Run an explicitly scoped **internal-only** provider QA submission for General and Kiti, once each; do not submit real customer data or blindly retry. Confirm native form submission(s), route, Contact association, absence of unintended marketing/subscription, and correct internal owner notification. If uncertain, stop and reconcile.
5. Only after independent readback, merge and deploy the narrowly scoped website change. Verify Production, HTTP form delivery, mobile, SEO/public pages, and rollback. Then remove the legacy website Apps Script form path.
6. Separately prove Outlook no longer needs `verifyCrmSession`; then retire the legacy CRM gateway, cron, old Apps Script web apps/triggers and unused credentials in a separate reviewed cutover. Preserve historical evidence and all company IDs.

## Gate status, 10 October 2026
**PROVIDER FORM CORRECTION / ACCEPTANCE OPEN.** The exact current HubSpot form field layout and admin controls are not accessible to the connected read-only tool. Production form remains on its existing path until the provider configuration and Preview test are accepted. Draft PR #74 is not cleared to merge. No browser submission, CRM record write, Apps Script, credential, Vercel Production, or paid-tool action is authorized by this document.

## Preservation
Verified Google Drive copies, made and reopened before cleanup:
- Master (21 tabs): https://docs.google.com/spreadsheets/d/1XdoUnHmuigcO0L4O0_NssultnQOzx1Qxsg-XjZhts1Q/edit
- Data Center Preview (30 tabs): https://docs.google.com/spreadsheets/d/10XZutSMt75LWv1DaMXGPg0uLlvqriCVNbwwH4xhx6J4/edit

Existing owner-authorized native form and CRM retirement evidence:
- Current authority: https://docs.google.com/document/d/1bsqCWq_DzuPFgolE-j1LVcQog0rdgHPzvQFq5FybZnw
- Staged retirement: https://github.com/hadyatallah/thesmarty-solution/pull/74
