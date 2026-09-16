# TSS Social Design System v2

Status: ACTIVE

This file is the source of truth for all new The Smarty Solution social creatives.
It extends the existing repository system using Hady's September 2026 references.
The machine-readable companion is `social/design-system.json`.

## Brand objective
Every TSS post should be recognisable as part of the same editorial publication before the viewer notices the logo. Content may vary; the visual grammar must not.

## Feed master format
- 1080 x 1350 px (4:5)
- Dominant background: warm off-white / cream
- Primary type: deep navy
- Secondary accent: muted slate blue / restrained TSS teal
- Avoid random gradients, saturated palettes and unrelated illustration styles
- Controlled whitespace that supports the hierarchy without leaving the post sparse
- No text near crop edges

## Fixed anatomy
1. Small uppercase category label at top-left, e.g. `SMARTY INSIGHT / CYPRUS PROPERTY`
2. No horizontal rule extending from the category label; it can appear connected to or overlap the label at social-media display sizes
3. Original TSS mark at top-right, then The Smarty Solution and Connect - Develop - Invest as real text with clear space
4. Strong editorial headline, normally 2-5 lines
5. One dominant fact, question or visual
6. Supporting copy kept short
7. Lower real-photo panel, location label, concise source line and `THESMARTYSOLUTION.COM` footer

For feed Insight / Data posts, the user-selected GDP composition is the master:
the real photograph runs full-width through the lower section, while the light
upper section contains the headline, dominant verified figure and compact facts.
Do not place the photograph inside an inset card or add rounded information boxes.
The same composition is the primary direction for practical checklists and TSS
service posts: a strong left-hand hook, two to four concise supporting points on
the right and full-width verified landmark photography below. Large empty areas
or oversized copy without supporting value are not acceptable.
Where the light editorial palette meets full-width photography, use a soft tonal
fade so the photograph emerges from the layout. Do not introduce a hard horizontal
divider unless the approved reference for that individual post explicitly uses one.

## Template family
Only these three template families are permitted. Each format is composed separately.

### A. Insight / Data
Use for GDP, tax, property, tourism and economic facts.
- Cream background
- Large navy headline
- One large blue/slate number or statistic
- Maximum 3-4 short supporting facts
- Verified real Cyprus photograph in the lower image panel

### B. Question / Debate
Use for audience engagement, unpopular opinions and investment questions.
- Cream or deep navy background from the approved palette
- One provocative question as the hero
- One short framing statement
- Minimal visual clutter
- No generic corporate diagrams unless essential

### C. Place / Opportunity
Use for Larnaca, Limassol, Paphos, Kiti and other locations/opportunities.
- Real Republic of Cyprus photography
- Photograph must sit inside a repeatable editorial composition, not be uploaded as an unbranded full-frame photo
- Cream editorial header or lower information panel
- Location name / question in navy
- Same category label, rule, logo and footer as all other templates

## Photography rules
- Republic of Cyprus controlled areas only
- Prioritise Larnaca, Limassol, Nicosia Republic-controlled side, Paphos, Paralimni, Protaras, Ayia Napa, Troodos, Platres, Lefkara and similar areas
- Never use imagery from the occupied side
- Prefer authentic architecture, streets, coast, development and business environments over generic stock imagery
- Avoid visible third-party branding as a dominant feature where a cleaner alternative exists
- Credit externally licensed imagery where required

Every v2 photograph must be approved in `social/photo-catalog.json` by original
file hash, source, licence, actual landmark and Republic-controlled geography.
Current approved locations are Paphos Castle, Larnaca Castle, Finikoudes,
Pano Lefkara and Petra tou Romiou. An AI location label alone is insufficient.
Only a location label appears on the creative; required photo attribution is
provided in its caption. Older landmark photos illustrate a location, not a
current property listing.

The original `logo-mark.png` is pinned to SHA-256
`1ca3fecb2dd2f53a78b208cac3426e3d0200552ad72afb3537a17ee93d361459`.
Its diagonal teal S is preserved; it cannot be replaced by an AI-rendered logo.

## Typography and hierarchy
- Clean contemporary sans-serif only
- Bold/extra-bold headline
- Regular/medium body
- Uppercase small category labels with tracking
- Never mix decorative typefaces
- Do not resize text simply to fill empty space

## Consistency controls
Before approval, compare the creative against the most recent TSS grid and reject it if:
- it resembles an unrelated brand
- logo position/scale differs materially
- palette falls outside the approved system
- typography hierarchy is materially different
- a feed image is not 1080x1350
- content/creative substantially duplicates something from the previous 30 days
- a plain full-frame photograph is being used as a feed post without TSS editorial framing

## Stories and Reels
Stories/Reels use dedicated 1080x1920 (9:16) assets. Never reuse a 4:5 feed asset directly.
- Preserve the same cream/navy/slate/teal identity
- Keep important text within the central safe area
- Vertical text safe area: x=72..1008, y=220..1620; feed: x=72..1008, y=64..1298
- Use the same category-label and logo logic where practical
- Reels should favour real location/business footage and restrained editorial overlays

## Content mix
Write for investors, entrepreneurs and people considering relocation. Choose
topics and European comparison countries using measured audience demand,
official data and credible original market studies. Useful audience content
should be roughly 80% of the mix, with 20% direct TSS promotion.
- Cyprus Investment Intelligence
- Property & Development
- Tax & Business
- European tax, property, cost-of-living and relocation comparisons
- Cyprus ↔ Lebanon
- Opportunity / Debate

Direct TSS promotion should normally remain around 15-25% of content.

Questions and challenging hooks need verified evidence. Never claim migration
counts prove a tax motive. Name the observation period, provisional status,
measure and material exceptions. A national household measure is not a rent
quote for a newcomer; a house-price index is not a forecast or rental yield.
Read the actual primary sources and maintain claim-to-source evidence with
direct URLs, scope notes, check dates and expiry. A failed source blocks the
post. Numbers in a reference design are not automatically verified facts.

## Editorial intelligence layer
New content after the initial review batch follows
`social/editorial-intelligence.json` and maps to a decision problem in
`social/audience-needs.json`. These files turn engagement techniques into TSS
rules without allowing hype to overrule accuracy.

- Hooks use a direct question, decision risk, myth-versus-fact, evidence
  comparison or evidence-supported unpopular opinion. They are normally no
  longer than 12 words.
- Words such as viral, explosive, guaranteed, risk-free and tax-free are not
  permitted as promotional claims. A challenging hook still needs accurate
  context in the creative and caption.
- Trend content can enter generation only through
  `social/trend-candidates.json` with a current source review. Social attention
  is not evidence that a market claim is true.
- Reels target 15-30 seconds: one short hook, one to three clear beats and one
  approved CTA. The final MP4 still requires the existing full-video checks.
- CTAs come from the controlled library and rotate by purpose: comment, save,
  compare, self-assess or qualified enquiry. Performance can change preferences
  only through an approved learning in `social/performance-feedback.json` after
  at least three comparable posts.
- A researched subject may be repurposed across formats only when the new item
  has a different hook, audience value, visual and format role. Exact or lightly
  rewritten reuse remains blocked by the duplicate checks.
- Social proof fails closed. A result or testimonial needs evidence, permission
  and confidentiality approval in `social/social-proof-registry.json` before it
  can be used.

Carousels are an editorial pilot only. Up to four per month may eventually
replace Feed slots, using four to six slides with one idea per slide. Carousel
publishing remains disabled until a multi-slide renderer, per-slide QA, Meta
adapter and controlled live verification are complete. It does not add to the
44-asset monthly cap.

## Publishing QA gate
A post must pass all of the following before it is marked approved:
- correct dimensions for platform
- approved template family
- correct brand palette
- consistent logo placement
- readable safe margins
- no overlapping text
- no accidental crop
- fact checked where factual
- maximum 5 hashtags for the direct publisher
- duplicate/topic check against previous 30 days
- Cyprus geographic imagery rule satisfied

All 17 checks in `social/lib/qa.js` must pass, including inspecting the actual
exported file. OCR validates final text regions; bounds reject clipping and
overlap; final bytes and decoded pixels are fingerprinted. V2 Reels require
complete MP4 decoding, scene-image OCR, OCR of the actual encoded scenes,
per-second frame comparisons, transitions and ending checks. Captions use no
more than five relevant hashtags; Story captions remain below 120 characters.

If any check fails, status remains draft and it must not enter the publishing queue.
Passing QA sets the first ten posts to `awaiting_user_approval`. Notify Hady
here when a final post or revision is ready. Only explicit user approval of
the exact creative and caption can populate `social/user-approval-policy.json`.
Technical QA cannot substitute for this approval. Content changes need revision
approval; scheduling-only changes preserve content approval but require a fresh
technical QA seal.

Full automatic publishing follows the ten approvals and inspected live rollout
tests. Each enabled format needs its own actual live proof. Target three
quality-controlled items per day across feed, Story and Reel; publish fewer
when a slot cannot pass quality, fresh-evidence or duplicate gates.
