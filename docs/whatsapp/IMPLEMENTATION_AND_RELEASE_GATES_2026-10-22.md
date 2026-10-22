# Operational implementation and activation gates

22 October 2026. Preview only. The accepted production receiver, Google identities,
number and Meta configuration are unchanged. No transmission or deletion is approved.

## Implemented

- `tssWhatsappSender.mjs`: exact-message owner approval, session-bound five-minute
  approval token, server-reloaded recipient/event, test-pair/recipient allowlists,
  current inbound-window enforcement, and explicit cost/transmission gates.
  Production sends and templates are refused. Unknown/BSUID recipient addressing
  is refused rather than guessed. No automatic or bulk replies.
- `tssWhatsappLedger.mjs`: real Firestore create/get adapter on the fixed
  `tss_whatsapp_operations` collection. Approval, dispatch claim, provider outcome,
  correlated delivery observations and owner reconciliation are separate sealed
  records. No update/delete method exists. A durable atomic create prevents a
  second dispatch after restart, concurrency, timeout or ambiguous audit failure.
  Reconciliation never clears the claim. No exactly-once provider claim is made.
- `tssWhatsappOperationsRuntime.mjs`: keyless adapters for proposed dedicated audit
  and secret-reader identities. Meta token access is version-pinned to a separate
  test-sender secret. No current webhook secret or session writer is repurposed.
- `tssWhatsappNotifications.mjs`: metadata-only alert planning, durable outbox,
  atomic notification attempts, deduplication, bounded backoff after definitive
  failures, and manual review after ambiguous sends. Outlook transport is pinned
  from info@thesmartysolution.com to thesmartysolution@gmail.com and includes the
  approved TSS signature. Graph 202 means SUBMITTED_UNVERIFIED, never delivered.
- `tssWhatsappNotificationWorker.mjs` and `/api/tss-whatsapp-notify`: a server-side
  job independent of browser/session lifetime. Default disabled. An enabled job
  requires a Google-verified ID token, exact audience and exact proposed scheduler
  identity. It scans stored inbound/outbound records, detects orphan dispatch
  claims, probes the accepted receiver and runs the outbox. Incomplete scans stop
  with an explicit failure. Current safety bound is 500 documents per collection.
  High-volume operation needs a separately tested cursor/index design first.
- Owner-only test review acknowledgements are sealed, read back and deduplicated;
  the notification worker uses them to suppress unread escalation. Merely viewing
  or refreshing a message does not mark it reviewed. Live acknowledgement requires
  the separately reviewed audit writer.
- Owner UI clears approvals on text/event changes, refresh and logout. Test send
  controls remain hidden unless the server allows approval, and disabled without
  cost/transmission configuration. Retention preview is a real selected-event
  read, respects unknown/active holds and cannot delete. The broader policy report
  labels missing inventories, backups and retry-window evidence as unknown.

## What is not accepted yet

No new service account, grant, Meta token, Microsoft app authorization, Secret
Manager version, scheduler or monitor was created. No real operational audit or
notification email has been written by the unapproved adapters. Durable storage
and closed-browser delivery are implemented in code but require live acceptance
after the following separately reviewed dependencies. Local fixtures are not a
substitute for those provider checks.

## Minimum permissions for separate review, not application

| Identity | Proposed access | Boundary / material limitation |
| --- | --- | --- |
| tss-whatsapp-operations@tss-crm-508908.iam.gserviceaccount.com | Custom role: datastore.entities.create/get/list on the existing default database | No update/delete/export, no secret access. Firestore IAM cannot isolate a collection here. Application adapter pins the collection, but database-wide read/create remains the IAM blast radius. Owner must accept this tradeoff before any grant. |
| tss-whatsapp-sender-secrets@tss-crm-508908.iam.gserviceaccount.com | secretmanager.versions.access on individually approved tss-whatsapp-test-sender and, if chosen, tss-whatsapp-owner-mail secrets | No access to the accepted webhook config and no datastore writes. Secret contents must be provisioned privately by the owner/provider. |
| tss-whatsapp-notify-scheduler@tss-crm-508908.iam.gserviceaccount.com | Dedicated job identity used to issue an ID token for the exact notify endpoint | No business-data permissions. Scheduler service-agent token issuance must be reviewed. No browser token or shared CRON_SECRET is reused. |

The two runtime identities need WIF impersonation for the exact existing Vercel
preview subject only. Production trust is a separate release decision. No owner,
editor, datastore.user, secretmanager.admin, JSON key or broad impersonation grant
is proposed. Existing webhook/reader/session policies must remain unchanged.
Hash linkage detects accidental record alteration and links claims/outcomes. It
is not a signature against a project administrator who can rewrite records and
hashes. Real immutability depends on create-only IAM, restricted administration
and approved retention. Do not describe stdout as an immutable audit ledger.

## Mail and background operation

Production environment metadata marks the old Outlook integration credentials
retired. ChatGPT's connected Outlook session does not provide Vercel authorization.
The implemented Microsoft adapter therefore stays disabled and never reads those
retired values. The previous client-secret adapter has been replaced by keyless
Google ID-token federation. It requires a dedicated mail identity with
`iam.serviceAccounts.getOpenIdToken` on itself granted only to the exact Preview
principal, a Google-issued audience of `api://AzureADTokenExchange`, and an Entra
federated credential matching the exact Google service-account unique ID. The smallest direct TSS-mail option is a reviewed Microsoft app
Exchange Application Mail.Send RBAC authorization restricted to the existing TSS mailbox, using the secret-free Google-to-Entra federation implemented in
`tssWhatsappMailIdentity.mjs`. No new Microsoft client secret is needed. It requires
tenant-admin consent and mailbox access restriction, plus actual Sent/provider
readback tests. No new mail vendor/subscription is proposed.

The notification worker needs an approved platform trigger. Vercel currently supports 100 cron jobs on Hobby, each at most daily with
hourly precision. The two registered Research Center seasonal jobs are preserved.
They do not provide timely message notifications, and native Vercel cron targets
production rather than Preview. The earlier two-slot claim was stale and is
superseded by the current provider documentation.
One Google Cloud Scheduler job is a supported alternative, after verifying the
shared billing account's unused free allowance and reviewing identity issuance.
An independent Cloud Monitoring uptime/email alert must cover worker/Firestore
failure, because an outbox in a failed database cannot report its own outage.
Do not claim closed-browser acceptance until a real successful notification,
definitive failure/backoff, ambiguous outcome and independent outage alert pass.

## Cost findings, checked 22 October 2026

- Cloud Scheduler: first 3 jobs per billing account free, then US$0.10/job/31 days.
  Free slots for this actual billing account have not been inspected.
- Cloud Monitoring uptime: first 1 million regional executions/project/month free,
  then US$0.30/1000. A five-minute check in3 regions is 26,784 executions in 31 days.
  The current pricing page dates metric-alert charges to September 2027, not today.
- A probe that initializes this webhook also reads Secret Manager. First 10,000
  accesses/account/month and 6 active versions are free, then US$0.03/10,000 accesses
  andUS$0.06/version/month. 26,784 probes alone could exceed the access free tier.
  Other project/account use is unknown. No zero-cost guarantee or activation.
- Firestore reads/writes and Vercel executions also consume existing quotas.
  Confirm actual usage/billing before provisioning a recurring worker or monitor.
- Official Meta sources now distinguish phone-owning WhatsApp accounts from
  Messaging accounts. Test accounts can work without a payment method, but that
  is not authorization to send or proof of the selected recipient's eligibility.
  Current developer pricing updates charge service messages from 1 October 2026.
  The official FAQ describes 1,000 free service messages/month/number, then charges.
  Account-specific allowance, exact destination rates and tax remain unverified.

Primary references:
- https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/permissions-reference
- https://cloud.google.com/scheduler/pricing
- https://cloud.google.com/products/observability/pricing
- https://cloud.google.com/secret-manager/pricing
- https://developers.facebook.com/documentation/business-messaging/whatsapp/whatsapp-business-accounts
- https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform
- https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages
- https://business.whatsapp.com/resources/faq

## Retention and cutover

The existing privacy notice promises purpose-based retention and owner-reviewed
access/deletion requests, not fixed 90/365 day periods. Keep public wording unchanged
until policy approval. Proposed content 90 days, audit 365 days, expired-session review
after 30 days and dedupe at least 30 days beyond content redaction remain candidates.
Unknown holds are preserved. No TTL, delete permission or automatic erasure exists.

The direct-migration runbook remains in OPERATIONAL_GO_NO_GO_2026-10-21.md. It
requires verified exports/media samples, ownership/OTP access, two-step PIN
readiness and explicit approval immediately before Business App interruption.
Reserve a planning window, not a promised outage duration. Deleting/deregistering
the App may lose history/media/features and website rollback cannot restore it.
Current Meta registration requirements, exact phone-owning account/phone ID,
publication and billing must be read back before cutover. No migration is allowed
by approving this code, the audit role, a test recipient or the retention proposal.

## Decisions that genuinely block live acceptance

1. Review the exact audit/secret-reader/job identity boundaries above before IAM.
2. Privately provision the reviewed test sender credential and choose one actual
   approved test recipient, exact message and cost exposure before transmission.
3. Approve a server mail authorization, background trigger and independent monitor
   after actual shared free-tier/billing inspection. No credentials in chat.
4. Approve retention policy separately. Keep deletion and production release off.
5. App publication, billing and direct number migration remain later separate gates.


## Infrastructure continuation, 22 October 2026

Owner authorized minimum audit IAM after verified preflight. The Work browser
still renders Google Cloud as Site Unavailable and has no authenticated gcloud
or Google infrastructure connector. No configuration result is inferred from
that restriction. `scripts/tss-whatsapp-infrastructure.py --apply` is the single
reviewed Cloud Shell setup operation. It inspects existing project/ancestor
allow policies, custom-role permissions, Preview subject trust, user-managed
keys and protected identity policies before adding only the audit identity,
three-permission custom role, database-conditioned binding and exact Preview
WIF binding. It refuses unexpected/broader configuration rather than modifying it.
No mail/Meta secret, API enablement, scheduler, monitor or billing change occurs.

The Preview `audit-acceptance` action is owner/session/CSRF gated and separately
flagged. It writes real approval/claim/outcome/reconciliation/outbox records using
fixed synthetic transports. It makes zero Meta or Microsoft requests. Unique
run manifests list exact record hashes for the separate Cloud Shell readback
mode (`--readback MANIFEST_ID`). Synthetic completed acceptance outcomes are
excluded from future live outbound alerts. A test pass here proves durable
mechanics, not real email delivery or Microsoft authorization.

Microsoft tenant administrator action remains required: a dedicated app with
Google federation and Exchange Application Mail.Send scoped to exactly
info@thesmartysolution.com. No organization-wide Entra Mail.Send or Mail.ReadWrite
grant is proposed. Exchange scoped RBAC is additive, so existing unscoped Entra
grants must be inspected before using any app. Test authorization for the TSS
mailbox and a known out-of-scope mailbox. Separate provider/Sent and destination
readback must establish real submission/delivery. Current code uses no mail read
permission. Never treat Graph 202 as delivered.

A single Cloud Scheduler job remains the smallest proposed frequent trigger.
Its billing-account-wide free allowance cannot be verified from available
connections. An unauthenticated Cloud Monitoring check against this protected
Preview would only detect the Vercel access boundary, so it is not acceptance of
worker health. Production health/status monitoring needs a reviewed sanitized
route and a fresh persisted heartbeat, plus an independent alert channel. No
monitor, recurring job or extra paid usage is activated while quota/consent
and protected-Preview access remain unresolved.

References for the corrected limits and secret-free Microsoft path:
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-google-cloud
- https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac
