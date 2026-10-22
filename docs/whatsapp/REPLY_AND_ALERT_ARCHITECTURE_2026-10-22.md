# Owner reply and closed-browser alert release contract

Prepared 22 October 2026. Design and disabled code review only. No sender,
new IAM grant, notification dispatch, deletion or Meta configuration is activated.

## Reply transaction

1. Authenticate the existing unexpired owner Admin session and exact origin/CSRF.
2. Reload the inbound event server-side from the pinned Firestore collection.
   Reject client recipient overrides, the Cyprus production number, non-message
   events, and any pair other than test WABA 2882413005471663 / phone 1378287792033123.
   Require a separately approved owner-controlled test recipient allowlist.
3. Canonicalize exact text, event key, recipient, account and sender identity into
   the existing approval digest. Present that exact text and target for approval.
   Bind a short-lived, single-use approval to owner, session, digest and expiry.
   A changed body or target invalidates approval. A generic session or dry-run
   result is never send approval. Enforce the current Meta addressing, permission,
   customer-service-window and pricing rules before dispatch.
4. Atomically create a durable action claim keyed by the approved action ID in
   an approved audit collection. The claim binds the digest and approval metadata.
   Concurrent requests must see one claim. Repeated requests return its state.
   Never use process memory, Vercel stdout or the Admin session collection as the
   business audit. No actual audit writer is authorized/provisioned in this PR.
5. Resolve a version-pinned, least-privilege Meta sender token in server memory
   through approved external secret access. No token in browser, Vercel variables,
   repository, logs, URLs or audit records. The current webhook config has HMAC
   and verification settings, not an accepted outbound credential contract.
6. Commit DISPATCHING durably before the one bounded provider attempt. Record
   provider-confirmed message ID as SUBMITTED. Only independently correlated
   provider status can establish DELIVERED or READ.
7. On timeout, connection loss, malformed success, process termination or failure
   to durably save the outcome, remain UNKNOWN_REVIEW_REQUIRED. Never reclaim an
   expired dispatch claim or automatically retry a possibly sent message. Owner
   reconciliation must precede any new separately approved action. Definitive
   pre-dispatch rejection is HELD. Definitive provider rejection is FAILED, not sent.

### Durable audit fields

Action ID, inbound event key, account/phone identity, recipient hash, body digest,
owner and approval timestamp/expiry, state transitions, provider message ID,
fixed error category and correlation ID. Keep content and tokens out. Reader,
claim creator and outcome writer permissions must be reviewed separately.
Existing create-only webhook and session identities must not gain broad roles.
Any new grant needs the owner's separate approval.

## Notifications independent of the browser

Required events are new inbound, webhook dependency/HMAC-system failure,
Firestore write/read outage, unread escalation and notification transport failure.
Invalid public HMAC requests alone should be aggregated/throttled, not create an
email flood. Deduplicate by event key/category/incident window. Persist an alert
outbox before acknowledging notification work. A Firestore outage also needs an
independent failure signal, since an outbox in the failed store cannot cover it.

Use generic subjects/bodies, counts, incident time and an owner Admin link. No
customer message content, phone number, credential or signed request URL in mail.
Notification delivery and failure are distinct from webhook HTTP acceptance.
Test actual provider submission and independent Sent/readback evidence, plus a
controlled failure and recovery. An ambiguous email outcome is reconciled before
resend. Suggested unread threshold is 15 minutes, policy pending owner approval.

### Existing mail infrastructure suitability

The approved Outlook account is info@thesmartysolution.com. Its connected ChatGPT
mail authorization does not give Vercel a reusable server-side authorization.
Production environment metadata still marks the legacy Outlook capture bridge
credentials retired. Do not decrypt/reuse those values or revive that bridge.
There is no accepted current Vercel mail sender or closed-browser WhatsApp
notification runtime. The two Hobby cron slots are occupied by the seasonal
Research Center triggers. Do not add a competing job, piggyback WhatsApp writes
onto research, or describe browser notifications as dependable background alerts.

The next integration decision is an existing-service mail authorization/monitoring
path with least privilege, verified free entitlement and independent failure
coverage. Any new OAuth grant, external secret, IAM role or billed monitoring
configuration needs explicit approval. No second notification vendor is proposed.

## Release gates

Keep operations disabled and PR #121 draft until signed production ingestion and
Admin readback pass, preview-only draft validation passes live, exact approved
test recipient is set, durable claim/outcome storage and private token access are
accepted, provider-confirmed one-test-send and ambiguity handling pass, and real
closed-browser success/failure notifications pass. Keep destructive retention,
production allowlists, app publication and number migration as separate approvals.
