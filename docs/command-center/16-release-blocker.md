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

## Preview request credential correction

The connected browser signed in successfully at21:44UTC. Its first relay request failed before reaching the Vercel function. Runtime counts showed only the earlier GET405. The stable Preview URL independently returned a Vercel SSO redirect. Inspection found credentials:omit in the browser RPC, which excludes the Preview access cookie even on same-origin requests. Changed only that fetch to credentials:same-origin. Cross-origin Apps Script calls still exclude cookies. This is a transport correction, not relaxed CRM authentication. Added SEC-26 and reran141 component tests successfully. Live retest pending.

## Current result: authenticated live acceptance, 22:03 UTC

The older sign-in, deployment-permission and bilingual-draft blockers above are historical and resolved. The user approved the endpoint scope; Version 11 is deployed; an authenticated Preview session is active. Proposal 498c5f764800784fdc3ea7105a10b55b was reconciled and rejected, never executed. A corrected exact proposal 84631d13e95c2c95f7356cb192ae349e passed approval and created only cancelled internal task TAS-af063c45. Refreshed CRM list showed exactly nine tasks, previously eight. English/Greek draft preparation passed at 22:03:22 UTC with info@thesmartysolution.com. No external message was sent.

A 182.869-second Gmail capture execution overlapped the failing requests. Code inspection confirmed remote Gmail requests held the same global lock needed by gateway calls. The tested replacement in command-center/apps-script/EmailSync.gs fetches outside that lock with a fenced scan lease, then rereads and applies records under the original CRM lock. It is saved to Head for live verification; Version 11 web code remains immutable until candidate deployment update. Local suite now153/153 PASS, including10 sync concurrency/replay/failure cases and2 partial-result reporting cases. This is not proof of full live phase acceptance.

Remaining blockers: live concurrency verification of this repair, complete regression coverage and actual current-source research, outbound provider, health feeds and publishing integrations. Daily/weekly schedules remain disabled. Production authorization is retained; release is blocked by unfinished gates, not a need for another general approval.


Live sync check: repaired Head completed at 22:08:44.536 UTC in 4.478 seconds, zero matching messages and zero record changes; lease cleared and scan success marker advanced. This validates a real empty scan, not large-batch concurrency. Synthetic concurrency/failure tests passed.

Candidate endpoint successfully updated to Version 12 at 22:11 UTC, retaining the existing owner execution/access settings and authenticated dispatch. Production Version 10 remains unchanged.
