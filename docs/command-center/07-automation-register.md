# Automation register

| Workflow | Implementation | Activation |
|---|---|---|
| Daily brief | Native backend handler, Asia/Nicosia working days, deterministic event key | Disabled; not installed |
| Weekly review | Native Monday handler, deterministic date key | Disabled; not installed |
| Housekeeping | Read rules and generic workflow contract | No event hook installed |
| Incoming email/enquiry | Existing TSS capture routines preserved | New command-center event binding pending |
| Content/publication result | Generic preparation/reconciliation contract | Not connected |

ccEnableSchedules requires CC_LIVE_GATES_PASSED equal to the exact runtime version. Do not set that property before acceptance. It deduplicates its own handler and does not remove existing triggers. ccDisableSchedules turns off only the new brief workflow. No new ChatGPT automation, external send, or publication trigger was created.

The existing private CRM had one Head time-based scheduledEmailSync_ trigger at inspection. It was left unchanged. Its successful invocation is not proof of Outlook ingestion or a successful commercial event.
