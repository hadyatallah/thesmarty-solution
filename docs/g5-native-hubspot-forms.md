# TSS | G5 Native HubSpot Forms — Staged Alternative

**Owner decision:** Use **native HubSpot Forms** on the TSS website rather than parsing notification emails into CRM records or activating the blocked direct Company/Contact/Ticket intake in PR #65.

**Status:** Draft Preview scaffolding only. The two native forms have not been created/published in HubSpot and their embed IDs are not yet known. No Production cutover, CRM record writes, provider configuration changes, source Apps Script edits, or subscription upgrades have been authorized or executed.

## Existing paths and ownership

- The public TSS website currently uses `contact.html` and `kiti-enquiry.html` forms with the legacy Apps Script submission handler in `script.js`. These must remain live until formally switched.
- Native form submissions should go directly from the browser to **HubSpot Forms**, not first through the legacy Google Apps Script CRM workbook and not by parsing notification emails.
- HubSpot Forms will create/update **Contact** data and store a form submission. They do **not** automatically guarantee a unique Company, associated Company record, or a commercial Ticket in this starter configuration.
- Avoid `tss_company_key` dependency for this initial native-forms path. Keep G5 direct intake PR #65 draft/unmerged and disabled. Continue existing HubSpot support escalation for that property independently.
- Do not enable automatic Contact→Company creation/matching through a Company-object field until exact record matching, duplicates and existing 3,046 Company identities have been reconciled.

## HubSpot configuration to perform through its authenticated official Forms UI

Create **two independent native forms in HubSpot's updated form editor**, so the complex privacy-sensitive opportunity enquiry is not mixed with the general business-contact funnel:

1. **TSS General Business Enquiry** for `contact.html`.
2. **TSS Kiti Expression of Interest** for `kiti-enquiry.html`.

Do not submit synthetic enquiries until the test has been separately approved. HubSpot's connected ChatGPT plugin has FORM **read AVAILABLE / write NOT_AVAILABLE**; it cannot create forms. Obtain the exact published **form ID** and the **official embed code/host/region** from HubSpot after creation. No assumed form ID or fake URL is acceptable.

### Field mapping and data handling

| Information | Recommended destination | Notes |
| --- | --- | --- |
| Email (required) | Contact `email` | Primary Contact identity. Existing Contact matching must be reviewed. |
| First/last name | Contact `firstname`, `lastname` | Native editor may require splitting existing full-name field. |
| Organisation (optional for Kiti) | Contact `company` | **Contact free-text company name**, not the Company object. Confirm no Company auto-creation. |
| Phone | Contact `phone` | Required for Kiti only, according to current page. |
| Enquiry message | Contact `message` or specifically created form-only field | HubSpot's existing Contact `message` property is present. Multiple submissions may change this latest-value field; preserve per-submission history. |
| Enquiry route | Form name or carefully scoped Contact custom property | Preserve general service route and distinct Kiti source. Do not auto-qualify. |
| Opportunity background/profile, structure, timing/capital range | Explicit native fields on Kiti form | Do not collect identity documents, banking details or private project files. |
| Privacy processing acknowledgement | HubSpot notice and appropriate processing consent | Mandatory, link `privacy.html`. Do not conflate with optional marketing permission. |
| Marketing opt-in | HubSpot subscription/consent field only when positively checked | **Unchecked by default**. Do not enroll marketing contacts by default. |

Existing general form has additional route-specific fields. Inventory before cutover: growth_goal, growth_market, growth_challenge, entry_market, entry_need, entry_activity, connection_type, connection_objective, opportunity_type, opportunity_stage, opportunity_objective, systems_problem, systems_current, systems_users, review_objective, kiti_context, company_website, country, timing. Either map these explicitly or formally accept a pared-down replacement; do not silently discard a business-critical field.

Existing Kiti form has profile, structure, message, timing, capital, source_opportunity and privacy_consent. Existing Kiti privacy notice and confidentiality/disclaimer remain mandatory.

### Native form guardrails

- Source is **HubSpot Forms embed**, not HubSpot non-HubSpot-form auto capture, which may double-capture the same legacy submission if left active.
- In Marketing → Forms, do **not** configure automated customer acknowledgement, sales sequences, marketing enrollment, deal creation, Ticket creation or Company association without separate acceptance.
- Enable **internal submission notifications** only if approved and verified as internal-only. The current system already emails `info@thesmartysolution.com`; do not accidentally duplicate notifications during migration.
- Add `thesmartysolution.com` and `www.thesmartysolution.com` to HubSpot's permitted tracking/hosting domains before external embed; submissions from unapproved domains can be treated as spam. Verify Preview domain policy separately and avoid unintended real contact creation from tests.
- HubSpot says its own tracking code is needed for **site analytics**, but not to make a native form submission itself work. Do not inject full visitor tracking site-wide without reviewing the existing privacy/cookie notice and consent requirements.
- Observe how a repeated form submission by the same email updates a Contact and how the form-submission event appears; do not treat it as an exactly-once commercial Ticket receipt.
- Explicitly verify default lifecycle stage, owner assignment and suppression rules so a form does not automatically qualify or promote the Contact.

## Website implementation in this Draft PR

- `hubspot-native-forms.js` is **hard-disabled**. It requires exact published Form IDs and the official modern HubSpot form embed-script URL before it will load any provider script.
- `contact.html` and `kiti-enquiry.html` have hidden native-form mount slots. Existing legacy forms and `script.js` handlers stay intact.
- When explicitly enabled **in a later approved change**, the adapter uses updated HubSpot form embed `hs-form-frame` markers and reveals the native slot only after an iframe is present. It does not embed the older `hbspt.forms.create` API, which is for legacy editor forms.
- The adapter does not send email, call the TSS CRM API, or submit programmatically.
- If the HubSpot script fails to load, the legacy form stays available. **This fallback is only a rollout safeguard**; dual-route or partially completed submissions still need manual reconciliation.

## Required staged acceptance and release process

1. Create and publish the two native HubSpot forms via an authenticated official HubSpot Forms UI (form creation only; no test submissions).
2. Verify exact field mapping, required questions, consent settings, email-notification behavior, custom fields and Company auto-creation restrictions.
3. Copy and verify official embed details; stage GUIDs and script URL into the **Draft Preview** adapter (the embed IDs are public configuration, not CRM secrets).
4. Run offline/browser smoke tests that ensure the native form renders on mobile and desktop, privacy and all required fields are present, and the old form remains fallback if the embed fails.
5. With separate explicit approval, run ONE synthetic internal QA submission through each form and independently read back the HubSpot Contact and form submission timeline. Verify 0 unintended Companies, Tickets, Deals, Tasks, customer emails and marketing enrollment, then reconcile any test data.
6. Prepare an independent, explicitly approved Production/form cutover that disables only the obsolete website form submit path on the two pages. Preserve Gmail/Outlook synchronization, existing legacy records and stable rollback.
7. Decide whether separate manually created or later automated commercial Tickets are needed for new enquiries. That is **not** implied by adopting native forms.

**Do not claim the two native forms are live, nor that HubSpot Company or Ticket creation works, based only on the Draft site embed scaffolding.**

Documentation: https://knowledge.hubspot.com/forms/create-and-edit-forms and https://knowledge.hubspot.com/forms/set-up-and-style-your-form-on-an-external-site
