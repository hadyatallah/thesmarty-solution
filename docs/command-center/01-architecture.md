# TSS AI Agent Command Center architecture

Candidate 0.2.0, staged on 22 September 2026. Existing operational Google Sheets CRM remains authoritative. No database migration or new hosting.

The existing CRM loads one Manager and shared CRM, Growth/Communications and Operations/Content modules. Common requests use deterministic rules over the signed-in snapshot. Unknown commands retain the existing approved AI interpreter. Specialist prompt registry remains 0.1.0; it is not a newly connected autonomous model runtime.

The native Apps Script binding in command-center/apps-script/CommandCenter.gs uses the existing requireSession_ function and derives the internal tenant and actor on the server. Browser-supplied roles or tenant IDs do not authorize anything. Existing saveRecord validation was extracted without changing its body into a private saveRecordLocked_ helper. Both the manual CRM and new gateway retain that validator and record-version check.

Agent Ledger stores append-only transitions. Each row holds an action/job state plus a metadata-only audit event in one JSON envelope with a checksum. A script lock and SpreadsheetApp.flush serialize transitions. This is not a database transaction spanning the business sheet and ledger. Dispatch is recorded first; a crash or ambiguous result remains executing/uncertain and cannot be automatically replayed. Manual reconciliation is still required. Locks do not serialize a human editing the sheet or another Apps Script project.

The browser stages proposals, displays exact server-returned fields, then requires a separate approval click per action. The server binds approval to the exact payload hash and current record version for ten minutes. Assistant writes fail closed when the gateway is unavailable. Ordinary manual CRM screens and WhatsApp logging retain existing behavior. Linked dependent actions require a resolved parent ID and a new review.

Pure modules are packaged into the private Apps Script file by build.mjs. No Node dependencies, credentials, alternate authentication, new OAuth scopes, or provider send/publish adapters are introduced. The generic Node Gateway/WorkflowEngine remain contract implementations; the native binding is the actual staged runtime.

Production remains on backend Version 10 and the previous website release. The staged Head source is not a production web deployment. No live Agent Ledger or proactive trigger has been installed. A separate synthetic workbook verifies Google-backed persistence. Real CRM reads were verified without changing business data.


Candidate 0.3 adds context.js as the shared evidence/notification projection, and native Events.gs serialized by the same Apps Script lock and append ledger. No new service or datastore.
