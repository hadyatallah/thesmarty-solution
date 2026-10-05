# Native CRM PDF attachments — V1 implementation checkpoint

**State: implemented candidate; NOT deployed or accepted. Do not merge or enable customer use.**

The native CRM Outlook composer and its existing proposal/approval API are extended, not replaced. Existing Outlook authorization, mailbox check, recipient/Company matching, suppression, duplicate policy, durable send claim, action header, Sent Items reconciliation and receipt path remain in use. Gmail and OAuth configuration are unchanged.

## Contract

An optional single PDF, maximum **2,000,000 bytes (decimal 2 MB)**, is selected with the normal browser/device file picker. Filename, exact size, PDF indicator and Remove control appear above the explicit Approve and send button. Selection and removal do not call an API or send mail. Reload discards the selected file; it must be selected and approved again.

The browser retains the File in memory. Only canonical filename, MIME type, byte size, SHA-256, final filename/version and optional restricted Drive file ID enter the proposal. From/To/Subject/Body/Company and attachment metadata are cryptographically bound to the existing sealed proposal and durable fingerprint. The approval request alone carries base64. The server validates the actual bytes, size, `%PDF-` signature, MIME/extension, canonical base64, filename safety and exact approved SHA-256. Arrays, second attachments and unknown attachment fields are rejected. No document bytes enter cookies, logs, Sheets or Drive. Drive IDs are references only: no arbitrary URL fetch and no sharing change.

Changing content, recipient, selected file or its reference during proposal invalidates dispatch. A fresh explicit approval is required. Safe failures include EMAIL_ATTACHMENT_TOO_LARGE, NOT_PDF, CHANGED, INVALID and MISSING. Attachment audit capability absence blocks PDF sends; it does not switch to unaudited sending or block the unchanged text-only attachment-free path.

Graph uses a fileAttachment with saveToSentItems=true and the existing x-tss-action-id. PDF Sent Items matching additionally requires that exact header. Attachment enumeration requests metadata only. `metadata` means filename, type and byte size were all observed and matched; `flag-only` means only hasAttachments=true was observed. An accepted/unverified result is never presented as full attachment verification. Post-dispatch transport or audit uncertainty does not authorize retry.

The exact final signature is normalized visibly before approval, and asserted on the server:

```text
Regards,

The Smarty Solution
Connect · Develop · Invest.
info@thesmartysolution.com
+35799810330
https://www.thesmartysolution.com
```

## Implementation and native prerequisite

Public repository files: crm/outlook-send.js; api/outlook/send/propose.js; api/outlook/send/approve.js; command-center/email-attachment.js; command-center/email-attachment-server.js; command-center/email-signature.js; tests/pdf-attachments.test.mjs; tests/browser-pdf-attachments.py.

Private Apps Script candidates: OutlookIntegration.gs and the single Code.gs dispatcher addition. Complete native source, exact saved-source references, narrow diff, SHA-256 manifest, generator and native tests are retained only in restricted project evidence, not this public repository.

The saved current receipt writer discards unknown metadata. Accordingly, proposal and approval require authenticated outlookPdfAttachmentSupport V1 and the durable claim/receipt must echo the bound attachment SHA-256. The candidate writer preserves the existing 18 Email Activity columns, storing metadata in actionTaken and the governed ledger. It enriches an already-ingested provider row rather than appending a duplicate, preserves an existing contact association, and rejects conflicting Company context. No PDF bytes are stored. A deduplicated Company-linked Activity event makes `Sent email / Attachment: filename.pdf` visible through the existing Company timeline without replacing the frontend. Unreconciled sends do not get a Sent email timeline event.

Customer PDF use is fail-closed by default. Native OUTLOOK_PDF_CUSTOMER_ACCEPTED is not set by this implementation. Before acceptance, only the existing Internal QA Company and internal QA recipient are eligible. Existing general sending hours remain unchanged; internal PDF QA additionally requires weekdays 09:00–17:00 Asia/Nicosia. No automated send, retry or customer release is introduced.

## Executed tests and limitations

83 local checks passed: 41 Node API/validation tests, 18 native-writer VM tests, and 24 Chromium DOM/file-picker checks over desktop/tablet/mobile viewport emulation. These are local/synthetic tests, not production acceptance. Existing tests were not edited or weakened. The complete pre-existing regression suite has not been executed in this environment; normal repository CI remains a release gate.

Node tests import the real handlers and mock all CRM/Graph calls. Native tests execute the complete candidate functions against an isolated spreadsheet/ledger model. They cover receipt replay, delta-ingestion race, metadata durability, Company/contact preservation, timeline deduplication and text-only behavior.

Browser navigation was blocked with ERR_BLOCKED_BY_ADMINISTRATOR. The browser checks therefore run actual function bodies in about:blank after removing ESM declarations, with a Python SHA-256 adapter and synthetic API responses. They verify actual file chooser behavior and DOM mutation guards, but do not prove HTTPS module loading, native WebCrypto, real-device behavior, production styling, authentication or live CRM acceptance.

PDF signature/hash validation is not an antivirus scan or complete structural PDF parser. Restricted Drive references are recorded but their content/version is not independently fetched or matched. New sent rows retain existing blank contact behavior unless an already-ingested row provides a contact association.

## Deployment and recovery state

Pre-change main / rollback commit: 68b91a8aeab3029db19a55bf1260e019fd7bc499.
Production rollback deployment: dpl_57o7eYSD7DXxCfSUrkDFBHNc9xWd (thesmarty-solution-agent).
Native reference: saved v14 Outlook source and unchanged Code.gs from the restricted evidence; this task could not freshly read the live editor.

No main merge, native publication, Vercel production deployment or controlled live email was performed. The native editor browser could not start because the TinyFish wallet was exhausted. No terms, OAuth consent, permissions or mailbox connection were changed. The temporary baseline-capture CI run returned no artifact at the last check; this is not a complete local repository archive. The exact baseline commit and relevant file captures remain the rollback references.

The release remains blocked until supported native access is restored, the narrow native patch is verified and published, full regression checks pass, deployed assets are verified, and the explicit internal QA package is approved during its send window. Sent Items, recipient receipt, exactly-once Email Activity, metadata, Company timeline and text-only production checks are still unverified. Do not infer deployment from this commit or local tests.
