# Retention, deletion and audit policy for owner approval

Proposal only, prepared22 October 2026. No deletion, TTL, new IAM or export is enabled.
Periods below are operating proposals, not a statement of legal requirements.

| Record class | Proposed rule | Required safeguards |
| --- | --- | --- |
| Message text and media metadata | Review for payload redaction after 90 days from receipt | Outstanding enquiries, legal holds and rights requests reviewed first. Do not download media automatically. Keep minimum event identity separate from content. |
| Minimal deduplication identity | Keep through content retention and at least 30 days after redaction | Final period depends on documented provider retry/replay exposure. Never remove the tombstone with the body or reprocess an old message as new. |
| Operational approval/send/alert audit | 365 days of minimal metadata | Durable append/transition audit, restricted access, recipient/body hashes instead of content, no credentials. Provider submission is not delivery. |
| Expired sessions and revocations | Review cleanup candidates30days after expiry | Existing logical expiry remains authoritative. Deletion must not make revoked/expired sessions valid or restore access. |
| Customer access/deletion request | Owner review without an automatic cascade | Verify requester, identify exact records, check lawful retention/holds, preview scope, obtain execution approval, record minimal completion evidence. No automatic HubSpot deletion. |
| Legal hold | Suspend relevant redaction/deletion until reviewed release | Record owner, reason category, scope, review date and release decision. Restrict access. A hold is not permission to retain unrelated content. |
| Backups and exports | No new automatic export until purpose/location/expiry approved | Encrypted restricted archive, named authorized users, access log, tested restore and deletion. Review deletion requests against recoverable copies and document any restricted deferred erasure. |

Content minimization is separate from event identity. An event tombstone may keep
only a digest and necessary timestamps when raw content is no longer justified.
TTL on the whole inbox document is not suitable before replay and audit behavior
are accepted. Firestore backups, exports and provider log retention have not been
independently inventoried in this session. Do not claim this proposal controls them.

Implementation sequence after explicit policy approval: inventory actual records,
generate a non-destructive plan, review holds and unresolved cases, authorize a
dedicated least-privilege redactor, test on disposable fixtures, preview exact
production targets, approve one bounded execution, and independently read back
redacted content plus preserved tombstones/audit. No bulk deletion or restore
guarantee is implied. All IAM and destructive actions remain separately gated.
