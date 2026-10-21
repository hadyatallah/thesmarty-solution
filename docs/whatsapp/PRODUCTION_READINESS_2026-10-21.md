# TSS WhatsApp Cloud API | Production readiness and cutover gate
**Checkpoint:** 21 October 2026 | **Status:** NO-GO for production number migration | **Mode:** owner-review draft

> This document prepares a later separately authorized cutover. It does **not** authorize Meta app publication, phone deletion/deregistration, number registration, customer messages, new IAM grants, or paid features. The TSS WhatsApp Business App number **+357 99 810330** must stay live until an approved cutover.

## 1. Verified evidence, not inferred readiness

| Gate | Status | Evidence / qualification |
|---|---|---|
| Google IAM, dedicated WIF service account and secret access | PASS | Owner Cloud Shell readback, 21 Oct; dedicated `tss-whatsapp-webhook@tss-crm-508908.iam.gserviceaccount.com` |
| Secret Manager test configuration | PASS | `tss-whatsapp-webhook-config` numeric version **2**; no Meta App Secret in GitHub or Vercel |
| Live Vercel HTTPS challenge / incorrect token | PASS | GET incorrect verify token HTTP 403; correct Meta challenge logged `challenge_verified` 21 Oct 00:16:24Z |
| Strict raw-body SHA-256 HMAC | PASS | Live malformed/invalid signatures HTTP 401; valid Meta dashboard signature reached account allowlist |
| Firestore signed synthetic write, readback, replay | PASS | Owner-run Cloud Shell test: POSTs 200/200, Firestore reads 200/200, Vercel `created:1`, `duplicates:1` |
| App-level Meta WhatsApp callback and `messages` field | PASS | Owner screenshot/Graph readback: callback matches, messages field found and subscribed |
| Test WABA app subscription | PASS | `GET /v26.0/2882413005471663/subscribed_apps` listed app `1707395857227784` and preserved DevX app |
| Meta dashboard sends signed sample | PASS with expected rejection | Real dashboard POST logged `account_rejected` 21 Oct 00:50:25Z because sample account IDs are NOT on strict allowlist; no storage |
| Actual user message on **production number** | NOT RUN | Production number still in WhatsApp Business App |
| App publication | NOT RUN | Meta interface last verified **Unpublished**; do not publish without approval |
| Live operator inbox / readback | BLOCKED | Webhook service account has Firestore document-create only; no protected operator review/read interface is deployed |
| Authorized outbound reply channel | BLOCKED | Webhook intentionally has no Graph API send capability or agent workflow |
| Data retention / deletion implementation | NOT COMPLETE | Firestore stores message events `held_for_review`; no verified retention deletion automation or operator deletion procedure |
| Combined privacy, retention and deletion instructions | PUBLISHED (website) | Owner approved one page at `https://www.thesmartysolution.com/privacy.html` on 21 October 2026; separate deletion URL intentionally not published |
| Billing / pricing review and approval | PENDING | Meta dashboard displayed Payment: Not added; no paid services without owner approval |

The Meta dashboard's canned sample can include WABA and phone IDs outside the authorized test pair. The resulting HTTP 403 is a correct security safeguard, **not** proof the receiver failed cryptographic verification. Do not expand the allowlist for the canned sample.

## 2. App publication preparation (non-publishing work only)

**Currently supported facts:** Business verification showed Complete in the owner's Meta WhatsApp setup screenshot. App was Unpublished, and an earlier Meta Basic Settings inspection reported a blank Privacy Policy URL, Terms URL, Data Deletion URL and category; this is a historical checkpoint, not fresh Basic Settings readback.

**Approved and published website copy (not Meta app publication):**

- One consolidated `privacy.html` page explains website/email/WhatsApp data, retention, provider processing, and deletion requests via `info@thesmartysolution.com`.
- Home footer has one link: `Privacy, Retention & Deletion`. No distinct `data-deletion.html` was published; the draft file was removed from PR #117.

**Verified website release:** Production deployment `dpl_6EjwQmZ7WLkPW2t5fG66ikijeb8o` published commit `7a7fa6b1958bcfea4a02d082e26937438eff6a66`. The live homepage/footer and `privacy.html` returned 200; the legacy nonexistent `data-deletion.html` returned 404 as expected.

Before pressing **Meta app Publish**, inspect Meta's **current** Basic Settings / Publish requirements. Populate or verify only fields Meta actually requires. Current public links:

- Privacy: `https://www.thesmartysolution.com/privacy.html`
- Deletion instructions section on same page: `https://www.thesmartysolution.com/privacy.html#data-deletion`
- Terms: **no approved TSS terms page exists; determine if Meta requires it, draft and request legal review if required**
- Category, app icon, app domains and support address: inspect, do not invent values.

**Owner approved publication of the consolidated website notice**, but an operational retention/deletion policy and any applicable legal/privacy review are still outstanding. Filling in Meta Basic Settings is preparatory; **Meta app publication remains a separate explicit approval**.

Meta's privacy guidance emphasizes explaining data categories, purposes and a deletion route. See https://developers.meta.com/vr/policy/privacy-policy/ (broader Meta platform reference; not a substitute for WhatsApp-specific terms).

## 3. Required operational capability before cutover

The webhook is intentionally **receive-and-hold**, not a usable replacement for the mobile WhatsApp Business App. For safe production operations, implement and accept:

1. **Secure operator review path:** authorized owner/admin can retrieve incoming messages and statuses from `tss_whatsapp_inbox`, identify sender, see time and source WABA, and mark the enquiry for follow-up. Separate authenticated reader permissions; do not expand existing webhook service account beyond create-only. Obtain approval for new scoped IAM if needed.
2. **Authorized replies:** owner-controlled send endpoint with strictly scoped Meta messaging token stored in Google Secret Manager, authenticated requests, recipient selection, audit trail and human approval. Do not send messages in readiness mode.
3. **Commercial reconciliation:** only verified, permitted correspondence reaches HubSpot; respect owner approval and privacy choices. No automatic CRM copy of all webhook payloads.
4. **Retention and deletion:** define actual retention duration, erasure/subject request workflow, archive/backup treatment, and dedupe retention. Do not enable Firestore TTL or paid features without reviewing effect and cost.
5. **Operator incident visibility:** alert owner of inbox/store failure or unread messages and provide a fail-closed procedure. No silent auto-reply promise.
6. **Test acceptance:** positive/negative signature, wrong WABA, retry/duplicates, live inbox readback, unauthorized access denied, approved human-initiated reply, downtime/monitoring and cost/limits reviewed.

No IAM, sending token, outbound messaging or retention automation is currently authorized by this document.

## 4. Direct business-app-to-Cloud-API migration: separate approval required

**Owner choice:** direct migration of existing number **+357 99 810330**, not Coexistence and not Tech Provider onboarding. Keep that decision; do not substitute partner onboarding.

**Material risk:** the standard direct path from WhatsApp Business App may require deleting its account before attaching the number to Cloud API, can disrupt mobile access, and can lose app message history. A local backup does **not** establish Cloud API history restoration. Some guidance distinguishes this from an On-Premises-API-to-Cloud-API migration; do not use legacy `backup.data` /`backup.password` migration steps for this Business App number without Meta confirming applicability.

Sources to reverify immediately before cutover (Meta may change procedures):

- WhatsApp Business Platform official documentation collection: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
- Current WhatsApp registration requirements: https://www.postman.com/meta/whatsapp-business-platform/folder/zuoeksl/registration
- Recent Business App vs Cloud API distinction and account-deletion risk: https://mesej.io/guides/whatsapp-number-migration/ and https://github.com/kapso-meta-docs/documentation/blob/main/documentation/whatsapp/solution-providers/migrate-existing-whatsapp-number-to-a-business-account.mdx

**Pre-cutover owner checklist (without changing anything):**

- Confirm Meta app **published and permitted to receive live production events**; confirm business profile and approved display name.
- Confirm billing/payment method and actual message/pricing implications; obtain explicit approval to incur any charges.
- Confirm dedicated **production** WABA `2247151412732806` is correct and distinguish it from test WABA `2882413005471663`. The final production phone-number ID cannot be assumed from the test ID.
- Verify number control, voice/SMS OTP route, verified contacts, two-step PIN / registration prerequisites, required permissions, and current Meta account migration UX.
- Export and independently preserve WhatsApp Business App conversations/contacts required for records. Explain any expected loss to owner and get explicit deletion authorization.
- Obtain a short downtime window and an owner-authorized rollback decision path. Record state before each irreversible action.

**Hard STOP:** Do not delete the WhatsApp Business App account, deregister a phone, register it with Cloud API, alter the production WABA or phone allowlist, publish Meta app, or send customer messages until owner approves **each irreversible/billable transition** and all operational gates above pass.

## 5. Future approved cutover sequence (not instructions to execute today)

1. Owner reviews privacy, costs, live inbox/replies, support coverage, documented current Meta requirements, export/backup and downtime.
2. Owner explicitly authorizes **app publication** if necessary and verifies live app mode.
3. Owner separately authorizes **phone migration** for **+357 99 810330** with understood risk to existing WhatsApp Business App/history.
4. Follow Meta's exact current direct-migration UX; verify number via OTP; do not improvise registration parameters or reuse test phone ID.
5. Confirm real production WABA and phone ID by read-only Meta API/dashboard after registration. Add **only** that approved WABA/phone pair to a new Secret Manager version; keep secret values out of Vercel and GitHub, then update numeric reference and redeploy.
6. Independently verify WABA `subscribed_apps`, a real user-generated inbound message, Firestore write/readback, operator notification, approved manually initiated reply and delivery status. No bulk sends.
7. Monitor agreed window; route any failed communications to the manual continuity plan.

## 6. Rollback and limits

**Before deletion/migration:** webhook can be disabled or redeployed without altering the existing mobile WhatsApp Business account.

**After deletion and Cloud API registration:** website rollback alone **cannot** restore the WhatsApp Business App. Returning the number may require Cloud API deregistration and a supported Business App re-registration, and may involve downtime and inaccessible old chat history. Do not promise reversibility, retained conversations or zero downtime.

Unknowns requiring verified current Meta dashboard state: actual publication eligibility, billing activation, account deletion/deregistration requirements, production phone ID, messaging limits, and recovery path.

## 7. Release controls

- GitHub PR #117 remains **draft**: owner has approved only the published unified website notice, not new operational IAM grants, outbound messaging, Meta app publication or phone migration.
- Existing Research Center, Data Center, HubSpot/Outlook, website and keyless Google configuration must remain intact.
- No TinyFish; no paid services without advance approval.
- Keep approved TSS email signature for any later commercial email. This webhook stage sends **no** commercial email or WhatsApp messages.
