"""Actual CRM rendering with synthetic state on localhost. Never authenticates or calls TSS.
Only the auto-login invocation is disabled in the served test copy, for both variants.
Provider status requests are intercepted with a synthetic response. All other external
requests are blocked. This tests calculations/rendering, not authentication or writes.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from urllib.parse import urlsplit
import json,threading,subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE='0df9299453fb0c407d71df3b09c992782788285e'
OUT=ROOT/'evidence/dashboard';OUT.mkdir(parents=True,exist_ok=True)
TABLES=['Companies','Contacts','Tasks','Tickets','Opportunities','Activity','Outreach','Email Activity','System Control','Automation Log','Revenue Tracker','Proposal Tracker','Prospect Queue']
def fixture():
 r={k:[] for k in TABLES}
 r['Companies']=[{'id':'c','name':'Synthetic Example Ltd','status':'Active','lifecycle':'Company','followUp':'2026-10-03'}, {'id':'q','name':'TSS INTERNAL QA Fixture','status':'Active','classification':'Internal QA'}]
 r['Tasks']=[{'id':i,'name':'Synthetic '+i,'companyId':'q' if i=='qa' else 'c','status':s,'dueDate':d} for i,s,d in [('iso','Open','2026-10-03'),('serial','Open',46289),('today','Open','2026-10-03T21:30:00Z'),('blank','Open',''),('invalid','Open','2026-02-30'),('new','New','2026-10-03'),('done','Done','2026-10-03'),('cancelled','Cancelled','2026-10-03'),('qa','Open','2026-10-03')]]
 r['Opportunities']=[{'id':'o','companyId':'c','name':'Synthetic opportunity','stage':'Discovery','followUp':'2026-10-03','nextAction':'Review'}]
 r['Tickets']=[{'id':'ticket','companyId':'c','name':'Synthetic ticket','status':'New','dueDate':'2026-10-04'}]
 return {'updatedAt':'2026-10-04T12:00:00Z','aiEnabled':False,'records':r,'enums':{},'fields':{},'coverage':{k:{'available':True,'complete':True,'total':len(v)+(1 if k=='Tasks' else 0)} for k,v in r.items()}}

def run(browser,variant,zone,width):
 files={}
 if variant=='baseline':
  for p in ['crm/index.html','crm/assistant.js','crm/command-center.js','command-center/crm.js']:
   files['/'+p]=subprocess.check_output(['git','show',f'{BASE}:{p}'],cwd=ROOT)
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def do_GET(self):
   route=urlsplit(self.path).path
   if route=='/crm/':route='/crm/index.html'
   p=(ROOT/route.lstrip('/')).resolve()
   if not (p.is_relative_to(ROOT) and p.is_file() and route.startswith(('/crm/','/command-center/'))):self.send_error(404);return
   b=files.get(route,p.read_bytes())
   if route=='/crm/index.html':
    assert b.count(b'\nstartLogin();')==1
    b=b.replace(b'\nstartLogin();',b'\nwindow.fixtureShellReady=true;')
   self.send_response(200);self.send_header('Content-Type','text/html' if p.suffix=='.html' else 'text/javascript');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(b)
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 origin=f'http://127.0.0.1:{server.server_port}'
 context=browser.new_context(timezone_id=zone,viewport={'width':width,'height':1000},service_workers='block')
 intercepted=[];forbidden=[];errors=[]
 def route_request(route):
  u=route.request.url
  if u.startswith(origin+'/'):route.continue_();return
  if u=='https://api.thesmartysolution.com/api/outlook/ingestion/status':
   route.fulfill(status=200,content_type='application/json',body='{"ok":true,"enabled":false,"bound":false,"mailbox":"synthetic@example.test"}');return
  if u=='https://api.thesmartysolution.com/api/outlook/status':
   intercepted.append('synthetic Outlook status');route.fulfill(status=200,content_type='application/json',body='{"ok":true,"connected":false}');return
  forbidden.append(u.split('?')[0]);route.abort()
 context.route('**/*',route_request)
 context.add_init_script("""{const NativeDate=Date;const fixed=Date.parse('2026-10-04T12:00:00Z');globalThis.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}};}""")
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 try:
  page.goto(origin+'/crm/');page.wait_for_function('window.fixtureShellReady && window.TSSCommandCenter')
  data=fixture();page.evaluate('(data)=>{state=data;view="Management";render();}',data)
  metric=lambda label:page.locator('.metric').filter(has=page.locator('span',has_text=label)).locator('strong').first.inner_text()
  # Exact label lookup avoids a similarly named metric.
  metrics=page.evaluate("Object.fromEntries([...document.querySelectorAll('.metric')].map(e=>[e.querySelector('span').textContent,e.querySelector('strong').textContent]))")
  management_width=page.evaluate('document.documentElement.scrollWidth')
  checks={'managementOpen':metrics.get('Open tasks')=='6','managementOverdue':metrics.get('Overdue tasks')=='3'}
  if variant=='patched':
   checks['managementNoHorizontalOverflow']=management_width<=width
   text=page.locator('main').inner_text();checks['qaSeparate']='Internal QA included: 1 Open / 1 overdue' in text
   checks['undatedVisible']='1 Open without a due date' in text;checks['invalidAndStatusReview']='1 Open task date(s), 1 unrecognized task status(es)' in text
   checks['partialCoverageHonest']='complete task coverage is not confirmed' in text
   page.screenshot(path=str(OUT/f'dashboard-{width}.png'),full_page=True)
  page.evaluate('go("Reports")');reports=page.evaluate("Object.fromEntries([...document.querySelectorAll('.metric')].map(e=>[e.querySelector('span').textContent,e.querySelector('strong').textContent]))")
  checks['reportsOverdue']=reports.get('Overdue tasks')=='3'
  if variant=='patched':checks['reportsNoHorizontalOverflow']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.evaluate('go("Today")');today=page.evaluate("Object.fromEntries([...document.querySelectorAll('.metric')].map(e=>[e.querySelector('span').textContent,e.querySelector('strong').textContent]))")
  checks['todayAllRecordTotal']=today.get('Overdue records')=='5';checks['todayTimestampAndTicket']=today.get('Records due today')=='2'
  if variant=='patched':
   checks['entityBreakdown']='Tasks: 3 · Tickets: 0 · Companies: 1 · Opportunities: 1' in page.locator('[data-action-metric-note]').inner_text()
   page.locator('button.metric').filter(has_text='Overdue records').click()
   checks['overdueCardOpensActualPopulation']=page.locator('#dialog .record').count()==5
   page.locator('#dialog button[aria-label="Close"]').click()
   result=page.evaluate("async()=>{const {CRMAdapter}=await import('/command-center/crm.js');return new CRMAdapter(state).attention(new Date());}")
   checks['assistantTaskParity']=result['taskSummary']['open']==6 and result['taskSummary']['overdue']==3
   checks['assistantOverdueParity']=len([x for x in result['items'] if x['kind']=='overdue'])==5
   week=page.evaluate("localDuePeriodAnswer('this week')")
   checks['SundayWeekBoundary']='2026-10-04 to 2026-10-04' in week or 'between 2026-10-04 and 2026-10-04' in week
   checks['layoutNoHorizontalOverflow']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  checks['recordsUnchanged']=page.evaluate('JSON.stringify(state.records)')==json.dumps(data['records'],ensure_ascii=False,separators=(',',':'))
  checks['noBrowserErrors']=not errors;checks['noOtherExternalRequests']=not forbidden
  return {'variant':variant,'timezone':zone,'width':width,'managementScrollWidth':management_width,'checks':checks,'management':metrics,'today':today,'errors':errors,'blocked':forbidden,'syntheticStatusRequests':len(intercepted)}
 finally:context.close();server.shutdown();server.server_close()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 results=[run(browser,'baseline','Asia/Nicosia',1280),run(browser,'baseline','Asia/Nicosia',390)]+[run(browser,'patched',z,w) for z,w in [('Asia/Nicosia',1280),('America/Los_Angeles',768),('Pacific/Kiritimati',390)]]
 version=browser.version;browser.close()
report={'environment':'Actual shell/read modules; synthetic state; intercepted status; no authentication or live writes','chromium':version,'results':results}
(OUT/'browser-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
assert not results[0]['checks']['managementOpen'] and not results[0]['checks']['managementOverdue'],'Baseline faults not reproduced'
assert next(r for r in results if r['variant']=='baseline' and r['width']==390)['managementScrollWidth']>390,'Baseline mobile overflow not reproduced'
assert all(all(r['checks'].values()) for r in results if r['variant']=='patched'),'Patched dashboard browser check failed'
