# Prompt and module register

| ID | Module | Status |
|---|---|---|
| tss.manager.1 | Manager instructions | Registered, not attached to a new LLM runtime |
| tss.crm.1 | CRM interpretation/summarization instructions | Registered |
| tss.growth.1 | Evidence and outreach drafting instructions | Registered |
| tss.operations.1 | Health and content instructions | Registered |
| tss-cc-0.1.0 | Deterministic modules | Candidate code and tests |

Registry source: command-center/prompts.js. promptFor emits trusted system rules separately from serialized untrusted data. No model result has execution authority. Existing Apps Script AI prompts were not changed. No API/model subscription was introduced.

## Candidate 0.2.0 update

The native private Apps Script binding now derives owner/session authority server-side and persists action/audit transitions. Shared browser controls stage and separately approve exact changes. This is staged and partially tested, not a production release. Specialist prompt IDs remain unchanged; no new model/provider credentials or permissions were added. See the current architecture and implementation report for deployment status.
