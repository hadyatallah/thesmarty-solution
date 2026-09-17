# TSS Instagram and Facebook automation

The existing GitHub → secured Vercel → Meta pipeline publishes TSS content.
Metricool is not used for publishing. Website, enquiry, Sheets, Microsoft 365
and SEO functionality are outside this system.

## Current operation — 16 September 2026

Posts 1–5 have explicit user approval and verified Instagram/Facebook results.
Post 5 is [on Instagram](https://www.instagram.com/p/DdWJM1fHCXe/) and
[Facebook](https://www.facebook.com/122301039992216133/posts/122301236666216133).
The durable source of truth is `tss-social-state: social/history.json`.

On 16 September 2026 Hady explicitly replaced the initial rollout hold with:
“skip the agreed launch gates pass and proceed with automation starting today”.
The policy now uses `automatic_after_qa`. Individual approval of Posts 6–10,
completion of the first ten and prerequisite live-format tests are no longer
required to start. The five historical individual approvals remain unchanged.
No individual approvals or live-test results are fabricated.

The intended posting slots are **09:15, 14:15 and 19:15 Asia/Nicosia**.
UTC wake-ups at minutes 15 and 45 of hours 6, 7, 11, 12, 16 and 17 cover
both Cyprus daylight-saving offsets and provide additional delivery attempts.
The manifest's offset-aware `publishAt` prevents early posting. Durable history
prevents a second publication on later wake-ups. It publishes only
final queue items that pass all actual-file, fact/source, geography, design,
caption, duplicate, account and technical review checks. Daily/monthly limits
still apply. Uncertain publication outcomes stop the automatic queue.

Supported scope is Feed on Instagram and Facebook, and dedicated Stories/Reels
on Instagram. Existing format verification records describe actual evidence.
First automatic vertical publications are checked against the exported assets
and archived after publishing. A failed comparison is quarantined, not retried.
`controlledPublicationId` remains null. This launch does not use a limit-bypassing
controlled publication exception.

Each workflow writes `social/automation-status.json` to the state branch. Its
`publishingEnabled`, blockers, approval counts and unpublished queue counts
explain the current effective state. Account errors fail closed and appear as
safe platform/error codes, never credential values. GitHub reports failed runs.
The separate TSS Post Review notification task remains a notification-only task.

## Monthly plan and platform scope

The approved calendar-month plan is **44 assets**: 16 Feed, 20 Stories, 8 Reels,
with 36 useful and at most 8 promotional assets. Topic/format allocations are in
`social/monthly-content-plan.json`; draft planning uses those allocations.
The publisher enforces total, format and promotion caps. Missed or failed slots
stay empty. At most one item is attempted per run, one of each format per local
day, and three assets per local day. Only an explicitly authorized controlled
rollout test may bypass normal daily/monthly limits.

- Feed: Instagram + Facebook, dedicated 1080×1350 PNG/JPEG.
- Story: Instagram adapter, dedicated 1080×1920; authorized for automatic publishing after final QA.
- Reel: Instagram adapter, dedicated 1080×1920 H.264 MP4; authorized for automatic publishing after final QA.
- Facebook Story/Reel adapters are not implemented or live-verified.

Consequently the full planned mix currently represents **60 platform publications**:
32 Feed publications plus 20 Instagram Stories and 8 Instagram Reels. It does not
mean every format is cross-posted to Facebook. Facebook vertical publishing needs
its own adapter, verification and an updated platform-publication target.

## Content production and honest limits

`node social/scripts/generate-drafts.js YYYY-MM-DD --history /path/to/current/history.json` prepares nonapproved drafts
from the reviewed bank and eligible reviewed trend candidates. It respects monthly
format/pillar capacities and existing history, reports exhausted inputs, and uses
current design requirements. It does not invent facts, final footage or approval.

Each workflow also runs the planner in dry-run mode and retains a monthly
content-supply report, including exhausted topic/format inputs.

The publishing workflow consumes final approved queue items. It does **not** run
an autonomous research/design agent. The current reviewed bank contains only six
evergreen briefs and no reviewed trend candidates; it cannot supply 44 fresh,
varied, researched assets every month by itself. Sustained production still needs
reviewed source briefs, source updates, dedicated rendering and final visual QA.
Do not describe the end-to-end content engine as fully autonomous or paid-free
at unlimited volume. No new model subscription or paid publishing service is
configured by this audit.

New posts map to an investor/entrepreneur/relocator decision need and topic pillar.
Hooks must be supported, CTAs varied, and migration counts must never be presented
as proof of motives. Social proof needs evidence, permission and confidentiality
review. Performance learning affects only comparable formats/objectives. New
factual claims require primary/official/original-study source metadata, exact
supporting excerpts, dates and editorial review. URL retrieval alone cannot judge
whether a source really proves a claim.

## Design and final QA

Use the approved light cream/navy/teal composition with the original pinned TSS
logo, readable typography and verified Republic-controlled Cyprus photography.
Blend the photograph smoothly into the palette. No category horizontal line,
floating cards or large writing boxes in new creatives. Previously approved
exports stay immutable; renderer changes do not alter published posts.

Final export → fact/source/geography review → actual visual inspection → manifest
seal → approved queue → repeated actual-file/OCR/source/duplicate checks → publish.
All checks fail closed. Maximum five relevant hashtags. Story caption metadata
must be under 120 characters. New Reels must match their 15–30-second script;
existing reviewed rollout assets retain their original approval bindings.

Export stills using `node social/scripts/export.js content-queue/FILE.json`.
File extension is derived from actual PNG/JPEG bytes. Inspect dedicated MP4s with
`node social/scripts/inspect-reel.js content-queue/FILE.json /path/to/video.mp4`.
This verifies decoding and fingerprints but cannot sign off visual quality or
footage/music rights. Commit content-addressed assets first, reference their
immutable commit, inspect final files, then bind the review. No script may invent
fresh inspection dates. Technical reviews expire after seven days.

Historical individual content approvals remain bound to their original exports.
Newly released content uses the explicit automatic-publishing authorization, not
a fabricated individual approval. Any asset, caption, evidence or schedule change
still requires the appropriate fresh technical QA seal.
The review index is `social/review-batches/2026-09-initial/index.json`.

## Publication history and recovery

History records topic, hook, format, platforms, fingerprints and API checkpoints.
Exact creative reuse is blocked permanently; similar topics/hooks are blocked for
30 days unless a documented deliberate update or materially different repurpose
passes policy. Current Instagram content is imported and fingerprinted before
publishing. Three old unretrievable publication IDs remain preserved as legacy
metadata; they cannot serve as verified-format evidence.

A protected version/policy digest preflight first confirms that the deployed
endpoint has the same approval and editorial policies as the checked-out runner.
A stale deployment stops before reservation.

A durable reservation precedes side effects. A run consumes its attempt before
publishing; failure on a later platform or verification cannot allow another post
through the run cap. Any uncertain result is quarantined and ends further attempts.
Known Instagram/Facebook IDs remain reported even if later verification fails.
Never delete a reservation or retry blindly. Investigate actual account state and
known IDs before an explicit controlled recovery.

Every published asset is downloaded, compared and permanently archived by hash
on the state branch. Caption comparison preserves punctuation, numbers and signs.
Explicit controlled tests retain their actual visual review records.
Scheduled results are marked `automatically_verified` after exact-caption
and image/video comparisons; this does not fabricate a human visual review.
Their final exports must still have passed visual QA before publication.

The secured endpoint validates signed manifests, account identities, sources,
assets and approvals. Serialization, reservations, caps and schedule gates live
in the GitHub runner; the endpoint is not a standalone scheduler. Keep the existing
publisher key secret and use the runner for all publication calls.

## Credentials and operations

Existing credentials stay in GitHub Actions Secrets and Vercel Production. Never
read, commit, print or paste their values. Account checks verify expected TSS
identities and return safe status information only. Token setup is account-level,
not repeated per post; Meta expiry/revocation may still require secure replacement.

Run the regression suite with `node --test social/tests/*.test.js`. The workflow
also checks unpublished review exports and retains QA artifacts. Actual published
media is additionally retained on the state branch so verification does not depend
on expiring artifacts.

[GitHub schedule syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)
allows IANA timezones. Scheduled runs can be delayed and are delivery opportunities,
not a promise to publish at an exact second.
