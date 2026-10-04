"""Exercise the real frontend module graph and patched submit handler on synthetic localhost data."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json, threading, subprocess
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
BASE='d0f95f9fadce45715f32abece52745435d5332e9'
PAGE=b'''<!doctype html><meta charset="utf-8"><title>Synthetic command test</title>
<textarea id="aiQuestion"></textarea><button id="run">Run</button><div id="aiAnswer"></div>
<script>
window.el=id=>document.getElementById(id);
window.esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.call=(...args)=>{window.unexpectedCalls.push(args[0]);throw Error('Live/backend calls forbidden in this test');};
window.unexpectedCalls=[];window.sessionToken='synthetic-not-a-real-session';
window.state={aiEnabled:false,records:{Companies:[{id:'fixture',name:'Example Company',email:'synthetic@example.invalid',status:'Needs verification'}],Contacts:[],Tasks:[],Tickets:[],Opportunities:[],Activity:[],'Email Activity':[{id:'fixture-old-mail',companyId:'fixture',direction:'sent',messageDate:'2026-09-01T09:00:00Z',subject:'Synthetic prior conversation'}],Outreach:[],'System Control':[],'Automation Log':[]},coverage:{}};
window.formatAssistantText=value=>esc(value);
</script><script src="/crm/assistant.js"></script><script type="module">
import {commandCenter} from '/crm/command-center.js';
window.TSSCommandCenter=commandCenter;window.fixtureReady=true;
</script>'''

QUERIES=[
 'Record the follow-up email I sent to Example Company yesterday',
 'Please log the September 23 sent email for Example Company',
 'Could you record the existing bilingual reply without sending it again?',
 'Add the sent email to the company timeline',
 'Save this already sent email to Email Activity',
 'Mark the email as sent',
 'Import the historical correspondence',
 'Reconcile the email activity for Example Company',
 'Please log the old email and draft another follow-up',
 'We need to record the previous follow-up message'
]

def exercise(browser,variant):
    manager=(subprocess.check_output(['git','show',f'{BASE}:command-center/manager.js'],cwd=ROOT)
             if variant=='baseline' else (ROOT/'command-center/manager.js').read_bytes())
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def do_GET(self):
            route=urlsplit(self.path).path
            if route=='/fixture/': body,kind=PAGE,'text/html'
            elif route=='/command-center/manager.js': body,kind=manager,'text/javascript'
            else:
                candidate=(ROOT/route.lstrip('/')).resolve()
                allowed=(route.startswith('/command-center/') or route in ['/crm/command-center.js','/crm/outlook-send.js','/crm/outlook-capture.js','/crm/assistant.js'])
                if not allowed or not candidate.is_relative_to(ROOT) or not candidate.is_file() or candidate.suffix!='.js':
                    self.send_error(404);return
                body,kind=candidate.read_bytes(),'text/javascript'
            self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}'
    context=browser.new_context();blocked=[];page=context.new_page();errors=[]
    context.route('**/*',lambda route: route.continue_() if route.request.url.startswith(origin+'/') else (blocked.append(route.request.url.split('?')[0]),route.abort()))
    page.on('pageerror',lambda error:errors.append(str(error)))
    try:
        page.goto(origin+'/fixture/');page.wait_for_function('window.fixtureReady === true')
        outcomes=[]
        for query in QUERIES:
            result=page.evaluate('''async input=>{
              const {query,variant}=input;el('aiQuestion').value=query;el('aiAnswer').textContent='';
              if(variant==='baseline') {
                // Baseline is the real module graph only. Legacy fallback needs the full CRM shell.
                el('aiAnswer').innerHTML=(await TSSCommandCenter.answer(query,state))||'';
              } else {
                // The repaired module must short-circuit the actual submit handler before fallback.
                await handleAssistantSubmit({preventDefault(){},submitter:el('run')});
              }
              return {query,text:el('aiAnswer').innerText,hasDraft:!!el('aiAnswer').querySelector('[data-email-card]'),hasSend:!!el('aiAnswer').querySelector('[data-email-approve]')};
            }''',{'query':query,'variant':variant})
            result['safeHistoricalResponse']=not result['hasDraft'] and not result['hasSend'] and 'no CRM activity was added' in result['text']
            outcomes.append(result)
        draft=page.evaluate('''async ()=>{
          el('aiQuestion').value='Draft an email to Example Company about internal QA testing';
          await handleAssistantSubmit({preventDefault(){},submitter:el('run')});
          return {hasDraft:!!el('aiAnswer').querySelector('[data-email-card]'),hasApproval:!!el('aiAnswer').querySelector('[data-email-approve]'),text:el('aiAnswer').innerText};
        }''')
        checks={'historicalRequestsReturnNoDraft':all(o['safeHistoricalResponse'] for o in outcomes),
                'newDraftStillRequiresApproval':draft['hasDraft'] and draft['hasApproval'],
                'noBackendCall':not page.evaluate('window.unexpectedCalls'),
                'noExternalRequest':not blocked,'noBrowserError':not errors}
        return {'variant':variant,'checks':checks,'historical':outcomes,'draftControls':draft,'browserErrors':errors}
    finally:
        context.close();server.shutdown();server.server_close()

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    results=[exercise(browser,'baseline'),exercise(browser,'patched')]
    version=browser.version;browser.close()
report={'environment':'real frontend modules; patched submit handler on localhost; synthetic data only','chromium':version,'results':results}
(ROOT/'evidence').mkdir(exist_ok=True)
(ROOT/'evidence/chromium-command-routing.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
assert all(results[1]['checks'].values()),'Patched frontend integration check failed'
assert any(o['hasDraft'] for o in results[0]['historical']),'Baseline draft misrouting not reproduced'
