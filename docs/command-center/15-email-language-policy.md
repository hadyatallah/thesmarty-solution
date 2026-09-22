# Commercial email language policy

User direction, 22 September 2026: commercial communications use info@thesmartysolution.com. Email contains English first, followed by professional Greek suitable for Cyprus, conveying the same facts and commitments.

The shared Growth module prepares both versions. Its optional translation function calls the existing authenticated askAssistant endpoint and its existing model usage limit. No new model subscription is introduced. Missing or failed translation is explicitly marked, with approvalReady false. Model output is untrusted, escaped in the interface and always subject to human review. Greek-character detection is only a format check, not proof of translation accuracy.

Sender, recipients, subject and both complete language versions must be included in exact-action approval before any future sending adapter executes. This update does not activate sending. The native gateway still does not expose external email dispatch. Existing email ingestion is unchanged. WhatsApp retains the Business App/manual logging boundary.

The tss.growth.2 prompt records this policy. The registered prompt is not yet a replacement for the legacy backend system prompt. Generic legacy model replies therefore remain an integration gap and must not be described as fully policy-enforced.

Validation: P2-19 through P2-21 exercise bilingual preparation, fixed sender, failed translation, suppression and WhatsApp separation. Live model translation, native-speaker review and provider dispatch remain untested.

Release status: the user requested deployment, but successful signed-in CRM acceptance and the other live phase gates are still required. Google origin mismatch was cleared. The first CRM challenge expired during Google verification. Subsequent authentication popups timed out in the cloud browser. No completed authenticated Preview session was established and no Production release was performed.
