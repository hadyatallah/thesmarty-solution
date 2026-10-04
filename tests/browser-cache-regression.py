"""Runs only against localhost with synthetic data. Never connects to TSS services."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json, threading, subprocess, os
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]

def exercise(browser, variant):
    saved=ROOT/variant/'crm/service-worker.js'
    if saved.exists():
        code=saved.read_bytes()
    elif variant=='baseline':
        code=subprocess.check_output(['git','show','d0f95f9fadce45715f32abece52745435d5332e9:crm/service-worker.js'],cwd=ROOT)
    else:
        code=(ROOT/'crm/service-worker.js').read_bytes()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def do_GET(self):
            route=self.path.split('?')[0]
            if route=='/crm/service-worker.js': body,kind=code,'text/javascript'
            elif route=='/crm/manifest.webmanifest': body,kind=b'{"name":"Synthetic local CRM"}','application/manifest+json'
            elif route=='/crm/icon.svg': body,kind=b'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>','image/svg+xml'
            elif route=='/crm/probe.json': body,kind=b'{"synthetic":true}','application/json'
            else: body,kind=b'<!doctype html><title>Isolated CRM cache test</title><p>Synthetic local fixture</p>','text/html'
            self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    origin=f'http://127.0.0.1:{server.server_port}'
    context=browser.new_context()
    try:
        context.add_cookies([{'name':'synthetic_session','value':'preserve','url':origin,'httpOnly':True}])
        page=context.new_page();page.goto(origin+'/crm/')
        page.evaluate("""async () => {
          localStorage.setItem('synthetic-session','preserve');
          const other=await caches.open('analytics-fixture');
          await other.put('/fixture-data',new Response('preserve'));
          const old=await caches.open('tss-crm-pwa-v4');
          await old.put('/old-fixture',new Response('old'));
          const similarlyNamed=await caches.open('tss-crm-pwa-not-owned');
          await similarlyNamed.put('/similar-fixture',new Response('preserve'));
          await navigator.serviceWorker.register('/crm/service-worker.js');
          await navigator.serviceWorker.ready;
        }""")
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        keys=page.evaluate('caches.keys()')
        assets=page.evaluate("""async () => {
          const result=await fetch('/crm/icon.svg');
          await fetch('/crm/probe.json');
          return {iconOk:result.ok,entries:await Promise.all((await caches.keys()).map(async name=>({name,urls:(await (await caches.open(name)).keys()).map(r=>r.url)})))};
        }""")
        storage=page.evaluate("localStorage.getItem('synthetic-session')")
        cookie=next((x['value'] for x in context.cookies() if x['name']=='synthetic_session'),None)
        context.set_offline(True)
        offline=page.evaluate("""async () => ({
          icon:await fetch('/crm/icon.svg').then(r=>r.ok).catch(()=>false),
          data:await fetch('/crm/probe.json').then(r=>r.ok).catch(()=>false)
        })""")
        checks={
          'unrelated_cache_preserved':'analytics-fixture' in keys,
          'similar_unowned_cache_preserved':'tss-crm-pwa-not-owned' in keys,
          'new_crm_cache_active':'tss-crm-pwa-v5' in keys,
          'old_crm_cache_retired':'tss-crm-pwa-v4' not in keys,
          'synthetic_cookie_preserved':cookie=='preserve',
          'synthetic_local_storage_preserved':storage=='preserve',
          'icon_works_offline':offline['icon'],
          'data_not_served_offline':not offline['data'],
          'no_probe_response_in_any_cache':not any('/crm/probe.json' in u for c in assets['entries'] for u in c['urls'])
        }
        return {'variant':variant,'checks':checks,'cache_names':keys,'cache_entries':assets['entries']}
    finally:
        context.close();server.shutdown();server.server_close()

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, **({'executable_path':os.environ['TSS_CHROMIUM_PATH']} if os.environ.get('TSS_CHROMIUM_PATH') else {}))
    results=[exercise(browser,'baseline'),exercise(browser,'patched')]
    version=browser.version;browser.close()
report={'environment':'isolated localhost Chromium, synthetic data only','chromium':version,'results':results}
(ROOT/'evidence').mkdir(exist_ok=True)
(ROOT/'evidence/chromium-cache-tests.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
assert all(results[1]['checks'].values()), 'A patched browser check failed'
assert not results[0]['checks']['unrelated_cache_preserved'], 'Baseline defect not reproduced'
