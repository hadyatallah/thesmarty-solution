# TSS Company Data Center Phase 3 Preview

**Date:** 27 September 2026  
**Purpose:** Isolated infrastructure prototype and QA fixture, not a Production release.

## State

The prototype adds the seven requested research-support structures plus a Data Center audit ledger to a private copy of the live workbook. It leaves the copied `Companies` tab, all 2,876 rows, the 36 legacy columns, and every Company ID unchanged. The synthetic preview website has no production data connection, no external APIs, no Company write action, and no communication function.

The live Apps Script backend has not been changed. Its current schema and write path do not accept the new support objects. This package therefore proves the object model and safety rules in isolation, but it does not claim authenticated persistent application integration. The Phase 3 production gate remains closed until the same controls are integrated into the existing backend and tested there.

## Open the isolated assets

- [Preview workbook](https://docs.google.com/spreadsheets/d/1k-ZZ6I2gvhsw3S6rWmGnbb1MdU7UowLHq0QHQ9jW_uc/edit)
- [Synthetic preview UI](company-data-center-preview/index.html)
- Matching engine: `data-center/engine.mjs`
- Acceptance fixtures: `data-center/tests/phase3.test.mjs`

The preview workbook is owner-only. It contains a full copy of the existing workbook plus the new research tabs. Synthetic fixture rows are visibly marked and must never be counted as market evidence.

## Architecture boundaries

1. `Companies` remains the only canonical Company identity. The Data Center uses its existing Company IDs as foreign keys.
2. Supporting research objects are not Commercial Network entities.
3. The six approved Commercial Network entities remain unchanged.
4. A Data Center dossier is a view assembled from a canonical Company plus evidence and linked support objects. It is not a second Company table.
5. Company category, researchLevel, leadScore, scoreBand, and the remaining legacy fields keep their existing meanings.
6. Research Candidates cannot create outreach, a prospect, or a canonical Company automatically.
7. Candidate-to-Company creation requires a human approval, identity basis, and source lineage.
8. Candidate matching returns suggestions. Even a domain match never performs an automatic link or Company creation.
9. No merge operation is provided. A duplicate candidate relationship cannot be used to merge records.
10. Evidence is append-only. Conflicting claims are retained with a conflict group rather than replacing prior evidence.
11. Missing information returns Unknown. It does not become a negative fact.
12. Project-company roles require evidence. Roles do not transfer between related Companies.
13. Research Runs require an idempotency key.
14. Source usage levels explain permitted use and limitations. There is no numeric source-truth score.

## Data objects and field definitions

`*Id` fields are identifiers. `companyId` always references an existing row in `Companies`. Empty `companyId` and populated `candidateId` keep a finding in staging. Dates are ISO 8601 strings. Every mutable support row has `version`, `createdAt`, and `updatedAt` where applicable.

### Research Candidate

Fields: `candidateId`, `discoveredName`, `normalizedName`, `website`, `normalizedDomain`, `country`, `region`, `locality`, `sectorHint`, `roleHints`, `discoverySourceRef`, `discoverySourceRefs`, `discoveredAt`, `candidateStatus`, `possibleCompanyId`, `identityMatchBasis`, `matchReviewState`, `assignedResearchOwner`, `reviewedAt`, `disposition`, `notes`, `createdAt`, `updatedAt`, `version`.

- `discoveredName` / `website` preserve the observed source values.
- `normalizedName` / `normalizedDomain` are matching aids, never canonical identity fields.
- `discoverySourceRef` preserves the first discovery reference. `discoverySourceRefs` keeps additional references when repeated discovery resolves to the same staged candidate.
- `candidateStatus` tracks the workflow. `disposition` records the reviewed outcome. `possibleCompanyId` is only a suggestion until a person confirms it.
- Candidate status values: New; Matching; Needs Review; Linked Existing Company; Approved New Company; Duplicate / Alias; Not Relevant; Inactive / Unverifiable; Deferred.
- Disposition also supports Related Company and Project / Brand Only.

### Research Source

Fields: `sourceId`, `sourceName`, `sourceType`, `baseUrl`, `publisher`, `geographyScope`, `sectorScope`, `sourceUsageLevel`, `accessMethod`, `active`, `lastSweptAt`, `nextReviewAt`, `sourceLimitations`, `notes`.

`sourceUsageLevel` is one of Identity / Official Evidence, First-Party Evidence, Structured Market Discovery, Independent Corroboration, or Discovery Only. It is not a reliability score. Blank sweep dates mean the source has not been swept.

### Evidence Observation

Fields: `evidenceId`, `companyId` or `candidateId`, `factType`, `attributePath`, `valueJson`, `displayValue`, `sourceId`, `sourceRef`, `sourcePublishedAt`, `observedAt`, `verificationStatus`, `freshnessStatus`, `informationClass`, `supersedesEvidenceId`, `conflictGroupId`, `capturedBy`, `reviewNotes`, `createdAt`, `updatedAt`, `version`.

- The subject is one canonical Company or one Research Candidate.
- `attributePath` identifies the fact being asserted. Each fact has its own verification and freshness.
- `sourcePublishedAt` may be blank when unknown. `observedAt` records when TSS checked it.
- Verification: UNVERIFIED; SOURCE SUPPORTED; DIRECTLY CONFIRMED; CONFLICTING / REVIEW REQUIRED.
- Freshness: Current; Review Due; Stale.
- Information class: Reusable TSS Intelligence; TSS Restricted Intelligence; Mandate Confidential; Highly Restricted.

### Identity Relationship

Fields: `relationshipId`, `relationshipType`, `fromCompanyId` or `fromCandidateId`, `toCompanyId` or `toCandidateId`, `evidenceId`, `verificationStatus`, `observedAt`, `reviewState`, `notes`, `createdAt`, `updatedAt`, `version`.

Relationship types: Same Company / Duplicate Candidate; Trading Name; Former Name; Brand Operated By; Project Brand; Parent; Subsidiary; Group Sibling; Development JV; SPV / Project Vehicle; JV Participant; Possibly Related / Review Required. A relationship does not imply a commercial Partner Relationship.

### Research Run / Market Sweep

Fields: `runId`, `sector`, `geography`, `sourceSet`, `methodologyVersion`, `startedAt`, `completedAt`, `candidatesFound`, `matchedExisting`, `newCanonicalCompanies`, `duplicateOrAliasReviews`, `unresolvedCandidates`, `inaccessibleSources`, `knownCoverageLimits`, `operator`, `notes`, `idempotencyKey`, `status`, `createdAt`, `updatedAt`, `version`.

The run records the source and query set, counts and limitations. Repeating the same idempotency key returns the existing run rather than creating a second one.

### Developer Project

Fields: `projectId`, `projectName`, `normalizedName`, `district`, `locality`, `developmentType`, `propertyType`, `observedStatus`, `statusDate`, `website`, `firstObservedAt`, `lastObservedAt`, `researchState`, `createdAt`, `updatedAt`, `version`.

Project status and date are evidence-dependent. Unknown is valid. A project name does not become a Company identity by itself.

### Developer Project Company Role

Fields: `roleId`, `projectId`, `companyId` or `candidateId`, `projectRole`, `verificationState`, `evidenceId`, `observedAt`, `notes`, `createdAt`, `updatedAt`, `version`.

Roles: Developer; Development vehicle / SPV; JV participant; Landowner; Contractor; Architect; Project manager; Sales agent; Operator; Brand. A Company can hold more than one role, and each role must be supported independently.

### Data Center Audit Log

Fields: `auditId`, `timestamp`, `actor`, `action`, `entityType`, `recordId`, `requestId`, `priorVersion`, `newVersion`, `outcome`, `details`.

The preview contains one synthetic fixture event only. It is not a persistent production audit trail.

## Cyprus developer sector pack

- Geography: Republic of Cyprus only; Northern Cyprus excluded unless later approved.
- Districts: Famagusta, Larnaca, Limassol, Nicosia, Paphos.
- Company roles: Residential Developer; Commercial Developer; Mixed-use Developer; Land Developer; Hospitality Development; Industrial / Logistics Development; Redevelopment; Developer + Contractor; Developer + Agency / Sales; Developer + Investment / Asset Ownership.
- Operating status: Observed Operating; Operating Status Unknown; Confirmed Inactive.
- Development activity: Observed Active Development; Observed Current Project Commercialization; Historical Development Evidenced; Development Activity Unknown; Confirmed Development Activity Ceased.
- The pack also records project/property type, office vs project geography, operating geography, sales/buyer journey routes, digital channels, observable technology signals, and public business contact routes.
- English and Greek terminology, district/locality, project-driven, company-confirmation, project-confirmation, site-specific, property-portal, and social-discovery search families are registered as repeatable query families. No full source sweep has been performed.

## Source register loaded in the preview workbook

The register has 19 source families plus one synthetic test source: Cyprus Property Developers Association; other industry associations; commercial developer directories; company websites; project websites; Google/web search; Google/business listings; property portals; LinkedIn; Instagram; Facebook/business pages; construction/property media; press releases; planning/development announcements; partner websites; existing TSS CRM Companies; Market study; Coverage; Instagram screening; synthetic QA fixtures.

The CPDA and directory URLs are the known source references carried from the approved methodology and existing Coverage notes. Generic source families remain without a source URL until a specific accessible source is selected and reviewed. No row is marked as swept.

## Research and identity workflow

`Sector/geography → source sweep → candidate staging → canonical Company match review → evidence extraction → enrichment → freshness/conflict review → Company dossier projection → supported roles/signals when justified → research-gap queue`.

- Exact business domain and official business email domain produce review suggestions. Multiple Companies with a shared domain remain ambiguous.
- Public email domains never identify a Company by themselves.
- Similar name alone, shared phone alone, or shared address alone never force a match.
- Candidate matching never auto-links or creates a Company.
- Project brand, subsidiaries, groups, and SPVs stay distinct until a relationship is evidenced.
- Company operating status and development activity remain separate facts.
- No observed agent, CRM, WhatsApp, or project remains Unknown when not found.

## QA rules and verified local results

Run from the repository root with:

```bash
node --test data-center/tests/phase3.test.mjs
```

The synthetic test suite currently passes 14 test groups covering:

- required supporting schemas and approved enums;
- exact-domain match suggestions and shared-domain ambiguity;
- public email, similar-name, phone, and address false positives;
- repeated candidate staging and source lineage;
- append-only conflicting evidence;
- freshness and Unknown handling;
- duplicate Research Run prevention;
- Research Candidate no-outreach and no-merge safeguards;
- human approval before Company creation;
- evidence-backed project roles and no role inheritance;
- protected legacy Company fields;
- Company dossier projection from canonical Company plus evidence, while keeping legacy CRM attributes separate;
- all 12 controlled pilot case dispositions as synthetic fixtures.

The 12 cases test the requested dispositions. The code does not independently verify their public evidence. This is a fixture test, not a completed live-company audit.

### Preview workbook checks

- The backup copy and Preview workbook read successfully.
- `Companies!A1:AJ3002` is byte-for-value identical between the backup and Preview workbook after supporting tabs were added.
- The Preview workbook has the eight supporting tabs: Research Candidate, Research Source, Evidence Observation, Identity Relationship, Research Run, Developer Project, Developer Project Company Role, and Data Center Audit Log.
- The Preview workbook contains one clearly marked synthetic candidate, synthetic evidence observation, synthetic research run, synthetic project/role, and one synthetic audit event. These do not represent real market research.
- The workbook metadata confirms the Preview file is owner-only.
- Existing workbook tabs and Company fields remain preserved in the Preview copy.

## Backup, restore and rollback

### Verified

- Fresh backup created from the live workbook before changes.
- Backup reopened; workbook metadata and Companies header/sample rows were readable.
- Preview workbook was copied from that backup.
- Every value in the copied Companies range A1:AJ3002 matched the backup after adding the Preview tabs.

### Not tested

- Restoring over the live workbook.
- Restoring the live Apps Script backend.
- Production rollback of a Data Center UI release.

No live changes have been made, so no Production restore has been needed. Keep the backup intact. If a Preview test corrupts its own data, discard the Preview copy and create a fresh one from the verified backup. Do not replace the live workbook or point the live backend to a copy without a separately tested migration/restore procedure.

### Code rollback

The UI and engine are isolated files. If a Preview deployment is created from a branch, revert the branch commit or close the pull request. Do not merge it into the Production branch. No release or rollback has been executed.

## Security and privacy

- No credentials or production secrets are present in this package.
- The synthetic UI performs no network calls and does not read CRM data.
- The Preview workbook is owner-only and contains a copy of CRM data. Keep its sharing restricted to the TSS owner unless a deliberate access review changes this.
- No unnecessary personal contacts were added.
- Mandate-confidential information is not used in reusable Company records.
- No external communication, outreach, qualification, or opportunity creation occurred.

## Remaining implementation gates

Production integration remains blocked until:

1. The new schemas and operations are implemented inside the current authenticated Apps Script backend, or an approved same-source equivalent, without adding a second Company store.
2. Backend role/permission enforcement, audit, idempotency, concurrency, recoverable failures and no-outreach behavior pass isolated tests.
3. The CRM UI reads the canonical Company and linked evidence to render Coverage, Research Queue, dossier, Sources, and Data Quality views without changing existing CRM behavior.
4. The 12 company cases are investigated against current primary pages and the existing CRM evidence. Their fixture outcomes are not accepted as evidence.
5. Backup/restore and rollback are tested against the actual preview backend.
6. Every test gate in the Phase 3 request passes.

Only after those gates should the 562 existing Developer and Developer / contractor labels be reconciled. Only after reconciliation and a second discovery pass should the sector coverage state be reassessed. Current state remains **Source Set Incomplete**.

## Exact next phase prompt

> Continue Phase 3 from this isolated Preview build. Keep the live Companies entity as the sole Company identity source and preserve all Company IDs, the 36 legacy fields, and the six Commercial Network entities. Implement the support objects and data operations inside the existing authenticated Apps Script backend using the current canonical workbook, with per-fact evidence lineage, human identity review, audit, optimistic concurrency, idempotent Research Runs, permission checks and hard no-outreach behavior. Extend the CRM UI additively to show Coverage, Research Queue, Company dossier, Sources and Data Quality. First test only in a fresh isolated Preview copy seeded from the verified 27 September backup. Independently research and resolve the 12 approved pilot cases using checked source pages. Do not reconcile live Companies, run the full market sweep, qualify developers, create prospects, contact companies, or deploy to Production until every Phase 3 preview gate passes. Stop and report if the existing Apps Script project cannot be safely extended or backup/restore cannot be tested.
