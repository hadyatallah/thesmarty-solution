# The Smarty Solution Instagram Publisher

Serverless endpoint: `POST /api/publish-instagram`

## Required environment variables

Set these in the deployment platform. Never commit the values to GitHub.

- `INSTAGRAM_ACCESS_TOKEN` — current Instagram API token for `@thesmartysolution`
- `INSTAGRAM_USER_ID` — `17841424595983267`
- `TSS_PUBLISHER_KEY` — create a long random secret used to authorize calls to the endpoint
- `META_GRAPH_VERSION` — optional; defaults to `v25.0`

## Request

Header:

`x-tss-publisher-key: <TSS_PUBLISHER_KEY>`

JSON body:

```json
{
  "imageUrl": "https://www.thesmartysolution.com/path/to/post.jpg",
  "caption": "Caption text #Cyprus #Investment",
  "dryRun": true
}
```

Use `dryRun: true` first. It validates the request without publishing.

When the dry run succeeds, set `dryRun` to `false` or omit it. The endpoint will:

1. Create an Instagram media container.
2. Publish the container.
3. Return the container ID and published media ID.

## TSS rules currently enforced

- Public HTTPS image URL required.
- Caption maximum 2,200 characters.
- Maximum 5 hashtags.
- Secrets remain server-side.
- Endpoint requires the private `TSS_PUBLISHER_KEY`.

## Additional QA before automation

Before automatic publication is enabled, add checks for:

- Feed creative: 1080 × 1350 px, 4:5.
- Story/Reel creative: 1080 × 1920 px, 9:16.
- Duplicate/recent-topic detection.
- Republic of Cyprus imagery only; exclude imagery from the occupied areas.
- Final crop, logo, safe-margin and text-spacing review.

## Security

Do not place Instagram tokens, app secrets or the publisher key in HTML, client-side JavaScript, GitHub files, screenshots or chat messages.
