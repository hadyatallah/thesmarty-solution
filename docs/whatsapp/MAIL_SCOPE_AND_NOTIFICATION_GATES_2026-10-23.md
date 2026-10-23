# Mail security and background notification continuation

23 October 2026. PR121 Preview only. No production release. Owner performed the separately approved Microsoft scope replacement below.

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
- Owner-provided live readback, 23 October 10:36 Europe/Nicosia: Exchange scope
  `TSS-WebsiteMailer-InfoOnly` has filter `PrimarySmtpAddress -eq 'info@thesmartysolution.com'`.
- Assignment `TSS-WebsiteMailer-InfoOnly-MailSend` grants only `Application Mail.Send`
  within that scope. Test-ServicePrincipalAuthorization for the TSS mailbox returns InScope True.
- Owner screenshots at 10:31 and 10:34 show the application-level Graph Mail.Send
  grant revoked and its configured app-registration request removed. Delegated
  Mail.Send, User.Read and previously granted offline_access were preserved.
- Only one actual mailbox exists. Unrelated-mailbox denial was not tested and is
  still pending. Do not invent a negative test or create a paid mailbox to satisfy it.
- Accepted mailbox configuration is not runtime token-exchange or email-delivery acceptance.

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

## Runtime continuation after scoped Microsoft acceptance

Latest owner authorization: exactly one notification addressed to
`info@thesmartysolution.com`. The transport now hardcodes this address as both
sender and recipient, preserving the approved signature. Browser alert data
cannot override the recipient. The keyless adapter additionally pins the tenant
and client IDs above, rejecting other well-formed GUIDs before any token call.
151 relevant local Node tests pass. These are fixture/security results, not live
authentication, transmission, delivery or browser-closed acceptance.

No mail identity provisioning is evidenced. Current Preview metadata has owner
email and worker gates disabled and no configured mail federation parameters.
The remaining trust is a distinct permission change, not the completed audit IAM:

1. Dedicated Google service account:
   `tss-whatsapp-owner-mail@tss-crm-508908.iam.gserviceaccount.com`.
2. On that service account only, grant `roles/iam.serviceAccountOpenIdTokenCreator`
   (only `iam.serviceAccounts.getOpenIdToken`) to the existing exact Preview subject:
   `principal://iam.googleapis.com/projects/103840050410/locations/global/workloadIdentityPools/vercel-research-center/subject/owner:tss21:project:thesmarty-solution-agent:environment:preview`.
   This covers all Preview deployments of this Vercel project, not one Git branch.
   No Google data roles, access-token minting, signing, keys, or production binding.
3. On the existing Website Mailer app registration, one federated identity credential:
   issuer `https://accounts.google.com`, audience `api://AzureADTokenExchange`,
   subject exactly the dedicated Google account's provider-returned numeric unique ID.
   Never substitute the project number, account email or a guessed subject.
   No Graph permission grant or client secret is required for this trust.
4. Configure only nonsecret identifiers and release gates in branch-specific Preview.
   Keep routine worker sending off while a single uniquely identified acceptance
   outbox item is prepared. Graph 202 remains SUBMITTED_UNVERIFIED, not delivery.

Owner permission review is required before applying this new Google identity trust.
No available connected Google IAM or Entra administrative write API is exposed in
this session. An owner Cloud Shell operation/portal federation entry is needed
once the exact grant is authorized and the account unique ID is read back.
No test email has been sent. Exactly-one owner transmission and closed-browser
background delivery remain BLOCKED, not PASS. No production changes or Meta actions.
