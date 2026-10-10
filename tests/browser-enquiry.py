"""Actual public form pages on localhost. All non-local traffic is intercepted or blocked."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from contextlib import contextmanager
import json, threading, subprocess, re
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
BASE='39f24dcfdab351821e3a59de3d70f1350137ab1d'
SCRIPT=(ROOT/'script.js').read_text()
ENDPOINT=re.search(r"const TSS_FORM_ENDPOINT = '([^']+)'",SCRIPT)[1]
BASE_FILES={name:subprocess.check_output(['git','show',f'{BASE}:{name}'],cwd=ROOT) for name in ['script.js','anti-spam.js']}
REPORT=[]
ARTIFACTS=ROOT/'evidence/enquiry';ARTIFACTS.mkdir(parents=True,exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args):pass
    def do_GET(self):
        # Only the site's public static files are used in this fixture.
        candidate=(ROOT/urlsplit(self.path).path.lstrip('/')).resolve()
        if not candidate.is_relative_to(ROOT) or candidate.suffix.lower() not in ['.html','.js','.css','.svg','.png','.jpg','.webp','.ico']:
            self.send_error(404);return
        super().do_GET()
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
ORIGIN=f'http://127.0.0.1:{server.server_port}'

@contextmanager
def session(browser,mode='confirmed',variant='patched',path='/contact.html?enquiry=business-growth&source=whatsapp',width=1280):
    context=browser.new_context(viewport={'width':width,'height':1000},service_workers='block')
    context.add_init_script("localStorage.setItem('tss_analytics_consent_v1','rejected')")
    state={'requests':[],'held':[],'errors':[],'mode':mode,'agent':0}
    def route_handler(route):
        request=route.request;url=request.url;parsed=urlsplit(url)
        if url==ENDPOINT:
            assert request.method=='POST'
            state['requests'].append(parse_qs(request.post_data or '',keep_blank_values=True))
            m=state['mode']
            if m=='hold':state['held'].append(route);return
            headers={'access-control-allow-origin':'*','content-type':'application/json'}
            if m=='network':route.abort('failed');return
            if m=='http':route.fulfill(status=503,body='Unavailable',headers=headers);return
            if m=='malformed':route.fulfill(status=200,body='not JSON',headers=headers);return
            if m=='unconfirmed':body={'ok':True}
            elif m=='invalid':body={'ok':False,'code':'INVALID_EMAIL'}
            elif m=='duplicate':body={'ok':False,'code':'DUPLICATE'}
            else:body={'ok':True,'recorded':True,'enquiryId':f'SYNTHETIC-{len(state["requests"])}','confirmationSent':m=='email-confirmed'}
            route.fulfill(status=200,body=json.dumps(body),headers=headers);return
        if parsed.path=='/api/tss-agent':
            state['agent']+=1
            route.fulfill(status=200,body=json.dumps({'reply':'Synthetic local assistant response.'}),headers={'access-control-allow-origin':'*','content-type':'application/json'});return
        if url.startswith(ORIGIN+'/'):
            name=parsed.path.lstrip('/')
            if variant=='baseline' and name in BASE_FILES:
                route.fulfill(status=200,body=BASE_FILES[name],content_type='application/javascript');return
            route.continue_();return
        # Fonts, analytics and all other external destinations never leave the test.
        route.abort('blockedbyclient')
    context.route('**/*',route_handler)
    page=context.new_page();page.on('pageerror',lambda e:state['errors'].append(str(e)))
    page.clock.install();page.goto(ORIGIN+path,wait_until='domcontentloaded')
    page.wait_for_function("typeof window.TSSAntiSpam === 'object' && typeof submitTssEnquiry_ === 'function'")
    page.evaluate("window.syntheticEvents=[];window.tssTrackEvent_=(name,data)=>syntheticEvents.push({name,data})")
    try:yield page,state
    finally:context.close()

FILL=r'''selector=>{
 const f=document.querySelector(selector);
 for(const el of f.querySelectorAll('input,select,textarea')) {
  if(el.disabled || el.type==='hidden' || el.name==='website' || el.name==='marketing_consent')continue;
  if(el.tagName==='SELECT') {
   if(!el.value){const option=[...el.options].find(o=>o.value&&!o.disabled&&!o.hidden);if(option)option.selected=true;}
   el.dispatchEvent(new Event('change',{bubbles:true}));
  }else if(el.type==='checkbox')el.checked=true;
  else if(el.name==='email')el.value='synthetic@example.invalid';
  else if(el.name==='phone')el.value='+357 99 000000';
  else if(el.name==='company_website')el.value='';
  else if(el.name==='name')el.value='Synthetic Visitor';
  else if(el.name==='company')el.value='Synthetic Test Only';
  else if(el.name==='country')el.value='Cyprus';
  else if(el.required || el.name==='message')el.value='Synthetic business objective and enquiry context for isolated testing.';
 }
 return f.checkValidity();
}'''
def fill(page,selector='form[data-tss-form="contact"]'):
    assert page.evaluate(FILL,selector),'Fixture did not meet unchanged form validation'
    page.clock.fast_forward(4000)

def submit(page,selector='form[data-tss-form="contact"]',times=1):
    page.evaluate("({selector,times})=>{const f=document.querySelector(selector);for(let n=0;n<times;n++)f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}",{'selector':selector,'times':times})

def nonce(page,selector='form[data-tss-form="contact"]'):
    return page.locator(selector+' input[name="form_nonce"]').input_value()

def check(label,fn):
    fn();REPORT.append({'test':label,'result':'passed'});print('PASS '+label,flush=True)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    try:
        def baseline_double():
            with session(browser,'hold','baseline') as (page,s):
                fill(page);submit(page,times=2)
                page.wait_for_timeout(150)
                assert len(s['requests'])==2, 'Original concurrent-submit problem not reproduced'
        check('baseline reproduces two concurrent submissions',baseline_double)
        def baseline_nonce():
            with session(browser,'unconfirmed','baseline') as (page,s):
                fill(page);before=nonce(page);submit(page)
                expect(page.locator('[data-tss-form-status]')).to_have_attribute('data-state','processing')
                assert nonce(page)!=before, 'Original proof rotation not reproduced'
        check('baseline rotates proof after uncertain receipt',baseline_nonce)
        for route in ['business-growth','market-entry','strategic-connections','opportunity-development','business-systems','commercial-review','kiti']:
            def route_test(route=route):
                path='/contact.html?enquiry='+route+'&source=whatsapp'
                with session(browser,path=path) as (page,s):
                    assert page.locator('#interest').evaluate('(e)=>e.selectedOptions[0].dataset.route')==route
                    fill(page);before=nonce(page);submit(page)
                    expect(page.locator('[data-tss-form-status]')).to_have_attribute('data-state','success')
                    assert len(s['requests'])==1
                    payload=s['requests'][0];assert payload['source']==[ORIGIN+path]
                    assert payload['form_nonce']==[before];assert payload['website']==['']
                    assert payload['message'][0].startswith('Service route: ')
                    assert 'Synthetic' in payload['message'][0]
                    assert page.locator('#name').input_value()==''
                    assert nonce(page)!=before
                    assert 'email has been sent' not in page.locator('[data-tss-form-status]').inner_text()
                    received=page.evaluate("syntheticEvents.filter(e=>e.name==='enquiry_received')")
                    assert len(received)==1 and set(received[0]['data'])=={'page_path','service_route'}
                    assert not s['errors'],s['errors']
            check('route, structured payload and direct WhatsApp attribution: '+route,route_test)
        def double_and_timeout():
            with session(browser,'hold') as (page,s):
                fill(page);before=nonce(page);submit(page,times=2);page.wait_for_timeout(100)
                assert len(s['requests'])==1
                assert page.locator('#name').is_disabled()
                page.clock.fast_forward(45001)
                expect(page.locator('[data-tss-form-status]')).to_have_attribute('data-state','processing')
                assert not page.locator('#name').is_disabled()
                assert page.locator('#name').input_value()=='Synthetic Visitor'
                assert nonce(page)==before
                assert page.locator('form[data-tss-form="contact"] button[type="submit"]').is_disabled()
                page.clock.fast_forward(61000);submit(page,times=2);page.wait_for_timeout(100)
                assert len(s['requests'])==1 and nonce(page)==before
                assert page.evaluate("syntheticEvents.filter(e=>e.name==='enquiry_received').length")==0
                assert not s['errors'],s['errors']
        check('concurrent clicks and timeout cannot resend or erase data',double_and_timeout)
        for mode in ['network','http','malformed','unconfirmed','duplicate']:
            def uncertain(mode=mode):
                with session(browser,mode) as (page,s):
                    fill(page);before=nonce(page);submit(page)
                    expect(page.locator('form[data-tss-form="contact"]')).to_have_attribute('data-tss-submission-state','processing')
                    assert nonce(page)==before and page.locator('#name').input_value()=='Synthetic Visitor'
                    assert page.locator('form[data-tss-form="contact"] button[type="submit"]').is_disabled()
                    assert page.locator('[data-tss-form-status]').get_attribute('data-state')!='success'
                    assert not s['errors'],s['errors']
            check('uncertain/duplicate outcome retained without retry: '+mode,uncertain)
        def actionable_rejection():
            with session(browser,'invalid') as (page,s):
                fill(page);before=nonce(page);submit(page)
                expect(page.locator('[data-tss-form-status]')).to_have_attribute('data-state','error')
                assert not page.locator('form[data-tss-form="contact"] button[type="submit"]').is_disabled()
                assert nonce(page)==before
                s['mode']='confirmed';submit(page)
                expect(page.locator('[data-tss-form-status]')).to_have_attribute('data-state','success')
                assert len(s['requests'])==2
        check('explicit validation rejection permits corrected retry',actionable_rejection)
        def offline():
            with session(browser) as (page,s):
                fill(page);page.evaluate("Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true})")
                submit(page)
                expect(page.locator('[data-tss-form-status]')).to_contain_text('offline')
                assert not s['requests'] and page.locator('#name').input_value()=='Synthetic Visitor'
        check('offline before dispatch keeps data and makes no POST',offline)
        def validation():
            with session(browser) as (page,s):
                page.clock.fast_forward(4000);submit(page);page.wait_for_timeout(100);assert not s['requests']
                fill(page);page.locator('[name="privacy_ack"]').uncheck();submit(page);page.wait_for_timeout(100);assert not s['requests']
        check('required fields and privacy acknowledgement cannot be bypassed',validation)
        def antispam():
            with session(browser) as (page,s):
                assert page.evaluate(FILL,'form[data-tss-form="contact"]');submit(page)
                expect(page.locator('[data-tss-form-status]')).to_contain_text('take a moment')
                assert not s['requests'];page.clock.fast_forward(4000)
                page.locator('input[name="website"]').evaluate("e=>e.value='spam'");submit(page)
                expect(page.locator('[data-tss-form-status]')).to_contain_text('could not verify');assert not s['requests']
        check('minimum fill time and honeypot remain enforced',antispam)
        def second_enquiry():
            with session(browser) as (page,s):
                fill(page);submit(page);expect(page.locator('[data-tss-form-status]')).to_have_attribute('data-state','success')
                first=s['requests'][0]['form_nonce'];page.clock.fast_forward(61000)
                fill(page);page.locator('#message').fill('A separate legitimate synthetic enquiry, not a retry.');submit(page)
                expect(page.locator('[data-tss-form-status]')).to_contain_text('SYNTHETIC-2')
                assert len(s['requests'])==2 and s['requests'][1]['form_nonce']!=first
        check('distinct enquiry after confirmed receipt and cooldown still works',second_enquiry)
        def route_switch():
            with session(browser) as (page,s):
                page.locator('#growth-challenge').fill('Old route only')
                page.locator('#interest').select_option(label="I'm not sure which applies");fill(page);submit(page)
                expect(page.locator('[data-tss-form-status]')).to_have_attribute('data-state','success')
                assert 'growth_challenge' not in s['requests'][0]
                assert 'Old route only' not in s['requests'][0]['message'][0]
        check('switching route excludes inactive fields from the payload',route_switch)
        def kiti():
            with session(browser,path='/kiti-enquiry.html?source=whatsapp') as (page,s):
                # Old Kiti URL now forwards visitors to ONE Kiti-preselected contact form.
                page.wait_for_url('**/contact.html?enquiry=kiti')
                assert page.locator('#interest').evaluate('(e)=>e.selectedOptions[0].dataset.route')=='kiti'
                assert page.locator('form[data-tss-form="kiti"]').count()==0
                selector='form[data-tss-form="contact"]'
                fill(page,selector)
                submit(page,selector)
                expect(page.locator('[data-tss-form-status]')).to_have_attribute('data-state','success')
                assert len(s['requests'])==1
                payload=s['requests'][0]
                assert 'Service route: Kiti Residential Development Opportunity' in payload['message'][0]
                assert 'Kiti Residential Development Opportunity' in payload['message'][0]
                assert payload['source']==[ORIGIN+'/contact.html?enquiry=kiti']
                assert payload['phone']==['+357 99 000000']
                assert not s['errors'],s['errors']
        check('old Kiti URL redirects into one Kiti-preselected protected form',kiti)
        for width in [390,768,1280]:
            def layout(width=width):
                with session(browser,'unconfirmed',width=width) as (page,s):
                    fill(page);submit(page)
                    expect(page.locator('[data-tss-form-status]')).to_have_attribute('data-state','processing')
                    page.locator('[data-tss-form-status]').scroll_into_view_if_needed()
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
                    page.screenshot(path=str(ARTIFACTS/f'contact-{width}.png'),full_page=True)
                    assert not s['errors'],s['errors']
            check('responsive uncertain-state layout '+str(width),layout)
        def assistant():
            with session(browser,'hold',width=768) as (page,s):
                page.locator('.tss-agent-launch').click()
                for message in ['Synthetic question one','Synthetic question two']:
                    page.locator('.tss-agent-input').fill(message)
                    page.locator('.tss-agent-form').evaluate("f=>f.requestSubmit()")
                    expect(page.locator('.tss-agent-input')).to_be_enabled()
                page.locator('.tss-lead-link').click();selector='form[data-tss-form="assistant"]'
                fill(page,selector);before=nonce(page,selector);submit(page,selector,2);page.wait_for_timeout(100)
                assert len(s['requests'])==1 and s['agent']==2
                assert 'Qualified lead' not in s['requests'][0]['message'][0]
                page.clock.fast_forward(45001)
                expect(page.locator(selector)).to_have_attribute('data-tss-submission-state','processing')
                assert nonce(page,selector)==before
                assert page.locator(selector+' input[name="name"]').input_value()=='Synthetic Visitor'
                assert not s['errors'],s['errors']
        check('dynamic assistant enquiry uses the same protected transport',assistant)
    finally:
        browser.close();server.shutdown();server.server_close()
        (ARTIFACTS/'results.json').write_text(json.dumps({'scope':'isolated browser, actual static pages, mocked responses only','checks':REPORT},indent=2)+'\n')
print(f'Browser checks passed: {len(REPORT)}')
