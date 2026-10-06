"""Chat-executable synthetic browser acceptance for the isolated Kiti pilot.

Loads the repository-local HTML and JavaScript directly into Chromium without any
network access. No CRM authentication, provider calls, Production data, Kiti
outreach, or business-record writes are performed.
"""
from pathlib import Path
import json, os, re, traceback
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('TSS_TEST_OUTPUT',str(ROOT/'evidence/kiti-pilot')))
OUT.mkdir(parents=True,exist_ok=True)

HTML=(ROOT/'crm/kiti-pilot.html').read_text()
MODEL=(ROOT/'crm/kiti-pilot-model.js').read_text()
UI=(ROOT/'crm/kiti-pilot.js').read_text()

# Test the actual repository files while removing only ES-module transport syntax.
HTML_INLINE=re.sub(r'<script\s+type="module"\s+src="/crm/kiti-pilot\.js"></script>','',HTML)
MODEL_INLINE=re.sub(r'\bexport\s+','',MODEL)
UI_INLINE=re.sub(r"^import\s*\{[\s\S]*?\}\s*from\s*['\"]\./kiti-pilot-model\.js['\"];\s*", '', UI, count=1)

def run(browser,width):
    errors=[]
    requests=[]
    checks={}
    ctx=browser.new_context(viewport={'width':width,'height':1100},timezone_id='Asia/Nicosia',service_workers='block')
    page=ctx.new_page()
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('request',lambda r: requests.append(r.url))
    try:
        page.set_content(HTML_INLINE,wait_until='load')
        page.add_script_tag(content=MODEL_INLINE+'\\n'+UI_INLINE)
        page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")
        page.wait_for_selector('[data-view="Overview"].active')
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
        checks['packEffectiveD1']='Effective\\nD1' in text
        checks['restrictedExcluded']='landownerIdentity' in text and 'Restricted' in text and 'confidentialStudies' in text
        checks['restrictedValuesNotRendered']='RESTRICTED TEST VALUE' not in text and 'RESTRICTED TEST DOCUMENT' not in text
        checks['publicFactsIncluded']='siteArea' in text and 'Approx. 859 m²' in text

        page.locator('[data-view="Presentation"]').click()
        text=page.locator('#workspace').inner_text()
        checks['presentationD1']='Approved D1 projection' in text
        checks['presentationLockedFacts']='Approx. 859 m²' in text and 'Preliminary concept completed' in text
        checks['presentationProtected']='Landowner identity' in text and '🔒 Not exposed' in text
        checks['presentationNoRestrictedValues']='RESTRICTED TEST VALUE' not in text and 'RESTRICTED TEST DOCUMENT' not in text

        page.locator('[data-view="Activity"]').click()
        text=page.locator('#workspace').inner_text()
        checks['activitySynthetic']='Synthetic events demonstrate the required reconstructable history' in text
        checks['activityOutreachBlock']='Communication gate evaluated' in text and 'BLOCKED · no external action' in text

        page.locator('[data-view="Assistant"]').click()
        page.locator('#interpretBtn').click()
        text=page.locator('#assistantResult').inner_text()
        checks['assistantInterest']='Expressed interest' in text
        checks['assistantPlanning']='Planning information requested' in text
        checks['assistantJV']='JV structure queried' in text
        checks['assistantNoQualification']='Qualification: NO CHANGE' in text
        checks['assistantProposalInterested']='engagementState' in text and 'Interested' in text
        page.screenshot(path=str(OUT/f'assistant-{width}.png'),full_page=True)

        page.locator('[data-view="Analytics"]').click()
        text=page.locator('#workspace').inner_text()
        checks['analyticsFixtureOnly']='Fixture counts only' in text
        checks['noForecastLanguage']='No close probability or weighted pipeline' in text
        checks['analyticsGovernance']='Outreach authority is not granted' in text
        checks['fitsAnalytics']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')

        validation=page.locator('#validationExample').inner_text()
        checks['validationPlanning']='planning approval' in validation.lower()
        checks['validationFinancial']='financial projection' in validation.lower()
        checks['validationArea']='site area' in validation.lower()
        checks['noBrowserErrors']=not errors
        checks['noExternalRequests']=not requests
        page.screenshot(path=str(OUT/f'analytics-{width}.png'),full_page=True)
        return {'width':width,'checks':checks,'errors':errors,'requests':requests}
    finally:
        ctx.close()

report={'environment':'Repository-local Kiti pilot files rendered in Chromium with network disabled. Synthetic fixture only.','results':[]}
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
    (OUT/'browser-results.json').write_text(json.dumps(report,indent=2)+'\\n')
    print(json.dumps(report,indent=2))

assert 'error' not in report, report.get('error')
assert all(all(r['checks'].values()) for r in report['results']), 'Kiti browser assertion failed'
