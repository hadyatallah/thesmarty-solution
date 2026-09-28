# Security review

The candidate preserves the existing verified Google owner session, nonce/JWT checks, backend schema, and optimistic version validation. Native endpoints authenticate before touching storage. Actor and internal tenant are server-derived. No credentials or private baseline source are included in this public repository. Manifest OAuth scopes are unchanged.

Assistant writes require exact server proposals and a separate human approval. Expiry is ten minutes. Hash mismatch, stale records, unsupported operations, missing authentication and cancelled actions fail closed. Executing/uncertain states cannot be replayed automatically. External sending, publishing, deletion, merging, payment and deployment adapters are absent.

Audit entries retain metadata, not session tokens or raw note/message bodies. Action state retains the proposed fields necessary for exact review, and must be treated as private CRM data. A checksum detects accidental ledger damage; it is not cryptographic proof against an editor who can rewrite the workbook. Sheets locks are scoped to this script, not arbitrary external editors.

Untrusted CRM/email/site content remains data. HTML rendering escapes fields. Model proposals cannot gain write authority. Model-level prompt injection evaluation, retention policy, complete notification isolation and scale/concurrency tests remain open.

Preview sign-in requires an explicitly approved exact OAuth origin. Do not use wildcard origins, bypass tokens in frontend code, disabled login protection, or copied production session tokens to get around this gate.


Native event types are allowlisted. Event content cannot select a write operation. Exact event-ID payload conflicts are rejected; stale/future/deleted/changed references cannot prepare work. Maximum three preparation attempts. Event activation requires exact runtime gates and an explicit event age policy. The notification projection does not grant write permission.
