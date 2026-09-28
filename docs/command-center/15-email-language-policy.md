# Commercial email language policy

User direction, 22 September 2026: commercial communications use info@thesmartysolution.com. Email contains English first, followed by professional Greek suitable for Cyprus, conveying the same facts and commitments.

The shared Growth module prepares both versions. Its optional translation function calls the existing authenticated askAssistant endpoint and its existing model usage limit. No new model subscription is introduced. Missing or failed translation is explicitly marked, with approvalReady false. Model output is untrusted, escaped in the interface and always subject to human review. Greek-character detection is only a format check, not proof of translation accuracy.

Sender, recipients, subject and both complete language versions must be included in exact-action approval before any future sending adapter executes. This update does not activate sending. The native gateway still does not expose external email dispatch. The existing read-only email ingestion is retained; its lock handling is being repaired separately. WhatsApp retains the Business App/manual logging boundary.

The tss.growth.2 prompt records this policy. The registered prompt is not yet a replacement for the legacy backend system prompt. Generic legacy model replies therefore remain an integration gap and must not be described as fully policy-enforced.

Validation: P2-19 through P2-21 exercise bilingual preparation, fixed sender, failed translation, suppression and WhatsApp separation. Live model translation passed in the signed-in Preview at 2026-09-22T22:03:22Z. Native-speaker review and provider dispatch remain untested.

## Sending window

User direction: no email outside business hours. Provisional window is Monday to Friday, 09:00 inclusive to 17:00 exclusive, Asia/Nicosia. The user has not supplied alternative hours. IANA timezone conversion handles daylight saving. Public holidays are not yet configured, so this must not be described as a complete Cyprus working-day calendar.

The server gateway checks the window before claiming dispatch and again immediately before calling an email provider. Out-of-hours actions remain unexecuted. A valid exact-content approval is still required when sending resumes. An overnight hold does not extend the ten-minute approval expiry. No automatic morning send or retry was enabled.

This is a tested server contract, not a live Outlook sending integration. Native Apps Script continues to reject email operations altogether. Existing separate website acknowledgements and mailbox rules have not yet been verified against this window. Do not claim this update controls every email sent by the business.

P2-22 to P2-24 cover winter/summer time, weekends, boundaries, expired approvals and crossing closing time during validation. Provider calls are synthetic, with zero real messages sent.

Release status: authenticated Preview, native synthetic approval/write and a bilingual draft passed live checks. Production remains held for unresolved reliability and integration gates. Native email sending is disabled.
