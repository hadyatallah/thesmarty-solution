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

## Research completeness formula — **PROVISIONAL**, not commercially approved

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

Thresholds for **preview human-review prioritization**: ≥75 Evidence-review ready, 45–74 Enrichment needed, <45 Research incomplete. These are provisional and have NO bearing on CRM lifecycle stages, commercial fit, approved contact, mandate readiness or outreach.

A company always requires human evidence review. Reasons are explicit; unresolved identity conflict, duplicate IDs, missing HTTPS sources, invalid IDs, stale/missing research dates and internal QA entries are held or routed to research review. **There is no automated HubSpot promotion or email send path.** Current `leadScore` and `scoreBand` are displayed only as historical legacy fields, never calculation inputs.

## Critical distinction

1. **Research completeness**: Do we have fields, links and a dated research review?
2. **Evidence validity**: Does a person validate source, identity, role, geography, timeline and conflicting facts? V2 does NOT claim this.
3. **Strategic fit**: Does the evidenced company suit an approved TSS offering? Requires separate assessment and reviewed weights; V2 leaves `fitQualification` = `NOT_ASSESSED`.
4. **Buying intent / engagement / contact consent**: Only an authorized commercial observation in HubSpot; V2 leaves buying intent `UNKNOWN` and outreach authorization `false`.
5. **Opportunity/mandate qualification**: Separate governed owner decision; no research field creates or modifies HubSpot deals.

## Data access and security gate

The pure engine can accept the historical Companies header row through `sourceRowsToCompanies`, extracting only the explicit research-side field allowlist. It drops legacy lifecycle/communication fields and does not read customer email bodies, Outlook, ticket records, contact lists, CRM tasks or payment details. The example preview contains only **fictional** company data and is not a production Data Center.

Before a LIVE private view is authorized:
- Verify current Apps Script source state and ensure existing auth is retained; do not open a public route exposing full Company rows.
- Build an authenticated, least-privilege Google Sheets read adapter with field allowlist and owner-bound server authorization; never place a service account key in HTML or return raw internal notes to anonymous users.
- Test exact 2,877 canonical IDs, all held identities from Phase 3 Preview, research freshness dates, source provenance and audit output. No silent merges or retroactive role certification.
- Approve research readiness scoring weights/thresholds separately; avoid any automatic commercial ranking until source verification and fit criteria are specified.
- Complete read-only private Data Center QA on desktop/tablet/mobile; then consider a separately approved Production UI change.
- Align HubSpot company/Contact IDs and mapping as a separate write gate. `TSS_HUBSPOT_SYNC_ENABLED=false` remains in effect until controlled real eligible enquiry, task scopes, idempotency, backup/rollback and recovery pass.
- The old System Control currently labels some outreach and sync switches ON. These are configuration **not execution proof**, and neither turns off automatically with this preview.

## Release acceptance status

- Pure module and offline tests: pending GitHub CI verdict for exact branch commit.
- Static preview: pending Vercel preview build and manual visual/interaction assessment.
- Full native source evidence and identity holds: historical accepted gated material, not re-run in this package.
- Production source/UI, company scores, HubSpot records, API scopes, website contact form and scheduled automation: UNCHANGED.
- WhatsApp → HubSpot: NEXT workstream, NOT started.
