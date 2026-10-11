# TSS original CRM backend retirement — provider cutover gate (2026-10-11)

Status: **branch cleanup completed, provider shutdown partly verified, Production merge still held pending CI/Preview and Apps Script admin confirmation**.

## Completed legacy retirement and accepted replacement
- Native HubSpot Contact form (`d6b2a98a-ef6b-4a18-9c99-cf39ea2925e5`) is deployed on the public site and a previous synthetic, spam-released submission has a matching regular HubSpot FORM receipt and Contact conversion; no new synthetic submissions allowed under the exhausted QA allowance.
- Original custom CRM and analytics UIs plus CRM PWA retired via merged PR #77; public legacy Apps Script enquiry handler and paid website AI assistant removed via merged PR #78.
- The official connected Microsoft 365 Outlook mailbox `info@thesmartysolution.com` independently supports read-only Inbox and Sent Items access without the original CRM; this does **not** prove automated Outlook-to-HubSpot capture/CRM historical sync parity.
- Original Master Google Sheets and Data Center evidence/backups remain read-only, preserved and independent of the custom CRM.

## Backend dependency resolution
1. Removed `api/crm.js`, the old same-origin authentication/data gateway into the hard-coded Apps Script deployment.
2. Removed `api/outlook/status.js`, `api/outlook/_lib.js`, and all `/api/outlook/*` OAuth/status/send routes that depended on CRM-session authentication.
3. Removed `server/outlook/{status,enable,disable,sync,_backend,_core}.js`, including `outlookBindIngestion`, `outlookInstallSchedule`, and `outlookDisconnectIngestion` callers.
4. Removed `lib/tssHubspotEnquiryHandler.mjs`, `lib/tssHubspotEnquirySync.mjs`, and the `tss-hubspot-enquiry-sync-tests.yml` workflow for the abandoned Google Sheet-to-HubSpot scheduled bridge.
5. Removed the old Outlook capture rewrites from `vercel.json`; `vercel.json` now has no rewrites and no cron schedules.
6. Removed stale CRM shell callers for Outlook capture/send controls (`crm/outlook-capture.js`, `crm/outlook-send.js`) and converted archived command-center email output to manual Outlook draft guidance.
7. Added `tests/legacy-backend-retirement.test.mjs` and updated existing retirement tests so CI asserts the removed files, rewrites, crons, and active source references stay absent.

## Provider verification on 2026-10-11
- Microsoft 365 shared mailbox `info@thesmartysolution.com`: Inbox read succeeded. Recent messages include HubSpot native form notifications and HubSpot Support correspondence.
- Microsoft 365 Sent Items read succeeded. Recent sent messages include HubSpot Support replies and the earlier internal HubSpot CRM email integration QA message.
- Outlook historical correspondence is preserved in Microsoft 365 independent of the retired CRM backend.
- HubSpot native website form contact remains present: Contact `qa+native-forms-20261010@thesmartysolution.com`, HubSpot ID `887970143443`, last modified `2026-10-11T05:43:44.714Z`.
- HubSpot/Microsoft native email capability evidence exists in Sent Items: `info@thesmartysolution.com is now connected to HubSpot!` and the prior `TSS HubSpot CRM Email Integration Test | QA-20261009-B` message. This supports native HubSpot email use, while automatic logging policy should remain a HubSpot admin setting, not a custom backend.
- Master Workbook read succeeded: `TSS CRM - Master Workbook`, timezone `Asia/Nicosia`, 21 tabs including `Companies` with 3004 rows and `Email Activity` with 3000 rows.
- Verified Master backup and Data Center research backup metadata reads succeeded; Data Center backup includes the preserved Phase 3 research tabs through `Company Intelligence Profile`.
- Vercel project `thesmarty-solution-agent` under team `tss21` still contains historical environment variable names for retired systems. Values were not decrypted or revealed.

## Still held before Production merge
- Official Apps Script administration was not available through the connected tools in this execution. Active Apps Script deployments/triggers still need owner-authenticated UI verification before claiming all obsolete CRM triggers are disabled.
- Vercel environment variables still present by name and eligible for later removal once this branch is deployed and no rollback requires them: `CRON_SECRET`, `TSS_SYNC_RUN_SECRET`, `TSS_HUBSPOT_*`, `TSS_GOOGLE_SERVICE_ACCOUNT_JSON`, `TSS_OUTLOOK_*`, and `OPENAI_API_KEY`. Social publishing variables were deliberately retained.
- Local retirement regression subset passed: `node --test tests/assistant-formatting.test.mjs tests/enquiry-flow.test.mjs tests/enquiry-transport.test.mjs tests/hubspot-native-forms.test.mjs tests/legacy-backend-retirement.test.mjs tests/legacy-crm-ui-retirement.test.mjs tests/native-hubspot-clean-cutover.test.mjs tests/retire-public-legacy-transports.test.mjs tests/status-display.test.mjs tests/tssDataCenterAuthenticatedView.test.mjs tests/command-center/lookup-availability.test.js tests/command-center/ui.test.js`.
- Full local suite still has pre-existing command-center transport tests requiring archived `crm/index.html`/origin assumptions and dashboard build tests blocked by sandbox `EPERM` spawning the primary runtime Node. These are not evidence that the retired backend is still required.
- Before merge: push this branch cleanup, wait for GitHub CI/Vercel Preview on the new commit, verify retired endpoint 404/410 behavior in Preview, then merge only if checks pass.

Owner preference: **Do not rebuild the abandoned custom CRM, Apps Script integration network, or paid website AI assistant.** Use ChatGPT + native connected HubSpot, Outlook, Google Sheets. No new subscription, paid tool, API service, or live marketing send.
