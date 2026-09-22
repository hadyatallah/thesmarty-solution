# Test matrix

All rows below are component/isolated integration tests, not live acceptance. Exact source hashes, environment and timestamp are retained in test-evidence.json.

| ID | Expected result | Actual | Environment |
|---|---|---|---|
| REG-1 | renders paragraphs, bold text and both list types | PASS: assertions satisfied | Synthetic / Node |
| REG-2 | routes existing TSS enquiry and opportunity links directly to Kiti | PASS: assertions satisfied | Synthetic / Node |
| REG-3 | preserves external destinations and uses safe new-tab attributes | PASS: assertions satisfied | Synthetic / Node |
| REG-4 | keeps trailing punctuation outside bare links but retains balanced parentheses | PASS: assertions satisfied | Synthetic / Node |
| REG-5 | HTML and unsafe link protocols remain inert text | PASS: assertions satisfied | Synthetic / Node |
| REG-6 | link labels can have bold text but cannot inject tags or nested links | PASS: assertions satisfied | Synthetic / Node |
| REG-7 | does not classify lookalike domains as TSS or accept credential URLs | PASS: assertions satisfied | Synthetic / Node |
| REG-8 | actual message renderer formats assistant responses and keeps visitor text literal | PASS: assertions satisfied | Synthetic / Node |
| REG-9 | assistant lead receipt cannot turn a backend reference into HTML | PASS: assertions satisfied | Synthetic / Node |
| AS-01 | AS-01 native gateway rejects unauthenticated requests before data access | PASS: assertions satisfied | Synthetic / Node |
| AS-02 | AS-02 exact approval required; successful replay cannot dispatch twice | PASS: assertions satisfied | Synthetic / Node |
| AS-03 | AS-03 durable ledger survives a fresh process context | PASS: assertions satisfied | Synthetic / Node |
| AS-04 | AS-04 changed record blocks execution without dispatch | PASS: assertions satisfied | Synthetic / Node |
| AS-05 | AS-05 rejection cannot be executed or approved again | PASS: assertions satisfied | Synthetic / Node |
| AS-06 | AS-06 uncertain outcome persists and cannot be retried | PASS: assertions satisfied | Synthetic / Node |
| AS-07 | AS-07 unsupported operations and protected fields are denied | PASS: assertions satisfied | Synthetic / Node |
| AS-08 | AS-08 audit excludes raw fields and session credentials | PASS: assertions satisfied | Synthetic / Node |
| AS-09 | AS-09 corrupted ledger fails closed | PASS: assertions satisfied | Synthetic / Node |
| AS-10 | AS-10 duplicate backend brief event produces one report and journal result | PASS: assertions satisfied | Synthetic / Node |
| AS-11 | AS-11 expired approval cannot execute | PASS: assertions satisfied | Synthetic / Node |
| P1-01 | P1-01 exact normalized company lookup | PASS: assertions satisfied | Synthetic / Node |
| P1-02 | P1-02 exact ID lookup | PASS: assertions satisfied | Synthetic / Node |
| P1-03 | P1-03 ambiguous name cannot choose a record | PASS: assertions satisfied | Synthetic / Node |
| P1-04 | P1-04 unknown name cannot guess | PASS: assertions satisfied | Synthetic / Node |
| P1-05 | P1-05 overdue task uses Cyprus date | PASS: assertions satisfied | Synthetic / Node |
| P1-06 | P1-06 missing next action | PASS: assertions satisfied | Synthetic / Node |
| P1-07 | P1-07 dormant opportunity uses configured 10 days | PASS: assertions satisfied | Synthetic / Node |
| P1-08 | P1-08 duplicate candidates never merge | PASS: assertions satisfied | Synthetic / Node |
| P1-09 | P1-09 incomplete company | PASS: assertions satisfied | Synthetic / Node |
| P1-10 | P1-10 existing custom values preserved | PASS: assertions satisfied | Synthetic / Node |
| P1-11 | P1-11 dossier has available communications | PASS: assertions satisfied | Synthetic / Node |
| P1-12 | P1-12 missing history not called empty | PASS: assertions satisfied | Synthetic / Node |
| P1-13 | P1-13 unauthorized proposal rejected | PASS: assertions satisfied | Synthetic / Node |
| P1-14 | P1-14 record changes after approval rejected | PASS: assertions satisfied | Synthetic / Node |
| P1-15 | P1-15 partial data retains limitations | PASS: assertions satisfied | Synthetic / Node |
| P1-16 | P1-16 Manager routes exact dossier without model guessing | PASS: assertions satisfied | Synthetic / Node |
| P2-01 | P2-01 already contacted is held | PASS: assertions satisfied | Synthetic / Node |
| P2-02 | P2-02 suppressed prospect cannot draft | PASS: assertions satisfied | Synthetic / Node |
| P2-03 | P2-03 new research prospect never creates a company | PASS: assertions satisfied | Synthetic / Node |
| P2-04 | P2-04 evidenced need can indicate potential fit | PASS: assertions satisfied | Synthetic / Node |
| P2-05 | P2-05 basic website does not prove weak business process | PASS: assertions satisfied | Synthetic / Node |
| P2-06 | P2-06 working CRM is retained | PASS: assertions satisfied | Synthetic / Node |
| P2-07 | P2-07 ambiguous sender held | PASS: assertions satisfied | Synthetic / Node |
| P2-08 | P2-08 known reply matches exact company | PASS: assertions satisfied | Synthetic / Node |
| P2-09 | P2-09 unknown sender never creates company | PASS: assertions satisfied | Synthetic / Node |
| P2-10 | P2-10 security notice goes to review, not a customer ticket | PASS: assertions satisfied | Synthetic / Node |
| P2-11 | P2-11 positive reply does not qualify | PASS: assertions satisfied | Synthetic / Node |
| P2-12 | P2-12 personalized follow-up remains Draft | PASS: assertions satisfied | Synthetic / Node |
| P2-13 | P2-13 exact approval required before send | PASS: assertions satisfied | Synthetic / Node |
| P2-14 | P2-14 cancelled send cannot execute | PASS: assertions satisfied | Synthetic / Node |
| P2-15 | P2-15 definite provider rejection reports failure | PASS: assertions satisfied | Synthetic / Node |
| P2-16 | P2-16 timeout reconciles without resending | PASS: assertions satisfied | Synthetic / Node |
| P2-17 | P2-17 simultaneous and repeated send executes once | PASS: assertions satisfied | Synthetic / Node |
| P2-18 | P2-18 WhatsApp only prepares text | PASS: assertions satisfied | Synthetic / Node |
| P3-01 | P3-01 enquiry success requires linked CRM receipts | PASS: assertions satisfied | Synthetic / Node |
| P3-02 | P3-02 persisted enquiry with delayed transfer stays pending | PASS: assertions satisfied | Synthetic / Node |
| P3-03 | P3-03 failed transfer is visible | PASS: assertions satisfied | Synthetic / Node |
| P3-04 | P3-04 repeated transfer observation has no write side effects | PASS: assertions satisfied | Synthetic / Node |
| P3-05 | P3-05 stale ingestion warns | PASS: assertions satisfied | Synthetic / Node |
| P3-06 | P3-06 successful business job is healthy | PASS: assertions satisfied | Synthetic / Node |
| P3-07 | P3-07 job failure remains failed | PASS: assertions satisfied | Synthetic / Node |
| P3-08 | P3-08 missing backup evidence stays unknown | PASS: assertions satisfied | Synthetic / Node |
| P3-09 | P3-09 scheduler success is not business health | PASS: assertions satisfied | Synthetic / Node |
| P3-10 | P3-10 social concepts are Draft | PASS: assertions satisfied | Synthetic / Node |
| P3-11 | P3-11 final assets and logo required for approval readiness | PASS: assertions satisfied | Synthetic / Node |
| P3-12 | P3-12 cancelled publication stays cancelled | PASS: assertions satisfied | Synthetic / Node |
| P3-13 | P3-13 Scheduled needs platform reference and time | PASS: assertions satisfied | Synthetic / Node |
| P3-14 | P3-14 definite failure is Failed | PASS: assertions satisfied | Synthetic / Node |
| P3-15 | P3-15 uncertain publication needs review | PASS: assertions satisfied | Synthetic / Node |
| P3-16 | P3-16 publication gateway prevents duplicate dispatch | PASS: assertions satisfied | Synthetic / Node |
| P3-17 | P3-17 story and reel use 1080 by 1920 | PASS: assertions satisfied | Synthetic / Node |
| P3-18 | P3-18 unverified landmark blocked | PASS: assertions satisfied | Synthetic / Node |
| P3-19 | P3-19 unsupported factual claim blocked | PASS: assertions satisfied | Synthetic / Node |
| P3-20 | P3-20 real estate agency positioning blocked | PASS: assertions satisfied | Synthetic / Node |
| P4-01 | P4-01 daily brief with no issues | PASS: assertions satisfied | Synthetic / Node |
| P4-02 | P4-02 multiple issues preserved | PASS: assertions satisfied | Synthetic / Node |
| P4-03 | P4-03 repeated event deduplicated | PASS: assertions satisfied | Synthetic / Node |
| P4-04 | P4-04 duplicate trigger executes handler once | PASS: assertions satisfied | Synthetic / Node |
| P4-05 | P4-05 downstream failure remains retryable with bound | PASS: assertions satisfied | Synthetic / Node |
| P4-06 | P4-06 stale event is not executed | PASS: assertions satisfied | Synthetic / Node |
| P4-07 | P4-07 deleted or changed record held | PASS: assertions satisfied | Synthetic / Node |
| P4-08 | P4-08 notifications deduplicate | PASS: assertions satisfied | Synthetic / Node |
| P4-09 | P4-09 automation cannot replace send approval | PASS: assertions satisfied | Synthetic / Node |
| P4-10 | P4-10 rejected approval cannot execute | PASS: assertions satisfied | Synthetic / Node |
| P4-11 | P4-11 expired or mismatched approval rejected | PASS: assertions satisfied | Synthetic / Node |
| P4-12 | P4-12 retry temporary read failure succeeds | PASS: assertions satisfied | Synthetic / Node |
| P4-13 | P4-13 provider unavailable stops after three attempts | PASS: assertions satisfied | Synthetic / Node |
| P4-14 | P4-14 one specialist may fail without losing others | PASS: assertions satisfied | Synthetic / Node |
| P4-15 | P4-15 Manager marks partial success | PASS: assertions satisfied | Synthetic / Node |
| P4-16 | P4-16 job audit exists without credentials or bodies | PASS: assertions satisfied | Synthetic / Node |
| P4-17 | P4-17 no send or publish event permitted | PASS: assertions satisfied | Synthetic / Node |
| PRE-01 | PRE-01 standalone bundle compiles and denies network access | PASS: assertions satisfied | Synthetic / Node |
| PRE-02 | PRE-02 approval required, exact decision and replay cannot duplicate update | PASS: assertions satisfied | Synthetic / Node |
| PRE-03 | PRE-03 rejected action cannot execute | PASS: assertions satisfied | Synthetic / Node |
| PRE-04 | PRE-04 concurrent change blocks stale approval | PASS: assertions satisfied | Synthetic / Node |
| PRE-05 | PRE-05 external operations unavailable and reset has no previous state | PASS: assertions satisfied | Synthetic / Node |
| SEC-01 | SEC-01 repeated proposal has same durable action ID | PASS: assertions satisfied | Synthetic / Node |
| SEC-02 | SEC-02 tenant cannot approve another tenant action | PASS: assertions satisfied | Synthetic / Node |
| SEC-03 | SEC-03 tampering invalidates approved payload | PASS: assertions satisfied | Synthetic / Node |
| SEC-04 | SEC-04 data instructions remain outside system prompt | PASS: assertions satisfied | Synthetic / Node |
| SEC-05 | SEC-05 audit omits private message body | PASS: assertions satisfied | Synthetic / Node |
| SEC-06 | SEC-06 Manager email drafting cannot execute a send | PASS: assertions satisfied | Synthetic / Node |
| UI-01 | UI-01 account data is escaped in rendered dossier | PASS: assertions satisfied | Synthetic / Node |
| UI-02 | UI-02 attention works with AI provider disabled | PASS: assertions satisfied | Synthetic / Node |
| UI-03 | UI-03 unknown request falls back to existing assistant | PASS: assertions satisfied | Synthetic / Node |
| UI-04 | UI-04 independent specialist error shown alongside success | PASS: assertions satisfied | Synthetic / Node |
| UI-05 | UI-05 legacy ambiguous update rejected before save | PASS: assertions satisfied | Synthetic / Node |
| UI-06 | UI-06 unavailable gateway blocks all assistant writes | PASS: assertions satisfied | Synthetic / Node |
| UI-07 | UI-07 create cannot fall back to legacy saveRecord | PASS: assertions satisfied | Synthetic / Node |
| UI-08 | UI-08 assistant delegates to shared approval controls without a direct write | PASS: assertions satisfied | Synthetic / Node |
| UI-09 | UI-09 companies without next action query is scoped to companies | PASS: assertions satisfied | Synthetic / Node |
| REG-112 | embedded Kiti form preserves phone, proof, qualification and routing in one request | PASS: assertions satisfied | Synthetic / Node |
| REG-113 | legacy separate experience field is still included if supplied | PASS: assertions satisfied | Synthetic / Node |
| REG-114 | recorded enquiry without confirmed email does not claim email was sent | PASS: assertions satisfied | Synthetic / Node |
| REG-115 | unreadable or unconfirmed responses retain form values and show processing | PASS: assertions satisfied | Synthetic / Node |
| REG-116 | spam, duplicate, rate limit, offline and HTTP failures never show success | PASS: assertions satisfied | Synthetic / Node |
| REG-117 | contact routes preserve backend category and include the visible service in the message | PASS: assertions satisfied | Synthetic / Node |

Live acceptance pending: signed-in CRM, production API projections, server approval gateway, durable transaction/restart tests, provider reconciliation, new enquiry transfer, Outlook ingest, Android phone/tablet and installed PWA, backend scheduled job delivery. No phase is accepted for Production.
