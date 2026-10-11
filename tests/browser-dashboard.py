"""Offline public-site regression after owner-authorized CRM dashboard retirement.

No customer records, real provider requests or CRM authentication. The obsolete
renderers are intentionally absent; preserved research logic has separate tests.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit
import threading, json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence/dashboard'
OUT.mkdir(parents=True,exist_ok=True)
RETIRED={'/crm/','/crm/index.html','/analytics/','/analytics/index.html'}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args): pass
    def do_GET(self):
        if urlsplit(self.path).path in RETIRED:
            self.send_error(404)
            return
        super().do_GET()

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}'
checks={}
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        ctx=browser.new_context(viewport={'width':390,'height':780},service_workers='block')
        ctx.route('**/*',lambda route:route.continue_() if route.request.url.startswith(origin+'/') else route.abort('blockedbyclient'))
        page=ctx.new_page()
        home=page.goto(origin+'/index.html',wait_until='domcontentloaded')
        checks['homepage_http_200']=home.status==200
        checks['no_public_admin_link']=page.locator('a[href="/crm/"]').count()==0
        checks['no_public_analytics_link']=page.locator('a[href="/analytics/"]').count()==0
        contact=page.goto(origin+'/contact.html',wait_until='domcontentloaded')
        checks['contact_http_200']=contact.status==200
        checks['native_hubspot_slot']=page.locator('.hs-form-frame[data-portal-id="149509919"]').count()==1
        checks['old_contact_form_absent']=page.locator('form[data-tss-form]').count()==0
        checks['mobile_page_fits']=page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2')
        for path in sorted(RETIRED):
            checks['retired_'+path]=page.request.get(origin+path).status==404
        page.screenshot(path=str(OUT/'retired-crm-public-site.png'),full_page=True)
        ctx.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()

report={'environment':'offline localhost synthetic browser, external traffic blocked','checks':checks}
(OUT/'browser-retirement.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
assert all(checks.values()),checks
