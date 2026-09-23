# Provider evidence projection v1

Date: 23 September 2026

This release improves the Operations/Manager health view using evidence already present in the authoritative TSS CRM workbook. It does not create a new monitoring database and does not infer provider success where no receipt exists.

## Added projections

- Website enquiries: latest persisted inbound-enquiry Activity receipt.
- CRM transfers: latest inbound enquiry linked-record Activity receipt.
- Backups: latest successful CRM Backup Automation Log entry with a 36-hour freshness window because the approved backup cadence is daily.
- Jobs: unresolved Warning/Error/Critical/Failed Automation Log entries become a warning backlog; resolved items are excluded.
- Deployment: System Control production/deployment record is surfaced as evidence, but remains unverified until Vercel is checked independently.
- Outlook ingestion: existing Email Activity projection remains ledger-only and explicitly does not claim mailbox completeness or ingestion heartbeat.

## Safety behavior

- No website traffic SLA is invented.
- No enquiry is assumed missing merely because no recent enquiry exists.
- No Outlook health is marked healthy from an old captured email.
- Missing provider evidence remains Unknown or Unverified.
- Resolved Automation Log warnings do not continue to degrade the Jobs signal.
- Backup restore testing remains separate from backup creation evidence.

## Tests

New CTX tests cover:
- backup freshness
- inbound enquiry receipt
- CRM transfer evidence
- unresolved/resolved automation warnings
- deployment control evidence

Vercel Preview for commit `5840ece53ca5fadbc2872ccf1580e832a47f1cf4` reached READY.

No CRM data, external email, social publication or schedule state is changed by this code.
