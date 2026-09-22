# Recovery and troubleshooting

Production website and Apps Script Version 10 remain the rollback baseline. No production deployment occurred. Private source/manifest/diagnostic backups and hashes were captured and saved separately. Never restore the historical public form-backend file as the private CRM source.

The current staged Head has two changes: new CommandCenter.gs, and Code.gs validator extraction plus five authenticated dispatch entries. Manifest, diagnostic file and existing Gmail trigger are unchanged. Because triggers run Head, web deployment rollback and source rollback are separate. If Head causes a regression, restore captured Code.gs and remove only the newly added module after preserving its evidence. Do not alter existing triggers or business worksheets.

No production Agent Ledger or new schedules were installed. The isolated synthetic test workbook and CC_TEST_DB / CC_TEST_ACTION properties contain test evidence and may be retained. Removing them later is a separate cleanup action.

For future release rollback: disable CC_SCHEDULES_ENABLED first if activated; restore prior website commit and prior Apps Script deployment version with release approval. Preserve ledger rows for reconciliation. Never delete audit rows to reset a failed job.

For executing/uncertain actions, reconcile the exact entity and record against the proposed fields and recorded receipt. No automatic retry is implemented. A stale version or rejected/expired approval requires fresh review. Broken ledger headers/checksums fail closed and require restoration from evidence, not silent recreation.

Google origin_mismatch requires an approved exact JavaScript origin in the existing OAuth client. A successful Vercel login does not fix the separate Google OAuth rule.


For candidate 0.3 Head rollback, restore CommandCenter.before-0.3.gs captured immediately before staging. No event producers or schedules were installed. The public frontend can return to c96d139e5e6d58ffe7bf3a7ce73d55b6e7929b53. Preserve the synthetic ledger for evidence.
