
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createSessionService, sameOrigin } from '../lib/tssAdminSession.mjs';
import { researchNextAction } from '../lib/tssIrcHandoff.mjs';
import { acquireResearchLock } from '../lib/tssIrcLock.mjs';
import { nicosiaDay, seasonActive, safeFailureCode, safeIndexDiagnostics } from '../lib/tssIrcRuntime.mjs';
import { getVercelOidcToken } from '@vercel/oidc';
import { ExternalAccountClient } from 'google-auth-library';
import {
  DISCOVERY_DISTRICTS,
  discoverDeveloperSignals,
  verifyFirstPartySource,
  classifyCandidate,
  candidateSummary,
  matchResearchRecord,
  nextNumericId,
  dayRotationIndex,
  normalizeName
} from '../lib/tssIrcResearch.mjs';

const GOOGLE = 'https://sheets.googleapis.com/v4/spreadsheets/';
const APPROVED_IRC_SHEET_ID = '1KFLZk_IlFY64IMpEW63wYvJdNF5jmfjZoRM79aVbBKs';
const APPROVED_MASTER_SHEET_ID = '1mZ7vd2UoGXlyxzwZ8Man593UhlLGt2uS1kIS3ZAWPsU';
const DISCOVERY_LIMIT = 3;
const IRC_RANGES = {
  settings: "'Settings'!A1:C100",
  buyers: "'Buyer Enquiries'!A1:U1000",
  referrals: "'Referral Organisations'!A1:Q2000",
  queue: "'Outreach Queue'!A1:T1000",
  suppressions: "'Suppressions'!A1:G1000",
  runs: "'Runs'!A1:M1000",
  evidence: "'Evidence'!A1:K2000",
  activity: "'Activity Log'!A1:K2000"
};
const MASTER_RANGE = "'Companies'!A1:G5000";

const utc = () => new Date().toISOString();
const day = () => nicosiaDay(new Date());
const text = value => String(value ?? '');
const log = (event, details = {}) => console.info(JSON.stringify({
  component: 'tss-irc-research',
  event,
  ...details
}));

function json(res, status, body) {
  res.status(status)
    .setHeader('Cache-Control', 'no-store')
    .setHeader('Content-Type', 'application/json; charset=utf-8')
    .end(JSON.stringify(body));
}

function authorised(actual, expected) {
  if (!actual || !expected) return false;
  const a = Buffer.from(text(actual));
  const b = Buffer.from(text(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Error('PROVIDER_' + response.status);
  return body;
}

async function googleAccessToken() {
  const projectNumber = text(process.env.GCP_PROJECT_NUMBER);
  const projectId = text(process.env.GCP_PROJECT_ID);
  const serviceAccountEmail = text(process.env.GCP_SERVICE_ACCOUNT_EMAIL);
  const poolId = text(process.env.GCP_WORKLOAD_IDENTITY_POOL_ID);
  const providerId = text(process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID);
  if (!projectNumber || !projectId || !serviceAccountEmail || !poolId || !providerId) {
    throw Error('GOOGLE_OIDC_CONFIGURATION_INCOMPLETE');
  }

  const authClient = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url:
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
    // Google supplies its own audience as callback context. Do not forward it
    // as Vercel OIDC options, which would exchange for the wrong audience.
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const tokenResponse = await authClient.getAccessToken();
  const accessToken = tokenResponse?.token;
  if (typeof accessToken !== 'string' || !accessToken) throw Error('GOOGLE_ACCESS_TOKEN_MISSING');
  log('google_oidc_token_acquired', { projectId, serviceAccountEmail });
  return accessToken;
}

function approvedMasterSheetId() {
  const configured = text(process.env.TSS_MASTER_SPREADSHEET_ID);
  if (configured && configured !== APPROVED_MASTER_SHEET_ID) {
    log('master_id_corrected', { configuredSource: 'environment', selected: 'approved_constant' });
  }
  return APPROVED_MASTER_SHEET_ID;
}

function ircSheetId() {
  const configured = text(process.env.TSS_IRC_SPREADSHEET_ID);
  if (configured && configured !== APPROVED_IRC_SHEET_ID) throw Error('IRC_WORKBOOK_CONFIGURATION_MISMATCH');
  return APPROVED_IRC_SHEET_ID;
}

async function batchGet(token, spreadsheetId, ranges) {
  const query = new URLSearchParams();
  ranges.forEach(range => query.append('ranges', range));
  const response = await fetch(
    GOOGLE + encodeURIComponent(spreadsheetId) + '/values:batchGet?' + query,
    {
      headers: { authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(12000),
      cache: 'no-store'
    }
  );
  const result = await readJson(response);
  const valueRanges = result.valueRanges || [];
  if (valueRanges.length !== ranges.length) throw Error('INCOMPLETE_SHEET_READ');
  return valueRanges.map(x => x.values || []);
}

async function readState(token) {
  const keys = Object.keys(IRC_RANGES);
  const values = await batchGet(token, ircSheetId(), Object.values(IRC_RANGES));
  return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
}

async function readMaster(token) {
  const values = await batchGet(token, approvedMasterSheetId(), [MASTER_RANGE]);
  const rows = values[0] || [];
  if (!rows.length || String(rows[0][0] || '').toLowerCase() !== 'id') {
    throw Error('MASTER_COMPANIES_SCHEMA_INVALID');
  }
  return rows;
}

function nextIds(rows) {
  return {
    referral: nextNumericId(rows.referrals, 'IRC-ORG-'),
    evidence: nextNumericId(rows.evidence, 'IRC-EV-'),
    activity: nextNumericId(rows.activity, 'IRC-ACT-')
  };
}

function colLetter(number) {
  let n = number, out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function a1Range(sheet, startRow, width, rowCount) {
  const endRow = startRow + rowCount - 1;
  return "'" + sheet + "'!" + 'A' + startRow + ':' + colLetter(width) + endRow;
}

async function batchWrite(token, data) {
  const response = await fetch(
    GOOGLE + encodeURIComponent(ircSheetId()) + '/values:batchUpdate',
    {
      method: 'POST',
      signal: AbortSignal.timeout(12000),
      headers: {
        authorization: 'Bearer ' + token,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data
      })
    }
  );
  return readJson(response);
}

async function appendRun(token, row) {
  // Allocate the run row server-side: another approved workflow may write Runs
  // while research is executing. Never overwrite its row using a stale count.
  const response = await fetch(GOOGLE + encodeURIComponent(ircSheetId()) +
    '/values/' + encodeURIComponent("'Runs'!A:M") + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ majorDimension: 'ROWS', values: [row] })
  });
  return readJson(response);
}

function rowsForOverview(state, appendedReferralCount, scheduledRun) {
  const buyers = Math.max(0, state.buyers.length - 1);
  const referrals = Math.max(0, state.referrals.length - 1) + appendedReferralCount;
  const queue = state.queue.slice(1);
  const suppressions = Math.max(0, state.suppressions.length - 1);
  const ready = queue.filter(row => String(row[14] || '') === 'READY').length;
  const sent = queue.filter(row => ['SENT', 'SUBMITTED'].includes(String(row[14] || ''))).length;
  const schedulerValue = scheduledRun ? scheduledRun.finishedAt || scheduledRun.startedAt : 'NOT VERIFIED';
  const stateValue = scheduledRun && scheduledRun.outcome !== 'RESEARCH_CYCLE_COMPLETE'
    ? 'LATEST SCHEDULED RESEARCH BLOCKED / CHECK RUNS / AUTO EMAILS OFF'
    : scheduledRun
    ? 'RESEARCH CYCLE COMPLETE / CRON LABEL RECORDED - VERIFY VERCEL LOG / AUTO EMAILS OFF'
    : 'RESEARCH CYCLE COMPLETE / SCHEDULER UNVERIFIED / AUTO EMAILS OFF';
  return [
    [buyers],
    [referrals],
    [Math.max(0, state.queue.length - 1)],
    [ready],
    [sent],
    [suppressions],
    [schedulerValue],
    [stateValue]
  ];
}

function parseRowsForRun(state) {
  const runs = state.runs || [];
  return runs.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    runId: text(row[0]),
    startedAt: text(row[1]),
    finishedAt: text(row[2]),
    newResearchSignals: text(row[4]),
    newBuyerEnquiries: text(row[5]),
    eligibleForEmail: text(row[6]),
    messagesSent: text(row[7]),
    held: text(row[8]),
    outcome: text(row[9]),
    details: text(row[10]),
    runType: text(row[11]),
    executionMode: text(row[12])
  }));
}

function findScheduledResearchRun(state) {
  return parseRowsForRun(state)
    .filter(x => x.runType === 'RESEARCH_CYCLE' && x.executionMode === 'VERCEL_CRON')
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .at(-1) || null;
}

function dedupeSignals(signals) {
  const seen = new Set();
  const out = [];
  for (const signal of signals) {
    const key = normalizeName(signal.sellerName) || signal.sellerURL || String(signal.listingId || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(signal);
  }
  return out.slice(0, DISCOVERY_LIMIT);
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { ok: false, error: 'method_not_allowed' });
  if (req.method === 'POST') {
    if (process.env.TSS_ADMIN_SESSION_ENABLED !== 'true') return json(res, 503, { ok: false, error: 'admin_session_not_enabled' });
    if (!sameOrigin(req, process.env)) return json(res, 403, { ok: false, error: 'csrf_origin_denied' });
    try {
      const session = await createSessionService().authenticate(req);
      const csrf = req.headers['x-tss-csrf'];
      if (typeof csrf !== 'string' || csrf.length !== 43 || createHash('sha256').update(csrf).digest('hex') !== session.csrfHash) {
        return json(res, 403, { ok: false, error: 'csrf_token_invalid' });
      }
    } catch { return json(res, 401, { ok: false, error: 'owner_session_required' }); }
  } else {
    const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!authorised(supplied, process.env.CRON_SECRET)) return json(res, 401, { ok: false, error: 'unauthorised' });
  }
  // User-Agent is a label, not independent proof of an unattended invocation.
  const scheduled = req.method === 'GET' && /^vercel-cron\/1\.0$/i.test(text(req.headers['user-agent']));
  const season = req.query?.season;
  if (season && !['summer', 'winter'].includes(season)) return json(res, 400, { ok: false, error: 'invalid_season' });
  if (season && !seasonActive(season, new Date())) return json(res, 200, { ok: true, outcome: 'INACTIVE_SEASON', messagesSent: 0 });
  const runId = 'IRC-RES-' + day() + (scheduled ? '' : '-MANUAL-' + Date.now() + '-' + randomUUID().slice(0, 8));
  const startedAt = utc();
  let token, state, lock, stage = 'GOOGLE_AUTH', writeAttempted = false, completed = false;
  async function releaseLock() {
    const held = lock; lock = undefined;
    if (!held) return;
    try { await held.release(); } catch { log('lock_release_pending', { runId }); }
  }
  log('invoked', { runId, executionMode: scheduled ? 'VERCEL_CRON' : 'AUTOMATION_MANUAL' });
  try {
    token = await googleAccessToken();
    stage = 'EXECUTION_LOCK';
    lock = await acquireResearchLock(token, runId);
    stage = 'IRC_READ';
    state = await readState(token);
    const settings = Object.fromEntries(state.settings.slice(1).map(row => [text(row[0]), text(row[1])]));
    if (!/^true$/i.test(settings.daily_scheduler_enabled || '')) {
      await releaseLock();
      return json(res, 200, { ok: true, outcome: 'PAUSED', messagesSent: 0 });
    }
    const unresolvedWrite = parseRowsForRun(state).find(x => x.outcome === 'WRITE_VERIFICATION_PENDING');
    if (unresolvedWrite) throw Error('IRC_WRITE_RECONCILIATION_REQUIRED');
    const previousRun = parseRowsForRun(state).find(x => x.runId === runId && x.outcome === 'RESEARCH_CYCLE_COMPLETE');
    if (previousRun && previousRun.outcome === 'RESEARCH_CYCLE_COMPLETE') {
      await releaseLock();
      log('already_recorded', { runId, executionMode: previousRun.executionMode });
      return json(res, 200, {
        ok: true,
        runId,
        outcome: 'ALREADY_RECORDED',
        executionMode: previousRun.executionMode,
        source: 'INDEX_AGENT_API'
      });
    }

    stage = 'MASTER_READ';
    const masterRows = await readMaster(token);
    stage = 'DISCOVERY';
    const district = DISCOVERY_DISTRICTS[dayRotationIndex(new Date())];
    const discovery = await discoverDeveloperSignals(fetch, district, 10);
    const signals = dedupeSignals(discovery.candidates);

    const ids = nextIds(state);
    let nextReferral = ids.referral;
    let nextEvidence = ids.evidence;
    let nextActivity = ids.activity;

    const referralRows = [];
    const evidenceRows = [];
    const activityRows = [];
    const outcomes = [];

    stage = 'FIRST_PARTY_VERIFICATION';
    const verified = await Promise.all(signals.map(async signal => ({
      signal,
      firstParty: await verifyFirstPartySource(fetch, signal.sellerURL)
    })));

    for (const item of verified) {
      const signal = item.signal;
      const firstParty = item.firstParty;
      const candidate = {
        ...signal,
        firstPartyURL: firstParty.firstPartyURL || '',
        siteName: firstParty.siteName || '',
        publicEmail: '',
        discoverySourceURL: discovery.sourceURL
      };
      const researchMatch = matchResearchRecord(candidate, state.referrals);
      const classification = classifyCandidate(candidate, firstParty, masterRows, state.referrals);
      const summary = candidateSummary(classification);
      const existingResearchId = researchMatch?.id || '';

      if (existingResearchId) {
        outcomes.push({
          name: signal.sellerName,
          summary,
          disposition: classification.disposition,
          reason: classification.reason,
          recordId: existingResearchId,
          saved: false
        });
        activityRows.push([
          'IRC-ACT-' + String(nextActivity++).padStart(4, '0'),
          startedAt,
          'Research',
          existingResearchId,
          'Research commercial handoff',
          classification.status,
          'INDEX AI Agent API + existing IRC workbook',
          '',
          scheduled ? 'Vercel scheduler' : 'TSS automation',
          JSON.stringify({kind: 'research-commercial-handoff/v1', sourceRunId: runId, ...researchNextAction(classification, existingResearchId), canonicalCompanyId: classification.canonicalCompanyId || '', note: 'Existing research record; no duplicate row or communication created.'})
        ]);
        continue;
      }

      const referralId = 'IRC-ORG-' + String(nextReferral++).padStart(4, '0');
      candidate.referralId = referralId;
      const row = [
        referralId,
        firstParty.siteName || signal.sellerName,
        '',
        'Cyprus',
        firstParty.firstPartyURL || '',
        '',
        'PROPERTY DEVELOPER',
        classification.canonicalCompanyId || '',
        signal.listingURL || discovery.sourceURL,
        startedAt,
        firstParty.verified ? 'First-party developer website verified' : 'First-party verification incomplete',
        classification.status,
        'UNKNOWN',
        '',
        'RESEARCH ONLY',
        '',
        [
          'Automated Research Center candidate.',
          'Discovery source: INDEX AI Agent API.',
          'Seller type observed: ' + (signal.sellerType || 'unknown') + '.',
          'Listing: ' + (signal.listingURL || 'not recorded') + '.',
          firstParty.firstPartyURL ? 'First-party source: ' + firstParty.firstPartyURL + '.' : '',
          firstParty.siteName ? 'First-party site name: ' + firstParty.siteName + '.' : '',
          'Disposition: ' + classification.disposition + '.',
          'Reason: ' + classification.reason + '.',
          classification.canonicalCompanyId ? 'Canonical Company ID: ' + classification.canonicalCompanyId + '.' : '',
          'No outreach authorized.'
        ].filter(Boolean).join(' ')
      ];
      referralRows.push(row);

      const evRows = [
        [
          'IRC-EV-' + String(nextEvidence++).padStart(3, '0'),
          'Referral',
          referralId,
          'INDEX developer listing identified seller as a developer candidate in ' + signal.district + (signal.location ? ' / ' + signal.location : '') + '.',
          discovery.sourceURL,
          'INDEX.cy AI Agent API',
          signal.listedAt || '',
          startedAt,
          'Discovery',
          'Source supported',
          'Current'
        ],
        [
          'IRC-EV-' + String(nextEvidence++).padStart(3, '0'),
          'Referral',
          referralId,
          firstParty.verified
            ? 'First-party website supports a Cyprus property-development role for the discovered organisation.'
            : 'First-party verification did not establish a Cyprus property-development role: ' + firstParty.reason + '.',
          firstParty.firstPartyURL || signal.sellerURL || discovery.sourceURL,
          firstParty.firstPartyURL ? 'First-party website' : 'INDEX seller page',
          '',
          startedAt,
          'First-party verification',
          firstParty.verified ? 'Verified' : 'Review required',
          'Current'
        ]
      ];
      evidenceRows.push(...evRows);

      activityRows.push([
        'IRC-ACT-' + String(nextActivity++).padStart(4, '0'),
        startedAt,
        'Referral',
        referralId,
        'Research commercial handoff',
        classification.status,
        'INDEX AI Agent API + first-party source + Master Companies',
        '',
        scheduled ? 'Vercel scheduler' : 'TSS automation',
        JSON.stringify({kind: 'research-commercial-handoff/v1', sourceRunId: runId, ...researchNextAction(classification, referralId), canonicalCompanyId: classification.canonicalCompanyId || '', note: 'No outreach, no HubSpot write, no duplicate communication. Canonical Company creation is not performed by this workflow.'})
      ]);

      outcomes.push({
        name: firstParty.siteName || signal.sellerName,
        summary,
        disposition: classification.disposition,
        reason: classification.reason,
        recordId: referralId,
        canonicalCompanyId: classification.canonicalCompanyId || '',
        saved: true
      });
    }

    const accepted = outcomes.filter(x => x.summary === 'ACCEPTED').length;
    const rejected = outcomes.filter(x => x.summary === 'REJECTED').length;
    const held = outcomes.filter(x => x.summary === 'HELD').length;
    const matchedExisting = outcomes.filter(x => x.disposition === 'DUPLICATE_CANONICAL_COMPANY').length;
    const runDetails = JSON.stringify({
      district,
      source: discovery.sourceURL,
      discoveryTotal: discovery.total,
      candidatesInspected: signals.length,
      accepted,
      held,
      rejected,
      matchedExisting,
      duplicateOrAliasReview: outcomes.filter(x => ['DUPLICATE_RESEARCH_RECORD','POSSIBLE_CANONICAL_MATCH'].includes(x.disposition)).length,
      outcomes
    });

    const finishedAt = utc();
    const runRow = [
      runId,
      startedAt,
      finishedAt,
      'INDEX AI Agent API; first-party company websites; Master Companies',
      signals.length,
      0,
      0,
      0,
      held,
      'WRITE_VERIFICATION_PENDING',
      runDetails,
      'RESEARCH_CYCLE',
      scheduled ? 'VERCEL_CRON' : 'AUTOMATION_MANUAL'
    ];

    const writeData = [];
    if (referralRows.length) {
      writeData.push({
        range: a1Range('Referral Organisations', state.referrals.length + 1, 17, referralRows.length),
        majorDimension: 'ROWS',
        values: referralRows
      });
    }
    if (evidenceRows.length) {
      writeData.push({
        range: a1Range('Evidence', state.evidence.length + 1, 11, evidenceRows.length),
        majorDimension: 'ROWS',
        values: evidenceRows
      });
    }
    if (activityRows.length) {
      writeData.push({
        range: a1Range('Activity Log', state.activity.length + 1, 10, activityRows.length),
        majorDimension: 'ROWS',
        values: activityRows
      });
    }

    const scheduledRunAfter = scheduled
      ? { runId, startedAt, finishedAt, outcome: 'RESEARCH_CYCLE_COMPLETE', executionMode: 'VERCEL_CRON' }
      : findScheduledResearchRun(state);
    const overviewValues = rowsForOverview(state, referralRows.length, scheduledRunAfter);
    writeData.push({
      range: "'Overview'!B2:B9",
      majorDimension: 'ROWS',
      values: overviewValues.map((row, index) => index === 7 ? ['RESEARCH WRITE VERIFICATION PENDING / AUTO EMAILS OFF'] : row)
    });

    stage = 'IRC_WRITE';
    writeAttempted = true;
    writeData.push({range: "'Overview'!C8:C9", majorDimension: 'ROWS', values: [
      ['Latest recorded scheduled attempt; a cron label alone is not scheduler-origin proof.'],
      ['Research state only. Outreach and CRM transitions require independent approval and execution evidence.']
    ]});
    // Persist a non-success marker BEFORE the data batch. An uncertain write
    // leaves reconciliation pending and blocks blind retries, even next day.
    await appendRun(token, runRow);
    await batchWrite(token, writeData);
    stage = 'READBACK';

    const verifyState = await readState(token);
    const runReadback = parseRowsForRun(verifyState).find(x => x.runId === runId && x.outcome === 'WRITE_VERIFICATION_PENDING');
    if (!runReadback) throw Error('SAVE_READBACK_RUN_MISSING');

    const savedIds = new Set((verifyState.referrals || []).slice(1).map(row => text(row[0])));
    const missing = referralRows.map(row => row[0]).filter(id => !savedIds.has(id));
    if (missing.length) throw Error('SAVE_READBACK_REFERRAL_MISSING');

    const overview = await batchGet(token, ircSheetId(), ["'Overview'!A1:C9"]);
    const overviewRows = overview[0] || [];
    const dashboardState = text(overviewRows[8]?.[1]);
    if (dashboardState !== 'RESEARCH WRITE VERIFICATION PENDING / AUTO EMAILS OFF') throw Error('DASHBOARD_REFRESH_READBACK_FAILED');
    for (const [key, expected] of [['referrals', referralRows], ['evidence', evidenceRows], ['activity', activityRows]]) {
      for (const row of expected) {
        const matches = (verifyState[key] || []).filter(saved => text(saved[0]) === text(row[0]));
        if (matches.length !== 1 || row.some((value, index) => text(matches[0][index]) !== text(value))) {
          throw Error('SAVE_READBACK_CONTENT_MISMATCH');
        }
      }
    }
    // Only data already read back successfully may receive a completion marker.
    // Finalization is bounded to this verified unique row and the dashboard.
    stage = 'FINALIZE';
    await batchWrite(token, [
      {range: "'Runs'!J" + runReadback.rowNumber + ':J' + runReadback.rowNumber, majorDimension: 'ROWS', values: [['RESEARCH_CYCLE_COMPLETE']]},
      {range: "'Overview'!B9:B9", majorDimension: 'ROWS', values: [overviewValues[7]]}
    ]);
    completed = true;
    await releaseLock();
    log('completed', {
      runId,
      executionMode: scheduled ? 'VERCEL_CRON' : 'AUTOMATION_MANUAL',
      district,
      discovered: signals.length,
      accepted,
      held,
      rejected,
      masterMatches: matchedExisting,
      saved: referralRows.length,
      messagesSent: 0
    });

    return json(res, 200, {
      ok: true,
      runId,
      outcome: 'RESEARCH_CYCLE_COMPLETE',
      executionMode: scheduled ? 'VERCEL_CRON' : 'AUTOMATION_MANUAL',
      district,
      discovered: signals.length,
      accepted,
      held,
      rejected,
      masterMatches: matchedExisting,
      saved: referralRows.length,
      messagesSent: 0,
      dashboardRefresh: true,
      source: 'INDEX_AGENT_API',
      masterSource: 'MASTER_COMPANIES_DIRECT_SHEETS_API'
    });
  } catch (error) {
    const code = safeFailureCode(error);
    const diagnostics = stage === 'DISCOVERY' ? safeIndexDiagnostics(error) : undefined;
    let failurePersisted = false;
    // Never blindly retry an ambiguous write. Preserve diagnostics only before
    // a commercial/evidence batch could have committed. Auth failures stay in logs.
    if (token && state && !writeAttempted) {
      try {
        await appendRun(token, [runId, startedAt, utc(), 'Research runtime', 0, 0, 0, 0, 0, 'BLOCKED', JSON.stringify({ stage, code, ...(diagnostics ? { diagnostics } : {}) }), 'RESEARCH_CYCLE', scheduled ? 'VERCEL_CRON' : 'AUTOMATION_MANUAL']);
        failurePersisted = Boolean(parseRowsForRun(await readState(token)).find(x => x.runId === runId && x.outcome === 'BLOCKED'));
        if (failurePersisted) {
          const updates = [{range: "'Overview'!B9:C9", majorDimension: 'ROWS', values: [[
            'RESEARCH BLOCKED / ' + stage + ' / ' + code + ' / AUTO EMAILS OFF',
            'Latest attempt ' + runId + ' failed. See Runs for timestamp and diagnostics; no successful-cycle claim.'
          ]]}];
          if (scheduled) updates.push({range: "'Overview'!B8:C8", majorDimension: 'ROWS', values: [[
            startedAt, 'Latest scheduled attempt BLOCKED; not the timestamp of the last success.'
          ]]});
          await batchWrite(token, updates);
        }
      } catch { /* Primary failure remains authoritative. Never log provider bodies. */ }
    }
    if (!writeAttempted) await releaseLock();
    console.error(JSON.stringify({
      component: 'tss-irc-research',
      event: 'blocked',
      runId,
      executionMode: scheduled ? 'VERCEL_CRON' : 'AUTOMATION_MANUAL',
      error: code, stage, failurePersisted, ...(diagnostics ? { diagnostics } : {})
    }));
    return json(res, 503, {
      ok: false,
      runId,
      outcome: 'BLOCKED',
      error: code, stage, failurePersisted, ...(diagnostics ? { diagnostics } : {})
    });
  } finally {
    // Retain the lease after an ambiguous write/readback. A later retry waits
    // for expiry, reacquires atomically, then re-reads Runs before any write.
    if (lock && (!writeAttempted || completed)) {
      await releaseLock();
    }
  }
}

