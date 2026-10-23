# Partners & Useful Resources

The page is static HTML with optional client-side filtering. No CMS, database or new service is needed.

## Add or update a listing

1. Edit `partners/entries.json`, the single listing source. Keep IDs stable and unique. Use a category from `categories`: `resources`, `editorial` or `commercial`. Categories may be added without changing the renderer.
2. Provide a factual name/description, a specific relationship label, a verified HTTPS or root-relative URL, verification date (`YYYY-MM-DD`), and `draft` or `published` status. Use `TSS Insights · Our own guide` for our content, never an external-partner label.
3. Before publishing, verify the destination and facts; obtain the owner's approval for named external listings and any required permissions. Editorial listings need a confirmed collaboration and published work. Commercial listings require an agreed relationship and a description limited to its agreed scope. A resource alone does not imply a partnership. Disclose applicable commercial/sponsored relationships. Do not promise permanent placement, reciprocal traffic or exclusivity.
4. Do not put private contacts, negotiation details, client identities, pending agreements or secrets in this public repository, including draft entries. Logos are not supported by this first version; permission and an accessible implementation are required before adding them.
5. Run `node scripts/build-partners.mjs` and commit both the source and generated `partners/index.html`. The deployed site does not run the generator automatically. Edit `page-shell.html` for surrounding copy/layout, not the generated page.
6. Run `node --test tests/partners.test.mjs`, check mobile/desktop and the actual destinations, then use the existing PR/preview process. No automatic production merge is intended.

Only published entries render. Empty categories do not create tabs. When two or more populated categories exist, working filter buttons appear with JavaScript; without JavaScript, all entries remain visible. Relationship labels remain visible on every card. Review entries periodically and update `verifiedOn` only after checking. Unpublish stale entries by setting `status` to `draft` and rebuilding, without erasing needed history.
