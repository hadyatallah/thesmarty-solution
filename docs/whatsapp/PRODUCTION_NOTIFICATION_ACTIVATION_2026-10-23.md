# Production notification release review — 23 October 2026

Accepted mail test remains accepted; do not repeat it or send another test email.
Production is NOT activated. PR121 stays draft until infrastructure/live gates pass.

## Candidate schedule and independent monitor

One Cloud Scheduler job, `tss-whatsapp-notify`, europe-west1, `*/10 * * * *`, UTC.
POST the exact Production notify URL. Google OIDC audience must equal that full URL;
identity must be tss-whatsapp-notify-scheduler@tss-crm-508908.iam.gserviceaccount.com.
No business-data roles on the scheduler identity. Existing Scheduler service-agent
role and administrator actAs permission must be verified before job creation;
no automatic broad role grant. At most two scheduler retries, 60-second minimum
backoff, 600-second maximum backoff, 180-second attempt deadline. Transport-level
ambiguous notification outcomes are never resent by these job retries.

10 minutes bounds normal detection latency without a browser, at 144 cycles/day.
This is a candidate, not a provider-backed timing SLA. Vercel Hobby's daily limit
cannot support this interval. Preserve both existing seasonal Research cron entries.

Independent monitoring candidate is Google Cloud Monitoring, outside Vercel:
- Worker failures: the Scheduler's failed HTTP completion (worker returns 503).
- Missed runs: absence of successful scheduled completions for 30 minutes.
- Webhook/processing failures: worker dependency health affects HTTP status even
  if the owner alert itself was successfully submitted.
- Vercel-wide/DNS/TLS failure: external HTTPS uptime check.
- Recipient delivery: Graph202 remains submitted/unverified; it is NOT mailbox
  delivery proof. No additional Microsoft read permission is requested.
Use native incident grouping, no repeated open-incident notifications, and recovery
notifications. An independently verified owner notification channel is required.
No simulated incident may trigger an email without separate transmission approval.
No scheduler, uptime check, metric, alert policy or notification channel is created
by this repository change. Live missed-run/failure/recovery acceptance is pending.

## Exact new Production trust requiring approval

On the two existing service accounts only, add the exact Production principal:
`principal://iam.googleapis.com/projects/103840050410/locations/global/workloadIdentityPools/vercel-research-center/subject/owner:tss21:project:thesmarty-solution-agent:environment:production`

1. tss-whatsapp-owner-mail@tss-crm-508908.iam.gserviceaccount.com:
   roles/iam.serviceAccountOpenIdTokenCreator (ID token issuance only).
2. tss-whatsapp-operations@tss-crm-508908.iam.gserviceaccount.com:
   roles/iam.workloadIdentityUser (use the already approved create/get/list ledger
   role in the default database). No new data role, update/delete or key permission.

This deliberately does not alter accepted Preview grants, webhook, reader,
session writer, WIF provider, Microsoft scope, or Entra grants. Production token
exchange also needs explicit TSS_WHATSAPP_PRODUCTION_MAIL_RELEASE=approved in
addition to existing identity/scope flags; code alone cannot activate sending.
Review Production branch trust and environment before enabling it.

`scripts/tss-whatsapp-production-preflight.py` is one READ-ONLY Cloud Shell review
operation: it inspects only the new Production bindings, enabled APIs and the
billing-account-wide Scheduler inventory, including paused jobs in every region.
Any inaccessible project/region fails closed. It applies no IAM or resource changes.
It does not re-run accepted audit/data/receiver tests. A free slot is a current
inventory fact, not a reservation or a guarantee that future usage stays free.

## Costs and remaining limits

Official Scheduler pricing: first 3 jobs per billing account free; additional jobs
$0.10 per 31 days, including paused jobs. Uptime checks include 1 million regional
executions/project/month. Current pricing lists metric-alert-policy pricing starting
1 September 2027, not now. Other Firestore/function/Secret Manager usage remains
metered: free Scheduler capacity alone is not proof of zero total infrastructure cost.
Do not activate resources until actual account usage and permitted budget are clear.

Inventory uses indexed recordKind business queries plus a single newest-cycle
query on notificationCycleAt, using standard single-field indexes. Cycle history
does not exhaust the 500-row business/inbox safety ceiling. Existing unindexed
business audit rows are preserved in a one-time immutable baseline after a bounded
read. An incomplete baseline fails closed. No existing record is updated/deleted.
The 500 business/inbox capacity ceiling remains explicit: saturation returns failure
for independent alerting rather than silently dropping records. Actual Firestore
query acceptance is still required in Preview before release.

References verified 23 October:
https://vercel.com/docs/cron-jobs/usage-and-pricing
https://cloud.google.com/scheduler/pricing
https://cloud.google.com/products/observability/pricing
https://docs.cloud.google.com/scheduler/docs/viewing-logs
https://docs.cloud.google.com/scheduler/docs/configuring/retry-jobs
