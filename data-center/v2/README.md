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
