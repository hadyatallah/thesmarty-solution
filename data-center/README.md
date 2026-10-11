# TSS Intelligent Data Center | Production operating handover

**Checkpoint: 11 October 2026.** This file supersedes the original pre-release PR #81 hold note. For authoritative acceptance decisions and provider blockers, consult the [TSS Current System Map and Open Work Register](https://docs.google.com/document/d/1bsqCWq_DzuPFgolE-j1LVcQog0rdgHPzvQFq5FybZnw/edit).

## Approved Production architecture

- **Website:** public business presence and one native HubSpot Contact form.
- **Intelligent Data Center:** read-only, owner-authenticated research application at `/data-center/`; website `/admin` and `/admin/` route to it.
- **Google Sheets:** existing canonical Master Companies plus a preserved historical Phase 3 research-evidence copy, with Company IDs unchanged.
- **HubSpot:** the only commercial CRM; **no** direct HubSpot writes, lead promotions, emails or automated outreach from the Data Center.
- **ChatGPT and existing Outlook/Zoom/WhatsApp channels:** separate management and communications workflows.

The former Google Sheets/Apps Script custom CRM, `/crm/`, `/analytics/`, legacy CRM API and abandoned custom mailbox capture are retired. Do not reactivate them, build a replacement CRM, or import all research Companies into HubSpot.

## Deployed releases (independently read back)

| Change | GitHub | Production evidence |
| --- | --- | --- |
| Secure read-only Data Center | [PR #81](https://github.com/hadyatallah/thesmarty-solution/pull/81), merge `b29842d` | Vercel READY |
| Final `/admin` website route | [PR #82](https://github.com/hadyatallah/thesmarty-solution/pull/82), merge `f10cf5f` | Vercel READY, route readback |
| Simpler Android owner Google sign-in/Lock App | [PR #83](https://github.com/hadyatallah/thesmarty-solution/pull/83), merge `0045941` | Production `dpl_G5rqEqpH7WMA6Phg8uLxGYTh1MxZ` READY |

Verified 11 October from official connected providers: `/admin`, `/data-center/`, homepage and Contact return HTTP 200; public shell and PWA manifest/service worker are served. `/crm/`, `/analytics/`, `/api/crm` and `/api/outlook/status` return HTTP 404. The served Data Center login shell reveals no private records before authentication. A previous owner-supplied Production Android Chrome screenshot showed successful owner Google authentication and dashboard totals. That screenshot is a separate acceptance checkpoint, not a newly repeated browser session.

## Data boundary and reconciliation

The current public, non-secret `data-center/config.js` references:
- Canonical Master Workbook: `1mZ7vd2UoGXlyxzwZ8Man593UhlLGt2uS1kIS3ZAWPsU`, `Companies!A:L`.
- Preserved research archive: `10XZutSMt75LWv1DaMXGPg0uLlvqriCVNbwwH4xhx6J4`, seven research tabs read by the app.
- Exact allowed Google identity: `thesmartysolution@gmail.com`.
- HubSpot account: `149509919` (external handover only).

The app requests Google `userinfo.email` and `spreadsheets.readonly`; it verifies Google's `email_verified` and exact allowed address **before** either Sheets read. Google Drive permissions remain the underlying security boundary. OAuth client ID and spreadsheet IDs in public source are identifiers, **not** API credentials. Tokens and fetched data stay in memory only, do not go into Vercel server storage or browser persistent storage, and are removed by **Lock App**. The service worker caches only an allowlisted public shell, never token-bearing or Sheets responses.

Independent read-only Sheet checks on 11 October returned **2,878 unique Company IDs**, **15 stored research candidates**, **702 stored evidence observations**, **5 projects**, **21 research sources**, **5 identity relationships**, **5 project-role records**, and **566 Company Intelligence Profiles**. The known synthetic fixture filter results in 14 candidates, 701 evidence observations and 4 projects in the app. Company and research ID checks found no duplicates in the checked leading columns. Historical evidence is not current primary-source verification.

Research archive ACL: TSS Gmail owner only. Master Workbook ACL: TSS Gmail owner, an authorized personal administrator writer, and an existing service-account reader. Review the last dependency before removing any historical service-account permission. No unreviewed role inheritance, automatic merges, Company creation or data edits.

## Current app capabilities

Dashboard and district breakdown, Company ID/name/category/district/email/phone/website search and dossier, developer/project and linked evidence display, Research Candidates, Evidence & Sources, Review Queue, and a non-writing HubSpot handover guide. The app is intentionally **read-only**. Adding new source facts, evidence disputes, or reconciliations requires a separate authorized research workflow, not silent client-side writes.

Open access: visit `https://www.thesmartysolution.com/admin`, tap **Open Data Center**, choose the TSS Gmail account and approve a Google prompt if Google requires one. Tap **Lock App** to clear page-held data. As of PR #83, a normal lock does not revoke the standing Google grant. Reopening after fully closing the PWA still requires a user-initiated Google token popup. Google can require reauthentication at its discretion. Do not solve this by persisting OAuth tokens in localStorage, cookies or a service worker.

## Open acceptance gates

- **Interactive security and devices, PARTIAL:** a full second-account refusal test and observed Android phone/tablet PWA install/re-entry check after PR #83 remain open. Static source review, Google ACL readback and the earlier owner screenshot do not replace those tests.
- **Main Contact native HubSpot form, PARTIAL:** current embedded form is **TSS Website Contact Enquiry**, ID `d6b2a98a-ef6b-4a18-9c99-cf39ea2925e5`; HubSpot records one submission as of 11 October. Historical provider forms may remain as records, but the website must embed just this form. The `kiti-enquiry.html` page redirects to Contact and is not a separate live form. The exact Kiti dropdown option, consent behavior and complete submission payload/association still require verified native form/admin or permitted internal QA readback.
- **HubSpot commercial enquiry routing, BLOCKED:** commercial pipeline `4209185979` exists, but four current tickets are all in Support Pipeline `0`; no ticket in TSS Commercial Enquiries has been accepted from the native form. Company key `tss_company_key` remains missing; do not retry its creation without new evidence. Support case `#49212582236` remains provider-owned. Contact `tss_contact_key` and Ticket `tss_enquiry_key` exist, but their uniqueness contract cannot be re-accepted from the current connector's property metadata. Do not claim full intake/idempotency acceptance.
- **Legacy cleanup, PARTIAL:** tested obsolete routes return 404 and PR #79 records provider trigger/deployment retirement. Current Apps Script trigger inventory and every dormant permission/dependency were not independently rechecked in the latest run. Never revoke live Google, Outlook, website or social dependencies on a guess.
- **Research writing and commercial promotions:** intentionally **not implemented**. They are not blockers for this read-only application and must not be reintroduced under a stabilization ticket.

## Regression tests

```bash
node --check data-center/app.js
node --check data-center/model.mjs
node --test data-center/tests/model.test.mjs
```

Run the existing isolated workflow `.github/workflows/tss-idc-app-safety.yml` and website regression tests before merging application changes. Production acceptance needs a verified exact commit, Vercel READY release, tested public routes, and authorized interactive security/functional checks. Keep owner-only Google permissions and the previous private Google operating guide as rollback references. No paid APIs or alternative browser agents.
