# Data access matrix

| Data | Manager/CRM | Growth | Operations | Writes |
|---|---|---|---|---|
| Companies/Contacts | Authorized snapshot | Suppression/history/identity and draft context | No independent copy | Existing CRM path only |
| Opportunities/Tasks/Tickets | Summary and attention | Existing-work check | Health context only | Existing CRM path only |
| Email Activity/Outreach | Linked history with coverage | Triage and contact checks | Evidence only | No new ledger write |
| Proposal/Revenue | Read if projected | No inference of payment/fees | No accounting | Read-only |
| System Control | Only projected allowlist | Approved rules only | Health controls | No writes |
| Automation Log | Read summary | None by default | Reported issue summaries | No new direct write |
| Agent actions/audit/jobs | Interface contracts | Interface contracts | Interface contracts | Durable store not connected |

Current internal TSS scope is not production multi-tenancy. Server services require tenantId and authorized actor; the browser is not a security boundary. Every production store key, query, approval, job, event and prompt context must be derived from authenticated scope. Tests only exercise the service contract, not a deployed tenant perimeter.
