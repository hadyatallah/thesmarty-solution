import { requireThat } from './qa.js';

// Platform formatting may change line breaks or composed Unicode characters.
// Keep punctuation, signs, case and every number significant.
export const canonicalCaption = value => String(value || '').normalize('NFC').replace(/\s+/gu, ' ').trim();

export function unresolvedPublications(history) {
  return history.filter(record => {
    if (String(record.phase || '').startsWith('legacy')) return false;
    if (!['verified', 'automatically_verified'].includes(record.phase)) return true;
    const platforms = String(record.platform || '').split('+');
    return !platforms.length || platforms.some(platform => {
      if (!['instagram', 'facebook'].includes(platform)) return true;
      const id = platform === 'instagram' ? record.instagram?.mediaId : record.facebook?.postId;
      const evidence = record.verification?.[platform];
      if (!id || !/^[a-f0-9]{64}$/.test(evidence?.sha256 || '')) return true;
      if (record.phase === 'automatically_verified') {
        return record.verificationMethod !== 'published-asset-comparison' || evidence.passed !== true ||
          String(evidence.id) !== String(id) || !/^[a-f0-9]{40}$/.test(evidence.evidenceCommit || '') ||
          evidence.evidencePath !== `social/published-assets/${evidence.sha256}.${record.format === 'reel' ? 'mp4' : 'jpg'}`;
      }
      return false;
    });
  });
}

export function enforceResolvedHistory(history) {
  const unresolved = unresolvedPublications(history);
  requireThat(!unresolved.length, `Unresolved publication blocks automatic publishing: ${unresolved.map(record => record.id).join(', ')}`);
}

export class PublicationRun {
  constructor(limit) {
    requireThat(Number.isSafeInteger(limit) && limit > 0, 'Invalid per-run publishing limit');
    this.limit = limit;
    this.attempts = [];
    this.uncertain = false;
  }

  get canAttempt() { return !this.uncertain && this.attempts.length < this.limit; }

  async attempt(record, action) {
    requireThat(this.canAttempt, 'Run publishing cap reached or an earlier outcome needs review');
    const outcome = { id: record.id, phase: 'started', instagramMediaId: null, facebookPostId: null };
    // Consume the allowance before the first operation. Verification failure
    // cannot make a successful/uncertain publication disappear from the cap.
    this.attempts.push(outcome);
    try {
      return await action();
    } catch (error) {
      this.uncertain = true;
      outcome.error = error.message;
      throw error;
    } finally {
      outcome.phase = record.phase;
      outcome.instagramMediaId = record.instagram?.mediaId || null;
      outcome.facebookPostId = record.facebook?.postId || null;
      outcome.verification = record.verification || null;
      outcome.requiresFinalPublishedVisualReview = record.phase === 'awaiting_published_visual_review';
      outcome.needsReview = this.uncertain;
    }
  }

  get published() {
    return this.attempts.filter(attempt => attempt.instagramMediaId || attempt.facebookPostId);
  }
}
