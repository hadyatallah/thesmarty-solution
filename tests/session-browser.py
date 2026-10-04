"""Real candidate shell/cookie handlers with an isolated synthetic native authority.
All app/API/Google requests are intercepted. No TSS/Google/Microsoft endpoint is contacted.
Actual browser cookie flags are checked, but their VALUES are never written to evidence.
"""
from pathlib import Path
import json,subprocess,urllib.request
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'evidence/session';OUT.mkdir(parents=True,exist_ok=True)
APP='https://www.thesmartysolution.com';API='https://api.thesmartysolution.com'
proc=subprocess.Popen(['node','tests/session-fixture-server.mjs'],cwd=ROOT,stdout=subprocess.PIPE,text=True)
port=json.loads(proc.stdout.readline())['port'];LOCAL=f'http://127.0.0.1:{port}'
def fixture(path,data):
 with urllib.request.urlopen(urllib.request.Request(LOCAL+path,data=json.dumps(data).encode(),headers={'Content-Type':'application/json'}),timeout=10) as r:return json.load(r)
STUB=r'''window.google={accounts:{id:{initialize(o){window.googleOptions=o;},renderButton(el){el.innerHTML='<button id="syntheticSignIn">Synthetic sign in</button>';el.firstElementChild.onclick=()=>{
 const c={iss:'https://accounts.google.com',aud:'103840050410-80lukup1okjnkmt6qvmd9s2mbvi3uakf.apps.googleusercontent.com',email:'thesmartysolution@gmail.com',email_verified:true,sub:'synthetic-owner',nonce:window.googleOptions.nonce,exp:Math.floor(Date.now()/1000)+3600};
 const credential='synthetic-header.'+btoa(JSON.stringify(c)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')+'.synthetic-signature';window.googleOptions.callback({credential});};},disableAutoSelect(){}}}};'''
results=[];contexts=[]
def context(browser,width=768,state=None,pwa=False):
 ctx=browser.new_context(viewport={'width':width,'height':960},storage_state=state);contexts.append(ctx)
 ctx.add_init_script(STUB)
 if pwa:ctx.add_init_script("const old=matchMedia;window.matchMedia=q=>q==='(display-mode: standalone)'?{matches:true}:old(q);")
 external=[];errors=[]
 def route(r):
  u=urlsplit(r.request.url)
  if r.request.url.startswith(APP+'/'):
   path=u.path
   if path=='/crm/':path='/crm/index.html'
   file=(ROOT/path.lstrip('/')).resolve()
   if file.is_relative_to(ROOT) and file.is_file() and (path.startswith('/crm/') or path.startswith('/command-center/')):
    body=file.read_bytes();kind='text/html' if file.suffix=='.html' else 'text/javascript' if file.suffix=='.js' else 'application/json'
    r.fulfill(status=200,body=body,content_type=kind);return
   r.fulfill(status=404,body='Synthetic fixture only');return
  if r.request.url.startswith(API+'/api/crm-session'):
   hdr=r.request.all_headers();hdr['host']='api.thesmartysolution.com'
   output=fixture('/dispatch',{'method':r.request.method,'headers':hdr,'body':r.request.post_data})
   headers={k:('\n'.join(v) if isinstance(v,list) else str(v)) for k,v in output['headers'].items()};headers['content-type']='application/json'
   r.fulfill(status=output['status'],body=json.dumps(output['value']),headers=headers);return
  if r.request.url.startswith('https://script.google.com/macros/s/'):
   data=json.loads(r.request.post_data or '{}');output=fixture('/native',data)
   r.fulfill(status=200,body=json.dumps(output['value']),headers={'Content-Type':'application/json','Access-Control-Allow-Origin':APP});return
  if r.request.url.startswith(API+'/api/outlook/status'):
   r.fulfill(status=200,body='{"ok":true,"connected":false}',headers={'Content-Type':'application/json','Access-Control-Allow-Origin':APP,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, X-TSS-CRM-Request, X-TSS-CRM-CSRF'});return
  external.append(u.scheme+'://'+u.netloc+u.path);r.abort()
 ctx.route('**/*',route)
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 return ctx,page,external,errors

def check(name,value):
 results.append({'name':name,'passed':bool(value)});assert value,name

def login(page,trusted=False):
 page.goto(APP+'/crm/');page.locator('#syntheticSignIn').wait_for(timeout=10000)
 if trusted:page.locator('#trustCrmBrowser').check()
 page.locator('#syntheticSignIn').click();page.locator('h2').filter(has_text='Your working day').wait_for(timeout=10000)

try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  fixture('/control',{'reset':True})
  ctx,page,external,errors=context(browser,390)
  login(page)
  cookies=ctx.cookies(API);cookie=next(c for c in cookies if c['name']=='__Host-tss-crm-v1')
  check('normal cookie is HttpOnly Secure Strict host-only',cookie['httpOnly'] and cookie['secure'] and cookie['sameSite']=='Strict' and cookie['domain']=='api.thesmartysolution.com' and cookie['path']=='/')
  check('normal cookie has session lifetime, not persistent expiry',cookie['expires']==-1)
  check('browser scripts cannot read protected API cookie',not page.evaluate('document.cookie').startswith('__Host-tss-crm-v1'))
  check('new flow has no credential or business-data web storage',page.evaluate('Object.keys(localStorage).length')==0)
  check('new flow uses marker rather than native bearer in shell',page.evaluate("sessionToken.startsWith('tss-cookie-v1:')"))
  first=fixture('/control',{})['calls'].count('googleSignIn');page.reload();page.get_by_role('heading',name='Your working day').wait_for()
  check('full page reload resumes without another Google login',fixture('/control',{})['calls'].count('googleSignIn')==first)
  check('reload revalidates with native checkSession',fixture('/control',{})['calls'].count('checkSession')>=3)
  check('phone-width login/dashboard does not overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  page.screenshot(path=str(OUT/'session-390-after-refresh.png'),full_page=True)
  fixture('/control',{'outage':True});page.reload();page.get_by_role('heading',name='Session check unavailable').wait_for()
  check('outage does not display cached or authenticated CRM',page.get_by_role('heading',name='Your working day').count()==0)
  fixture('/control',{'outage':False});page.locator('button').filter(has_text='Retry session check').click();page.get_by_role('heading',name='Your working day').wait_for()
  page.locator('#signOutButton').click();page.get_by_role('heading',name='Admin login').wait_for()
  check('explicit logout removes new cookie',not any(c['name']=='__Host-tss-crm-v1' for c in ctx.cookies(API)))
  check('explicit logout native revocation checked',fixture('/control',{})['calls'].count('signOut')==1)
  check('no browser script errors',not errors)
  check('no unapproved external request',not external)
  ctx.close()

  fixture('/control',{'reset':True})
  ctx,page,external,errors=context(browser,768);login(page,True)
  c=next(c for c in ctx.cookies(API) if c['name']=='__Host-tss-crm-v1')
  check('trust cookie has positive expiry no later than one hour',c['expires']>0 and c['expires']-page.evaluate('Date.now()/1000')<=3601)
  # Synthetic profile state stays in memory. Never save cookie values into evidence.
  saved=ctx.storage_state();first=fixture('/control',{})['calls'].count('googleSignIn');ctx.close()
  ctx,page,external,errors=context(browser,768,state=saved);page.goto(APP+'/crm/');page.get_by_role('heading',name='Your working day').wait_for()
  check('trusted synthetic cookie survives context restart',fixture('/control',{})['calls'].count('googleSignIn')==first)
  fixture('/control',{'revoke':True});page.reload();page.locator('#syntheticSignIn').wait_for()
  check('revoked cookie cannot restore a new context',page.get_by_role('heading',name='Your working day').count()==0)
  page.screenshot(path=str(OUT/'session-768-revoked-login.png'),full_page=True)
  check('trust remains unchecked on new sign-in',not page.locator('#trustCrmBrowser').is_checked())
  check('trusted context has no browser errors or external requests',not errors and not external)
  ctx.close()

  fixture('/control',{'reset':True})
  ctx,page,external,errors=context(browser,1280);login(page,True)
  fixture('/control',{'advance':3600001});page.reload();page.locator('#syntheticSignIn').wait_for()
  check('native and sealed expiry rejected independently of retained cookie',page.get_by_role('heading',name='Your working day').count()==0)
  check('expiry case no browser errors/external requests',not errors and not external);ctx.close()

  fixture('/control',{'reset':True})
  ctx,page,external,errors=context(browser,768,pwa=True);login(page)
  check('installed-app login skips the new session endpoint',not any(c['name']=='__Host-tss-crm-v1' for c in ctx.cookies(API)))
  check('installed-app retains original trusted-device behavior',page.evaluate("Object.keys(localStorage).some(k=>k.includes('trusted'))"))
  first=fixture('/control',{})['calls'].count('googleSignIn');page.reload();page.get_by_role('heading',name='Your working day').wait_for()
  check('installed-app original refresh restoration remains functional',fixture('/control',{})['calls'].count('googleSignIn')==first)
  check('installed-app path has no script errors or external requests',not errors and not external);ctx.close()

  fixture('/control',{'reset':True,'enabled':False})
  ctx,page,external,errors=context(browser,768);page.goto(APP+'/crm/');page.locator('#syntheticSignIn').wait_for()
  check('explicitly disabled feature retains original browser sign-in',page.locator('#trustCrmBrowser').count()==0)
  check('disabled mode does not create new session cookie',not any(c['name']=='__Host-tss-crm-v1' for c in ctx.cookies(API)))
  check('disabled path has no script errors or external requests',not errors and not external)
  browser.close()
finally:
 proc.terminate();proc.wait(timeout=5)
 (OUT/'browser-session-results.json').write_text(json.dumps({'environment':'isolated Chromium, actual candidate shell and cookie handlers, synthetic native authority, all external requests intercepted','checks':results,'passed':sum(r['passed'] for r in results),'total':len(results),'realGoogleOrNativeAcceptance':False},indent=2)+'\n')
print(json.dumps({'passed':len(results),'total':len(results)}))
