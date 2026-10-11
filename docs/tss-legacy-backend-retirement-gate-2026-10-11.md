# TSS original CRM backend retirement — provider cutover gate (2026-10-11)

Status: **staged only, NOT Production approved**.

## Completed legacy retirement and accepted replacement
- Native HubSpot Contact form (`d6b2a98a-ef6b-4a18-9c99-cf39ea2925e5`) is deployed on the public site and a previous synthetic, spam-released submission has a matching regular HubSpot FORM receipt and Contact conversion; no new synthetic submissions allowed under the exhausted QA allowance.
- Original custom CRM and analytics UIs plus CRM PWA retired via merged PR #77; public legacy Apps Script enquiry handler and paid website AI assistant removed via merged PR #78.
- The official connected Microsoft 365 Outlook mailbox `info@thesmartysolution.com` independently supports read-only Inbox and Sent Items access without the original CRM; this does **not** prove automated Outlook-to-HubSpot capture/CRM historical sync parity.
- Original Master Google Sheets and Data Center evidence/backups remain read-only, preserved and independent of the custom CRM.

## Backend dependencies found
1. `api/crm.js` provides old same-origin authentication/data gateway into a hard-coded Apps Script deployment.
2. `api/outlook/status.js` dispatches CRM-session-authenticated Outlook capture and legacy status/sync/enable/disable endpoints.
3. `api/outlook/_lib.js` and `server/outlook/{status,enable,disable,sync,_backend,_core}.js` still implement old CRM `checkSession` and `outlookBindIngestion`, `outlookInstallSchedule`, `outlookDisconnectIngestion` flows; ensure no active work depends on them before removal.
4. `lib/tssHubspotEnquiryHandler.mjs` and `lib/tssHubspotEnquirySync.mjs` implement abandoned Google Sheet-to-HubSpot scheduled bridge. No Vercel cron appears in current `vercel.json`, but the server modules remain in GitHub.
5. `vercel.json` currently contains four old Outlook capture rewrites to `/api/outlook/status`; these must be resolved as part of eventual backend cutover.
6. Vercel has historical Production environment variable **names** including `TSS_OUTLOOK_*`, `TSS_HUBSPOT_*`, `TSS_GOOGLE_SERVICE_ACCOUNT_JSON`, `CRON_SECRET`, `TSS_SYNC_RUN_SECRET`, and `OPENAI_API_KEY`. Their values were not revealed. Other social publishing variables also exist and must be preserved until their independent uses are known.
7. Active Google Apps Script projects, versions, deployments, schedules/triggers, and connected HubSpot-Microsoft Outlook inbox auto-logging status have **not** been independently read through official provider administration in this chat.

## This candidate branch
- The two Vercel Function entry points `api/crm.js` and `api/outlook/status.js` have been removed **only in this branch**, to explicitly stage the final decommission.
- A proposed change to old Outlook rewrites in `vercel.json` was not applied because a tool safety check blocked it. Do not attempt to work around the restriction. The config is left unchanged; this branch must **NOT merge** as-is.
- Historical supporting modules and provider credentials remain in place until the final controlled provider cutover.

## Mandatory merge prerequisites
- Official owner-authenticated Google Apps Script administration: inventory each active deployment and all installable/time-driven triggers; retain any unrelated research or public website services. Disable only verified obsolete CRM-related triggers when data preservation/recovery is confirmed.
- Official HubSpot and Microsoft 365 administration: establish whether business correspondence is captured in HubSpot natively, whether automatic inbox/sent synchronization is necessary, and whether a supported native replacement is active and tested. Do not treat a direct mail read as proof of background CRM logging.
- Verify the original CRM's historical Email Activity/Tasks in Google Sheets remain preserved and that no customer communications or other approved workflows still call `/api/crm` or `/api/outlook/status`.
- Resolve Vercel routing and associated environment variables through an approved authorized path; never print or commit secrets.
- Replace old backend tests with actual retirement safety tests, keep the native HubSpot website/Outlook mailbox/Google Sheet data regression tests, and pass CI and protected Preview before merge.
- Release only in narrowly scoped Production changes with rollback evidence; independently verify 404/410 for retired endpoints and functioning native website/Outlook/HubSpot. No further provider QA form submissions under the exhausted allowance.

Owner preference: **Do not rebuild the abandoned custom CRM, Apps Script integration network, or paid website AI assistant.** Use ChatGPT + native connected HubSpot, Outlook, Google Sheets. No new subscription, paid tool, API service, or live marketing send.
