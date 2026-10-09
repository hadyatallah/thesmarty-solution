// G4 candidate only — NOT DEPLOYED. Integrate as a separately reviewed,
// authenticated dispatch in an owner-controlled Apps Script project.
// Do not add a public doPost() here or replace the existing CRM backend.
// Every reservation is permanent until an explicit, audited owner resolution.
// LockService protects only the atomic ScriptProperties state transition;
// it does not remain held across the external HubSpot API request.
//
// Existing project source/HEAD, auth scope, backup and deployment version
// MUST be verified before this function is connected to any live endpoint.

function tssG4ReservationSha256_(input) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(input), Utilities.Charset.UTF_8);
  return bytes.map(function(b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function tssG4ReservationSameHash_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== 64 || b.length !== 64) {
    return false;
  }
  var diff = 0;
  for (var i = 0; i < 64; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function tssG4ReservationDispatch_(request) {
  // A trusted authenticated Apps Script dispatcher must pass the ORIGINAL
  // server-only secret; there is deliberately no public web handler here.
  // Hash is configured once in ScriptProperties, never stored in this code.
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('TSS_G4_RESERVATIONS_ENABLED') !== 'true') {
    return { ok: false, code: 'RESERVATION_SERVICE_DISABLED' };
  }
  var expected = props.getProperty('TSS_G4_RESERVATION_SECRET_SHA256');
  var candidate = request && request.secret;
  if (!candidate ||
      !tssG4ReservationSameHash_(tssG4ReservationSha256_(candidate), expected)) {
    return { ok: false, code: 'RESERVATION_UNAUTHORIZED' };
  }
  var key = request.taskId;
  if (typeof key !== 'string' || !/^TSK-WEB-\d{4}-\d{4,12}$/.test(key)) {
    return { ok: false, code: 'INVALID_TASK_ID' };
  }
  var action = request.action;
  if (['reserve', 'settle', 'inspect'].indexOf(action) < 0) {
    return { ok: false, code: 'INVALID_ACTION' };
  }
  var storeKey = 'TSS_G4_RES_' + key;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return { ok: false, code: 'RESERVATION_STORE_BUSY' };
  }
  try {
    var priorRaw = props.getProperty(storeKey);
    var prior = priorRaw ? JSON.parse(priorRaw) : null;
    if (action === 'inspect') {
      // Inspection never returns a claim token.
      return { ok: true, state: prior ? prior.state : 'absent',
        taskId: key, hubspotTaskId: prior ? prior.hubspotTaskId || null : null };
    }
    if (action === 'reserve') {
      if (prior) return { ok: false, code: prior.state === 'committed' ?
        'ENQUIRY_ALREADY_COMMITTED' : 'RESERVATION_HELD', state: prior.state };
      var token = Utilities.getUuid();
      var created = { taskId: key, state: 'reserved',
        tokenHash: tssG4ReservationSha256_(token),
        createdAt: new Date().toISOString(), hubspotTaskId: null };
      props.setProperty(storeKey, JSON.stringify(created));
      return { ok: true, state: 'reserved', token: token, taskId: key };
    }
    if (!prior || prior.state !== 'reserved') {
      return { ok: false, code: 'RESERVATION_NOT_ACTIVE' };
    }
    if (!request.token ||
        !tssG4ReservationSameHash_(
          tssG4ReservationSha256_(request.token), prior.tokenHash)) {
      return { ok: false, code: 'RESERVATION_TOKEN_MISMATCH' };
    }
    if (request.outcome !== 'verified' && request.outcome !== 'review_required') {
      return { ok: false, code: 'INVALID_OUTCOME' };
    }
    // Even an uncertain write NEVER releases the reservation for retry.
    // Only a separately approved manual recovery can resolve review_required.
    prior.state = request.outcome === 'verified' ? 'committed' : 'review_required';
    prior.hubspotTaskId = typeof request.hubspotTaskId === 'string' ?
      request.hubspotTaskId.slice(0, 64) : null;
    prior.finishedAt = new Date().toISOString();
    props.setProperty(storeKey, JSON.stringify(prior));
    return { ok: true, state: prior.state, taskId: key };
  } finally {
    lock.releaseLock();
  }
}
