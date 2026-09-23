# Test evidence report

The local suite contains 127 passing tests, including sixteen native Apps Script contract tests. test-evidence.json retains test IDs, exact source hashes, environment, expected/actual outcomes, side effects and timestamps. Local tests use synthetic services; they do not prove live acceptance.

Additional real Apps Script Head checks:
- Isolated synthetic Google spreadsheet: approval required, one dispatch after exact approval, replay prevented, state and audit persisted; no CRM writes or external sends.
- Fresh execution: restart/idempotency and five unauthenticated endpoint guards checked. See the private implementation report for actual timestamped results.
- Real CRM read-only projection: core and commercial datasets loaded and deterministic attention/data-quality rules ran without writes. Data coverage was reported explicitly.
- Exact private baseline and candidate save validators: the same synthetic auth/stale/custom-value/enum/duplicate/link/default checks passed against both versions. Evidence is retained with the private source archive.
- Source verification: the staged private Code.gs exactly matched the reviewed candidate; the original validation/write body was retained verbatim.

Browser findings: production CRM and private editor signed in successfully; Vercel account access succeeded. Google rejected Preview login with origin_mismatch. The exact Preview OAuth origin was approved, but Google Cloud Console remains inaccessible in this browser. This is an access configuration dependency, not permission to weaken verification.

No phase is accepted for production. Remaining gates include browser writes/login isolation/mobile/PWA, enquiry receipt-to-transfer regression, provider authorization/failures/reconciliation, live concurrency, restoration, and installed schedule/event delivery. Earlier passing component cases do not waive these gates.
