
import { createSign, timingSafeEqual } from 'node:crypto';
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
const day = () => utc().slice(0, 10);
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
  const raw = process.env.TSS_GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw Error('GOOGLE_SERVICE_ACCOUNT_NOT_CONFIGURED');
  let service;
  try {
    service = JSON.parse(raw);
  } catch {
    throw Error('GOOGLE_SERVICE_ACCOUNT_JSON_INVALID');
  }
  if (!service.client_email || !service.private_key) throw Error('GOOGLE_SERVICE_ACCOUNT_FIELDS_MISSING');

  const now = Math.floor(Date.now() / 1000);
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({
    iss: service.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3300
  });
  const signer = createSign('RSA-SHA256');
  signer.update(head + '.' + body);
  signer.end();
  const assertion = head + '.' + body + '.' + signer.sign(service.private_key).toString('base64url');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const result = await readJson(response);
  if (!result.access_token) throw Error('GOOGLE_ACCESS_TOKEN_MISSING');
  return result.access_token;
}

function approvedMasterSheetId() {
  const configured = text(process.env.TSS_MASTER_SPREADSHEET_ID);
  if (configured && configured !== APPROVED_MASTER_SHEET_ID) {
    log('master_id_corrected', { configuredSource: 'environment', selected: 'approved_constant' });
  }
  return APPROVED_MASTER_SHEET_ID;
}

function ircSheetId() {
  return text(process.env.TSS_IRC_SPREADSHEET_ID) || APPROVED_IRC_SHEET_ID;
}

async function batchGet(token, spreadsheetId, ranges) {
  const query = new URLSearchParams();
  ranges.forEach(range => query.append('ranges', range));
  const response = await fetch(
    GOOGLE + encodeURIComponent(spreadsheetId) + '/values:batchGet?' + query,
    {
      headers: { authorization: 'Bearer ' + token },
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

function rowsForOverview(state, appendedReferralCount, scheduledRun) {
  const buyers = Math.max(0, state.buyers.length - 1);
  const referrals = Math.max(0, state.referrals.length - 1) + appendedReferralCount;
  const queue = state.queue.slice(1);
  const suppressions = Math.max(0, state.suppressions.length - 1);
  const ready = queue.filter(row => String(row[14] || '') === 'READY').length;
  const sent = queue.filter(row => ['SENT', 'SUBMITTED'].includes(String(row[14] || ''))).length;
  const schedulerValue = scheduledRun ? scheduledRun.finishedAt || scheduledRun.startedAt : 'NOT VERIFIED';
  const stateValue = scheduledRun
    ? 'RESEARCH CYCLE COMPLETE / SCHEDULER VERIFIED / AUTO EMAILS OFF'
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
  return runs.slice(1).map(row => ({
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
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!authorised(supplied, process.env.CRON_SECRET)) {
    return json(res, 401, { ok: false, error: 'unauthorised' });
  }

  const scheduled = /^vercel-cron\/1\.0$/i.test(text(req.headers['user-agent']));
  const runId = 'IRC-RES-' + day();
  const startedAt = utc();
  log('invoked', { runId, executionMode: scheduled ? 'VERCEL_CRON' : 'AUTOMATION_MANUAL' });

  try {
    const token = await googleAccessToken();
    const state = await readState(token);
    const previousRun = parseRowsForRun(state).find(x => x.runId === runId);
    if (previousRun) {
      log('already_recorded', { runId, executionMode: previousRun.executionMode });
      return json(res, 200, {
        ok: true,
        runId,
        outcome: 'ALREADY_RECORDED',
        executionMode: previousRun.executionMode,
        source: 'INDEX_AGENT_API'
      });
    }

    const masterRows = await readMaster(token);
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
          'Automated bounded discovery',
          classification.status,
          'INDEX AI Agent API + existing IRC workbook',
          '',
          scheduled ? 'Vercel scheduler' : 'TSS automation',
          'Existing research record matched by name/domain. No duplicate row or communication created.'
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
        'Automated bounded discovery → verification → qualification → deduplication',
        classification.status,
        'INDEX AI Agent API + first-party source + Master Companies',
        '',
        scheduled ? 'Vercel scheduler' : 'TSS automation',
        'No outreach, no HubSpot write, no duplicate communication. Canonical Company creation is not performed by this workflow.'
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
      'RESEARCH_CYCLE_COMPLETE',
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
    writeData.push({
      range: a1Range('Runs', state.runs.length + 1, 13, 1),
      majorDimension: 'ROWS',
      values: [runRow]
    });

    const scheduledRunAfter = scheduled
      ? { runId, startedAt, finishedAt, executionMode: 'VERCEL_CRON' }
      : findScheduledResearchRun(state);
    const overviewValues = rowsForOverview(state, referralRows.length, scheduledRunAfter);
    writeData.push({
      range: "'Overview'!B2:B9",
      majorDimension: 'ROWS',
      values: overviewValues
    });

    await batchWrite(token, writeData);

    const verifyState = await readState(token);
    const runReadback = parseRowsForRun(verifyState).find(x => x.runId === runId);
    if (!runReadback) throw Error('SAVE_READBACK_RUN_MISSING');

    const savedIds = new Set((verifyState.referrals || []).slice(1).map(row => text(row[0])));
    const missing = referralRows.map(row => row[0]).filter(id => !savedIds.has(id));
    if (missing.length) throw Error('SAVE_READBACK_REFERRAL_MISSING');

    const overview = await batchGet(token, ircSheetId(), ["'Overview'!A1:C9"]);
    const overviewRows = overview[0] || [];
    const dashboardState = text(overviewRows[8]?.[1]);
    if (!/RESEARCH CYCLE COMPLETE/i.test(dashboardState)) throw Error('DASHBOARD_REFRESH_READBACK_FAILED');

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
    const code = text(error?.message || 'UNKNOWN').slice(0, 180);
    console.error(JSON.stringify({
      component: 'tss-irc-research',
      event: 'blocked',
      runId,
      executionMode: scheduled ? 'VERCEL_CRON' : 'AUTOMATION_MANUAL',
      error: code
    }));
    return json(res, 503, {
      ok: false,
      runId,
      outcome: 'BLOCKED',
      error: code
    });
  }
}
