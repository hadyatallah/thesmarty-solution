# TSS Intelligent Data Center — private app v1 release gate (11 October 2026)

## Current state
A responsive **read-only** application shell and authentic Google Sheets API client are staged in Draft PR #81 at `/data-center/index.html`. The existing public website's `/admin` redirection **must remain pointed to the private Google Docs launchpad** until this release gate passes. The original `/crm/` must remain retired.

## Approved boundary
- Canonical Companies: Master Workbook `1mZ7vd2UoGXlyxzwZ8Man593UhlLGt2uS1kIS3ZAWPsU`.
- Research Candidate, Source, Evidence Observation, Identity Relationship, Developer Project, Developer Project Company Role and Company Intelligence Profile: **preserved historical evidence copy** `10XZutSMt75LWv1DaMXGPg0uLlvqriCVNbwwH4xhx6J4`. No writes.
- Commercial CRM: HubSpot portal `149509919`. This app has no commercial API integration, and no write/send/promote actions.
- Owner account: `thesmartysolution@gmail.com`.
- No service account credential, API key, refresh token, backend proxy, custom login, Apps Script, additional database, subscribed agent or paid AI API.

## Browser authentication
Uses Google's supported `google.accounts.oauth2.initTokenClient` token model to request **`spreadsheets.readonly` + `userinfo.email`** on a direct owner-initiated sign-in. Verifies `email_verified` and exact allowed Google account from Google's `/oauth2/v3/userinfo` **before** reading either Sheet. Tokens and fetched data stay in page memory only; sign-out clears them. Data never ships to Vercel from the browser and is protected by the Google Sheet's existing owner-only ACL. Source code is publicly viewable; it contains spreadsheet IDs, not credentials or actual Company records. The app shell is not itself an authenticated security wall.

`data-center/config.js` now contains the public OAuth Web client ID supplied by the TSS owner on 11 October 2026. This is not a secret. Google consent configuration, exact Preview-origin allowlisting and authenticated owner testing still require independent verification before release.

## Google provider configuration required before live acceptance
1. In the TSS owner-controlled Google Cloud project `tss-crm-508908`, Google Sheets API is already enabled, according to the owner-shared console screenshots.
2. Configure an appropriate OAuth consent application. A consumer Gmail owner generally requires **External / Testing** with exact `thesmartysolution@gmail.com` approved as a test user, unless Google's current policies and an already approved configuration say otherwise. Do not bypass unverified-app or access controls.
3. Register an OAuth Web application client with **Authorized JavaScript origins** including the exact approved Preview origin for validation and later `https://www.thesmartysolution.com`. Do not register wildcard domains. Configure only required scopes. A browser client ID is public; do not commit a client secret.
4. Public client ID from the owner is configured in `data-center/config.js`. Confirm the Web client has authorized the exact latest protected Preview origin (which changes with each commit) and the Production `https://www.thesmartysolution.com` origin. Test the TSS owner sign-in and verify that unauthorized accounts cannot read the private Sheets.
5. Verify authorized owner Google can read canonical Companies and all seven research support tabs, and that the Companies directory, district/category search, dossier joins, project link roles, source evidence and review queue render correctly against real private Sheets **without writing anything**.
6. Verify mobile, desktop, keyboard tab order, no data before sign-in, safe sign-out, no browser storage, expired token handling, CSP behavior and accidental public data disclosure. Recheck Google ACLs remain owner-only.
7. Pass isolated CI and Preview smoke testing at an exact commit. Merge only when Production access is approved, then deploy, verify read-only functionality and update /admin using a **separate controlled routing PR**, leaving a rollback to the owner-private Google document.

## Unaccepted features / limitations
- Interactive Company search needs browser OAuth setup and acceptance. A successful static Preview, GitHub CI, or the available ChatGPT Google Drive plugin **does not** prove OAuth integration works in the live website.
- No background research, continuous sync, cross-company promotion, data editing, business email sends, or HubSpot writes.
- Research evidence is from an immutable preserved snapshot; current factual verification needs separate source review. A legacy status of `Current` is relative to its stored observation date, not necessarily today's verification.
- The user may perform research and scoped editing through the **separate connected ChatGPT/Google Drive workflow**; this private app does not inherit those connector permissions.

## Regression commands
`node --check data-center/app.js`

`node --check data-center/model.mjs`

`node --test data-center/tests/model.test.mjs`

Dedicated workflow: `.github/workflows/tss-idc-app-safety.yml`.

## Data boundary for Production
**Do not merge or replace /admin until Google OAuth consent, exact current Preview origin and approved owner-provider sign-in with real read-only Sheets data are successfully tested.** Preserve all source workbooks, app site, native HubSpot Contact, privacy pages and the prior accepted CRM retirement.
