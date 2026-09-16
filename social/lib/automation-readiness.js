import { enforceUserApproval, schedulerProof } from './qa.js';
import { unresolvedPublications } from './publication-run.js';

// Authorization to automate does not waive the first-ten or live-format gates.
export function automationReadiness(config, policy, queue, history, plan, now = Date.now()) {
  const blockers = [], initial = [];
  if (policy?.firstPostIds?.length !== 10 || new Set(policy.firstPostIds).size !== 10) blockers.push('The initial ten-post policy is invalid.');
  for (const id of policy?.firstPostIds || []) {
    const item = queue.find(item => item.id === id), live = history.find(item => item.id === id);
    let approved = false, reason = null;
    try {
      if (!item) throw new Error('Queue manifest missing');
      enforceUserApproval(item, policy, now);
      approved = true;
    } catch (error) { reason = error.message; }
    const verified = live?.phase === 'verified' && item?.platforms?.every(platform => {
      const review = live.publishedReview?.[platform], evidence = live.verification?.[platform];
      return review?.passed === true && review.reviewer && evidence?.sha256 && review.assetSha256 === evidence.sha256;
    });
    initial.push({ id, approved, verified: Boolean(verified), ...(reason ? { reason } : {}) });
  }
  if (initial.some(item => !item.approved)) blockers.push('Each of the initial ten posts needs approval for its exact asset and caption.');
  if (initial.some(item => !item.verified)) blockers.push('The initial ten published results need final visual verification.');
  const requiredFormats = Object.entries(plan.formats).filter(([, v]) => v.monthlyTarget > 0).map(([format]) => format);
  const missingFormats = requiredFormats.filter(format => !config.approvedFormats?.includes(format));
  if (missingFormats.length) blockers.push(`Live format verification is pending: ${missingFormats.join(', ')}.`);
  try { schedulerProof({ ...config, approvedFormats: requiredFormats }, history); }
  catch (error) { blockers.push(error.message); }
  const unresolved = unresolvedPublications(history);
  if (unresolved.length) blockers.push('Unresolved publication outcomes need review before scheduled publishing.');
  const pending = queue.filter(item => !history.some(old => old.id === item.id));
  const ready = blockers.length === 0;
  return {
    checkedAt: new Date(now).toISOString(),
    authorized: config.schedulerEnabled === true,
    ready,
    publishingEnabled: config.schedulerEnabled === true && ready,
    mode: config.schedulerEnabled !== true ? 'disabled' : ready ? 'publishing' : 'readiness-checks',
    initialApproved: initial.filter(item => item.approved).length,
    initialVerified: initial.filter(item => item.verified).length,
    requiredCount: 10, initial, requiredFormats, missingFormats, unresolvedIds: unresolved.map(item => item.id),
    blockers,
    queue: {
      approvedUnpublished: pending.filter(item => item.status === 'approved').length,
      awaitingUserApproval: pending.filter(item => item.status === 'awaiting_user_approval').length,
      drafts: pending.filter(item => item.status === 'draft').length,
      expiredReviews: pending.filter(item => item.review && (!Number.isFinite(Date.parse(item.review.reviewedAt)) || now - Date.parse(item.review.reviewedAt) > 7 * 86400000)).map(item => item.id)
    },
    contentProduction: 'Reviewed source briefs, dedicated final exports and actual visual QA are still required; the publisher does not research or approve new content.'
  };
}
