# TSS G4 — Durable enquiry reservation candidate (NOT ACTIVATED)

**Scope:** Draft PR #64, 9 October 2026. This is a non-live design and offline-tested
candidate. No additional subscription, new cloud database, real HubSpot write, or
Apps Script Production source update is authorized by this document.

## Why the prior bridge was insufficient

The HubSpot task-subject search is not atomic. Concurrent Vercel functions could both
observe no matching task and independently create one. A process-local lease has the
same failure. The bridge therefore remains fail-closed for every write until a tested
**shared durable reservation** is accepted. Existing Company/Contact property matching
also does not prove provider-enforced unique Task creation.

## Candidate on already approved Google infrastructure

- `integrations/apps-script/TssG4Reservation.gs` contains a **standalone
  dispatcher function**, not a new public `doPost` and not a current deployment.
- It uses Google's `LockService.getScriptLock().tryLock` to serialize short
  state transitions, and script-scoped persistent `PropertiesService` keys
  `TSS_G4_RES_TSK-WEB-YYYY-NNNN`. The Apps Script lock is released
  immediately after the state transition; it does NOT span network requests.
- Each original Task ID is reserved exactly once with a random claim token.
  Competing reservations fail. No time-based expiry and no automatic retry
  after process death, timeout or an uncertain HubSpot result.
- After the caller verifies the HubSpot created Task and **both** its persisted
  Company and Contact associations, a matching claim can be settled
  `committed`. Every error/uncertain result settles `review_required`.
  A failed settlement call leaves `reserved`, which still blocks retries.
- A committed or review-required enquiry is never automatically re-reserved.
  Separate, audited operator reconciliation is mandatory for uncertain cases.
  Original source evidence and provider IDs must be retained.
- `lib/tssG4ReservationAdapter.mjs` is a **server-only, unwired adapter**
  designed for an explicitly authorized HTTPS Google Apps Script dispatch.
  It validates the allowed HTTPS endpoint and one-time ContentService redirect
  host, never retries POST after uncertain outcomes, and never exposes the
  shared secret in a browser or log.
- The Apps Script module is disabled unless
  `TSS_G4_RESERVATIONS_ENABLED=true` and a securely configured
  `TSS_G4_RESERVATION_SECRET_SHA256` exists in its ScriptProperties.
  The matching secret must remain in restricted server-only configuration.
  **No secret or endpoint has been provisioned or enabled** by this PR.
- The adapter is intentionally NOT connected to
  `lib/tssHubspotEnquiryHandler.mjs`. Changing
  `TSS_HUBSPOT_SYNC_ENABLED` alone still cannot create HubSpot records.

## Provider and deployment acceptance still REQUIRED

1. Recover, verify and back up **complete current Apps Script HEAD and deployed
   source**, current manifest, triggers and operational Gmail/Outlook behavior.
   Previous inability to safely update the Apps Script project is not waived.
2. Choose the exact owner-controlled Apps Script dispatcher (existing
   authenticated gateway vs separately approved isolated project), security
   model and deployment URL. Do not overwrite any existing `doPost`.
3. Independently validate that script-scoped Properties storage quotas and
   provider concurrency/rate limits meet the intended volume, with an
   explicit fail-closed capacity policy. Persistent claims must be retained;
   no unattended purge or automatic requeue.
4. Authorize and test the narrowly scoped server-only shared secret and
   authenticated request/response in the existing Microsoft/Google/Vercel
   setup. Do not place credentials in GitHub, user-visible chats or client JS.
5. Complete the protected Vercel Preview **authenticated** browser acceptance.
   Prior read-only connector fetch returned 401 after redirect; READY does
   not prove authenticated endpoint functionality.
6. Run an approved **internal QA only** end-to-end test:
   one enquiry -> exact Company/Contact -> exactly one Task, both
   associations, preserved source timestamp, no customer messages;
   concurrent identical attempt rejected; uncertain response
   requires review; replay does not duplicate.
7. Verify effects independently in HubSpot, Sheets, Apps Script audit and
   Vercel logs. Record precise provider Task IDs and rollback conditions.
8. Obtain a separate owner-approved Production release and bridge write gate.
   Keep G4 and G5 distinct: legacy-form -> legacy Workbook -> HubSpot
   remains a **transition bridge**, not G5's compliant final read-only archive
   architecture.

## Important limitations

This candidate uses **Apps Script ScriptProperties**, not an externally proven
transactional database. ScriptProperties quotas, atomic persistence and the
trusted dispatch's authentication must be validated on the actual authorized
project before calling the result Production-safe. Atomic serialization is
provided by Apps Script LockService only for transactions inside that
particular script project. Different Apps Script projects do not share this
lock or the same ScriptProperties.

The reservation protocol prevents **automatic duplicate dispatch**, not
mathematical exactly-once delivery or recovery from arbitrary provider
failures. It intentionally prioritizes no-duplicate delivery over automatic
retry. The long-lived ledger may ultimately need a dedicated reviewed
archival store. No cleanup, quota expansion, provider entitlement assumption,
or creation of a paid service is approved.

### Read-only sources

- Google [LockService](https://developers.google.com/apps-script/reference/lock/)
- Google [PropertiesService](https://developers.google.com/apps-script/reference/properties/properties-service)
- Existing PR #64 and TSS authoritative G3/G4/G5 register

**Disposition:** STAGED / CI REVIEW ONLY. Runtime source backup, authentication,
deployment, concurrent provider QA, live-written record readback and explicit
owner approval remain blocking. The deployed website, Apps Script, Outlook,
HubSpot, Production Vercel and CRM Master Workbook are unchanged.
