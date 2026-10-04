"""Synthetic, localhost-only acceptance of the actual changed CRM shell.
Only auto-login invocation and the legacy real-ID map are replaced in served
copies. No owner browser, credentials, private data, provider calls or live writes.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit
import json, threading, subprocess, os, re, traceback
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('TSS_TEST_OUTPUT',str(ROOT/'evidence/status-display')));OUT.mkdir(parents=True,exist_ok=True)
BASE='f5cccfb1458583862ec882c0a326f8858cdb33c2'
TABLES=['Companies','Contacts','Tasks','Tickets','Opportunities','Activity','Outreach','Email Activity','System Control','Automation Log','Revenue Tracker','Proposal Tracker','Prospect Queue']
def fixture():
 r={k:[] for k in TABLES};r['Companies']=[{'id':'SYN-1','name':'Synthetic Example','classification':'Canonical','notes':'Original','version':1,'lifecycle':'Company','status':'Active'},{'id':'UNKNOWN','name':'Other synthetic','classification':'','notes':'','version':1}]
 return {'updatedAt':'2026-10-04T11:50:00Z','records':r,'fields':{'Companies':['id','name','classification','notes','version']},'enums':{'Companies':{'classification':['Canonical','Legacy']}}}
def run(browser,variant,width):
 if variant=='baseline':
  path=os.environ.get('TSS_BASELINE_HTML')
  html=Path(path).read_text() if path else subprocess.check_output(['git','show',BASE+':crm/index.html'],cwd=ROOT).decode()
 else:html=(ROOT/'crm/index.html').read_text()
 assert html.count('\nstartLogin();')==1
 html=html.replace('\nstartLogin();','\nwindow.fixtureShellReady=true;')
 html,n=re.subn(r'^const classificationOverlay=.*?;$','const classificationOverlay={"SYN-1":"Legacy"};',html,flags=re.M);assert n==1
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def do_GET(self):
   route=urlsplit(self.path).path
   if route in ['/crm/','/crm/index.html']:data,kind=html.encode(),'text/html'
   else:
    p=(ROOT/route.lstrip('/')).resolve()
    if not(p.is_relative_to(ROOT) and p.is_file() and route.startswith(('/crm/','/command-center/'))):self.send_error(404);return
    data,kind=p.read_bytes(),'text/javascript'
   self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 origin=f'http://127.0.0.1:{server.server_port}';ctx=browser.new_context(viewport={'width':width,'height':1000},timezone_id='Asia/Nicosia',service_workers='block')
 errors=[];blocked=[];status_calls=[];checks={}
 def intercept(route):
  if route.request.url.startswith(origin+'/'):route.continue_();return
  if route.request.url=='https://api.thesmartysolution.com/api/outlook/ingestion/status':
   route.fulfill(status=200,content_type='application/json',body='{"ok":true,"enabled":false,"bound":false,"mailbox":"synthetic@example.test"}');return
  if route.request.url=='https://api.thesmartysolution.com/api/outlook/status':status_calls.append('synthetic');route.fulfill(status=200,content_type='application/json',body='{"ok":true,"connected":false}');return
  blocked.append(route.request.url.split('?')[0]);route.abort()
 ctx.route('**/*',intercept)
 ctx.add_init_script("""{const D=Date,fixed=D.parse('2026-10-04T12:00:00Z');globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}};}""")
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 try:
  page.goto(origin+'/crm/');page.wait_for_function('window.fixtureShellReady && window.TSSCommandCenter')
  page.evaluate('(data)=>{state=data;view="System Health";render();}',fixture())
  text=page.locator('main').inner_text()
  if variant=='baseline':
   checks['reproducedFixedBackup']='Backup\nEnabled' in text
   checks['reproducedHealthy']='Healthy' in text
   page.evaluate('state.updatedAt=null;systemHealth()')
   checks['reproducedMissingTimeCurrent']='API freshness\nCurrent' in page.locator('main').inner_text()
   page.evaluate('outreachView()');checks['reproducedHourly']='Hourly' in page.locator('main').inner_text()
   page.evaluate('(data)=>{window.syntheticSnapshot=data;call=async()=>structuredClone(syntheticSnapshot);}',fixture())
   page.evaluate('refresh()');checks['reproducedCanonicalOverwrite']=page.evaluate('state.records.Companies[0].classification')=='Legacy'
  else:
   checks['notBlank']=len(text)>200;checks['noFixedBackup']='Backup execution\nNot verified' in text
   checks['noBroadHealth']=not set(page.locator('.metric > strong').all_text_contents()) & {'Healthy','Current','Enabled'}
   page.evaluate('stateObservation={source:"api",receivedAt:Date.now()};systemHealth()')
   checks['observedNotHealthy']='API snapshot\nObserved' in page.locator('main').inner_text()
   checks['healthFits']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.screenshot(path=str(OUT/f'health-{width}.png'),full_page=True)
   for label,value in [('absent',None),('invalid','not-a-date'),('future','2026-10-05T12:00:00Z'),('stale','2026-10-04T09:00:00Z')]:
    page.evaluate('(value)=>{state.updatedAt=value;systemHealth()}',value)
    t=page.locator('main').inner_text();checks[label+'TimeSafe']=not set(page.locator('.metric > strong').all_text_contents()) & {'Healthy','Current'} and ('API snapshot\nStale' in t if label=='stale' else 'API snapshot\nNot verified' in t)
   page.evaluate('state.updatedAt="2026-10-04T11:50:00Z";stateObservation={source:"cache",receivedAt:Date.now()};systemHealth()')
   checks['cachedClearlyLabeled']='API snapshot\nCached' in page.locator('main').inner_text()
   page.evaluate('stateObservation={source:"api",receivedAt:Date.now(),refreshFailed:true};systemHealth()')
   checks['failedRefreshPreserved']='Last refresh failed' in page.locator('main').inner_text()
   page.evaluate('go("Outreach")');text=page.locator('main').inner_text()
   checks['outlookUnverified']='Outlook reply processing\nNot verified' in text and 'Hourly' not in text
   checks['outreachFits']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.screenshot(path=str(OUT/f'outreach-{width}.png'),full_page=True)
   page.evaluate('(data)=>{window.syntheticSnapshot=data;window.savedCalls=[];call=async(fn,...args)=>{if(fn==="getState")return structuredClone(syntheticSnapshot);if(fn==="saveRecord"){savedCalls.push({fn,args:structuredClone(args)});Object.assign(syntheticSnapshot.records.Companies.find(r=>r.id===args[1].id),args[1]);return args[1];}throw Error("Unexpected synthetic RPC: "+fn);};}',fixture())
   page.evaluate('refresh()');page.evaluate('refresh()')
   checks['canonicalOnRefresh']=page.evaluate('state.records.Companies[0].classification')=='Canonical'
   page.evaluate('go("Companies");companyFilters.classification="Legacy";drawRecords()')
   checks['filterIgnoresLegacy']=page.evaluate('filtered().length')==0
   page.evaluate('companyFilters.classification="Canonical";drawRecords()')
   checks['filterUsesCanonical']=page.evaluate('filtered().length')==1
   ctxdata=page.evaluate('async()=>{const {CRMAdapter}=await import("/command-center/crm.js");return new CRMAdapter(state).dossier("Synthetic Example");}')
   checks['assistantCanonical']='Canonical' in json.dumps(ctxdata) and 'Legacy' not in json.dumps(ctxdata)
   page.evaluate('edit("Companies","SYN-1")')
   checks['editorCanonical']=page.locator('select[name="classification"]').input_value()=='Canonical'
   page.locator('textarea[name="notes"]').fill('Changed synthetic note')
   page.locator('#recordForm button[type="submit"]').click();page.wait_for_function('savedCalls.length===1 && !busy')
   checks['unchangedClassificationInSave']=page.evaluate('savedCalls[0].args[1].classification')=='Canonical'
   checks['onlyExpectedSyntheticSave']=page.evaluate('savedCalls.length')==1
   page.evaluate('syntheticSnapshot.records.Companies[0].classification="";refresh()')
   page.evaluate('companyDetail("SYN-1")')
   checks['blankHintExplicit']='display only; not verified' in page.locator('#dialog').inner_text()
   checks['blankStateUntouched']=page.evaluate('state.records.Companies[0].classification')==''
   page.screenshot(path=str(OUT/f'classification-{width}.png'),full_page=True)
   page.evaluate('edit("Companies","SYN-1")')
   checks['blankEditorUntouched']=page.locator('select[name="classification"]').input_value()==''
   page.locator('textarea[name="notes"]').fill('Second synthetic note');page.locator('#recordForm button[type="submit"]').click();page.wait_for_function('savedCalls.length===2 && !busy')
   checks['blankSaveUntouched']=page.evaluate('savedCalls[1].args[1].classification')==''
   checks['canonicalCacheSchema']=page.evaluate('JSON.parse(localStorage.getItem(STATE_CACHE_KEY)).schema')==2
   checks['noBrowserErrors']=not errors;checks['noOtherExternalRequests']=not blocked
  return {'variant':variant,'width':width,'checks':checks,'errors':errors,'blocked':blocked,'syntheticStatusCalls':len(status_calls)}
 finally:ctx.close();server.shutdown();server.server_close()
report={'environment':'Isolated actual shell with synthetic state. Not authenticated getState-to-screen acceptance. No provider or native writes.','results':[]}
try:
 with sync_playwright() as p:
  opts={'headless':True}
  if os.environ.get('TSS_CHROMIUM_EXECUTABLE'):opts['executable_path']=os.environ['TSS_CHROMIUM_EXECUTABLE']
  browser=p.chromium.launch(**opts);report['chromium']=browser.version
  for variant,width in [('baseline',1280),('patched',390),('patched',768),('patched',1280)]:report['results'].append(run(browser,variant,width))
  browser.close()
except Exception as e:
 report['error']=str(e);report['traceback']=traceback.format_exc()
finally:
 (OUT/'browser-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
assert 'error' not in report,report.get('error')
assert all(all(r['checks'].values()) for r in report['results']),'Browser assertion failed'
