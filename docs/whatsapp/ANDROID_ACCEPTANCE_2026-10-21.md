# WhatsApp Admin inbox acceptance

21 October 2026, owner-tested on Android, Preview only.

## Demonstrated by the owner

- Authorized Google sign-in reached all three Admin workspace choices.
- WhatsApp Inbox opened using the Admin session, without a second GIS login.
- One existing Firestore event was displayed with details:
  `TSS_INTERNAL_QA_SYNTHETIC_ONLY`, sender `15550000000`, held_for_review.
- Owner confirmed the requested refresh and logout/re-entry checks worked.
- Copy-only draft interface is displayed. No sending action exists.

These are owner-provided live results. An independent agent HTTP trace was not
captured. Given the verified handler/UI code, successful record display implies
the required session write/readback, cookie authorization and dedicated-reader
request succeeded. Do not represent that inference as a captured provider log.

## Database metadata guard

The old script hashed the complete Database response before and after IAM changes.
That includes `earliestVersionTime`. Google's Database REST reference documents it
as continuously updated, stale as soon as queried. This proves a false-positive
path in the old guard. It does not prove no other field changed in the owner's
historical run because the old script did not retain the original snapshots.

Reference: https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases

Owner read-only Cloud Shell comparison at 15:56 Nicosia returned only `etag` as
changed after excluding `earliestVersionTime`. All other fields matched. Region
was `europe-west1`; database `updateTime` was `2026-10-20T20:24:05.736028Z`, before
today's IAM work. Combined with the script's absence of database-modification
commands, this closes the warning as a metadata comparison defect. The historical
snapshots were not retained, so this is a current readback and timestamp-based
conclusion rather than a reconstructed original diff.

Google documents `etag` as a server checksum computed from other field values.
The final guard records both `earliestVersionTime` and `etag` separately, and still
compares `updateTime` plus every configuration field and existing identity/provider
policy. Eight fake-CLI tests verify benign metadata changes pass while real
configuration and updateTime changes still block. No live database mutation or
security setting was changed to fix this check.

## Remaining acceptance limits

- Metadata warning CLOSED with the owner-provided read-only comparison above.
- Live session expiry has not been independently observed; automated expiry tests
  passed. No hidden session extension is implemented.
- Pagination cannot be exercised with the single existing event. Automated page
  token tests passed. No extra database fixtures are created merely for pagination.
- Data Center and Research Center regression CI passed. Their browser OAuth flows
  remain unchanged and their full migration to shared sessions remains deferred.
- No Production promotion/merge or phone migration is authorized by this report.

PR #119 remains draft/unmerged. PR #118 remains unmerged. No customer messages sent.
