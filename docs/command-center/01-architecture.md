# TSS AI Agent Command Center architecture

Candidate 0.1.0. Existing operational Sheets CRM remains authoritative. Commercial TSS Flow and Discovery Portal are out of scope. No migration, new hosting or new account was created.

## Actually implemented

The current CRM page loads crm/command-center.js. Its Manager routes supported natural-language requests to CRMAdapter, GrowthAgent and OperationsAgent. These are logical modules in one application. All receive the same authenticated getState snapshot. They do not independently copy CRM data. Unknown requests retain the existing assistant/AI interpretation path.

CRM rules are deterministic. They provide lookup, dossiers, due work, configured opportunity inactivity, duplicate candidates, missing fields and current pipeline/activity summaries. The Manager reports partial specialist failure without discarding successful results. Rendering escapes source text.

Gateway is a server-side service class with injected authorization, transactional store and provider adapter. It hashes exact payloads, binds approvals to them, checks expiry/version, records dispatch before sending, deduplicates the same request and holds uncertain outcomes for reconciliation. WorkflowEngine similarly takes a transactional store and bounded read/preparation handlers. Neither is exposed as a live endpoint. The only store implementation is an explicitly synthetic test double.

## Not connected

Production authentication to the new gateway, durable metadata/audit persistence, provider send/publish adapters, current public research provider and backend schedules/event hooks. No new write/send/publish endpoint is exposed. Existing assistant writes continue through the legacy confirmation and validated saveRecord path. They are not claimed to be covered by the new gateway.

The new Manager routes common requests deterministically. Full conversational orchestration using the versioned specialist prompts is not connected. Prompts are registered and tested for data separation, not evidence of adversarial model robustness.

## Backend completion

Reuse the current Apps Script authentication, authoritative schema and saveRecord validation. Add private agent metadata ledgers and lock-protected gateway transitions through the actual private runtime after its source is recovered and inspected. A server bridge may host the Node gateway, but no new token trust model or database migration is authorized. The integration task identifies this remaining work explicitly.
