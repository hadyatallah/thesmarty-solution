
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { Gaxios } = createRequire(import.meta.url)('gaxios');
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

test('Production-style cron run performs discovery, first-party verification, Master Companies dedupe, save, read-back and dashboard refresh without communication side effects', async (t) => {
  const wifEnv={GCP_PROJECT_NUMBER:'103840050410',GCP_PROJECT_ID:'tss-crm-508908',GCP_SERVICE_ACCOUNT_EMAIL:'tss-hubspot-sheets-reader@tss-crm-508908.iam.gserviceaccount.com',GCP_WORKLOAD_IDENTITY_POOL_ID:'vercel-research-center',GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID:'vercel',VERCEL_OIDC_TOKEN:[Buffer.from(JSON.stringify({alg:'RS256'})).toString('base64url'),Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,sub:'synthetic-preview',aud:'https://vercel.com/tss21'})).toString('base64url'),'synthetic-signature'].join('.')};
  const previousWif=Object.fromEntries(Object.keys(wifEnv).map(k=>[k,process.env[k]]));
  const previousOidcFile=process.env.VERCEL_OIDC_TOKEN_FILE;
  delete process.env.VERCEL_OIDC_TOKEN_FILE;
  Object.assign(process.env,wifEnv);
  let exchangeCalls=0;
  t.mock.method(Gaxios.prototype,'request',async options=>{
    const url=String(options.url);exchangeCalls++;
    if(url==='https://sts.googleapis.com/v1/token'){
      assert.equal(options.data.get('subject_token'),wifEnv.VERCEL_OIDC_TOKEN);
      return {data:{access_token:'synthetic-federated-token',expires_in:3600,token_type:'Bearer'}};
    }
    assert.match(url,/^https:\/\/iamcredentials.googleapis.com\/v1\/projects\/-\/serviceAccounts\/tss-hubspot-sheets-reader@tss-crm-508908.iam.gserviceaccount.com:generateAccessToken$/);
    assert.equal(new Headers(options.headers).get('authorization'),'Bearer synthetic-federated-token');
    assert.deepEqual(options.data.scope,['https://www.googleapis.com/auth/spreadsheets']);
    return {data:{accessToken:'synthetic-sheets-impersonated-token',expireTime:new Date(Date.now()+3600000).toISOString()}};
  });
  const prev = {
    CRON_SECRET: process.env.CRON_SECRET,
    TSS_GOOGLE_SERVICE_ACCOUNT_JSON: process.env.TSS_GOOGLE_SERVICE_ACCOUNT_JSON,
    TSS_IRC_SPREADSHEET_ID: process.env.TSS_IRC_SPREADSHEET_ID,
    TSS_MASTER_SPREADSHEET_ID: process.env.TSS_MASTER_SPREADSHEET_ID,
    fetch: global.fetch,
    info: console.info,
    error: console.error
  };

  process.env.CRON_SECRET = 'SYNTHETIC_TEST_KEY';
  process.env.TSS_IRC_SPREADSHEET_ID = '1KFLZk_IlFY64IMpEW63wYvJdNF5jmfjZoRM79aVbBKs';
  process.env.TSS_MASTER_SPREADSHEET_ID = '1mZ7vd2UoGXlyxzwZ8Man593UhlLGt2uS1kIS3ZAWPsU';

  const database = makeDatabase();
  const calls = [];
  let sourceMode = "results";
  let concurrentExternalRun = false;
  let injectReadbackFailure = false, failNextReadback = false;
  let lockMetadata;
  const logs = [];

  global.fetch = async (url, options = {}) => {
    const u = String(url);
    calls.push(u);

    if(u.startsWith('https://sheets.googleapis.com/')) assert.equal(options.headers.authorization,'Bearer synthetic-sheets-impersonated-token');

    if (u.endsWith('/developerMetadata:search')) return response(200,{matchedDeveloperMetadata:lockMetadata?[{developerMetadata:lockMetadata}]:[]});
    if (u.endsWith(':batchUpdate') && !u.includes('/values:batchUpdate')) {
      let next=lockMetadata;
      for(const request of JSON.parse(options.body).requests){
        if(request.deleteDeveloperMetadata){const lookup=request.deleteDeveloperMetadata.dataFilter.developerMetadataLookup;if(next?.metadataValue===lookup.metadataValue)next=undefined;}
        if(request.createDeveloperMetadata){if(next)return response(400,{});next=request.createDeveloperMetadata.developerMetadata;}
      }
      lockMetadata=next;return response(200,{replies:[]});
    }

    if (u.includes('/values:batchGet?')) {
      if (failNextReadback) { failNextReadback=false; return response(503, {}); }
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

    if (u.includes(':append?')) {
      database["'Runs'"].push(...JSON.parse(options.body).values);
      return response(200, { updates: { updatedRows: 1 } });
    }
    if (u.includes('/values:batchUpdate')) {
      const payload = JSON.parse(options.body || '{}');
      for (const item of payload.data || []) {
        applyRange(database, item.range, item.values || []);
      }
      if(concurrentExternalRun){database["'Runs'"].push(['EXTERNAL-APPROVED-RUN']);concurrentExternalRun=false;}
      if (injectReadbackFailure && payload.data.some(item=>item.range==="'Overview'!B2:B9")) { failNextReadback=true; injectReadbackFailure=false; }
      return response(200, { totalUpdatedCells: 100 });
    }

    if (u.includes('agent.index.cy/v1/listings?')) {
      if(sourceMode==='zero')return response(200,{total:0,results:[]});
      if(sourceMode==='malformed')return response(200,{error:'bad upstream response'});
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
    assert.equal(exchangeCalls,2);
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
    const handoffs = database["'Activity Log'"].slice(1).map(row => JSON.parse(row[9]));
    assert.equal(handoffs.length, 3);
    assert.ok(handoffs.some(item => item.action === 'VERIFY_COMMERCIAL_FIT'));
    assert.ok(handoffs.some(item => item.action === 'RESOLVE_EXISTING_HUBSPOT_IDENTITY'));
    assert.ok(handoffs.some(item => item.action === 'KEEP_REJECTED'));
    assert.ok(handoffs.every(item => item.kind === 'research-commercial-handoff/v1' && item.sendsAuthorized === false && item.crmWritesAuthorized === false));
    assert.equal(database["'Outreach Queue'"].length, 1, 'Research handoff must not create approval or send-ready queue entries');

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
    assert.equal(overview[1][1], 0);
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
    // Pause must prevent all source requests and writes, including manual runs.
    database["'Settings'"][1][1] = 'FALSE';
    const before = calls.length;
    const paused = mkRes();
    await handler({method:'GET',headers:{authorization:'Bearer SYNTHETIC_TEST_KEY'}},paused);
    assert.equal(JSON.parse(paused.body).outcome,'PAUSED');
    assert.equal(calls.slice(before).some(url=>url.includes('agent.index.cy')||url.includes('/values:batchUpdate')),false);
    database["'Settings'"][1][1] = 'TRUE';
    database["'Runs'"] = database["'Runs'"].slice(0,1);
    sourceMode='zero';
    concurrentExternalRun=true;
    const manual=mkRes();
    await handler({method:'GET',headers:{authorization:'Bearer SYNTHETIC_TEST_KEY'}},manual);
    assert.equal(manual.statusCode,200,manual.body);
    assert.equal(JSON.parse(manual.body).discovered,0);
    assert.match(JSON.parse(manual.body).runId,/-MANUAL-/);
    const cronAfterManual=mkRes();
    await handler({method:'GET',headers:{authorization:'Bearer SYNTHETIC_TEST_KEY','user-agent':'vercel-cron/1.0'}},cronAfterManual);
    assert.equal(JSON.parse(cronAfterManual.body).outcome,'RESEARCH_CYCLE_COMPLETE');
    assert.equal(database["'Runs'"].length,4);
    assert.ok(database["'Runs'"].some(row=>row[0]==='EXTERNAL-APPROVED-RUN'));
    sourceMode='malformed';
    const failure=mkRes();
    await handler({method:'GET',headers:{authorization:'Bearer SYNTHETIC_TEST_KEY'}},failure);
    assert.equal(failure.statusCode,503);
    assert.equal(JSON.parse(failure.body).error,'INDEX_RESPONSE_SCHEMA_INVALID');
    assert.equal(JSON.parse(failure.body).failurePersisted,true);
    assert.equal(database["'Runs'"].at(-1)[9],'BLOCKED');
    assert.match(database["'Overview'"][8][1], /RESEARCH BLOCKED.*DISCOVERY.*INDEX_RESPONSE_SCHEMA_INVALID/);
    assert.match(database["'Overview'"][8][2], /failed/);
    // A newer scheduled failure must replace yesterday's success in the overview.
    database["'Runs'"]=database["'Runs'"].filter(row=>row[12]!=='VERCEL_CRON');
    const failedCron=mkRes();
    await handler({method:'GET',headers:{authorization:'Bearer SYNTHETIC_TEST_KEY','user-agent':'vercel-cron/1.0'}},failedCron);
    assert.equal(failedCron.statusCode,503);
    assert.match(database["'Overview'"][7][2], /BLOCKED/);
    sourceMode='zero';
    const manualRecovery=mkRes();
    await handler({method:'GET',headers:{authorization:'Bearer SYNTHETIC_TEST_KEY'}},manualRecovery);
    assert.equal(manualRecovery.statusCode,200,manualRecovery.body);
    assert.match(database["'Overview'"][8][1], /LATEST SCHEDULED RESEARCH BLOCKED/);

    sourceMode='zero';
    database["'Runs'"]=database["'Runs'"].slice(0,1);
    const concurrentA=mkRes(),concurrentB=mkRes();
    const scheduledRequest={method:'GET',headers:{authorization:'Bearer SYNTHETIC_TEST_KEY','user-agent':'vercel-cron/1.0'}};
    const beforeConcurrent=calls.length;
    await Promise.all([handler(scheduledRequest,concurrentA),handler(scheduledRequest,concurrentB)]);
    const responses=[JSON.parse(concurrentA.body),JSON.parse(concurrentB.body)];
    assert.equal(responses.filter(x=>x.outcome==='RESEARCH_CYCLE_COMPLETE').length,1);
    assert.equal(responses.filter(x=>x.error==='IRC_RUN_IN_PROGRESS').length,1);
    assert.equal(database["'Runs'"].length,2);
    assert.equal(calls.slice(beforeConcurrent).filter(url=>url.includes('agent.index.cy/v1/listings?')).length,1);

    // A successful provider write followed by failed readback is never success.
    database["'Runs'"]=database["'Runs'"].slice(0,1);
    injectReadbackFailure=true;
    const uncertain=mkRes();
    await handler(scheduledRequest,uncertain);
    assert.equal(uncertain.statusCode,503);
    assert.equal(database["'Runs'"].at(-1)[9],'WRITE_VERIFICATION_PENDING');
    assert.match(database["'Overview'"][8][1],/VERIFICATION PENDING/);
    assert.equal(database["'Runs'"].some(row=>row[9]==='RESEARCH_CYCLE_COMPLETE'),false);
    // Model the next execution after the lease expires: reconciliation gate
    // prevents another discovery/data batch, rather than blindly replaying.
    lockMetadata=undefined;
    const beforeRetry=calls.length, reconcile=mkRes();
    await handler(scheduledRequest,reconcile);
    assert.equal(JSON.parse(reconcile.body).error,'IRC_WRITE_RECONCILIATION_REQUIRED');
    assert.equal(calls.slice(beforeRetry).some(url=>url.includes('agent.index.cy')),false);




  } finally {
    for (const key of ['CRON_SECRET','TSS_GOOGLE_SERVICE_ACCOUNT_JSON','TSS_IRC_SPREADSHEET_ID','TSS_MASTER_SPREADSHEET_ID']) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
    for(const [key,value] of Object.entries(previousWif)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    if(previousOidcFile===undefined)delete process.env.VERCEL_OIDC_TOKEN_FILE;else process.env.VERCEL_OIDC_TOKEN_FILE=previousOidcFile;
    global.fetch = prev.fetch;
    console.info = prev.info;
    console.error = prev.error;
  }
});

