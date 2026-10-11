"""Offline browser regression for retired CRM PWA and preserved native website.

The discontinued CRM no longer has a service-worker asset. The test uses a fresh
isolated Chromium profile and does not contact production or any provider.
It cannot unregister a worker previously installed in a customer's browser.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
import json, threading, os
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RETIRED=['crm/index.html','crm/service-worker.js','crm/manifest.webmanifest','crm/icon.svg','analytics/index.html']
for path in RETIRED:
    assert not (ROOT/path).exists(), "Retired UI still exists: "+path

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args): pass
    def do_GET(self):
        route=urlsplit(self.path).path.lstrip('/')
        if route in RETIRED:
            self.send_error(404)
            return
        super().do_GET()

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
ORIGIN=f'http://127.0.0.1:{server.server_port}'
results={}
try:
    with sync_playwright() as p:
        opts={'executable_path':os.environ['TSS_CHROMIUM_PATH']} if os.environ.get('TSS_CHROMIUM_PATH') else {}
        browser=p.chromium.launch(headless=True,**opts)
        context=browser.new_context(service_workers='block')
        context.route('**/*',lambda route: route.continue_() if route.request.url.startswith(ORIGIN+'/') else route.abort('blockedbyclient'))
        page=context.new_page()
        page.goto(ORIGIN+'/contact.html',wait_until='domcontentloaded')
        checks={
            'one_native_contact_slot':page.locator('.hs-form-frame[data-portal-id="149509919"]').count()==1,
            'no_legacy_form':page.locator('form[data-tss-form]').count()==0,
            'contact_navigation':page.locator('a[href="contact.html"]').count()>0,
        }
        for file in RETIRED:
            reply=page.request.get(ORIGIN+'/'+file)
            checks['retired_'+file]=reply.status==404
        checks['no_new_service_worker']=page.evaluate('navigator.serviceWorker.getRegistrations().then(r => r.length === 0)')
        assert all(checks.values()),checks
        results={'environment':'offline localhost browser with all external requests blocked','checks':checks,'chromium':browser.version}
        context.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
(ROOT/'evidence').mkdir(exist_ok=True)
(ROOT/'evidence/chromium-cache-tests.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
