// Report only. This module has no credentials, fetch, timers or deletion path.
export function operationalPolicyPreview(inventory,{now=Date.now(),contentDays=90,auditDays=365,sessionDays=30,tombstoneExtraDays=30}={}) {
  for(const n of [contentDays,auditDays,sessionDays,tombstoneExtraDays])if(!Number.isInteger(n)||n<1||n>3650)throw Error('policy_period_invalid');
  const days=86400000;
  const scan=(records,date,period,action)=>records===undefined?{coverage:'unknown',candidates:[]}:{coverage:'supplied-records-only',examined:records.length,
    candidates:records.filter(r=>r.legalHold===false&&Number.isFinite(Date.parse(r[date]))&&Date.parse(r[date])<now-period*days).map(r=>({reference:r.key,action,requiresOwnerReview:true}))};
  return {mode:'plan-only',activated:false,deletionAllowed:false,policyApproved:false,
    content:scan(inventory.inbox,'receivedAt',contentDays,'review_payload_redaction'),
    audit:scan(inventory.audit,'createdAt',auditDays,'review_minimal_audit_retention'),
    sessions:scan(inventory.sessions,'expiresAt',sessionDays,'review_expired_session_metadata'),
    dedupe:{action:'preserve_tombstones',minimumExtraDaysAfterRedaction:tombstoneExtraDays,providerRetryWindowVerified:false},
    legalHolds:'explicit-false-required-before-candidate-selection',backups:{coverage:'unknown',action:'inventory-and-approve-export-policy'},
    customerRequests:{action:'identity-verification-and-scoped-owner-review',automaticCascade:false}};
}
