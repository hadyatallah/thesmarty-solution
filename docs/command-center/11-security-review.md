# Security review

No new credential, secret, auth route, external write endpoint or frontend tenant override was added. Business data is not included in synthetic tests or repository documentation. Source strings are escaped by the new renderer. Existing login and service worker are unchanged.

Tests cover unauthorized proposals, tenant-scoped action lookup, exact payload binding, stale versions, rejected/expired approvals, replay/concurrency protection and audit omission of private message bodies. Prompt injection test checks structural separation only. It is not evidence that a language model cannot be manipulated.

Legacy fixes: ambiguous update names now require exact identity; pending updates retain the reviewed version; nullish field preservation keeps zero/false values; failed/uncertain multi-action plans are cleared so a possible create cannot be replayed with the old Confirm button.

Release blockers: durable server-side gateway binding, least-privilege authorization, authenticated scope extraction, private-store access controls, schema validation during atomic writes, secret-safe provider errors, retention, restart/fault testing and live authorization tests. Existing local browser cache/history needs a separate session-isolation review before multi-client reuse. No claim of production security certification is made.
