# Recovery and troubleshooting

Candidate frontend rollback: revert the candidate commit through a reviewed change, then deploy only with release approval. No workbook schema or business record rollback is needed because this work did not mutate them. The existing Production branch remains the release baseline.

If a new read handler fails, the Manager marks its section failed. Other sections survive. Unknown/unavailable data must not be presented as zero or healthy. Unsupported commands can still reach the original assistant.

After an uncertain send/publish, use the exact action idempotency key to inspect the provider first. Never click-send again to diagnose. A confirmed remote receipt closes the action. Confirmed absence requires a newly reviewed action. Running/uncertain jobs must be reconciled after crashes.

A stale record requires refreshing and reviewing a new proposal. Do not swap in a new version silently. An ambiguous account requires the exact CRM ID. Missing email history requires sync/coverage inspection before outreach. A scheduler run without a business receipt is not success.

When private Apps Script changes are eventually made, preserve the current deployment ID. Web deployment rollback and Head-trigger source rollback are separate. Capture the current baseline then, do not infer it from historical versions in old reports.
