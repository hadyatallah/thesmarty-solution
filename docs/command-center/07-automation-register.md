# Automation register

All new entries are DISABLED and have no installed trigger.

| Workflow | Intended location | Input/output | Candidate |
|---|---|---|---|
| Working-day brief | Existing TSS backend | Snapshot to review brief | Daily key and safe handler engine |
| Weekly commercial review | Existing TSS backend | Defined period/current pipeline to report | Reporting method and handler contract |
| CRM housekeeping | Existing health/event flow | Detect quality issues | Non-destructive rules |
| New enquiry / transfer result | Existing form backend | Persisted reference to attention | Event contract |
| Incoming email | Existing Outlook ingestion | Message reference to review | Triage and event contract |
| Failed job | Backend job store | Bounded retries to aggregated warning | Engine contract |
| Publication result | Existing publisher | Provider reference to reconciled state | State normalization |

No duplicate ChatGPT automation was created. Existing schedules were not altered. Weekdays and schedule times must be reconciled with current configured routines before activation. Candidate daily key uses Asia/Nicosia and Monday-Friday; social concept cadence retains Monday-Saturday. A running job left by a crash needs explicit recovery, not an assumed success.
