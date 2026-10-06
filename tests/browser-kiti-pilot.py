"""Chat-executable synthetic browser acceptance for the isolated Kiti pilot.

Serves the actual repository-local Kiti ES-module files over localhost. All
non-local requests are blocked. No CRM authentication, provider calls,
Production data, Kiti outreach, or business-record writes are performed.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit
import json, threading, os, traceback
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('TSS_TEST_OUTPUT',str(ROOT/'evidence/kiti-pilot')))
OUT.mkdir(parents=True,exist_ok=True)

ALLOWED={
    '/crm/kiti-pilot.html':('crm/kiti-pilot.html','text/html; charset=utf-8'),
    '/crm/kiti-pilot.js':('crm/kiti-pilot.js','text/javascript; charset=utf-8'),
    '/crm/kiti-pilot-model.js':('crm/kiti-pilot-model.js','text/javascript; charset=utf-8'),
    '/crm/kiti-pilot-governance.js':('crm/kiti-pilot-governance.js','text/javascript; charset=utf-8'),
    '/crm/kiti-pilot-backend.js':('crm/kiti-pilot-backend.js','text/javascript; charset=utf-8'),
}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass
    def do_GET(self):
        route=urlsplit(self.path).path
        if route=='/':
            route='/crm/kiti-pilot.html'
        item=ALLOWED.get(route)
        if not item:
            self.send_error(404)
            return
        rel,kind=item
        data=(ROOT/rel).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type',kind)
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(data)))
        self.end_headers()
        self.wfile.write(data)

def run(browser,width):
    errors=[]
    blocked=[]
    checks={}
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}'
    ctx=browser.new_context(
        viewport={'width':width,'height':1100},
        timezone_id='Asia/Nicosia',
        service_workers='block'
    )
    def intercept(route):
        if route.request.url.startswith(origin+'/'):
            route.continue_()
            return
        blocked.append(route.request.url.split('?')[0])
        route.abort()
    ctx.route('**/*',intercept)
    page=ctx.new_page()
    page.on('pageerror',lambda e: errors.append(str(e)))
    try:
        page.goto(origin+'/crm/kiti-pilot.html',wait_until='networkidle')
        page.wait_for_selector('[data-view="Overview"].active',state='visible')
        body=page.locator('body').inner_text()

        checks['syntheticBoundary']='SYNTHETIC / NO OUTREACH' in body
        checks['correctTitle']='Kiti Residential Development Opportunity' in body
        checks['initialPhaseLaunch']=page.locator('#phase').inner_text()=='LAUNCH'
        checks['outreachBlocked']='Outreach blocked: Outreach authority not granted' in page.locator('#authority').inner_text()
        checks['knownFactsVisible']='Approx. 859 m²' in body and 'Preliminary concept completed' in body
        checks['noRestrictedTestValues']='RESTRICTED TEST VALUE' not in body and 'RESTRICTED TEST DOCUMENT' not in body
        checks['fitsOverview']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')

        page.locator('[data-view="Readiness"]').click()
        text=page.locator('#workspace').inner_text()
        checks['readinessExplainsBlock']='Outreach authority' in text and 'External contact blocked until granted' in text
        checks['researchReady']='Research authority' in text and 'Granted' in text
        checks['fitsReadiness']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')

        page.locator('[data-view="Mandate"]').click()
        text=page.locator('#workspace').inner_text()
        checks['researchOnlyWarning']='does not represent live Kiti commercial authority' in text
        checks['mandateOutreachNotGranted']='Outreach' in text and 'Not Granted' in text
        checks['mandateD1']='Maximum disclosure' in text and 'D1' in text

        page.locator('[data-view="Criteria"]').click()
        text=page.locator('#workspace').inner_text()
        checks['criteriaTypes']='Mandatory' in text and 'Preferred' in text and 'Informational' in text
        checks['criteriaNoScore']='no numerical Match Score' in text
        checks['criteriaAppetiteUnknown']='Current appetite remains Unknown' in text

        page.locator('[data-view="Matches"]').click()
        text=page.locator('#workspace').inner_text()
        checks['gelfancoFixture']='Gelfanco' in text and 'TSS-CY-001' in text
        checks['mandatoryPass']='Mandatory' in text and 'PASS' in text
        checks['priorityReview']='Priority Review' in text
        checks['appetiteUnknown']='Current appetite' in text and 'Unknown' in text
        checks['gapsVisible']='Current appetite unknown' in text and 'Capacity unknown' in text
        checks['matchOutreachBlocked']='Outreach authority not granted' in text
        page.screenshot(path=str(OUT/f'matches-{width}.png'),full_page=True)

        page.locator('[data-view="Communications"]').click()
        text=page.locator('#workspace').inner_text()
        checks['communicationsSynthetic']='Synthetic communication timeline only' in text
        checks['communicationsBlocked']='BLOCKED · Outreach authority not granted' in text
        checks['communicationsProposalOnly']='Interpret and propose only' in text

        page.locator('[data-view="Documents"]').click()
        text=page.locator('#workspace').inner_text()
        checks['documentsMetadataOnly']='Document metadata only' in text
        checks['documentsD1Eligible']='Approved public teaser' in text and 'Eligible at current ceiling' in text
        checks['documentsD3Blocked']='Planning / technical package' in text and 'Blocked pending authority and conditions' in text
        checks['documentsProtectedLabels']='landowner identity' in text.lower() and 'confidential studies' in text.lower()

        page.locator('[data-view="Packs"]').click()
        text=page.locator('#workspace').inner_text()
        checks['packEffectiveD1']='Effective\nD1' in text
        checks['restrictedExcluded']='landownerIdentity' in text and 'Restricted' in text and 'confidentialStudies' in text
        checks['restrictedValuesNotRendered']='RESTRICTED TEST VALUE' not in text and 'RESTRICTED TEST DOCUMENT' not in text
        checks['publicFactsIncluded']='siteArea' in text and 'Approx. 859 m²' in text
        checks['packManifestVisible']='Pack manifest' in text and 'PACK-' in text
        checks['packFingerprintVisible']='Content fingerprint' in text
        checks['packDraftOnly']='Approval state' in text and 'Draft' in text
        checks['developerPackPreview']='Developer pack preview' in text and 'Opportunity at a glance' in text and 'Express qualified interest through TSS.' in text
        checks['professionalPackPreview']='Professional handoff preview' in text and 'Review only the specifically assigned planning, legal or technical question.' in text
        checks['investorPackDeferred']='Investor pack:' in text and 'deferred pending the approved professional/regulatory route' in text

        page.locator('[data-view="Presentation"]').click()
        text=page.locator('#workspace').inner_text()
        checks['presentationD1']='Approved D1 projection' in text
        checks['presentationLockedFacts']='Approx. 859 m²' in text and 'Preliminary concept completed' in text
        checks['presentationProtected']='Landowner identity' in text and 'Not exposed' in text
        checks['presentationNoRestrictedValues']='RESTRICTED TEST VALUE' not in text and 'RESTRICTED TEST DOCUMENT' not in text

        page.locator('[data-view="Activity"]').click()
        text=page.locator('#workspace').inner_text()
        checks['activitySynthetic']='Synthetic events use deterministic idempotency keys' in text and 'No live Activity rows are written' in text
        checks['activityOutreachBlock']='Governance Block' in text and 'BLOCKED · no external action' in text
        checks['activityEventIds']='AE-' in text

        page.locator('[data-view="Runtime"]').click()
        page.locator('#runtimeCheckBtn').click()
        page.wait_for_selector('#runtimeResult .assistant-card')
        text=page.locator('#runtimeResult').inner_text()
        checks['runtimeReadPass']='Read permission' in text and 'PASS' in text
        checks['runtimeCandidatePass']='Candidate records' in text and '1' in text
        checks['runtimeMandatoryPass']='Mandatory result' in text and 'PASS' in text
        checks['runtimeAppetiteUnknown']='Appetite' in text and 'Unknown' in text
        checks['runtimeProposalOnly']='proposed · human review only' in text
        checks['runtimeExternalBlocked']='External communication' in text and 'BLOCKED' in text
        checks['runtimeNoForbiddenWrite']='Forbidden write/execute call' in text and 'NONE' in text
        checks['runtimeCallsOnlyAccepted']='getCommercialNetworkState' in text and 'getCommercialNetworkCandidates' in text and 'prepareCommercialNetworkTransition' in text and 'getCommercialNetworkCommunicationGate' in text

        page.locator('[data-view="Assistant"]').click()
        page.locator('#interpretBtn').click()
        text=page.locator('#assistantResult').inner_text()
        checks['assistantInterest']='Expressed interest' in text
        checks['assistantPlanning']='Planning information requested' in text
        checks['assistantJV']='JV structure queried' in text
        checks['assistantNoQualification']='Qualification: NO CHANGE' in text
        checks['assistantProposalInterested']='engagementState' in text and 'Interested' in text
        checks['assistantResponseCategory']='Qualified interest signal' in text
        checks['assistantProposalId']='ASP-' in text
        checks['assistantNoExternalAction']='External action: NO' in text and 'Human approval required' in text
        checks['assistantSafeDraft']='Safe draft preview' in text and 'Further planning or technical material can only be shared through the appropriate controlled disclosure stage.' in text
        checks['assistantNoRestrictedIdentity']='RESTRICTED TEST VALUE' not in text and 'landownerIdentity' not in text
        page.screenshot(path=str(OUT/f'assistant-{width}.png'),full_page=True)

        page.locator('[data-view="Analytics"]').click()
        text=page.locator('#workspace').inner_text()
        checks['analyticsFixtureOnly']='Derived from synthetic Match state and Activity events' in text
        checks['noForecastLanguage']='No close probability, weighted pipeline or Match Score' in text
        checks['analyticsGovernance']='Outreach authority is not granted' in text
        checks['analyticsDerived']='Governance blocks' in text and 'Audited synthetic events' in text
        checks['analyticsNoScoring']='No close probability, weighted pipeline or Match Score' in text
        checks['fitsAnalytics']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')

        validation=page.locator('#validationExample').inner_text()
        checks['validationPlanning']='planning approval' in validation.lower()
        checks['validationFinancial']='financial projection' in validation.lower()
        checks['validationArea']='site area' in validation.lower()
        checks['noBrowserErrors']=not errors
        checks['noExternalRequests']=not blocked
        page.screenshot(path=str(OUT/f'analytics-{width}.png'),full_page=True)
        return {'width':width,'checks':checks,'errors':errors,'blocked':blocked}
    finally:
        ctx.close()
        server.shutdown()
        server.server_close()

report={
    'environment':'Actual repository Kiti ES modules served only on localhost. Synthetic fixture only; all non-local requests blocked.',
    'results':[]
}
try:
    with sync_playwright() as p:
        opts={'headless':True}
        if os.environ.get('TSS_CHROMIUM_EXECUTABLE'):
            opts['executable_path']=os.environ['TSS_CHROMIUM_EXECUTABLE']
        browser=p.chromium.launch(**opts)
        report['chromium']=browser.version
        for width in (390,768,1280):
            report['results'].append(run(browser,width))
        browser.close()
except Exception as e:
    report['error']=str(e)
    report['traceback']=traceback.format_exc()
finally:
    (OUT/'browser-results.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))

assert 'error' not in report, report.get('error')
assert all(all(r['checks'].values()) for r in report['results']), 'Kiti browser assertion failed'
