"""Isolated Chromium DOM/picker tests, not live CRM acceptance.
This runtime blocks all URL navigation. The actual modules are evaluated in an
about:blank DOM after removing ESM declarations. A Python SHA-256 adapter replaces
WebCrypto only because about:blank is not a secure context. API fetch is synthetic.
No admin/browser security policy is disabled, and no live network request is made.
"""
import json, hashlib, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'test-results/pdf-browser'
OUT.mkdir(parents=True,exist_ok=True)
PDF=b'%PDF-1.4\n% synthetic browser fixture\n%%EOF\n';NAME='Internal_QA_v1.pdf'
styles='body{font:16px system-ui;margin:20px;max-width:700px}button{font:inherit;padding:10px;margin:5px 0}input{font:inherit}li{overflow-wrap:anywhere}section{border:1px solid;padding:12px}label{display:block}input[type=text]{display:block;width:100%}p{line-height:1.5}button:disabled{opacity:.5}'
source='\n'.join((ROOT/f).read_text() for f in ['command-center/email-attachment.js','command-center/email-signature.js','crm/outlook-send.js'])
source=re.sub(r'^import .*?;\s*$', '',source,flags=re.M)
source=re.sub(r'^export ', '',source,flags=re.M)
harness=r'''
window.requests=[];window.testMode='ok';window.session='synthetic-session';
window.fetch=async (url,options)=>{
 const body=JSON.parse(options.body);window.requests.push({url,body});
 if(url.endsWith('/propose')){
  const p={id:'synthetic-proposal',hash:'synthetic-hash',from:'info@thesmartysolution.com',companyId:'COM-8ee64d5e',expiresAt:'2099-01-01T00:00:00Z',...body.message,...(body.attachment?{attachment:body.attachment}:{})};
  if(testMode==='tamper')document.querySelector('[data-email-subject]').textContent='Changed after approval';
  if(testMode==='remove')removePdfAttachment(document.querySelector('[data-email-card]'));
  if(testMode==='replace')await selectPdfAttachment({card:document.querySelector('[data-email-card]'),files:[new File(['%PDF-other'],'Different.pdf',{type:'application/pdf'})]});
  return {ok:true,json:async()=>({ok:true,proposal:p})};
 }
 return {ok:true,json:async()=>({ok:true,status:'succeeded',companyId:'COM-8ee64d5e',receipt:{reconciled:true,sentDateTime:'2026-10-05T09:00:00Z',attachmentVerification:{level:'metadata'}}})};
};
window.resetFixture=()=>{
 outcomes.clear();window.requests=[];window.testMode='ok';
 document.querySelector('#fixture').innerHTML=renderEmailDraft({channel:'email',approvalReady:true,from:'info@thesmartysolution.com',to:'thesmartysolution@gmail.com',subject:'Internal PDF QA',text:'Hello,\n\nThis is a harmless internal attachment acceptance fixture. Nothing is sent by selecting a file.'});
};
bindOutlookApprovals({session:()=>window.session});resetFixture();
'''
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for label,width,height,mobile in [('desktop',1280,1000,False),('tablet',820,1180,True),('mobile',390,844,True)]:
  context=browser.new_context(viewport={'width':width,'height':height},is_mobile=mobile,has_touch=mobile)
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  # No page.goto: keep the admin navigation policy intact.
  page.set_content('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles+'</style></head><body><main id="fixture"></main></body></html>')
  page.expose_function('testSha256',lambda b:list(hashlib.sha256(bytes(b)).digest()))
  page.evaluate("Object.defineProperty(window.crypto,'subtle',{value:{digest:async(algorithm,buffer)=>{if(algorithm!=='SHA-256')throw Error('Unexpected algorithm');return new Uint8Array(await window.testSha256(Array.from(new Uint8Array(buffer)))).buffer;}}})")
  page.evaluate('(()=>{'+source+'\n'+harness+'})()')
  def requests():return page.evaluate('window.requests')
  def choose(buffer=PDF,mime='application/pdf',name=NAME):
   with page.expect_file_chooser() as chooser:page.locator('[data-email-attach]').click()
   chooser.value.set_files({'name':name,'mimeType':mime,'buffer':buffer})
  def fresh():page.evaluate('window.resetFixture()')
  choose();page.wait_for_function("document.querySelector('[data-email-attachment-name]').textContent==='Internal_QA_v1.pdf'")
  assert requests()==[],'Selection must not make any API call'
  assert page.locator('[data-email-attachment-size]').inner_text().endswith(f'{len(PDF)} bytes')
  assert page.locator('[data-email-remove]').is_visible();assert not page.locator('[data-email-file]').get_attribute('multiple')
  assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'Horizontal overflow'
  page.screenshot(path=str(OUT/f'{label}-approval-card.png'),full_page=True)
  results.append({'test':label+' normal picker, visible PDF before approval, no selection send, no overflow','passed':True})
  page.locator('[data-email-approve]').click();page.wait_for_function("document.querySelector('[data-email-approve]').textContent==='Sent'")
  req=requests();assert len(req)==2;assert 'contentBytes' not in req[0]['body']['attachment'];assert req[0]['body']['attachment']['sha256']==hashlib.sha256(PDF).hexdigest();assert req[1]['body']['attachment']['contentBytes']
  assert page.locator('[data-email-approve]').is_disabled();page.evaluate("document.querySelector('[data-email-approve]').click()");assert len(requests())==2
  results.append({'test':label+' explicit approval, exact digest, bytes only at approve, repeat click blocked','passed':True})
  fresh();choose();page.wait_for_function("document.querySelector('[data-email-attachment-name]').textContent==='Internal_QA_v1.pdf'")
  page.locator('[data-email-remove]').click();assert page.locator('[data-email-attachment-info]').is_hidden()
  page.locator('[data-email-approve]').click();page.wait_for_function("document.querySelector('[data-email-approve]').textContent==='Sent'")
  assert all('attachment' not in r['body'] for r in requests());results.append({'test':label+' remove permits text-only path','passed':True})
  for mutation in ['tamper','remove','replace']:
   fresh();choose();page.wait_for_function("document.querySelector('[data-email-attachment-name]').textContent==='Internal_QA_v1.pdf'")
   page.evaluate('(value)=>window.testMode=value',mutation);page.locator('[data-email-approve]').click();page.wait_for_function("document.querySelector('[data-email-status]').textContent.startsWith('Not sent.')")
   req=requests();assert len(req)==1 and req[0]['url'].endswith('/propose'),mutation;assert not page.locator('[data-email-approve]').is_disabled()
   results.append({'test':label+' '+mutation+' after proposal prevents dispatch','passed':True})
  for bad,kind,name in [(b'not pdf','application/pdf','Fake.pdf'),(b'','application/pdf','Empty.pdf'),(PDF,'image/png','Wrong.pdf'),(b'%PDF-'+b' '*2000000,'application/pdf','Big.pdf')]:
   fresh();choose(bad,kind,name);page.wait_for_function("document.querySelector('[data-email-attachment-status]').textContent.startsWith('Not sent.')");assert not requests();assert page.locator('[data-email-approve]').is_disabled();page.locator('[data-email-remove]').click();assert not page.locator('[data-email-approve]').is_disabled()
  results.append({'test':label+' invalid/empty/non-PDF/oversized local rejection and recovery','passed':True})
  assert not errors,errors;results.append({'test':label+' no page errors','passed':True});context.close()
 browser.close()
report={'suite':'isolated-browser-DOM','passed':len(results),'failed':0,'limitations':['No browser URL navigation permitted by runtime administrator policy.','ESM declarations removed for about:blank execution; actual dependency and composer function bodies retained.','SHA-256 adapter used because about:blank lacks secure-context WebCrypto.','Synthetic API responses only; no live CRM, Graph, mailbox, authentication, or device acceptance.'],'results':results}
(OUT/'results.json').write_text(json.dumps(report,indent=2));print(json.dumps({'passed':len(results),'failed':0,'evidence':str(OUT),'mode':'DOM/picker only; not live acceptance'}))
