# Release check, 22 September 2026

Production approval requested by the user is recorded. Production has not been changed.

Authenticated Preview succeeded in the connected browser. Visible CRM showed 2,874 companies, 5 prospects and 0 qualified leads. Summarize Prime Surfaces resolved TSS-CY-2872 and displayed its linked contact, opportunity, tasks and three captured email entries, with partial-history limitations. These were reads only.

Refreshing the new action ledger returned: Action backend unavailable: Unknown action. The Preview still uses the existing Version 10 Production API, which lacks the new gateway handlers. Staged Apps Script Head contains these handlers but is not released through that URL.

A separate candidate web deployment was prepared with the existing owner execution model and Anyone invocation setting. Automatic approval review rejected the Deploy action because a new publicly reachable endpoint running as the user requires explicit approval of that permission scope. No candidate deployment ID was created. The dialog was cancelled. Do not bypass this rejection with another tool, URL or indirect deployment.

The editor-only /dev URL is an existing test route and is not equivalent to the credential-omitting cross-origin POST transport used by the CRM frontend. See https://developers.google.com/apps-script/guides/web for test-deployment access behavior.

Required next approval: create one separate candidate Apps Script web-app endpoint, executing as thesmartysolution@gmail.com with Who has access set to Anyone. Only transport invocation is public. Existing TSS Google authentication and session checks must still protect every CRM read/write endpoint. This permission does not authorize exposing CRM data, disabling authentication, email sends, publication, or claiming all phase gates passed.

After approval: create and record the candidate endpoint and version, bind it only to Preview, verify unauthenticated requests are rejected, validate the native ledger and exact-action flow on synthetic/internal records, and complete the remaining regression gates before promoting Production. Production frontend and backend rollback must retain their exact prior versions. Research, sending, publishing, monitoring feeds and schedules still have separate incomplete integration/acceptance work.

Live draft check returned an English-only draft in the already-open browser page. This page predates the latest bilingual Preview deployment, so it does not verify the bilingual candidate. Reload and fresh sign-in are required before that acceptance test. No message was sent.


## Approved candidate deployment

The user explicitly approved the requested permission scope. Candidate Version 11 was deployed successfully on 22 September 2026 at 21:09 UTC. Candidate endpoint: https://script.google.com/macros/s/AKfycbyVmqjxRsbdMoIrqGqETiFbOyOumjY3da_aUbThEn_8LdRN7CZFPDPMNUkWRaGJdHWRsQ/exec . Production Version 10 endpoint was not modified.

Owner-only ccInstall completed at 21:10:46 UTC to initialize Agent Ledger metadata. Existing CRM records were not part of this operation. No schedules or external dispatch enabled. Development branch crm/index.html now targets the candidate endpoint for Preview testing. Authenticated ledger and write acceptance remain pending.

## Signed-in Version 11 acceptance and transport repair

Candidate faee562 / backend tss-cc-0.3.0 passed signed-in ledger reads and manual daily-brief persistence. Repeating the brief returned job a3101c46-cb44-4d07-924e-b1ab09324616 without additional audit entries. Google model health diagnostic returned HTTP 200 and Greek output. Live bilingual drafting still failed to obtain translation; it displayed a missing-translation limitation and did not send.

The internal Cancelled task proposal failed with a browser connection error before exact approval. The ledger refresh subsequently returned an unavailable error. No ccDecide or ccExecute approval was issued. A task plan also omitted data.name; frontend validation now rejects this and the planner explicitly requires data.name.

Added api/crm-command.js for the six Command Center methods only. Same-site POST requests forward the existing opaque session to the fixed candidate Apps Script endpoint. No privileged credential, new authentication model, database or provider subscription was introduced. Redirects are restricted to the Google ContentService host and followed as GET without the session body. Failed writes are never retried. Existing login and ordinary CRM transport remain unchanged. This repair must pass deployed acceptance before Production promotion.

Local component suite: 140/140 passed, including cross-origin refusal, missing sessions, method restriction, redirect session protection, uncertain-write non-retry, HTML response rejection and missing-name proposal validation. Live repair verification pending. Production unchanged; external sending, publishing and proactive schedules remain disabled.
