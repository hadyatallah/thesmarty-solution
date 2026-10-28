# Client prospect discovery correction — staged, not activated

Baseline verified 28 October 2026: Production deployment `dpl_7kbEGuwQnvvAy6uHv6hcAjfzjEHv`, commit `9029ed8c65ba92e960f6c7b8e2fc4055071dd154`, branch `publish/global-expat-hub-20261027`. Main is divergent. No repository AGENTS.md or .agents skills were present on this baseline.

## Source and purpose

The INDEX listing adapter finds developer signals and stores referral organisations. It is not a company web-search API. Its role verification intentionally excludes agencies from developer research. Changing a seller filter would neither establish small-company ownership nor supply the intended client-discovery workflow.

Client discovery belongs to the existing ChatGPT daily research task, using public first-party websites and source-backed review. Do not create a second schedule, API, service, paid subscription or credentials. ChatGPT coordinates; Sheets stores research evidence; HubSpot remains the commercial record. No new offering or fee is introduced.

This patch preserves the historical developer/referral cycle and records, clearly labels its purpose and zero-result outcomes, and makes its accepted handoff `REVIEW_REFERRAL_FIT`. An authenticated request to the existing endpoint with `purpose=TSS_CLIENT_PROSPECTS` returns HTTP 409 / `EXTERNAL_RESEARCH_REQUIRED` before calling providers or writing anything. It does not execute ChatGPT, search the web or imply an automation has run. Unknown purposes also fail closed. Existing requests with no purpose retain referral compatibility; neither their saved records nor their historical agency rejections are reclassified.

The Research Center explains this separation. `RESEARCH_CYCLE_COMPLETE` remains a technical persistence receipt for backward compatibility; `discoveryOutcome=NO_CANDIDATES` and `clientProspectsDiscovered=0` explicitly prevent using it as client-acquisition proof. The UI states this limitation even for older records without these fields.

## Existing researcher intake

`node scripts/tss-irc-prospects.mjs` accepts JSON on stdin (maximum 1 MiB) and produces a deterministic, non-writing research assessment. It is not a search engine and must not replace actual source reading.

Required batch fields: `source:EXISTING_CHATGPT_WEB_RESEARCH`, `target:SOLO_AGENTS_SMALL_OWNER_LED_AGENCIES`, `observedAt`, `candidates` (at most 100), and `existingRecords`. `screeningComplete` may only be true after the existing consumer has read all relevant identity, suppression and hold records. An empty existing-record array does not imply screening is complete.

Each candidate has `name`, `website`, optional `aliases`, `recordType:TSS_CLIENT_PROSPECT`, `identityConflict`, `suppressed`, `holds`, and an evidence array. Each evidence item contains `claim`, `value` (`SUPPORTED` or `CONTRADICTED`), a same-domain first-party HTTPS `url`, a concise `observation`, `observedAt`, `sourceType:FIRST_PARTY`, and `reviewed:true` only after actual researcher review. These are trusted researcher assertions, not website-supplied instructions. The module checks evidence structure; it cannot certify factual truth from a link or boolean.

Claims: `realEstateAgency`, `cyprusOperations`, `smallOrSolo`, and `ownerLed`. A documented boutique description supports initial segment review; a page listing six people is not proof of exhaustive headcount. Historical descriptions of a small founding venture do not establish current size. Missing size/ownership receives `ENRICHMENT_REQUIRED`, not blanket agency rejection. Contrary evidence excludes; conflicting evidence and duplicate names, aliases or domains remain held. Referral records are excluded from this intake without modifying them.

`QUALIFIED_FOR_REVIEW` means only that the supplied evidence supports initial target review. It does not verify legal identity, TSS commercial fit, buying intent, consent, or an approved service. Those remain separate. Every result is `commercialOutcome:HELD`, `outreachReady:0`, with `ACCEPTANCE_ONLY` and `INTERNAL_QA_LOGGING_HOLD` retained. No passed permission flags can turn this offline intake into a sender or CRM writer.

## Non-sending evidence smoke test

Run `node scripts/tss-irc-prospect-evidence-smoke.mjs`. It uses dated observations from these public pages, not a hardcoded discovery universe:

- [Tandy](https://tandyrealty.com.cy/about-us/): boutique and family-run statements, agency trade name, Cyprus address. Qualifies for initial research review; legal/brand mapping and identity review remain held. No claimed headcount.
- [Sarikas](https://sarikasproperties.com/about-us/): family operation and Cyprus agency services. Current size remains unknown, so enrich.
- [KAZO](https://kazo.com.cy/our-team): Cyprus agency and CEO/founder with six displayed profiles. Exhaustive size remains unknown, so enrich.

Expected result: 3 inspected, 1 qualified for research review, 2 requiring enrichment, 0 outreach-ready, 0 messages, 0 CRM writes. Full HubSpot/Outlook identity/history screening is deliberately incomplete. No company or contact is inserted by this smoke test.

This public smoke fixture omits live CRM records. Re-running with existing identities supplied changes matching candidates to `DUPLICATE_HOLD`; absence from the IRC workbook never establishes global novelty. Keep current restricted CRM evidence outside this public repository.

## Release and activation gates

1. Review the narrow diff against the deployed baseline, then obtain explicit merge/deploy approval. Do not deploy divergent main or inadvertently publish unrelated branch work. Authentication, lock, journal, signature, schema and scheduler configuration remain unchanged.
2. The coordinator must separately review and approve an additive read-only discovery amendment to the **existing** ChatGPT task. Its last verified state is paused, ACCEPTANCE_ONLY; do not infer active recurrence from this patch. Retain the exact saved commercial restrictions and QA logging hold. Verify the actual schedule/timezone independently before activation. No task was edited here.
3. The amended research task must actively discover new candidates, read first-party sources, retain unknowns, reconcile duplicates with existing research/CRM history through already-authorized reads, and use this intake or its exact contract. Do not ask Hady to find a list, reuse these smoke examples as the only source, or wait for a developer-listing result to begin independent public research.
4. Keep findings in the approved research workflow with dated sources and exact unresolved checks. No automatic writes to referral organisations, HubSpot, outreach queue or canonical companies are provided or authorized by this patch. Any persistence adapter must be reviewed against existing authorization and schema first; do not improvise one.
5. Observe a real research execution and its retained evidence. Only then describe discovery as operational. Sending, CRM mutation and QA recovery remain independently held and require their existing acceptance/authority; this patch does not release them.

Regression command: `node --test tests/tssIrc*.test.mjs`. Tests cover wrong source/target, referral separation, evidence gaps, conflicts, duplicate names/domains/aliases, exclusions, suppressions, zero results, authenticated routing and no-provider/no-write client requests, alongside the existing authentication, signature, journal and commercial handoff regressions.

Local verification on 28 October: `node --test tests/tssIrc*.test.mjs tests/tssBuyerDiscoverability.test.mjs` — 97 passed, 0 failed. API syntax and `git diff --check` passed. Existing lockfile dependencies were installed without lifecycle scripts; no package or lockfile changes. Hosted CI and live acceptance are separate evidence.

Independent local review found and verified a fix for duplicate matching against existing HTTP/bare-domain website values. Identity normalization now accepts those representations while evidence still requires HTTPS. The reviewer reran the 9 prospect tests successfully and found no further blocking defect. It confirmed that static smoke samples are not imported into production, missing screening cannot authorize outreach, and authentication precedes routing.

Broader local verification: `node --test tests/*.test.mjs data-center/tests/*.test.mjs` yields 342 tests, 334 passes, 8 failures. An isolated archive of exact Production base `9029ed8` with the same dependencies yields 332 tests, 324 passes and the same 8 failing tests: task-metrics generated bundle, two Kiti redirect expectations, insights generated output, three obsolete zero-cron assertions, and a Windows-incompatible legacy source scan (`C:\\C:\\...`). These files/configuration were not changed by this correction. The aggregate suite is not green; no new failure was observed. Do not misreport the focused green suite as full-repository acceptance.

The unrelated social suite was also compared: `node --test social/tests/*.test.js` gives 67 tests, 59 passes and the same 8 failing tests on both candidate and exact baseline (automation-readiness, monthly-plan, schedule, approval expectations, and unavailable ffmpeg). No social files changed. Research Center inline-script syntax passes. No hosted browser or production acceptance is claimed.
