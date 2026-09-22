# Test evidence report

Run: `node tests/command-center/record-evidence.mjs` from repository root.

The retained TAP file and JSON include each test ID, local environment, base commit, exact source hash, synthetic fixture reference, expected assertion, result, evidence reference, side-effect boundary and timestamps. The source hash identifies the working tree tested even before its release commit exists.

Phase 1, then Phases 1-2, then Phases 1-3, then Phases 1-4 were executed successfully before advancing component work. UI and gateway security tests were added for concrete risks. Existing public assistant formatting and enquiry routing tests also pass in the final run. These are isolated tests. They do not establish live Google login, backend approval enforcement, delivery or mobile acceptance.

The repeated-enquiry test is a read-side status test, not a new live replay of the existing form transfer. Research tests use a synthetic provider, not actual public-source verification. Content review is a structured gate with human evidence fields, not a vision model that proves assets are correct. These limits prevent overstating acceptance.
