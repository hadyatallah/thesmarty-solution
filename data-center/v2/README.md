# TSS Intelligent Data Center V2 | Governed Research Management
**Workstream:** V2 isolated development (not Production)  
**Initiated:** 11 October 2026  
**Authority:** Owner explicitly agreed to start V2 without access to desktop/tablet, granting a **limited sequencing exception** while V1 acceptance is PARTIAL. This is NOT a V1 PASS and is NOT authority to enable research writes in Production.

## Distinct stages and evidence

- V1: read-only live Data Center; owner reports functioning on Android phone. Desktop and tablet acceptance still OPEN. Keep `/admin` and `/data-center/` unchanged.
- V2: add governed research proposals, fact-level source lineage, duplicate/conflict review, human decisions, and eventually approved append-only Google Sheets evidence/audit updates.
- V2 evidence here: pure `review.mjs` proposal preflight and synthetic automated tests only. No user-facing editor, deployed write path, accepted real write, duplicate resolution, or complete V2 stage claim exists yet.
- Historical *Phase 2* developer-market methodology is a research-domain reference; it is not the new V2 software release status.

## Retained operating architecture

1. Website stays public. One native HubSpot Contact form; no competing contact/CRM intake.
2. **Google Sheets stays the sole existing canonical Company/research substrate.** Master Companies IDs are immutable. Preserved Phase 3 evidence archive remains read-only unless a separately approved, non-destructive migration is verified. Do not create another production database.
3. **HubSpot remains the only commercial CRM**; research candidates do not become leads automatically.
4. No custom CRM resurrection, Apps Script CRM, independent backend service, paid AI APIs, TinyFish, unapproved subscription, automated outreach, secret in browser source, or write-capable scope in V1.
5. Owner authentication, Google ACL enforcement, read-only V1 token, Lock App, source provenance and privacy partitioning remain mandatory.
6. Sequential completion applies within V2 itself. **V1 desktop/tablet acceptance remains a tracked open item and no V1 PASS is recorded.**

## Existing live source schemas (readback 11 Oct 2026)

Canonical `Companies!A:L`: Company `id` is source of identity and must not be rewritten or split into separate V2 IDs.

Archived research `Evidence Observation!A:U` uses:
`evidenceId, companyId, candidateId, factType, attributePath, valueJson, displayValue, sourceId, sourceRef, sourcePublishedAt, observedAt, verificationStatus, freshnessStatus, informationClass, supersedesEvidenceId, conflictGroupId, capturedBy, reviewNotes, createdAt, updatedAt, version`.

Existing research `Company Intelligence Profile!A:O` includes `companyId, disposition, canonicalIdentityState, duplicateReviewState, evidenceState, researchGaps, updatedAt, version`. Profiles must not be silently overwritten during evidence append.

The owner-only **isolated synthetic QA workbook**, ID `1X1EQpRLRK-ErvHXHxZ8Jp1rvV-SIW8GaKelVuCbzFkk`, has tabs `Evidence QA`, `Audit QA`, `Read Me`, `Acceptance`. It is NOT CANONICAL. Existing prior QA records use stable request IDs, evidence IDs, audit IDs and have already been read back. Some historical fixtures set both Company and Candidate identifiers; this V2 preflight deliberately requires exactly **one** to prevent ambiguity in *new* submissions. Preserve historical fixtures unmodified.

`Evidence QA!A:P` header:
`evidenceId, companyId, candidateId, factType, attributePath, valueJson, displayValue, sourceId, sourceRef, observedAt, verificationStatus, freshnessStatus, informationClass, conflictGroupId, requestId, version`.

`Audit QA!A:L` header:
`auditId, date, actor, action, entityType, recordId, requestId, priorVersion, newVersion, outcome, details, sourceRef`.

## Implemented V2 checkpoint — isolated proposal engine

`review.mjs` and `../tests/v2-research.test.mjs`:
- Accept only synthetic `QA-*` identity/source/evidence/audit IDs, an existing verified QA Company **or** QA Candidate, and synthetic `synthetic://tss-idc/` source references.
- Require a source ID/reference, observation date, fact path, JSON value and display value, audit date and QA actor.
- Enforce the existing verification states: `UNVERIFIED`, `SOURCE SUPPORTED`, `DIRECTLY CONFIRMED`, `CONFLICTING / REVIEW REQUIRED`. Preserve `Current`, `Review Due`, `Stale`; treat Unknown as unknown, not No. Source information classes remain `Reusable TSS Intelligence`, `TSS Restricted Intelligence`, `Mandate Confidential`, `Highly Restricted`. QA records use `Internal QA Only` and MUST NOT flow into production research.
- Require **fresh readbacks** of BOTH QA Evidence and Audit tabs before a proposal can be considered. Reject any previously used request ID, evidence ID or audit ID. Reject equivalent dated source observations.
- Escalate differing existing attribute values to `REVIEW_REQUIRED`, never overwrite, auto-merge or conceal previous observations; conflicting statuses require a reviewed conflict group ID.
- The only two materialized rows, if `QA_READY`, are **in-memory arrays** matching the isolated QA tabs. The audit outcome is `PREPARED`, never `RECORDED` until a separate controlled action is actually written and independently read back.
- There is **no network call, write API, automated append, storage, auth/token or browser UI** in this module. Passing preflight does not authorize actual write or imply stable concurrency/unique-value guarantees from native Sheets.

## Mandatory acceptance gates before any V2 live research write

1. Explicit approval of a complete V2 source and field-level mutation contract: evidence append and audit append; reviewed corrections recorded as newer observations, not destructive replacement. Source and observation date must be present and reproducible. Preserve the canonical Company key.
2. Independently verify authorization mechanism without weakening the V1 `spreadsheets.readonly` scope or broadening the Production site's privileges prematurely. No client secret or service account JSON.
3. Verify QA identity guard, approved taxonomy, confidentiality class, source validity, search preflight for all existing request IDs, idempotency and duplicate/probable-match handling. Review concurrent duplicate submissions and Sheets' lack of guaranteed transactional uniqueness.
4. If writes are authorized, perform **exactly scoped synthetic-only QA** against the existing separate workbook; verify both evidence and audit readbacks by immutable request ID, and prove no canonical/archived rows changed.
5. Build a Preview-only, owner-visible research proposal/review UI; test Chrome Android, desktop and tablet behavior, including failed submissions, Lock App, double-tap, token expiry, stale data, network loss, audit and privacy.
6. Obtain owner acceptance of synthetic Preview before separately authorizing Production capability; verify V1 open gates independently and do not silently promote V1 to PASS.
7. Only after safe write semantics and rollback are accepted, consider a **distinct, explicit, gated** production rollout. Never auto-promote data or send messages to HubSpot.

## Immediate development next steps

Build the isolated Preview-only research proposal workflow from the pure validator; then assess and test the least-privileged, audited way to write to the existing Google Sheets without adding a second CRM or paid platform. Until accepted, `readOnly:true` in `data-center/config.js` remains untouched. Reconcile V1 desktop/tablet checks when devices become available.

**Current status:** V2 STARTED / ENGINEERING OPEN. V1 PARTIAL / DEVICE ACCEPTANCE OPEN. Neither may be claimed complete.


## V2 execution checkpoint — Preview interface and actual isolated QA evidence

**Execution date:** 11 October 2026 (owner authorized “Proceed”). **Draft PR #87 remains unmerged.**

### New Preview-only editor

- `data-center/v2/preview.html`, `preview.css` and `preview.js` provide a mobile-responsive research proposal form with separate Draft, Review and Prepare sections.
- The Preview has one fixed QA Company and one fixed QA Candidate; fields include fact type, attribute path, JSON fact value, display value, observation date, source ID and synthetic source reference, verification and freshness, stable request/evidence/audit IDs, conflict group and review notes.
- `Run preflight checks` validates. The `Show duplicate scenario` and `Show conflict scenario` buttons demonstrate blocked/review-required states. `Prepare QA rows locally` produces only a readable in-memory JSON preview and **never writes**.
- Critical notice: the page uses static demo fixtures, **not** fresh Google Sheets snapshots. Therefore a local `QA_READY` display is NOT approval to append. No Google sign-in, API request, browser persistent storage, real Company data, HubSpot, production export or external analytics.
- New `data-center/tests/v2-preview.test.mjs` exercises synthetic form submission, row preview, duplicate/uncertain-fact scenarios, edit invalidation, and safeguards. The proposal validator now explicitly requires nonempty verification and freshness classifications.
- Preview URL on the exact Vercel draft deployment: `https://thesmarty-solution-agent-1pi4r8g4a-tss21.vercel.app/data-center/v2/preview.html`. It may require access to Vercel Preview; it is not a public Production editor. Main Production V1 remains without a V2 route.

### Executed isolated QA write — PASS (NOT CANONICAL)

Target Google Sheet: **TSS IDC — Isolated Governed Write QA — NOT CANONICAL — 2026-10-11**, ID `1X1EQpRLRK-ErvHXHxZ8Jp1rvV-SIW8GaKelVuCbzFkk`, owner `thesmartysolution@gmail.com`, private (`shared=false`; only owner permission in Drive metadata). Exact tab IDs: `Evidence QA=406344347`, `Audit QA=899733297`.

Before the single authorized QA write, the official connected Google Sheets API re-read both full tabs `Evidence QA!A1:P100` and `Audit QA!A1:L100`. Both headers matched the known schema; existing records were 2 evidence rows and 2 audit rows, and neither the proposed stable request nor record IDs nor source reference appeared in either tab. One Google Sheets `batchUpdate` call, containing **two appendCells operations** targeting only these two QA tab IDs, returned two provider replies. Do not blindly retry this call.

- Exact request ID: `QA-IDC-V2-REQ-20261011-001`
- Synthetic Evidence ID: `EV-QA-V2-20261011-001`
- Synthetic Audit ID: `AUD-QA-V2-20261011-001`
- Synthetic identity: `QA-COMPANY-001` (Candidate empty)
- Fact path: `v2QaWriteGate`; synthetic value `Synthetic QA acceptance observation`
- Provenance: `QA-SRC-001`, `synthetic://tss-idc/v2/gate-20261011-001`, observed `2026-10-11`
- Classification: `UNVERIFIED` / `Review Due` / `Internal QA Only`
- Audit: `APPEND`, exact evidence reference, priorVersion `0`, newVersion `1`, outcome `RECORDED`.

An **independent connected Sheets readback** of both tabs returned exactly one matching Evidence and one matching Audit record linked by the same immutable request ID, with the expected source, identity, class and audit outcome. Counts increased exactly **2→3** per tab. Test disposition: **PASS only for this bounded synthetic append/readback**. Replay of this request is forbidden; preflight must reject its now-existing ID.

A separate **post-write read-only** canonical check confirmed **2,878 nonempty unique Companies** and **702 nonempty unique preserved Evidence Observation IDs**, unchanged from the earlier source counts. The QA operation did not target either production workbook. Prior preserved synthetic fixture remains in the archive and is not production research. No live business record, HubSpot record, email or communication was written.

### Still OPEN

- The user-facing Preview editor has not been accepted on Android phone, desktop or tablet by the owner. The ability to copy preview rows is deliberately not a Google Sheets write integration.
- Separate current QA workbook readback is still mandatory at execution time for each distinct future request; the frozen Preview fixture cannot substitute. Google Sheets unique IDs/atomic replay under concurrent independent writers are not guaranteed; current preflight can race. **Do not claim production idempotency acceptance from this one success.**
- No live research write mechanism, login scope expansion, immutable versions/compare-and-swap, conflict-resolution approval or real information-class access partitions have passed. Production remains read-only.
- V1 desktop/tablet acceptance remains OPEN due to the explicit early-V2 sequencing exception. V2 stays **IN DEVELOPMENT**, not COMPLETE.


## Final engineering checkpoint — governed V2 reviewer and bounded QA gateway (11 October 2026)

**Stage decision: V2 ENGINEERING BUILT / PROVIDER AND PRODUCTION ACCEPTANCE HELD.** No V2 Production release is authorized; do not merge the PR, enable browser editing or declare V2 complete merely because tests pass.

### Implemented independently on Draft PR #87

1. **Synthetic V2 proposal and local review**: `preview.html` + `preview.js` + `review.mjs` + regression tests. Android owner screenshots accepted the working layout, local QA preflight PASS, duplicate blocked, and conflict review required. Later duplicate-example adjustment removes a redundant legacy-prefix warning; automated tests PASS. No actual QA writes from this static demo.
2. **Governed real research review**: `real-read.html`, `real-read.js`, `real-review.mjs` plus tests. Has a separate owner Google GIS read-only token, exact `email_verified` owner identity check, canonical Master Companies `A:L` and preserved Evidence `A:U`/Profiles `A:O` reads, exact Company ID/dossier selection, cross-evidence conflicts, source HTTP(S) and observation date checks, information-class warnings and reviewed-proposal JSON held only in memory. Token and all fetched records are cleared by Lock. **There is NO real-data write or HubSpot integration.** This newly built owner browser workflow has passed simulated regression tests, **not** an actual Google OAuth/Preview-owner sign-in.
3. **Owner-only synthetic QA gateway**: `qa-gateway.mjs` + `qa-connect.html` + `qa-connect.js` and tests. QA workbook ID and the only two eligible sheet IDs are pinned in code. The Google scope for this **separate QA test page** is `spreadsheets`, never installed or requested by V1. Verified owner identity precedes any provider QA read. The workflow demands fresh QA tab metadata and both header ranges, exact one-time confirmation phrase, a full preflight for ID collisions, and one two-tab appendCells request. Every outcome is re-read using stable request ID; uncertain responses MUST NOT be retried. The gateway becomes spent even after a failure. It cannot target Master Companies or archived research.
4. **Serverless/CRM boundary unchanged**: no new backend, Apps Script, SQL/database, service account secret, browser storage token, paid automation, outreach, HubSpot write or direct Company edit. V1 `data-center/config.js` retains `readOnly:true` and `spreadsheets.readonly`. The original production admin and website routes remain unchanged.

### Security decision still required

Google `https://www.googleapis.com/auth/spreadsheets` is an account-wide Sheets write scope; source code pinning a QA workbook does **not** reduce what a compromised bearer token could potentially access. **Do not treat the current QA-only browser login implementation as accepted for Production.** The recommended Production approach, pending acceptance, keeps the browser read-only and uses a separately controlled/audited owner-authorized Google Drive/Sheets connector through ChatGPT management or an equivalent existing approved provider process for each accepted append. This avoids broadening V1's Google browser token. No new CRM/backend is needed.

Independent writers can still race between fresh reads and appendCells. Sheets does not enforce immutable unique IDs on its own. The production policy must state a **single authorized writer**, fresh preflight of current evidence and audit, readback of all relevant IDs, one write attempt, stable request ID, and human reconciliation on ambiguous responses. **Do not claim guaranteed parallel-writer idempotency** or delete/supersede old observations automatically.

Before a real write contract can be authorized, decide where restricted **operational** V2 Evidence/Audit rows live without modifying the immutable Phase 3 archive or duplicating canonical Company identities. The Master Workbook includes existing historical CRM tabs and an older reader permission, so adding restricted evidence there without reviewing file-wide ACLs is not automatically safe. An owner-only evidence ledger holding just Company ID foreign keys (not a second Companies table) is a candidate, **not approved**. The existing QA workbook is explicitly NOT CANONICAL and must never be used for real research.

### Remaining V2 acceptance gates

- **Google Auth Platform**: Browser authentication on ephemeral Vercel Preview origin is NOT accepted. The current known Web OAuth client may authorize Production origin only. Do not bypass origin validation, expand testers casually or claim interactive Google consent has passed. Official Google Cloud configuration and an approved stable Preview origin or isolated provider QA are required to test this particular browser route.
- **Owner-facing QA gate**: simulation and direct *independent connector* synthetic Evidence+Audit readback PASS; the newly built owner browser QA sign-in/submit/readback is NOT physically tested. Treat its write scope as risk until accepted.
- **Owner live research reviewer**: device UI + exact Google OAuth source load, 7-view regression compatibility, expiration/reentry, confidentiality partitions, source classification and mobile/desktop/tablet checks need live acceptance. Simulated source/mock tests are not live browser evidence.
- **Operational target/permissions**: select approved owner-only evidence/audit storage under Google Sheets, no second canonical Company database, field-level evidence lineage, human review, immutable IDs and rollback/reconciliation runbook. No live research write has passed.
- **V1**: separately remains PARTIAL due to outstanding desktop and tablet acceptance (owner allowed an early V2 sequencing exception).

### Verified development evidence

GitHub Actions dedicated IDC safety suite included all V1 and V2 synthetic tests, including QA gateway no-retry/uncertain-result scenarios and real reviewer wrong-account/source-error/Lock checks. Final exact run, commit and Preview deployment must be read back after the last change. The prior **real connected Google Sheets** synthetic QA append PASS has already been recorded separately and must NOT be conflated with the new untested UI. Original Company count remained 2,878 unique IDs and historical evidence 702 IDs after that isolated write.


## Owner-approved operational storage boundary (11 October 2026)

**Authority:** Owner expressly approved the creation of an owner-only Google Sheets Evidence and Audit ledger for V2. The workbook was created with the connected TSS Google owner identity, not a service account. Its exact private URL and ID are recorded **only in the private authoritative TSS operational register and Google Drive**, not in public website source or this public repository. It must NOT be confused with the earlier isolated synthetic QA workbook or the preserved Phase 3 archive.

**Independently verified owner-only permission:** Google Drive `shared=false`, `thesmartysolution@gmail.com` the only ACL principal (owner); the separate personal Google connection returned `403 PERMISSION_DENIED` for this new ledger. Keep these restrictions and recheck before any approved write.

**Initial workbook tabs (no real research rows):**

| Tab | Schema or purpose |
|---|---|
| Operating Rules | Owner/private-only access, append-only evidence intent, canonical ID foreign keys, single-writer and no-retry procedures, V2 release HOLD |
| Evidence Observation | Archive-compatible `evidenceId` through `version` (21 fields), plus `requestId`, `decisionId`, `auditId` |
| Audit Ledger | Immutable `auditId`, `requestId`, event timestamp, actor, action, entity, record/Company/decision ID, prior/new version, outcome, provenance and independent reconciliation |
| Review Decisions | `decisionId`, `requestId`, canonical `companyId`, proposed fact/path/source/date, reviewer, human disposition, rationale, linked Evidence/Audit IDs and information class |

The ledger has **no Companies tab**. All Company identity matching uses existing canonical `Companies.id` from the Master Workbook, not a copied list. The preserved Phase 3 research archive is unchanged. Evidence, Audit and Decisions tables started at exactly one header row each; no source observations, approvals or audit events were imported. The spreadsheet timezone is `Asia/Nicosia`.

Strict cell dropdown validation readbacks verified Evidence verification statuses, freshness states, information classes, Audit outcomes, Review Decisions dispositions and information classes. These reduce accidental classification errors but **do not** implement a database transaction, uniqueness guarantee or human authorization.

**Scope guard:** Storage-target creation and ACL verification PASS. This does not authorize any live Evidence/Audit/Decision append. PR #87 remains DRAFT and V2 release HELD until a single owner-authorized writer process, fresh canonical/evidence ID preflight, immutable request reconciliation, human decision, privacy partition, independent provider readback and explicit Production acceptance have passed. Do not introduce broad write-capable browser OAuth scopes into V1. Use only existing approved Google provider tooling for isolated future write QA pending a least-privileged final contract.

**Source integrity after creation:** Master Companies remain 2,878 unique IDs; preserved Phase 3 Evidence Observation remains 702 unique IDs (bounded connected Google Sheets readback). Neither original source workbook was edited as part of establishing the V2 storage ledger.

For exact file identifiers and authoritative approval evidence see the private Google Doc **TSS Current System Map and Open Work Register**, section “OWNER-APPROVED V2 OPERATIONAL EVIDENCE AND AUDIT LEDGER CREATION”.
 

## Operational three-tab owner write contract — acceptance checkpoint

**11 October 2026:** `operational-write-contract.mjs` and `../tests/v2-operational-write.test.mjs` added to the **Draft, unmerged** V2 development PR. The module is pure JavaScript with **no network calls or live workbook ID** and is intentionally not imported into V1 or the public Preview browser.

A future individually authorized ChatGPT-managed Google Sheets write must provide a **fresh provider-sourced snapshot** of all three operational tabs, plus current canonical Company IDs, historical archived evidence, verified owner identity, owner-only file ACL and a single-writer reservation. The adapter does **not** autonomously acquire these proofs: supplying unverified booleans or stale snapshots is prohibited.

The contract accepts only:
- A specific source-backed fact proposal attached to an exact unique canonical Company ID (never a new CRM Company).
- Explicit owner decision `APPROVED`, reviewed rationale, stable request/evidence/audit/decision IDs, source URL/date and approved information classification.
- No synthetic/QA IDs, duplicate fact observation, supersession, or unreviewed conflicting/restricted research.
- One controlled three-tab **append-only** plan: `Evidence Observation`, `Audit Ledger`, `Review Decisions`, all sharing the same request ID with cross-linked IDs. No direct Company edit or HubSpot write.
- A single provider batch request constructed only **after** fresh ID scans and complete approval. Verify the returned state using independent provider reads of all three tables. On ambiguity, stop and reconcile by immutable request ID; never auto-retry.

**Test result:** GitHub IDC security/regression workflow run `38167952021` completed SUCCESS at commit `2b55f417e5d3a3c7f65aa4a394ebbfba249c55d2`. The additional tests use synthetic objects and simulate prepared evidence/audit/decision rows, owner-approval checks, ACL/snapshot failures, duplicate IDs across tabs, conflicting facts, restricted classification and exact readback. **No operational Evidence/Audit/Decision row was added and no Production source was altered.**

**Provider-write and concurrency limitations:** The JavaScript module returns a plan; it is not a Google write integration and cannot itself verify a real OAuth account or reserve a provider-level transaction. Native Sheets does not enforce unique IDs, so single-writer exclusion is an operating condition rather than a tested globally atomic lock. The existing provider-connected Google Sheets actions may carry out an individually authorized future append, but end-to-end live acceptance remains HELD until a specific reviewed real research fact, actual owner approval, independent fresh preflight, single attempt, and audit readback can be verified.

Do not write anonymous/synthetic QA fixtures into the owner-only **operational** ledger simply to make it appear active. The previously approved separate `NOT CANONICAL` QA workbook holds synthetic write evidence. V1 desktop/tablet acceptance and V2 live mobile/desktop/browser checks remain OPEN.
