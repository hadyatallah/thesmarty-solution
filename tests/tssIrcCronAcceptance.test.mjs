
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import handler from '../api/tss-irc-daily.js';

const mkRes = () => ({
  statusCode: 200,
  headers: {},
  body: '',
  status(n) { this.statusCode = n; return this; },
  setHeader(k, v) { this.headers[k] = v; return this; },
  end(t) { this.body = String(t || ''); return this; }
});

const response = (status, body, contentType = 'application/json', url = 'https://example.test/') => ({
  ok: status >= 200 && status < 300,
  status,
  url,
  headers: { get: key => key.toLowerCase() === 'content-type' ? contentType : '' },
  json: async () => body,
  text: async () => typeof body === 'string' ? body : JSON.stringify(body)
});

const applyRange = (database, range, values) => {
  const m = String(range).match(/^'([^']+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!m) throw Error('Bad test range ' + range);
  const sheet = m[1];
  const startColLetters = m[2];
  const startRow = Number(m[3]) - 1;
  const colToNum = letters => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const startCol = colToNum(startColLetters);
  const key = "'" + sheet + "'";
  database[key] ||= [];
  for (let r = 0; r < values.length; r++) {
    database[key][startRow + r] ||= [];
    for (let c = 0; c < values[r].length; c++) {
      database[key][startRow + r][startCol + c] = values[r][c];
    }
  }
};

const makeDatabase = () => ({
  "'Settings'": [
    ['key','value','purpose'],
    ['daily_scheduler_enabled','TRUE',''],
    ['auto_send_enabled','FALSE',''],
    ['daily_send_cap','10','']
  ],
  "'Buyer Enquiries'": [
    ['buyerId','createdAt','firstName','lastName','email','originCountry','destination','propertyType','budgetBand','purchaseHorizon','sourceType','sourceURL','sourceObservedAt','requestEvidence','contactPermission','contactPermissionAt','sharePermission','status','owner','lastContactAt','notes']
  ],
  "'Referral Organisations'": [
    ['referralId','organisationName','legalName','country','website','publicEmail','organisationType','canonicalCompanyId','sourceURL','sourceObservedAt','verification','channelAssessment','contactBasis','contactPermissionEvidence','engagementStatus','lastContactAt','notes'],
    ['IRC-ORG-0001','Existing Research Org','','Cyprus','https://existing-research.cy/','','PROPERTY DEVELOPER','','https://existing-research.cy/','2026-10-10','Source supported','','UNKNOWN','','RESEARCH ONLY','','']
  ],
  "'Outreach Queue'": [
    ['queueId','leadType','leadId','recipientEmail','recipientName','jurisdiction','recipientClass','permissionBasis','permissionEvidenceURL','reviewedBy','reviewedAt','sendApproved','optedOut','sendAfter','status','messageTemplate','lastAttemptAt','sentAt','providerMessageId','notes']
  ],
  "'Suppressions'": [
    ['emailLower','suppressedAt','reason'],
    ['bounce@example.com','2026-10-10','hard bounce']
  ],
  "'Runs'": [
    ['runId','startedAt','finishedAt','discoverySources','newResearchSignals','newBuyerEnquiries','eligibleForEmail','messagesSent','held','outcome','details','runType','executionMode']
  ],
  "'Evidence'": [
    ['evidenceId','subjectType','subjectId','fact','sourceURL','publisher','publishedAt','observedAt','evidenceType','verification','freshness']
  ],
  "'Activity Log'": [
    ['activityId','timestamp','entityType','entityId','event','result','source','messageId','actor','notes']
  ],
  "'Overview'": [
    ['Metric','Value','Meaning'],
    ['Buyer enquiries','0',''],
    ['Referral organisations','1',''],
    ['Outreach candidates','0',''],
    ['Ready for email','0',''],
    ['Messages sent','0',''],
    ['Suppressed','1',''],
    ['Last scheduler run','NOT VERIFIED',''],
    ['Operational state','OLD','']
  ]
});

const masterRows = [
  ['id','name','category','district','email','phone','website'],
  ['TSS-CY-0100','Existing Canonical Ltd','Developer','Larnaca','','','https://existing-canonical.cy/']
];

test('Production-style cron run performs discovery, first-party verification, Master Companies dedupe, save, read-back and dashboard refresh without communication side effects', async () => {
  const prev = {
    CRON_SECRET: process.env.CRON_SECRET,
    TSS_GOOGLE_SERVICE_ACCOUNT_JSON: process.env.TSS_GOOGLE_SERVICE_ACCOUNT_JSON,
    TSS_IRC_SPREADSHEET_ID: process.env.TSS_IRC_SPREADSHEET_ID,
    TSS_MASTER_SPREADSHEET_ID: process.env.TSS_MASTER_SPREADSHEET_ID,
    fetch: global.fetch,
    info: console.info,
    error: console.error
  };

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  process.env.CRON_SECRET = 'SYNTHETIC_TEST_KEY';
  process.env.TSS_GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: 'qa@example.test',
    private_key: privateKey
  });
  process.env.TSS_IRC_SPREADSHEET_ID = 'irc-test-sheet';
  process.env.TSS_MASTER_SPREADSHEET_ID = '1mZ7vd2UoGXlyxzwZ8Man593UhlLGt2uS1kIS3ZAWPsU';

  const database = makeDatabase();
  const calls = [];
  const logs = [];

  global.fetch = async (url, options = {}) => {
    const u = String(url);
    calls.push(u);

    if (u.includes('oauth2.googleapis.com/token')) {
      return response(200, { access_token: 'SYNTHETIC_TOKEN' });
    }

    if (u.includes('/values:batchGet?')) {
      const parsed = new URL(u);
      const ranges = parsed.searchParams.getAll('ranges');
      const isMaster = u.includes('/1mZ7vd2UoGXlyxzwZ8Man593UhlLGt2uS1kIS3ZAWPsU/');
      if (isMaster) {
        return response(200, { valueRanges: [{ values: masterRows }] });
      }
      return response(200, {
        valueRanges: ranges.map(range => ({
          values: database[range.split('!')[0]] || []
        }))
      });
    }

    if (u.includes('/values:batchUpdate')) {
      const payload = JSON.parse(options.body || '{}');
      for (const item of payload.data || []) {
        applyRange(database, item.range, item.values || []);
      }
      return response(200, { totalUpdatedCells: 100 });
    }

    if (u.includes('agent.index.cy/v1/listings?')) {
      return response(200, {
        total: 3,
        results: [
          {
            id: 101,
            url: 'https://index.cy/sale/101',
            seller: { name: 'Existing Canonical Ltd', type: 'developer', url: 'https://index.cy/member/existing' },
            district: 'larnaca',
            location: 'Larnaca',
            listed_at: '2026-10-16',
            updated_at: '2026-10-16'
          },
          {
            id: 102,
            url: 'https://index.cy/sale/102',
            seller: { name: 'New Verified Developer', type: 'developer', url: 'https://index.cy/member/new' },
            district: 'larnaca',
            location: 'Kiti',
            listed_at: '2026-10-16',
            updated_at: '2026-10-16'
          },
          {
            id: 103,
            url: 'https://index.cy/sale/103',
            seller: { name: 'Agency Misclassified', type: 'developer', url: 'https://index.cy/member/agency' },
            district: 'larnaca',
            location: 'Aradippou',
            listed_at: '2026-10-16',
            updated_at: '2026-10-16'
          }
        ]
      });
    }

    if (u.includes('/member/existing')) {
      return response(200, '<html><a href="https://existing-canonical.cy/">Website</a></html>', 'text/html', u);
    }
    if (u.includes('/member/new')) {
      return response(200, '<html><a href="https://new-verified.cy/">Website</a></html>', 'text/html', u);
    }
    if (u.includes('/member/agency')) {
      return response(200, '<html><a href="https://agency-site.cy/">Website</a></html>', 'text/html', u);
    }
    if (u.includes('existing-canonical.cy')) {
      return response(200, '<html><title>Existing Canonical Developer Cyprus</title><body>Property developer and residential development in Cyprus.</body></html>', 'text/html', u);
    }
    if (u.includes('new-verified.cy')) {
      return response(200, '<html><title>New Verified Developer Cyprus</title><body>Property developer and residential developments in Cyprus.</body></html>', 'text/html', u);
    }
    if (u.includes('agency-site.cy')) {
      return response(200, '<html><title>Agency</title><body>Real estate agency in Cyprus.</body></html>', 'text/html', u);
    }

    throw Error('Unapproved network route in test: ' + u);
  };

  console.info = (...x) => logs.push(x.join(' '));
  console.error = (...x) => logs.push(x.join(' '));

  try {
    const res = mkRes();
    await handler({
      method: 'GET',
      headers: {
        authorization: 'Bearer SYNTHETIC_TEST_KEY',
        'user-agent': 'vercel-cron/1.0'
      }
    }, res);

    assert.equal(res.statusCode, 200, res.body);
    const body = JSON.parse(res.body);
    assert.equal(body.outcome, 'RESEARCH_CYCLE_COMPLETE');
    assert.equal(body.executionMode, 'VERCEL_CRON');
    assert.equal(body.discovered, 3);
    assert.equal(body.accepted, 1);
    assert.equal(body.held, 1);
    assert.equal(body.rejected, 1);
    assert.equal(body.masterMatches, 1);
    assert.equal(body.saved, 3);
    assert.equal(body.messagesSent, 0);
    assert.equal(body.dashboardRefresh, true);

    const saved = database["'Referral Organisations'"].slice(2);
    assert.equal(saved.length, 3);
    assert.ok(saved.some(row => row[1] === 'Existing Canonical Ltd' && row[7] === 'TSS-CY-0100' && row[14] === 'RESEARCH ONLY'));
    assert.ok(saved.some(row => row[1] === 'New Verified Developer' && row[10] === 'First-party developer website verified' && row[11] === 'RESEARCH QUALIFIED - OUTREACH NOT AUTHORIZED'));
    assert.ok(saved.some(row => row[1] === 'Agency Misclassified' && row[14] === 'RESEARCH ONLY'));

    const runRows = database["'Runs'"];
    assert.equal(runRows.length, 2);
    assert.equal(runRows[1][11], 'RESEARCH_CYCLE');
    assert.equal(runRows[1][12], 'VERCEL_CRON');

    const overview = database["'Overview'"];
    assert.equal(overview[1][1], '0');
    assert.equal(overview[2][1], 4);
    assert.match(String(overview[8][1]), /RESEARCH CYCLE COMPLETE/);

    assert.ok(logs.some(x => x.includes('"event":"invoked"')));
    assert.ok(logs.some(x => x.includes('"event":"completed"')));
    assert.equal(calls.some(x => x.includes('graph.microsoft.com')), false);
    assert.equal(calls.some(x => x.includes('hubapi.com')), false);

    const replay = mkRes();
    await handler({
      method: 'GET',
      headers: {
        authorization: 'Bearer SYNTHETIC_TEST_KEY',
        'user-agent': 'vercel-cron/1.0'
      }
    }, replay);
    assert.equal(replay.statusCode, 200);
    assert.equal(JSON.parse(replay.body).outcome, 'ALREADY_RECORDED');
    assert.equal(database["'Runs'"].length, 2);
  } finally {
    for (const key of ['CRON_SECRET','TSS_GOOGLE_SERVICE_ACCOUNT_JSON','TSS_IRC_SPREADSHEET_ID','TSS_MASTER_SPREADSHEET_ID']) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
    global.fetch = prev.fetch;
    console.info = prev.info;
    console.error = prev.error;
  }
});
