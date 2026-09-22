# Integration map

| Integration | Actual candidate binding | Remaining work |
|---|---|---|
| CRM | Shared current getState snapshot, existing session | Live projection/coverage verification |
| CRM writes | Existing saveRecord retained with proposal version protection | Route new gateway through same validation, server-side approvals |
| Email | Read Email Activity if present | Inbox provider, live ingestion heartbeat, send/reconcile adapter |
| WhatsApp | Existing Business App composer and manual log unchanged | No inbox/API project included |
| Enquiry | Health normalization contract only; existing transfer code unchanged | Safe read projection of receipt/transfer state |
| Analytics | No live binding | Authorized existing analytics adapter |
| Social | Draft concepts, asset review rules, provider-state normalization | Bind exact approved package to existing publisher and receipts |
| Deployment | No runtime adapter | Read-only project event/usage feed |
| Notification | Store interface and deduplication | Durable backend inbox plus UI |
| Research | Injectable research interface | Current public source provider and quality evaluation |

No provider credentials belong in browser code or prompts. ChatGPT connector access is not application runtime authorization.
