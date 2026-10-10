# PDF V1 integrity addendum — production release still held

This is the successor to the initial e7b7135 implementation checkpoint in CRM_PDF_ATTACHMENTS_V1.md. Its feature constraints, private-native prerequisite and live acceptance limitations remain unchanged. It does not declare production acceptance.

The final local result is **84 passing checks**: 42 API/validation checks, 18 private native-writer checks and 24 isolated browser DOM/picker checks. The original 41 API checks remain unchanged. A new regression first failed against the initial candidate, then passed after replacing lossy ASCII PDF-header decoding with an exact comparison of the five magic octets. High-bit bytes that Node decodes as `%PDF-` under ASCII must still be rejected with EMAIL_ATTACHMENT_NOT_PDF.

The added test is tests/pdf-magic.test.mjs. The existing synthetic API tests continue in tests/pdf-attachments.test.mjs. Run both with:

```sh
node --test tests/pdf-attachments.test.mjs tests/pdf-magic.test.mjs
```

All normal existing repository tests remain unchanged. The new contract workflow includes the additional test; it does not replace or relax the existing CI suites. Passing local checks do not establish a passing full existing regression suite.

Vercel automatically creates branch previews. The initial e7b7135 preview reached READY, but this did not change production. Exact final candidate/preview identities are in the scoped Drive execution record and the authoritative TSS Current System Map and Open Work Register. No native publication, production promotion, live mailbox send or customer release is approved by a preview build or by this document.

The native editor remains blocked by an exhausted TinyFish wallet. Browser URL navigation remains administrator-blocked; DOM/picker tests use the documented about:blank/SHA adapter and synthetic responses. A fresh native pre-change read, narrow audit publication, full regression completion and explicit internal live acceptance are still required. R-01 remains closed. Do not reset Outlook OAuth or change Gmail.
