# Sign-in-free synthetic test workspace

Open `index.html` in a browser. It is a single self-contained file and can run offline. On Vercel Preview the route is `/command-center-preview/`; Vercel platform protection may require a temporary share link. No Google sign-in is used by this page.

The shared Manager and response/approval UI are bundled from the candidate's modules, alongside the native gateway with in-memory test bindings. `connect-src 'none'` prevents network calls. Fixtures have synthetic IDs and reserved example.test addresses. No backend URL, credential, real CRM data, external send or publication adapter is included.

Build: `node command-center-preview/build.mjs`

Test: `node tests/command-center/record-evidence.mjs`

Try priorities, the Demo Surfaces summary, content and weekly review. Propose a task change, inspect the exact fields and approve or reject. Close a pending proposal, simulate another edit, then load the approval ledger and attempt execution to see the stale-record guard. Reload or Reset discards all test changes.

This is an interaction test, not a replacement CRM. Its in-memory storage, mock lock/session and non-cryptographic checksum are not security controls. The real native backend retains existing authentication, locking, SHA-256 and persistent ledger. Existing CRM login, production deployment and PWA are untouched. Live HTTP integration acceptance and schedule activation remain gated. No new recurring service cost.

Rollback: remove this directory or use the previous Preview; it has no business-data migration or external side effects.
