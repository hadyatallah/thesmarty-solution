"""Read-only Commercial Network Opportunity Workspace preview checks.
Serves only local repository files, blocks every external request and uses the embedded
synthetic fixture. It does not authenticate, call Apps Script, or write TSS data.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from urllib.parse import urlsplit
import json,threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence'/'commercial-network-preview'
OUT.mkdir(parents=True,exist_ok=True)

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        route=urlsplit(self.path).path
        if route=='/crm/commercial-network-preview.html':
            p=ROOT/'crm'/'commercial-network-preview.html'
        elif route=='/crm/commercial-network-preview.js':
            p=ROOT/'crm'/'commercial-network-preview.js'
        else:
            self.send_error(404); return
        if not p.is_file():
            self.send_error(404); return
        body=p.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type','text/html' if p.suffix=='.html' else 'text/javascript')
        self.send_header('Cache-Control','no-store')
        self.end_headers()
        self.wfile.write(body)

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}'

sizes=[('desktop',1280,900),('tablet',768,1000),('mobile',390,844)]
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for label,width,height in sizes:
        context=browser.new_context(viewport={'width':width,'height':height},timezone_id='Asia/Nicosia',service_workers='block')
        blocked=[]; errors=[]
        def guard(route):
            if route.request.url.startswith(origin+'/'):
                route.continue_()
            else:
                blocked.append(route.request.url)
                route.abort()
        context.route('**/*',guard)
        page=context.new_page()
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(origin+'/crm/commercial-network-preview.html')
        page.wait_for_function('window.fixtureShellReady===true')
        phase=page.locator('.status-card').filter(has_text='Operating Phase').locator('strong').inner_text()
        checks={
            'syntheticBanner':page.locator('.preview-badge').inner_text()=='DEV PREVIEW · SYNTHETIC DATA · READ ONLY',
            'phaseLoad':phase=='LOAD',
            'outreachBlocked':'Outreach blocked' in page.locator('#attentionBanner').inner_text(),
            'communicationDisabled':page.get_by_role('button',name='Prepare Communication').is_disabled(),
            'allSevenTabs':page.locator('[role="tab"]').count()==7,
            'overviewDefault':page.get_by_role('tab',name='Overview').get_attribute('aria-selected')=='true',
            'noHorizontalOverflow':page.evaluate('document.documentElement.scrollWidth<=innerWidth'),
            'noExternalRequests':not blocked,
            'noBrowserErrors':not errors
        }
        page.get_by_role('tab',name='Matches').click()
        checks['matchPreservesUnknown']='current appetite unknown' in page.locator('#workspacePanel').inner_text().lower()
        checks['qualificationVisible']='Under Qualification' in page.locator('#workspacePanel').inner_text()
        checks['engagementVisible']='Not Contacted' in page.locator('#workspacePanel').inner_text()
        page.get_by_role('tab',name='Mandate').click()
        checks['authoritySeparated']='Research' in page.locator('#workspacePanel').inner_text() and 'Outreach' in page.locator('#workspacePanel').inner_text()
        page.get_by_role('tab',name='Public Presentation').click()
        checks['publicNotPublished']='Public-safe does not mean published' in page.locator('#workspacePanel').inner_text()
        page.screenshot(path=str(OUT/f'{label}.png'),full_page=True)
        results.append({'label':label,'width':width,'height':height,'checks':checks,'errors':errors,'blocked':blocked})
        context.close()
    version=browser.version
    browser.close()

server.shutdown(); server.server_close()
report={'environment':'local static preview, synthetic accepted-schema fixture, all external requests blocked','chromium':version,'results':results}
(OUT/'results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
assert all(all(r['checks'].values()) for r in results), 'Commercial Network preview responsive acceptance failed'
