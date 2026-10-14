# TSS Phase D WhatsApp Cloud API Readiness Report

Date: 10 October 2026
Scope: read-only Meta inventory, official documentation review, offline-only engineering preparation.

## Executive disposition

Phase D is PARTIAL / PREPARATION ONLY. No Production implementation is authorized.

No Meta resource was created or modified. No WhatsApp Business Account was created. No phone number was registered, migrated, disconnected or tested. No webhook was configured. No message was sent. No HubSpot record was created or changed. No Production deployment or PR merge occurred.

## Account-verified Meta inventory

| Gate | Status | Evidence |
| --- | --- | --- |
| Meta Business Portfolio exists | PASS | Business portfolio `thesmartysolution`, portfolio ID `360592650162259`. |
| Portfolio ownership / admin visibility | PASS | `Hady Atallah (you)` has Full access / Everything. `UnclaimedBusinessUser FromPool @thesmartysolution` also shows Full access / Everything and needs later cleanup review. |
| Business verification | BLOCKED | Business verification status is `Rejected`. Meta page says it cannot determine the portfolio belongs to an actual business. |
| Legal business details | PARTIAL | Legal business name, address, business phone and website are blank in Meta Business info. |
| Facebook Page | PARTIAL | Page `The Smarty Solution` is attached, but shows `Review needed` for people with access. |
| Instagram account | PASS | `@thesmartysolution`, ID `17841424595983267`, owned by `thesmartysolution`. |
| WhatsApp Business Account | BLOCKED | Business Settings > WhatsApp accounts shows `No WhatsApp accounts added`. |
| Meta Developers app | PARTIAL | App `The Smarty Solution Publisher`, app ID `1707395857227784`, owned by `thesmartysolution`. WhatsApp product/configuration was not verified on the developer app. |
| Billing / WhatsApp billing | PARTIAL | Billing hub exists; no ad accounts visible. WhatsApp Business Accounts billing tab did not show an attached WABA in the observed read-only view. |
| Existing phone number eligibility | NOT TESTED | No WABA or Cloud API phone number is attached, so no account-specific phone-number eligibility or coexistence state could be verified. |

## Official capability summary

Official Meta documentation confirms Cloud API setup requires a Meta app with the WhatsApp use case, a WhatsApp/Messaging account, phone number selection or addition, webhook setup, and a system-user token for durable API use. Required token permissions documented for system-user operation are `business_management`, `whatsapp_business_messaging` and `whatsapp_business_management`.

Official docs also show webhook payloads include `whatsapp_business_account` entries, `phone_number_id`, original WhatsApp message IDs, customer `wa_id`, message timestamps and status events. This supports preserving provider identifiers as the idempotency and audit source.

Meta documents the customer-service window as a 24-hour window opened by a user reply/message, allowing non-template messages inside that window. Business-initiated messages outside that window require approved templates.

## Coexistence and phone-number assessment

Account-specific coexistence is BLOCKED / NOT VERIFIED because no WABA is attached to the current portfolio.

Do not assume the existing WhatsApp Business App number can be connected without disruption. The next owner-approved provider step must verify, in Meta's own setup flow or documentation for this exact account and number, whether supported WhatsApp Business App coexistence is available. If coexistence is unavailable or uncertain, preserve the current Business App number and use a separate approved test number or stop.

## Proposed integration contract

Smallest safe target:

1. Meta webhook receives inbound messages and statuses.
2. Backend verifies Meta signature against a stored app secret.
3. Webhook events normalize into a minimal envelope: WABA ID, phone number ID, display phone, message ID, conversation/status ID, wa_id, timestamp, type, text summary and raw provider identifiers.
4. Idempotency key is derived from provider, WABA ID, phone number ID, message ID, status and timestamp.
5. Identity resolution first matches exact known `wa_id` to HubSpot Contact, then verified Company association. Ambiguous or unknown identity enters human review.
6. HubSpot remains the commercial system of record. Tickets go to `TSS Commercial Enquiries`, not Support Pipeline.
7. Suppression and opt-out are checked before any outbound draft is eligible.
8. ChatGPT may prepare drafts and reports. Customer messages require owner approval. Autonomous customer messaging remains unsupported.

## Offline engineering completed

Added disabled-by-default offline candidate:

| File | Purpose |
| --- | --- |
| `lib/tssWhatsappPhaseDOffline.mjs` | Pure local helpers for signature verification, webhook normalization, event idempotency, classification, identity resolution, suppression checks, approval state, outbound validation, retry simulation and command registry. |
| `tests/tssWhatsappPhaseDOffline.test.mjs` | Synthetic tests only. No network, no secrets, no provider writes. |

Test command:

```bash
node --test tests/tssWhatsappPhaseDOffline.test.mjs
```

Expected result: PASS.

## ChatGPT Command Centre readiness

| Command | Mode |
| --- | --- |
| Show new WhatsApp enquiries | READ-ONLY |
| Summarize an enquiry | READ-ONLY |
| Identify unresolved messages | READ-ONLY |
| Show related HubSpot Contacts and Tickets | READ-ONLY |
| Prepare a reply for owner review | DRAFT-ONLY |
| Approve or reject a proposed response | REQUIRES OWNER APPROVAL |
| Show message delivery status | READ-ONLY |
| Show follow-ups requiring attention | READ-ONLY |
| Report integration failures | READ-ONLY |
| Show messaging usage and costs | READ-ONLY |
| Autonomous customer messaging | FUTURE UNSUPPORTED |

## Dependencies and blockers

Phase B remains PARTIAL / BLOCKED. HubSpot Company property `tss_company_key` remains unresolved under support case `49212582236`.

Phase C remains HELD. Existing ChatGPT preparation is permitted only under C-LIM-01. It is not operational acceptance.

Phase D production remains HELD until all future owner approvals below are explicit and recorded.

## Future approvals required

1. Correct Meta business legal details and business verification path.
2. Decide whether to attach/create a WABA, and confirm no disruption to the existing WhatsApp Business App number.
3. Verify account-specific coexistence or approve a separate test number.
4. Create or modify Meta app WhatsApp configuration.
5. Generate/store system-user token and app secret.
6. Configure webhook endpoint and subscriptions.
7. Approve any billable messaging setup or credit exposure.
8. Approve HubSpot write path after Phase B idempotency and identity gates are closed.
9. Approve controlled internal-only live test.
10. Approve Production deployment.

## Rollback and non-disruption provisions

Current Business App remains untouched. No phone-number migration is acceptable without a separate rollback plan. First live build must be dark-launched with webhook verification only, then inbound-only, then draft-only outbound, then owner-approved send. If duplicate events, signature failures, identity ambiguity or billing uncertainty appear, events must enter failure hold and no customer response should be sent.

## Readiness gates

| Gate | Status |
| --- | --- |
| Meta portfolio inventory | PASS |
| Business verification | BLOCKED |
| Facebook Page / Instagram inventory | PARTIAL |
| Existing WABA present | BLOCKED |
| Existing Cloud API configuration | NOT TESTED |
| Phone-number eligibility | NOT TESTED |
| WhatsApp Business App coexistence | NOT TESTED |
| Official capability review | PASS |
| Pricing / billing exposure | PARTIAL |
| TSS architecture compatibility | PASS |
| Offline tests | PASS |
| Production readiness | BLOCKED |

