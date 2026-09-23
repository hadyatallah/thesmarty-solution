# Continuation status, 22 September 2026

Candidate 0.3.0 is live in authenticated Preview with native ledger installed. OAuth/sign-in are resolved. Synthetic exact-approval write, rejected action, stored daily job and one bilingual draft passed. The original task below remains acceptance detail; do not repeat source recovery or redesign storage. See 14-implementation-report.md and live-acceptance-2026-09-22.json. Finish sync-repair live verification and remaining research/provider/monitoring/content gates; do not activate schedules early.

# Codex backend integration and acceptance task

Continue the existing implementation. Do not redesign or migrate CRM storage.

## Repository and files

Repository: https://github.com/hadyatallah/thesmarty-solution
Branch: work/tss-command-center
Base inspected: 8fc2cdfc121fb9550fb3512f6f998bac61900e46

Inspect current HEAD and AGENTS.md before editing. Candidate paths:
- command-center/crm.js: authorized snapshot read adapter and deterministic rules
- command-center/manager.js: single orchestration entry
- command-center/growth.js: prospect/history checks, matching, research port and drafts
- command-center/operations.js: normalized health, content concepts and review rules
- command-center/gateway.js: server action/approval service
- command-center/workflows.js: backend event/job/notification service
- command-center/prompts.js: versioned role registry
- crm/command-center.js: existing-interface binding and escaped renderer
- crm/assistant.js: existing AI fallback and legacy confirmed writes
- crm/index.html: same CRM, module loader
- tests/command-center/: synthetic tests and evidence runner
- docs/command-center/: contracts, limitations and evidence

## Required private dependency

Locate and export the actual current TSS CRM Apps Script project through its private resource register. crm/index.html contains the known production API reference. The Master Playbook supplies the project and master-workbook IDs. Do not treat google-apps-script-form-backend.gs in the public repo as the actual live form implementation. It is a historical variant. Do not publish private runtime source or credentials into this public repository.

Retrieve current Code.gs and appsscript.json, active deployment/version, owner/auth functions, dispatch allowlist, getState projections and coverage, saveRecord validation/concurrency, and existing triggers. Save private baseline with content hashes. Record source/API version explicitly.

## Implementation order

1. Verify and reuse existing Google session authentication server-side. Derive actor/tenant from that authenticated context. Never accept frontend tenant or role authority. Confirm current session roles and checkSession response contract from the real source.
2. Implement a durable server store for actions, approvals, audit, jobs, events and notifications using the existing TSS backend and private metadata ledgers. No CRM migration. The store atomic(key, callback) contract must serialize same-key operations, commit action+audit together, and persist across process restarts. Apps Script lock semantics and crash recovery must be verified. Do not replace it with localStorage, process Maps, Vercel local files or the tests/TestStore.
3. Choose the smallest runtime binding preserving the gateway contract. If the existing Apps Script hosts the gateway, port the Node hash/UUID functions to its native utilities and run equivalent contract tests. If an existing authenticated server bridge hosts Node, keep gateway.js there and bind its store to private Apps Script operations. This is a deployment binding, not a new product architecture. Verify current official provider documentation before changing runtime code.
4. Implement CRM adapter read/validate/execute using current getState/saveRecord. Hold server-side optimistic concurrency through the actual write, not only a pre-read. Use patches, preserve valid zero/false/custom values, enforce entity/field/enum allowlists, recheck suppression, and resolve dependent actions once. A failed batch records completed/failed/pending action IDs and must not replay earlier creates.
5. Add authenticated gateway proposal/approve/reject/execute/status/reconcile API functions to the existing dispatch or server bridge. Validate same-origin/CSRF handling as appropriate to the real auth design. Approval must bind exact destination, content, asset/account version and record version. No provider result may be invented. Unknown operation is denied. Idempotency must survive restart and concurrent requests.
6. Connect crm/command-center.js to durable proposals/pending approvals/status/audit/notifications in the SAME interface. Route sensitive legacy assistant writes through the shared server gateway. Keep ordinary CRM screens and confirmed writes working. Show partial result/failure distinctly.
7. Wire registered role prompts to the existing approved model service with structured intent validation and budget limits. Keep common rules deterministic. Do not make record identity, permissions or commercial state a model decision. Test untrusted notes/emails/websites and multi-turn context. Avoid broad CRM dumps into prompts.
8. Connect authorized read-only Outlook ingestion evidence and message receipts. Separate ChatGPT connector capability from application OAuth. Sender is info@thesmartysolution.com. Unknown/ambiguous senders go to review. No auto-qualification. Bind sending only after exact human approval and provider reconciliation. Test only internal recipients when exact test send is approved.
9. Connect a permitted current-public-source research provider. Require source URL/date and distinguish observations, claims and assumptions. Verify a real strong-fit, weak-fit, already-working-CRM and conflicting-source case. Never create a company solely from an email.
10. Expose minimal enquiry/CRM transfer business receipts, ingestion heartbeat/backlog, backups, deployment and analytics evidence through common read adapters. Do not infer health from a schedule. Define freshness windows from the approved operational register; don't invent service SLAs.
11. Bind content approval to final images/video, exact captions/accounts/timezone and immutable asset hashes. Reuse the existing approved publisher. Preserve its disabled unattended state. Query provider before retrying an uncertain post. No public test publication without exact approval.
12. After Phases 1-3 live gates pass, attach safe daily/weekly and event workflows to the existing TSS backend. First inventory existing jobs to avoid duplication. Critical enquiry retry remains in its current backend. Deduplicate source/event IDs, quarantine stale/changed/deleted-record events, cap retries, expose failed backlog and recovery. No external send or publish from a daily brief.

## Mandatory tests and evidence

Run `node tests/command-center/record-evidence.mjs`. Keep all current tests passing. Add durable-store concurrency/restart tests, authenticated integration tests and real-provider sandbox tests. Every test needs ID, environment, candidate commit/version, test records, expected/actual result, result, receipt/evidence, side effects and timestamp.

Explicit gates: Phase 1's 15 user cases; Phase 2's 18; Phase 3's 20; Phase 4's 17. Current component tests do not waive live acceptance. Repeated-enquiry P3-04 must exercise real backend idempotency, not only status normalization. P3-11 needs complete asset approval, not only metadata. P4 must prove durable job execution across restarts and no unsigned external actions. Model injection evaluation must include adversarial content, not merely prompt separation.

After EACH phase rerun critical earlier suites plus signed-in CRM reads/confirmed internal write, enquiry receipt-to-CRM, login/logout/session isolation, existing WhatsApp V1A, record count/ID integrity, and affected mobile/PWA journey. Use synthetic/internal records, preserve commercial states and suppress test contacts. No real prospects or public posts for testing.

## Deployment and acceptance

One batched Preview candidate. Validate desktop plus phone/tablet widths and actual Android installed PWA where needed. Existing Google OAuth allowed origins must be respected; do not weaken auth or widen access silently to make Preview work. Use a private authenticated test route/backend if existing Preview sign-in is unsupported, with explicit access review when scope would widen.

Retain rollback commit, exact Apps Script baseline and separate Head-trigger recovery steps. No Production deployment, merge, paid upgrade or new service without required exact approval. Ask Hady to approve the concrete verified release only after blockers are resolved.

Finish with the requested status classifications and all ten acceptance answers. Never label component mocks as successful live integration.
