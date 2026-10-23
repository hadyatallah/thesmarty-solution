# Maintain Insights & Resources

`catalog.json` is the one source for hub listings. Run `node scripts/build-insights-hub.mjs` after edits and commit the source plus generated `insights/index.html`. This is a static site, not a CMS; no automatic server build is required. Edit `hub-shell.html` for surrounding copy.

Use a unique stable ID and `type`: `article`, `partner`, or `resource`. `status` is `draft` or `published`. Include a factual description, relationship label, verified URL and verification date. Public drafts must never contain private contacts, prospects, negotiations or confidential client information.

Articles and resources use a topic ID. Only populated article topics are shown. Partners instead require `relationshipType`: `editorial` or `commercial`. A resource must never imply a commercial partnership. Existing article body files and URLs remain independent of the catalog and must not be renamed when reorganizing the hub.

Before publishing a named partner, verify an agreed relationship and owner approval; describe only the agreed scope. Editorial entries need a confirmed collaboration and published work. Logos need permission and a separately reviewed accessible implementation. No unconfirmed partners, guarantees, automatic reciprocal listings, exclusivity or permanent placement promises. Label sponsored/commercial relationships clearly. Check external links before publication.

The three top-level sections are navigation links with shareable hashes and browser history. Articles have their own topic navigation; Partners does not reuse those topic filters. Without JavaScript all sections remain readable. The old /partners/ page forwards to /insights/#partners. Native header dropdown provides the dedicated navigation entry on desktop and mobile.

Validate with `node --test tests/insights-hub.test.mjs`; verify all sections, topic filters, links, Back/Forward and narrow layouts in the preview before release. Use the existing PR process and preserve production branch runtime changes. Recheck existing article URLs after publication.
