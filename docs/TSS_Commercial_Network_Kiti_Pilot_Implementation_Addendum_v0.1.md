# TSS Commercial Network Opportunity Workflow & Kiti Pilot Implementation Addendum

**Version:** 0.1  
**Date:** 6 October 2026  
**Status:** PROPOSED / CONTROLLED DEV PILOT  
**Authority boundary:** This addendum does not modify the Master Playbook, authorize Production deployment, authorize Kiti outreach, increase disclosure authority, or activate autonomous external communication.

## 1. Purpose

This addendum translates the approved Commercial Network architecture into a controlled Kiti pilot covering the Opportunity Workspace, Match methodology, governed Opportunity Packs, Assistant communication proposals, analytics, and acceptance.

It is additive. The existing authoritative entities remain Company, Contact, TSS Sales Opportunity, Company Role, Commercial Signal, Commercial Opportunity, Mandate, Match, Partner Relationship, Task, Activity and Communication.

### Chat-only execution constraint

For the current pilot, all work must be executable and reviewable from ChatGPT through connected tools, source-control actions, Drive/Sheets reads and writes, CI, deployment metadata, and other chat-accessible interfaces.

Do not require Hady to leave the chat for routine testing, source inspection, branch/PR work, Drive review, CI review, or Preview metadata checks.

If a gate genuinely requires direct user-presence in an external browser, a fresh interactive OAuth/consent action, a manual provider takeover, or another non-chat action, that gate must remain explicitly **DEFERRED / USER-PRESENCE REQUIRED** rather than being bypassed, weakened, or represented as passed.

This constraint does not reduce security, authority, acceptance, or audit requirements.

## 2. Operating phases

Prepare / Load / Launch / Convert are derived display phases only.

- PREPARE: Opportunity assessment/readiness.
- LOAD: Accepted Opportunity still completing Mandate, criteria, information-package or targeting readiness.
- LAUNCH: targeting, qualification, shortlist, outreach and early engagement.
- CONVERT: interest, introduction, active discussion, negotiation/professional handoff and outcome.

No independent editable operatingPhase field is introduced.

## 3. Opportunity Workspace

The pilot workspace is an internal commercial cockpit for one Commercial Opportunity.

Required views:
- Overview
- Readiness
- Mandate
- Target Criteria
- Matches
- Communications
- Documents / Disclosure
- Public Presentation
- Activity
- Analytics

The workspace must answer:
1. Where are we?
2. What blocks progression?
3. Which Companies may fit?
4. What are we allowed to do?
5. What is the next action?

## 4. Readiness

Readiness is derived, not a new entity.

Display outcomes:
- Ready
- Attention
- Blocked
- Not Applicable

A blocker must explain the exact reason, for example Outreach authority not granted or disclosure ceiling below requested material.

## 5. Match methodology

Criteria remain:
- Mandatory
- Preferred
- Informational

Criterion outcomes:
- Meets
- Does Not Meet
- Unknown
- Conflicting / Review Required
- Stale / Revalidation Required

Derived Mandatory aggregate:
- PASS
- FAIL
- INCOMPLETE
- REVIEW REQUIRED

Derived working queues:
- Priority Review
- Standard Review
- Research First
- Blocked

These queue labels are operational views only and do not become Company truth.

Commercial appetite must never be inferred from capability, role, geography, project history or brand size.

No universal Match Score is permitted.

## 6. Qualification and authority

Qualification State and Engagement State remain separate.

AI may identify evidence and gaps but may not:
- mark Qualified
- Shortlist
- approve Outreach
- create Mandate authority
- override suppression
- release restricted information
- send external communication

Commercial fit never creates outreach authority.

## 7. Opportunity Packs

Pack generation follows:

Opportunity + Mandate + Match + approved document references
→ recipient/audience context
→ disclosure eligibility
→ allow-listed projection
→ role template
→ AI drafting
→ claim/disclosure validation
→ preview
→ human approval
→ governed artifact
→ audit

AI receives only the allowed projection, not unrestricted CRM/Drive context.

Pilot pack types:
- Developer D1 teaser
- Developer D2 pack
- controlled Developer D3 test pack
- Professional Handoff pack

Investor-facing external distribution remains deferred pending the appropriate professional/regulatory route.

### Pack Manifest

A non-authoritative artifact manifest records:
- packId
- opportunityId
- mandateId
- matchId
- recipient Company/Contact
- audience role
- requested/effective disclosure
- source record versions
- template version
- included/excluded fields
- document references/versions
- generated/approved metadata
- artifact reference
- supersession reference

The Pack Manifest is not a seventh Commercial Network entity.

## 8. Fact locking and claim validation

Structured facts such as title, geography, site area, dates, commercial structure, document titles and disclosure statements are locked to governed source values.

Generated drafts must fail validation when they introduce unsupported claims, including unapproved:
- planning approval
- ROI / yield / IRR / profit
- project value
- sales price
- construction cost
- funding requirement
- completion timing
- principal identity

## 9. Communication Assistant

The Assistant operating pattern is:

Observe → Interpret → Propose → Validate → Human approves → Execute → Audit

Outlook/email messages may produce proposals for:
- engagement state
- questions / notes
- next action
- follow-up
- disclosure review
- draft response

Positive interest never automatically changes Qualification State.

Unknown or ambiguous senders do not create speculative Companies.

Suppression instructions use the protected suppression path.

Commercial terms may be recorded as stated facts but cannot be accepted or countered autonomously.

## 10. Analytics

Commercial analytics are derived from real states and Activity history.

Required concepts:
- Prepare / Load / Launch / Convert progression
- Match qualification funnel
- engagement funnel
- response-quality classification
- stage ageing
- time-to-next-action
- disclosure progression
- pack generation/approval/share
- Assistant correction rate
- governance blocks
- conservative source attribution

No weighted pipeline, close probability, universal health score or invented revenue forecast.

## 11. Kiti fixture

The controlled reference fixture uses:
- Kiti Residential Development Opportunity
- Land / Development
- Kiti, Larnaca District, Cyprus
- public facts already approved for Kiti
- a research-only synthetic Mandate for acceptance
- no live outreach authority
- Gelfanco as an evidence-discipline Match fixture with current appetite preserved as Unknown

Protected Kiti information includes landowner identity, architect identity, people behind TSS, confidential studies and unapproved projections.

## 12. Acceptance

The Kiti pilot must pass:
- baseline/source integrity
- protected CRM regression
- workspace/derived-phase consistency
- Mandate/authority/disclosure blocking
- Match methodology
- Pack projection and unsupported-claim validation
- Assistant proposal behavior
- analytics reconciliation
- concurrency/idempotency/audit/security
- positive end-to-end synthetic journey
- negative governance-block journey

Any unauthorized disclosure, suppression bypass, authority bypass, canonical identity corruption, unsupported external claim, duplicate consequential action, unaudited state change or protected-CRM regression is blocking.

## 13. Current implementation boundary

This addendum authorizes only controlled DEV preparation and testing.

### Reconciled accepted baseline

The current development path uses the accepted Commercial Network DEV2 checkpoint, not the quarantined old DEV project.

Accepted restricted evidence records:
- P0 DEV2 foundation: 32/32 persistent cases passed
- P0.5 native subset: 16/16 cases passed, while full P0.5 remains pending
- P1/P2/P3 DEV2 backend subset: 16/16 cases passed
- Company Data Center Phase 3: closed on 3 October for the approved bounded Preview research/data/runtime scope

The old DEV ninth-file provenance discrepancy remains historical/quarantined evidence and is not repaired or overwritten.

The Kiti pilot may consume accepted Data Center evidence read-only while preserving all Needs Review, Unknown, stale/review-due and conflict states. The current pilot uses a governed read-only Gelfanco snapshot from the accepted Preview and does not copy private contact fields.

The next release gate is the remaining **full P0.5 compatibility on an identified release candidate**, followed by sequential frontend/real-auth/provider/Production acceptance. Accepted P0 and Data Center Phase 3 are not restarted without specific new evidence.

It does not authorize:
- Production promotion
- live Kiti outreach
- external D2/D3 sharing
- investor solicitation
- autonomous qualification or sending
- Master Playbook amendment

Permanent adoption is decided capability by capability only after pilot acceptance.
