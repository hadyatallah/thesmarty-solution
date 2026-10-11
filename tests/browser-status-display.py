"""Offline browser acceptance for retirement of the obsolete CRM status view.

Old status-display code cannot remain publicly reachable after removal. Direct
Google Sheets research and HubSpot form acceptance are verified separately.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit
import json, threading, os
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('TSS_TEST_OUTPUT',str(ROOT/'evidence/status-display')))
OUT.mkdir(parents=True,exist_ok=True)

assert not (ROOT/'crm/index.html').exists()
assert not (ROOT/'analytics/index.html').exists()

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args): pass
    def do_GET(self):
        if urlsplit(self.path).path in ('/crm/','/crm/index.html','/analytics/','/analytics/index.html'):
            self.send_error(404)
        else: super().do_GET()

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}'
checks={}
try:
    with sync_playwright() as p:
        opts={'headless':True}
        if os.environ.get('TSS_CHROMIUM_EXECUTABLE'):opts['executable_path']=os.environ['TSS_CHROMIUM_EXECUTABLE']
        browser=p.chromium.launch(**opts)
        for width in (390,768,1280):
            ctx=browser.new_context(viewport={'width':width,'height':900},service_workers='block')
            ctx.route('**/*',lambda route:route.continue_() if route.request.url.startswith(origin+'/') else route.abort('blockedbyclient'))
            page=ctx.new_page()
            result=page.goto(origin+'/contact.html',wait_until='domcontentloaded')
            checks[f'contact_{width}']=result.status==200 and page.locator('.hs-form-frame').count()==1
            checks[f'no_legacy_form_{width}']=page.locator('form[data-tss-form]').count()==0
            checks[f'fits_{width}']=page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2')
            if width==390:page.screenshot(path=str(OUT/'native-contact-390.png'),full_page=True)
            checks[f'crm_gone_{width}']=page.request.get(origin+'/crm/index.html').status==404
            checks[f'analytics_gone_{width}']=page.request.get(origin+'/analytics/index.html').status==404
            ctx.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
report={'environment':'isolated localhost public-website retirement validation','checks':checks}
(OUT/'browser-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
assert all(checks.values()),checks
