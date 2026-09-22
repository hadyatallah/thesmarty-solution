# Release check, 22 September 2026

Production approval requested by the user is recorded. Production has not been changed.

Authenticated Preview succeeded in the connected browser. Visible CRM showed 2,874 companies, 5 prospects and 0 qualified leads. Summarize Prime Surfaces resolved TSS-CY-2872 and displayed its linked contact, opportunity, tasks and three captured email entries, with partial-history limitations. These were reads only.

Refreshing the new action ledger returned: Action backend unavailable: Unknown action. The Preview still uses the existing Version 10 Production API, which lacks the new gateway handlers. Staged Apps Script Head contains these handlers but is not released through that URL.

A separate candidate web deployment was prepared with the existing owner execution model and Anyone invocation setting. Automatic approval review rejected the Deploy action because a new publicly reachable endpoint running as the user requires explicit approval of that permission scope. No candidate deployment ID was created. The dialog was cancelled. Do not bypass this rejection with another tool, URL or indirect deployment.

The editor-only /dev URL is an existing test route and is not equivalent to the credential-omitting cross-origin POST transport used by the CRM frontend. See https://developers.google.com/apps-script/guides/web for test-deployment access behavior.

Required next approval: create one separate candidate Apps Script web-app endpoint, executing as thesmartysolution@gmail.com with Who has access set to Anyone. Only transport invocation is public. Existing TSS Google authentication and session checks must still protect every CRM read/write endpoint. This permission does not authorize exposing CRM data, disabling authentication, email sends, publication, or claiming all phase gates passed.

After approval: create and record the candidate endpoint and version, bind it only to Preview, verify unauthenticated requests are rejected, validate the native ledger and exact-action flow on synthetic/internal records, and complete the remaining regression gates before promoting Production. Production frontend and backend rollback must retain their exact prior versions. Research, sending, publishing, monitoring feeds and schedules still have separate incomplete integration/acceptance work.

Live draft check returned an English-only draft in the already-open browser page. This page predates the latest bilingual Preview deployment, so it does not verify the bilingual candidate. Reload and fresh sign-in are required before that acceptance test. No message was sent.
