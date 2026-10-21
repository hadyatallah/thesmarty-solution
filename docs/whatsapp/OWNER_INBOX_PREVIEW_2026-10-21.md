# TSS WhatsApp Owner Inbox | Preview Implementation & Acceptance Gates
**Date:** 21 October 2026  
**Mode:** development preview only; NO production release or WhatsApp number migration approved

## Objective and current state

The TSS test webhook has independently passed app callback setup, strict Meta signature validation, test-WABA subscription, signed synthetic Firestore persistence/readback, and event deduplication. Meta's canned sample passed HMAC but was rejected by the intentionally narrow test account allowlist. The Meta app is **not confirmed published**. **+357 99 810330** remains in the WhatsApp Business App.

The existing inbound receiver writes verified incoming events as immutable `tss_whatsapp_inbox` Firestore documents with `event` JSON, `receivedAt` and `state=held_for_review`. It does not read those documents or send replies.

This branch adds a separate private operator preview. It is based on the verified production release `7a7fa6b1958bcfea4a02d082e26937438eff6a66`, without including broader, unapproved code changes from PR #117.

## Preview capabilities

- Owner Google sign-in and a read-only HTTPS endpoint `GET /api/tss-whatsapp-inbox`.
- Server validates Google `userinfo`: `email_verified` and exact `thesmartysolution@gmail.com` on **every** read request; no trust in front-end login hints.
- The existing Google OAuth web client is reused from the Data Center public configuration. The Google token is short-lived and kept only in the open browser tab; none is saved in cookies, local storage, Firestore, Vercel settings or GitHub.
- The browser requests `userinfo.email` and `https://www.googleapis.com/auth/datastore`; this is **new Google OAuth consent scope**, even though no IAM role is added. Google may refuse consent depending on OAuth application configuration.
- Google Firestore reads are performed **as the signed-in project owner**, not using the inbound webhook's service account. The application never adds Firestore read/list privileges to the create-only receiver.
- API allows only fixed `tss_whatsapp_inbox` collection in Firestore `(default)` under `tss-crm-508908`, a maximum 30 records per page, no arbitrary URL, collection, method or provider credentials. It returns only explicitly enumerated fields, not arbitrary Firestore metadata.
- Incoming text/status/metadata displayed using DOM `textContent` (never untrusted HTML); media attachments are not fetched automatically.
- Unsent, nonpersistent drafts can be typed and copied by the owner. **There is no Graph API send route, sending token, send button, auto-reply or CRM write.**
- Browser notifications can be enabled voluntarily. They work only while this page is unlocked and active and contain no sender names or message contents. Not a background alerting solution.
- Retention and deletion are **not active**; this UI cannot delete records. The published TSS privacy/data-handling page includes deletion request instructions.

### Security and cost qualifications

The OAuth `datastore` scope is powerful. Although our endpoint is hardcoded GET-only, the owner-issued token may have more Firestore privileges than a future production inbox should have. This is an **owner-operated pilot**, not the approved long-term production least-privilege pattern. Before customer rollout, favor a distinct *reader-only* Google identity scoped as narrowly as supported and an authenticated owner ID-token exchange. This would require a separate owner review and limited IAM changes. No server-side private credentials are added here.

Firestore operations can consume existing Google Cloud quota; no new paid infrastructure was created. The owner prohibits new charges without advance approval. Keep reads limited and review Cloud billing/usage before production launch.

### Environment configuration

**Production stays unchanged.** New preview-only nonsecret Vercel settings required before live test:

- `TSS_WHATSAPP_INBOX_ENABLED=true` on **Preview** only
- `TSS_WHATSAPP_OWNER_EMAIL=thesmartysolution@gmail.com` on **Preview** only
- Existing `TSS_WHATSAPP_FIRESTORE_PARENT=projects/tss-crm-508908/databases/(default)/documents` already configured for Preview

The current sender webhook keeps its independent `TSS_WHATSAPP_WEBHOOK_ENABLED` production configuration. These new settings do not change Meta subscription or enable outbound messages.

## Acceptance gates

| Gate | Status until tested |
|---|---|
| JS syntax, unit test: exact owner email, Google identity verification, unauthorized access denied | NOT RUN |
| Unit test: fixed collection, GET-only, no send, strict OAuth bearer | NOT RUN |
| Preview deployment READY and private HTML loads (without public data) | NOT RUN |
| Preview unauthenticated API returns 401 (not event payload) | NOT RUN |
| Google OAuth owner consent for `datastore` scope | NOT RUN — requires user's own Google authentication |
| Real Firestore list returns expected signed test records | NOT RUN |
| Replay records remain distinct/unchanged; messages render safely | NOT RUN |
| Draft is local only and no Graph API request occurs | UNIT TEST / MANUAL REVIEW |
| Manual browser alerts while tab open | NOT RUN |
| Retention policy, backend notifications, approved send/token/audit | BLOCKED PENDING OWNER DECISIONS |
| Meta app publication and production number migration | **NOT AUTHORIZED** |

If Google OAuth rejects the new `datastore` scope, **do not** weaken access controls or add broad IAM. Capture only the nonsecret error code and present a narrower authorization alternative.

## Next work after preview review

1. Confirm how the owner wants to receive alerts: in-app notification, ChatGPT task, Outlook email using *approved signature only*, or a combination. Reliable background monitoring requires scoped server-side reads and an authorized schedule, neither supplied here.
2. Define retention age and legal exceptions; implement controlled deletion only after explicit policy and cost approval. Deleting Firestore dedupe documents too early permits replay ingestion.
3. Design signed and logged explicit reply approval and delivery confirmation, using the correct *production* phone-number ID and a Meta system user messaging token stored **only** in Google Secret Manager. No direct customer messaging until separate owner authorization. A human-readable draft is **not** a sent message.
4. Verify app publication requirements and billing; do not migrate `+357 99 810330` until actual live inbox, alerts, human-approved outbound messaging, and rollback readiness pass.

### Rollback
Deleting or disabling this **preview-only** branch/flag does not alter the existing public website, webhook, test subscriptions, Firestore documents or WhatsApp Business App. Existing production website rollback remains a Vercel deployment operation. After a future number migration, reverting Vercel code cannot restore a deleted WhatsApp Business App account.
