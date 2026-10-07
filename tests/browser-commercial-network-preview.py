"""Commercial Network DEV2 read-only browser acceptance with an isolated projected state."""
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from urllib.parse import urlsplit
import json,threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence'/'commercial-network-preview';OUT.mkdir(parents=True,exist_ok=True)
projection={
 'roles':[],'signals':[],
 'commercialOpportunities':[{'id':'COP-READ-001','title':'Read Projection Acceptance Opportunity','opportunityType':'Land / Development','status':'Accepted','developmentStage':'Targeting','internalSummary':'Authenticated read acceptance record.','geographyCountry':'Cyprus','geographyRegion':'Larnaca District','geographyLocality':'Read Fixture','sector':'Residential Development','commercialStructure':'Other / To Be Defined','owner':'TSS QA','informationClass':'TSS Restricted Intelligence','publicationStatus':'Not Published','publicTitle':'Read Projection Opportunity','publicSummary':'Public-safe acceptance projection.','publicGeography':'Larnaca District, Cyprus','publicOpportunityType':'Residential Development','publicStructure':'To Be Defined','publicCTA':'Express Interest','keyDocumentRefs':[]}],
 'mandates':[{'id':'MAN-READ-001','commercialOpportunityId':'COP-READ-001','title':'Read acceptance mandate','status':'Active','criteriaJson':json.dumps([{'label':'Developer capability evidenced','type':'Mandatory','result':'Supported'},{'label':'Current commercial appetite','type':'Informational','result':'Unknown'}]),'authorityResearch':'Granted','authorityOutreach':'Not Granted','authorityDisclosure':'Conditional','authorityIntroduction':'Not Granted','authorityRepresentation':'Not Granted','authorityNegotiation':'Not Granted','authorityBinding':'Not Granted','maxDisclosureLevel':'D1 Anonymous Teaser','restrictions':'No external action','legalProfessionalRoute':'Review Required','owner':'TSS QA','informationClass':'TSS Restricted Intelligence'}],
 'matches':[{'id':'MAT-READ-001','mandateId':'MAN-READ-001','companyId':'COM-READ-001','qualificationState':'Under Qualification','engagementState':'Not Contacted','mandatoryCriteriaResult':'Supported','criteriaEvidenceJson':json.dumps({'Developer capability':'Supported','Current appetite':'Unknown'}),'gaps':'Current appetite unknown · capacity unknown','nextAction':'Review evidence gaps'}],
 'partnerRelationships':[],'coverage':{'Mandates':{'active':1},'Matches':{'active':1}},'enums':{},'permissions':{'canRead':True,'externalCommunication':False},'updatedAt':'2026-10-07T07:00:00+03:00'
}
inject="networkState="+json.dumps(projection,separators=(',',':'))+";renderOpportunityChooser();window.cnWorkspaceReady=true;"
class H(BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  route=urlsplit(self.path).path
  if route=='/crm/commercial-network-preview.html':
   b=(ROOT/'crm'/'commercial-network-preview.html').read_bytes();ctype='text/html'
  elif route=='/crm/commercial-network-preview.js':
   src=(ROOT/'crm'/'commercial-network-preview.js').read_text()
   assert src.count('init();')==1
   b=src.replace('init();',inject).encode();ctype='text/javascript'
  else:self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',ctype);self.end_headers();self.wfile.write(b)

server=ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}';results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 for label,w,h in [('desktop',1280,900),('tablet',768,1000),('mobile',390,844)]:
  c=browser.new_context(viewport={'width':w,'height':h},timezone_id='Asia/Nicosia',service_workers='block');errors=[];blocked=[]
  def route_request(route):
   if route.request.url.startswith(origin+'/'):route.continue_()
   else:blocked.append(route.request.url);route.abort()
  c.route('**/*',route_request);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(origin+'/crm/commercial-network-preview.html');page.wait_for_function('window.cnWorkspaceReady===true')
  checks={'banner':page.locator('.preview-badge').inner_text()=='DEV2 · AUTHENTICATED READ · READ ONLY','projection':page.locator('#opportunityTitle').inner_text()=='Read Projection Acceptance Opportunity','phase':page.locator('.status-card').filter(has_text='Operating Phase').locator('strong').inner_text()=='LOAD','blocked':'Outreach blocked' in page.locator('#attentionBanner').inner_text(),'disabled':page.get_by_role('button',name='Prepare Communication').is_disabled(),'tabs':page.locator('[role="tab"]').count()==7,'overflow':page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'network':not blocked,'errors':not errors}
  page.get_by_role('tab',name='Matches').click();t=page.locator('#workspacePanel').inner_text().lower();checks.update({'unknown':'current appetite unknown' in t,'qualification':'under qualification' in t,'engagement':'not contacted' in t,'company':'com-read-001' in t})
  page.get_by_role('tab',name='Activity').click();checks['activityBoundary']='not included in the current Commercial Network read projection' in page.locator('#workspacePanel').inner_text()
  page.get_by_role('tab',name='Public Presentation').click();checks['publication']='Public-safe does not mean published' in page.locator('#workspacePanel').inner_text()
  page.screenshot(path=str(OUT/f'{label}.png'),full_page=True);results.append({'label':label,'checks':checks,'blocked':blocked,'errors':errors});c.close()
 version=browser.version;browser.close()
server.shutdown();server.server_close()
report={'environment':'isolated DEV2 projection rendering; no authentication transport and no external requests','chromium':version,'results':results}
(OUT/'results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
assert all(all(r['checks'].values()) for r in results)
