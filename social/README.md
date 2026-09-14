# TSS direct publishing

This extends the existing Instagram publisher, Meta app, repository and Vercel
deployment. Metricool remains connected and is not called to publish.

## Current rollout

The three existing Instagram publication records stay unchanged. They are
imported into durable history alongside recent Instagram content. The old
15-minute publishing trigger is removed. Publishing is disabled by default.

Initial inspection on 14 September 2026 verified the Instagram credentials and
17 retrievable current posts (16 images and one video), now fingerprinted.
The three earlier queue publication IDs returned Meta error 100/subcode 33 when
queried individually. Their existing metadata is preserved; the current API
cannot confirm their published assets or determine why they are unavailable.
They must remain part of the manual creative/source duplicate review, and cannot
serve as live-verification proof. Read-only results are retained at
`tss-social-state: social/legacy-publication-checks.json`. Facebook production
Page credentials were absent. No new live publication or schedule was activated.

Authenticated Meta inspection confirmed the existing app ID `1707395857227784`
(The Smarty Solution Publisher). Its Manage Pages use case already has
`pages_show_list` ready for testing. `pages_manage_posts` and
`pages_read_engagement` currently show **Add**. The posting permission includes
creating, editing and deleting Page posts; the read permission includes Page
content, follower data and insights. These required scopes and a securely stored
Page token must be in place before the controlled dual-platform test.

Only the `controlledPublicationId` may publish while the scheduler is disabled.
That test requires an approved **feed** export and both correct TSS accounts.
Missing Facebook credentials block both platforms before any container creation.
After the live photos and captions pass API checks, inspect the downloaded
Instagram and Facebook files in the `tss-social-qa` workflow artifact. Mark that
history record `verified` with per-platform `publishedReview` objects containing
passed, reviewer, timestamp and the SHA-256 of each actual downloaded asset. Only then set
`verifiedLivePublication`, `formatVerifications`, `approvedFormats`, and `schedulerEnabled` and add:

```yaml
schedule:
  - cron: '15 9,14,19 * * *'
    timezone: 'Asia/Nicosia'
```

The runner allows one content item per run and at most three per Cyprus day,
with at most one feed, one Story and one Reel. A controlled rollout test is a
single explicit exception to daily caps. Existing posts count toward normal caps.
A post from an earlier day, or more than four hours late, is not published as
backlog. Only formats with a controlled live verification can be scheduled.
These are target slots, not guaranteed delivery times. GitHub may delay or drop
scheduled runs and disables inactive public schedules after 60 days.

## Credentials

Existing Vercel variables remain server-side:

- `TSS_PUBLISHER_KEY`, also the existing GitHub Actions secret
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_USER_ID` = `17841424595983267`
- `META_GRAPH_VERSION`, default `v25.0`

Facebook requires separate existing-app Page credentials in Vercel production:

- `FACEBOOK_PAGE_ACCESS_TOKEN` (also accepts `FACEBOOK_PAGE_TOKEN`,
  `META_PAGE_ACCESS_TOKEN` or `FB_PAGE_ACCESS_TOKEN`)
- `FACEBOOK_PAGE_ID` = `177672945439622`, optional because the target is pinned

Use the existing Meta app and a Page token with Page publishing/read permissions.
Store credentials in the platform's secure environment editor, never in chat.
The inspection response reports configuration and confirms account identity. It
never returns tokens. App review, verification, access level and token expiry
are determined from the actual account/API response, not assumed from app setup.

The inspected files in `social/qa-samples` are permanently marked `qaOnly`.
The workflow checks their real export, OCR, immutable hosting and a signed
Instagram API dry run. All live API actions reject these samples. They never
enter the publishing queue or content-history reservations. Expired sample
reviews are skipped, without fabricating a new inspection date.

GitHub uses its short-lived built-in `GITHUB_TOKEN` to write history to
`tss-social-state: social/history.json`. No new personal GitHub token is needed.
No model API calls, Meta ad calls or paid publishing service are added. The
publishing layer is designed for existing free GitHub/Meta infrastructure.

## Generate, export and inspect

`node social/scripts/generate-drafts.js YYYY-MM-DD` creates up to three curated
drafts, with a dedicated Story layout among feed drafts. The bank is deliberately
finite. Exhausted or repeated topics produce fewer drafts. It does not invent
current market facts, generate footage or approve its own images. Fresh editorial
angles and verified source material must replenish the bank.

Set an explicit `publishAt` with the correct Asia/Nicosia UTC offset. Export feed
and Story images with:

`node social/scripts/export.js content-queue/FILE.json`

This creates a content-addressed PNG and layout evidence, and resets approval.
For a dedicated Reel MP4, use:

`node social/scripts/inspect-reel.js content-queue/FILE.json /path/to/dedicated.mp4`

This decodes the complete video, enforces the vertical policy, fingerprints six
frames and resets approval. It does not approve text, facts, music/footage rights
or the full-video inspection. Review the actual exported MP4 before approving it.

Commit the asset first. Set `asset.commit` to the immutable 40-character Git
commit containing it. Inspect the actual file, read its caption and compare it
with `social-results/recent-instagram.json` from the latest workflow.

Fact-bearing posts need a claim inventory and sources with direct HTTPS URLs,
an evidence excerpt, checked time, expiry and a note explaining support for the
claim. Source retrieval confirms the excerpt remains available. Editorial review
must confirm the meaning, scope and completeness of claims. HTTP success alone
is never treated as fact verification.

Approve only after every check exported by `social/lib/qa.js` passes. Set status
`approved` and add `review` with reviewer, reviewedAt, boundSha256=`binding(item)`,
captionSha256=`sha256(item.caption)`, assetSha256 and all check values `true`.
Use the helper exports to calculate hashes. A seven-day review expiry requires
fresh inspection for older batches. Changing any creative content, caption,
platform, asset, evidence or publishing time invalidates approval.

Every publishing run repeats manifest, source, real-file, dimensions, byte hash,
decoded pixel hash, text layout and OCR checks before a signed endpoint dry run.
The endpoint repeats manifest, account, source and actual hosted-file checks.
Mutable renderer URLs and legacy `imageUrl` direct requests cannot publish.

## Formats and imagery

- Feed: dedicated 1080x1350 still PNG/JPEG.
- Story: dedicated 1080x1920 still image with central safe area. Under-120-character
  caption text is metadata. The Story's visible message must be in its image.
- Reel: dedicated 1080x1920 H.264/yuv420p MP4, 6-60 seconds by TSS policy. Full
  decode, full-video inspection, sampled-frame review and rights checks are
  required. The scheduler blocks Reels until published-video comparison is
  passed and its own controlled live result is inspected.
- Facebook's enabled adapter publishes feed photos only. Facebook Stories/Reels
  fail closed until their own adapters and live verifications are completed.

The correct original logo is pinned by SHA-256. Fonts are fixed. Copy is measured
at the actual font size, never silently truncated. There is no fallback photo
panel. A missing or failed photograph stops rendering.

The photo catalog starts empty. Each photo must be registered by exact file hash
after checking the real location, Republic-controlled geography and licensing.
An AI location label or an allowed city name alone cannot approve imagery.
The `place-opportunity` template refuses unregistered photos.

## Duplicate protection and recovery

History contains date, topic, headline, creative identifier, actual asset and
decoded-pixel fingerprints, format, platforms, container IDs and publication IDs.
Exact creative/asset reuse is permanently blocked. Topic/headline similarity is
checked for 30 days. Dates appended to a topic key do not evade this check.
Actual historical Instagram images are downloaded once and fingerprinted. A
small decoded RGB signature also catches identical images after ordinary JPEG
compression or resizing. A failed historical download blocks publishing until
the recent visual history can be checked. This image comparison is conservative;
similar-looking graphics can require a new visual before they pass.
Historical videos are decoded and fingerprinted at six points across their
duration. Reel exports must supply matching actual decoded-frame evidence.
The duplicate check also compares those frames after video recompression; it
does not rely on the video filename, hook or MP4 bytes alone. Visual similarity
is a conservative additional gate, not a substitute for editorial duplicate review.
A deliberate update needs its prior record, reason, new angle and visual change.
Recent Instagram posts are imported before every approval/publishing run and
stored at `tss-social-state: social/recent-instagram.json`. The three-day slot
plan alone cannot approve a format. `formatVerifications` must point to a
verified, inspected live record for each scheduled format.

The runner saves a durable reservation **before** container creation, then saves
the container ID and a checkpoint before each publishing call. Any save conflict
stops the call. Failures, timeouts and partial Instagram/Facebook success are
quarantined. They are never automatically retried. An uncertain result may have
published successfully. Check the actual account and known container/publication
IDs before any manual recovery. Do not delete reservations to force retries.

Controlled live test assets are also stored on the history branch by file hash
so an editor can inspect the exact API-published photos without relying on an
expiring artifact download. QA artifacts include actual published images and crop/visual-content
comparisons. Bad final comparisons block rollout and the record is quarantined.
Source and credential errors fail the GitHub job. Nothing reports a successful
live publication merely because an API request returned HTTP 200.

## Scope

Website enquiry code, Google Sheets, Microsoft 365, Metricool settings and
scheduled/draft posts, website HTML/CSS/JS, SEO and social connections are outside
this change. Existing social-only API functions are extended in place.

Primary references: [Meta content publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/),
[Page photos](https://developers.facebook.com/docs/graph-api/reference/page/photos/),
[GitHub schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
