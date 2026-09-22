# Action and approval matrix

| Action | Candidate treatment | Production requirement |
|---|---|---|
| Read/analyze | Automatic within current snapshot | Existing authenticated permissions |
| Draft | Prepare and label Draft | No execution implied |
| Create/update core CRM | Existing confirmation remains | Existing schema validation and expected version |
| Qualify / Won / Lost / suppression / financial fields | High impact gateway class | Exact fresh human approval plus server authorization |
| Send email / external WhatsApp / publish | New Manager cannot execute | Exact recipient/account/content/asset hash approval, suppression recheck, provider receipt |
| Merge/delete/bulk replace/pay/deploy | No production adapter | Separate exact action approval and recovery plan |

Action fields include ID, tenant, actor, source, request ID, entity/reference, operation, proposed fields, expected version/outcome, payload hash, approval requirement/state/reference/expiry, execution status, idempotency key, provider receipt, error code, timestamps and audit reference. Approval expires after at most ten minutes in the candidate. This is a candidate safety default, not a modified live TSS control.

Same request and payload returns the same action. A changed payload requires a new approval. Executing/uncertain actions cannot dispatch again. Reconciliation with provider proof may close them; confirmed absence requires a newly reviewed proposal, not blind retry.
