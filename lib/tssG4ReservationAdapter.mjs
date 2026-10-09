// G4 candidate only — NOT WIRED INTO LIVE HANDLER.
// An independent owner-authorized Apps Script dispatch must be deployed,
// authenticated, source-backed-up and accepted before enabling this adapter.
// No browser-side access, no credentials embedded in source, no auto-retries.

function approvedAppsScriptUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('RESERVATION_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' ||
      !/^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname) ||
      url.username || url.password || url.port || url.search || url.hash) {
    throw new Error('RESERVATION_URL_INVALID');
  }
  return url.toString();
}

async function dispatch(endpoint, secret, request, fetcher) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('RESERVATION_SECRET_MISSING');
  }
  const body = JSON.stringify({ ...request, secret });
  // POST is never replayed after any network error or uncertain result.
  let response = await fetcher(endpoint, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body
  });
  if ([302, 303].includes(response.status)) {
    const location = response.headers?.get('location') || '';
    let target;
    try { target = new URL(location, endpoint); }
    catch { throw new Error('RESERVATION_RESPONSE_REDIRECT_INVALID'); }
    if (target.protocol !== 'https:' ||
        target.hostname !== 'script.googleusercontent.com' ||
        target.username || target.password || target.port) {
      throw new Error('RESERVATION_RESPONSE_REDIRECT_INVALID');
    }
    // A Google ContentService redirect is a GET to the one-time response.
    response = await fetcher(target.toString(), { method: 'GET', redirect: 'manual' });
  }
  if (!response.ok) throw new Error('RESERVATION_PROVIDER_UNAVAILABLE');
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error('RESERVATION_RESPONSE_INVALID'); }
  if (!payload || payload.ok !== true) {
    const allow = new Set([
      'RESERVATION_SERVICE_DISABLED', 'RESERVATION_UNAUTHORIZED',
      'INVALID_TASK_ID', 'INVALID_ACTION', 'RESERVATION_STORE_BUSY',
      'ENQUIRY_ALREADY_COMMITTED', 'RESERVATION_HELD',
      'RESERVATION_NOT_ACTIVE', 'RESERVATION_TOKEN_MISMATCH',
      'INVALID_OUTCOME', 'RESERVATION_STORE_CAPACITY',
      'VERIFIED_TASK_ID_REQUIRED'
    ]);
    throw new Error(allow.has(payload?.code) ? payload.code :
      'RESERVATION_RESPONSE_INVALID');
  }
  return payload;
}

export function makeG4ReservationAdapter({ url, secret, fetcher = fetch }) {
  const endpoint = approvedAppsScriptUrl(url);
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('RESERVATION_SECRET_MISSING');
  }
  return {
    async acquire(taskId) {
      const claim = await dispatch(endpoint, secret,
        { action: 'reserve', taskId }, fetcher);
      if (claim.state !== 'reserved' || !claim.token || claim.taskId !== taskId) {
        throw new Error('RESERVATION_RESPONSE_INVALID');
      }
      let settled = false;
      return {
        async release(outcome = { status: 'review_required' }) {
          if (settled) throw new Error('RESERVATION_ALREADY_SETTLED');
          const verified = outcome.status === 'verified';
          const result = await dispatch(endpoint, secret, {
            action: 'settle', taskId, token: claim.token,
            outcome: verified ? 'verified' : 'review_required',
            hubspotTaskId: verified && outcome.taskId != null ?
              String(outcome.taskId) : null
          }, fetcher);
          if (result.state !== (verified ? 'committed' : 'review_required')) {
            throw new Error('RESERVATION_SETTLEMENT_UNVERIFIED');
          }
          settled = true;
        }
      };
    }
  };
}
