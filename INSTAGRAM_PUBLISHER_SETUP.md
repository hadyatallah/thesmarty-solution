# TSS direct social publisher

The maintained operating instructions are in [social/README.md](social/README.md).
The deployed endpoint is `POST /api/publish-instagram`. The existing GitHub
workflow is `.github/workflows/publish-instagram.yml`.

The endpoint accepts authenticated, signed QA manifests from the workflow.
Legacy requests containing only an image URL and caption are rejected. Run the
existing workflow for account checks, QA and authorized publication instead of
constructing direct publishing requests.

Required secure variable references are `TSS_PUBLISHER_KEY`,
`INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID` and `FACEBOOK_PAGE_ACCESS_TOKEN`.
`FACEBOOK_PAGE_ID` is an optional account-ID override. The endpoint defaults to
the fixed TSS Page ID and rejects any different account. Never read or expose
credential values in chat, source files or logs.

On 16 September 2026 Hady authorized automatic publishing after completed QA,
waiving the initial manual approval and prior live-format test prerequisites.
The supported scope is Feed on Instagram and Facebook, plus dedicated Stories
and Reels on Instagram. Facebook vertical formats remain unsupported.

Final asset/source/design/account checks, duplicate protection, publishing caps
and actual published-asset comparison still apply. A failed or uncertain
publication is quarantined for reconciliation and never retried automatically.
Configuration and authorization are recorded in `social/publishing-config.json`
and `social/user-approval-policy.json`. Live status and evidence are maintained
on the `tss-social-state` branch. See the maintained README for current procedures.
