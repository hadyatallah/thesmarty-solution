# TSS Data Center — research readiness V2 implementation (PREVIEW / non-writing)

Date: 2026-10-09 · Authority: [TSS Data Center → HubSpot transition specification](https://docs.google.com/document/d/1-WyBphpAGDAbbc9si-uZG9KTL6xdgmvD54BUH93HbV0/edit).

## Implementation baseline

- The existing native TSS CRM Master Workbook has 2,877 unique Company IDs, plus 2,877 existing **legacy sales-blended** `leadScore` values, `scoreBand`, `scoreReason`, and `scoreUpdatedAt`.
- Existing `Prospect Queue`: 20 selected/review candidate rows. No automatic outreach is authorized.
- HubSpot Starter is the target commercial CRM. The legacy application remains operational until separately accepted cutover. WhatsApp is NEXT after this transition, not part of this PR.
- This change adds a **pure, deterministic, read-only**, source-focused research completeness engine and a **fictional sample** preview. It does not connect to or mutate Google Sheets, HubSpot, CRM session state, Apps Script, emails, WhatsApp, or Vercel environment variables.
- No new subscriptions, API scopes, deployed cron jobs or Production switches.

## Code

- `crm/data-center-research-engine.mjs`: canonical pure engine (shared static and private test source).
- `lib/tssResearchQualification.mjs`: server-side re-export, no logic copy.
- `tests/tssResearchQualification.test.mjs`: strict no-sales-inference, freshness, review and duplicate-rejection tests.
- `crm/data-center-research-preview.html`: desktop/tablet/mobile responsive, self-contained **synthetic** preview using the exact engine, with search, gate filters, ordering and breakdowns. No APIs or external resources.
- `.github/workflows/tss-research-readiness-v2-tests.yml`: targeted PR CI.

## Research completeness formula — OWNER-APPROVED FOR READ-ONLY HUMAN RESEARCH REVIEW ONLY

| Input present/valid | Points | Claim limitation |
|---|---:|---|
| Canonical TSS ID + name | 10 | ID syntax and name presence, NOT identity verification |
| First syntactically safe HTTPS source | 20 | Presence of a URL, NOT source validation |
| Second distinct HTTPS source URL | 10 | Different URL, NOT independent corroboration |
| Research review date | 15 current (≤90 days); 7 aging (91–365 days); 0 otherwise | Date recency, NOT present activity proof |
| Category | 5 | Raw input, NOT supported developer role |
| District | 5 | Reported district, NOT confirmed operational reach |
| Portfolio or services narrative | 10 | Text present, NOT audited correctness |
| TSS fit narrative | 10 | Evidence completeness, NOT buying intent or mandate |
| Verification notes | 10 | Text present, NOT formal fact verification |
| Valid HTTPS company website | 5 | Website pointer, NOT business legitimacy |
| **Maximum** | **100** | **RESEARCH DATA COMPLETENESS ONLY** |

Thresholds for **preview human-review prioritization**: ≥75 Evidence-review ready, 45–74 Enrichment needed, <45 Research incomplete. Owner approval on 9 October 2026 applies ONLY to these transparent research field-completeness weights and thresholds for human review prioritization. They have NO bearing on CRM lifecycle stages, commercial fit, verified source quality, contact consent, mandate readiness or outreach.

A company always requires human evidence review. Reasons are explicit; unresolved identity conflict, duplicate IDs, missing HTTPS sources, invalid IDs, stale/missing research dates and internal QA entries are held or routed to research review. **There is no automated HubSpot promotion or email send path.** Current `leadScore` and `scoreBand` are displayed only as historical legacy fields, never calculation inputs.

## Critical distinction

1. **Research completeness**: Do we have fields, links and a dated research review?
2. **Evidence validity**: Does a person validate source, identity, role, geography, timeline and conflicting facts? V2 does NOT claim this.
3. **Strategic fit**: Does the evidenced company suit an approved TSS offering? Requires separate assessment and reviewed weights; V2 leaves `fitQualification` = `NOT_ASSESSED`.
4. **Buying intent / engagement / contact consent**: Only an authorized commercial observation in HubSpot; V2 leaves buying intent `UNKNOWN` and outreach authorization `false`.
5. **Opportunity/mandate qualification**: Separate governed owner decision; no research field creates or modifies HubSpot deals.


## Authenticated existing-CRM read-only view (same draft PR)

- The existing `crm/index.html` now offers **Research → Data Center Research (Preview)** in its internal menu and accepts `?view=Data%20Center%20Research` when navigating directly.
- The new view is **not a separate public data API**. It checks the pre-existing `sessionToken`, signed-in `state.records.Companies`, existing source-observation status, and imports the **same** `/crm/data-center-research-engine.mjs` module used by the synthetic preview and Node tests.
- It displays the full loaded count, human evidence-review queue, holds, and the first 40 matching company records with completeness breakdowns. Search and gate filters operate entirely in browser memory. No existing Companies, Contacts, Outreach, Tasks, Tickets, Opportunities, score, formula, API gateway or authentication code was removed or modified.
- Existing CRM session rules remain authoritative; cached CRM data is clearly labeled cached, not a fresh provider verification.
- A static security regression checks that the new view has an authenticated state/session gate and does not invoke any save, HubSpot, CRM or external fetch; another test compiles the full existing inline CRM scripts to catch syntax regressions.
- This is only in the **draft PR branch**, not Production. The preview deployment has not completed an owner-authenticated private QA session, including mobile testing, so no Production release is approved.

## Data access and security gate

The pure engine can accept the historical Companies header row through `sourceRowsToCompanies`, extracting only the explicit research-side field allowlist. It drops legacy lifecycle/communication fields and does not read customer email bodies, Outlook, ticket records, contact lists, CRM tasks or payment details. The example preview contains only **fictional** company data and is not a production Data Center.

Before a LIVE private view is authorized:
- Verify current Apps Script source state and ensure existing auth is retained; do not open a public route exposing full Company rows.
- Reuse the pre-existing authenticated CRM state for the first owner-only read-only review (now staged in draft PR). If a future dedicated Sheets API read adapter is needed, require an owner-bound server authorization, strict field allowlist and no anonymous access. Never put a service-account key in HTML.
- Test exact 2,877 canonical IDs, all held identities from Phase 3 Preview, research freshness dates, source provenance and audit output. No silent merges or retroactive role certification.
- Research-completeness scoring weights and human-review thresholds are now owner-approved only for read-only research triage. Source accuracy, independent corroboration, legal identity and strategic fit still require separate human verification. Never use this numeric result for automated commercial ranking, HubSpot lifecycle writes or outreach.
- Complete read-only private Data Center QA on desktop/tablet/mobile; then consider a separately approved Production UI change.
- Align HubSpot company/Contact IDs and mapping as a separate write gate. `TSS_HUBSPOT_SYNC_ENABLED=false` remains in effect until controlled real eligible enquiry, task scopes, idempotency, backup/rollback and recovery pass.
- The old System Control currently labels some outreach and sync switches ON. These are configuration **not execution proof**, and neither turns off automatically with this preview.

## Release acceptance status

- Canonical scoring module and 13 scoring regressions: GitHub CI PASS. Legacy CRM inline script-syntax/auth-gate tests added; latest branch CI and authenticated live QA remain separate gates.
- Static preview: pending Vercel preview build and manual visual/interaction assessment.
- Full native source evidence and identity holds: historical accepted gated material, not re-run in this package.
- Production source/UI, company scores, HubSpot records, API scopes, website contact form and scheduled automation: UNCHANGED.
- WhatsApp → HubSpot: NEXT workstream, NOT started.

## Phase 3 known-open-exception overlay — WIRED IN DRAFT PREVIEW, NOT PRODUCTION

Read-only owner-native source audit (9 October 2026): five unresolved Identity Relationship ledger rows implicate 7 distinct canonical Companies; four documented ambiguous-directory pairs implicate 8; five Companies have CONFLICTING / REVIEW REQUIRED Evidence Observation entries. These are 20 distinct, known-open-exception Company IDs, all confirmed present among the 2,877 current Master Workbook IDs. This is NOT a complete count of all unresolved Company identities, unverified developer roles or possible duplicate cases. The 562-record legacy developer cohort remains separately unverified.

A strict, read-only validator now exists in `crm/data-center-phase3-holds.mjs`. It accepts only a dated owner-selected `tss-phase3-known-open-holds-v1` JSON manifest, restrictive exception reasons and IDs that match the authenticated Companies collection. It rejects unknown/duplicate IDs, future or over-30-day-old manifests, malformed inputs and purported complete/cleared coverage. It cannot approve sales ranking, outreach or HubSpot lifecycle changes. The manifest with the 20 known IDs is maintained outside the repository because publishing restricted exception IDs in public static source is not authorized.

**Latest draft-branch update:** the earlier full-file replacement blocker was resolved by creating the narrow browser-only `crm/data-center-phase3-import.mjs` module and committing a small, reviewed `crm/index.html` hook. An authenticated Data Center Research view now offers owner-selected local JSON import. It validates known exception IDs and updates review counts only in browser memory, and refuses changes after the session changes. Malformed, stale, oversized, duplicated or unknown-ID manifests fail closed. The existing unjoined-holds warning remains until a valid file is selected. No IDs from the owner-restricted manifest were committed into the website. Pure Node/UI simulation and existing CRM renderer regressions pass on the PR branch. This is not signed-in owner tablet/desktop acceptance, a full Phase 3 identity census, or any release approval.

The private manifest is available for optional owner selection in the **draft Preview only**, not a static web asset. Do not publish or commit it. The updated Vercel Preview reached READY and PR #63 remains DRAFT/UNMERGED. Next separate acceptance gate is the signed-in owner session on real Companies (including the private local import, no leakage, tablet/desktop, refresh/re-login and negative access). Production, Google workbook, HubSpot, Gmail/Outlook and legacy triggers remain unchanged.

## 9 October 2026 — owner scoring decision, private holds governance, and B3 acceptance

**Owner decision**: Approved the existing exact 100-point field-completeness model and the three existing human-review bands (75–100, 45–74, below 45) **only** as a research queue prioritization aid. This approval does not certify source truth, verify developer activity, approve fit, establish buying intent, or consent to contact. The 562-record legacy developer cohort remains unverified; no automatic HubSpot handoff is authorized. No scoring input, threshold, data or runtime code changed in this documentation commit.

**Private identity-hold retention decision for the current read-only phase**: preserve the authoritative, restricted Phase 3 identity/evidence ledgers and the 20 known-open-exception manifest outside GitHub and static assets. The authenticated Data Center Research interface must require fresh owner-selected, validated local import per session; the current imported overlay is **browser-memory only**, is dropped on a reload, and must never be silently described as a persistent or complete company identity register. A blank/reloaded session remains **NOT JOINED** with explicit warning and no automatic commercial actions. Do not store restricted IDs unencrypted in localStorage, expose them through static assets, or switch on HubSpot sends/writes. A durable auto-restoring read path would require a separately implemented and accepted owner-authenticated server-side restricted register, freshness, revocation, versioned audit, fail-closed unknown handling, and exact source reconciliation. That integration is **not implemented or approved for deployment** by this decision.

**B3 accepted owner-reported private Preview test**: authenticated Google sign-in passed, 2,877 Company records loaded, private 20-hold paste fallback passed, 2,854 human review queue, 23 review holds, zero HubSpot promotions, 20/20 identity filter, 0/0 no-match search, invalid manifest fail-closed, responsive shell regression and cache/live reload/overlay clearing passed. Verified branch head before this documentation-only update: 603a661090b7021df2ec4b125e0b964c0a151028. Preview deployment dpl_GVREkh6qr19knHnMoUfb9rczsjLF READY. B3 CLOSED **for Preview only**; exact accepted executable code remains unchanged by this documentation update.

**Production release gate remains HOLD**: PR #63 stays Draft/Unmerged; no Production merge/deploy/promote, CRM/Google Sheet/HubSpot data change, credential update, server-side identity registry, Outlook/Gmail state change, or customer communication is authorized by the narrowly scoped scoring/retention approval. Current Production before this doc-only update: f036fa51b0d684dd8e486a4923075bfc5602aa82 / dpl_4Z5PKVXMaEp4668kby131m6BHrHe. Separate Production authorization, staged behavior/readback and rollback/restore verification still required. Acceptance of the transient manual-import control must not be relabeled as persistence of the imported overlay.
