# Mail security and background notification continuation

23 October 2026. PR121 Preview only. No production release or permission changes.

## Accepted boundary

Do not repeat the accepted receiver, Inbox or durable audit setup. Audit run
47685fbfa38a4f55a13b1b5ce83ca66f independently read eight records, denied anonymous
access, and passed claim arbitration, duplicate rejection, uncertain-outcome
review, no automatic resend and notification outbox deduplication. No actual
WhatsApp or email transmission occurred.

## Exact existing Microsoft identity

- Tenant: 0d3c6e54-c584-44a3-bb2d-4533b5393fc6.
- App: The Smarty Solution Website Mailer.
- Client ID: 1b834ef7-b258-41fb-8ca9-ea9f093b4264.
- Enterprise service principal: 791b0876-f7e7-4cde-b27c-1cdafecff1a2.
- Application registration object: 036466e0-c784-419a-9f73-438db116b4cc.
- Last direct Entra observation, 22 October: application Mail.Send granted,
  delegated Mail.Send/User.Read and offline_access granted. One existing secret
  was listed, but no value was accessed or reused.

Application Mail.Send alone does not establish effective mailbox isolation.
Exchange Application Access Policies constrain the Entra permission path.
Exchange Application RBAC is additive and must also be evaluated. A narrow RBAC
scope does not override an unscoped Entra grant. Current effective scope is
UNKNOWN, not demonstrated tenant-wide access and not demonstrated isolation.

## Read-only verification operation

`scripts/tss-whatsapp-exchange-preflight.ps1` uses ExchangeOnlineManagement and
an administrator's normal interactive connection. It creates no app, grant,
credential, scope, group or messages. It does not install a module automatically.
No Exchange connector or authenticated PowerShell runtime exists in this Work
session, so the helper is a prepared external read-only operation if the browser
cannot expose the required configuration and supported tests.

It verifies the exact connected tenant, resolves the existing TSS mailbox,
inspects access policies and service-principal assignments, then runs
Test-ApplicationAccessPolicy and Test-ServicePrincipalAuthorization against
all discovered existing user/shared/room/equipment mailboxes. The app's last
observed Entra Mail.Send is conservatively treated as present. For each mailbox,
either allowed permission path means effective send authority remains.

An unrelated mailbox must exist for a denial test. A nonexistent address or
unlicensed directory user is not substituted as proof. No email is sent to prove
denial. The JSON report hashes unrelated mailbox references and omits provider
exception text, message content, tokens and credentials. Unknown responses,
missing commands, permission errors and wrong tenant fail closed.

The helper never authorizes runtime attachment by itself. Reconcile its result
with a current Entra consent readback and inspect all reported scope definitions.
After changes, allow provider authorization caches to settle and rerun supported
tests before a separately approved owner-only notification transmission.

## Runtime guard added

The keyless Google-to-Entra token adapter now also requires an approved scope
verification flag and SHA256 reference to reviewed scope evidence before any
token exchange. The evidence reference is nonsecret metadata, not a credential.
The flags remain unset. Existing transmission and mail-worker switches stay off.
No new Google identity, WIF binding, Microsoft federation or tenant permission
is provisioned by this change. A dedicated Google mail identity and its narrow
ID-token issuance trust still require separate approval after scope verification.

## Trigger and independent monitor preparation

The existing proposed worker is independent of browser/session lifetime. It has
fixed owner recipient and sender, approved signature, durable outbox/attempt/
outcome records, bounded definitive retries, no ambiguous resend and persisted
cycle summaries. Actual mail authorization and delivery remain unaccepted.

Current Vercel Hobby documentation permits 100 daily jobs per project, with
hourly precision. Native cron targets production and cannot deliver timely
Preview notifications. Preserve the Research Center's two seasonal UTC entries.
Do not activate another research scheduler or change its Nicosia schedule.

A candidate external trigger is one Cloud Scheduler job, after shared free-tier
usage is verified. Its OIDC Authorization header does not by itself satisfy
protected Preview's x-vercel-trusted-oidc-idp-token header. Custom Vercel Trusted
Sources supports exact issuer/audience/subject rules, but an actual supported
header-capable caller must pass acceptance. No public exception or stored bypass
secret is approved. GitHub Actions is another existing-service candidate, but
schedule delivery can be delayed and a scheduled workflow must exist on the
default branch. No scheduled workflow or IAM trust is silently introduced.

Prepare an external monitor in the existing Google Cloud monitoring service,
with a reviewed authenticated health/heartbeat source and an independent owner
alert channel. Required signals: receiver initialization unavailable, stale or
failed persisted notification cycle, persistent Firestore failure and unresolved
notification outcomes. Group incidents by component, alert on state transition,
cap repeats and send a recovery event. Do not treat a protected Preview 302 or
an ordinary static website 200 as application health.

A database-backed outbox cannot report its own datastore outage. Monitoring must
operate outside Vercel and must test a safe simulated outage and missed heartbeat
without disabling the production receiver. Current monitoring is PREPARED ONLY,
not provisioned or independently demonstrated. Shared free quotas, notification
channel verification and protected Preview access are pending. No 24/7 claim.

## Primary references

- https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac
- https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/test-applicationaccesspolicy
- https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/test-serviceprincipalauthorization
- https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-google-cloud
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources
- https://cloud.google.com/scheduler/pricing
