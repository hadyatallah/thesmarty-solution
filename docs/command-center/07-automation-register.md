# Automation register

| Workflow | Implementation | Activation |
|---|---|---|
| Daily brief | Native backend handler, Asia/Nicosia working days, deterministic event key | Disabled; not installed |
| Weekly review | Native Monday handler, deterministic date key | Disabled; not installed |
| Housekeeping | Native persisted report preparation and data-quality checks | No event hook installed |
| Incoming email/enquiry | Existing TSS capture routines preserved | Native event consumer tested; producer hooks remain gated |
| Content/publication result | Native metadata event consumer; provider integration pending | Not connected |

ccEnableSchedules requires CC_LIVE_GATES_PASSED equal to the exact runtime version. Do not set that property before acceptance. It deduplicates its own handler and does not remove existing triggers. ccDisableSchedules turns off only the new brief workflow. No new ChatGPT automation, external send, or publication trigger was created.

The existing private CRM had one Head time-based scheduledEmailSync_ trigger at inspection. It was left unchanged. Its successful invocation is not proof of Outlook ingestion or a successful commercial event.

## Reconciled live inventory — 22 September 2026

See existing-automation-inventory.json. Existing Outlook CRM Sync and Weekly Commercial Review remain enabled, alongside health, follow-ups and backup tasks. Their run metadata does not prove business success. New Command Center schedules remain disabled; do not confuse these with the existing Work schedules.

Outreach Engine 6aae23bd118881918b62f74315129d61 was updated in place at22:27:08.747226UTC. Background runs now prepare/review only; exact bilingual message approval and Mon–Fri09:00–17:00 Asia/Nicosia checks apply to separately approved interactive sends. This is an instruction-level update, not live send acceptance. No send/publication or schedule change occurred. Disabled social publishing automations remain disabled.
