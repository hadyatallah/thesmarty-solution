/* Cookie transport for ordinary browsers. Installed-app authentication remains unchanged. */
(function(global){
 'use strict';
 const BASE='https://api.thesmartysolution.com';
 const PATH='/api/crm-session';
 const MARKER='tss-cookie-v1:';
 const LOGOUT_INTENT='tss-crm-browser-signout-pending-v1';
 const EXTRA=new Set(['/api/crm-command','/api/crm-research','/api/outlook/status','/api/outlook/oauth/start','/api/outlook/disconnect','/api/outlook/send/propose','/api/outlook/send/approve']);
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function create({fetcher=global.fetch.bind(global),clock=Date.now,ready=()=>{},cleared=()=>{}}={}){
  let current=null,epoch=0,enabled=false,pendingLogin=false;
  const pendingLogout=()=>{try{return global.localStorage?.getItem(LOGOUT_INTENT)==='1';}catch{return false;}};
  const logoutIntent=value=>{try{value?global.localStorage?.setItem(LOGOUT_INTENT,'1'):global.localStorage?.removeItem(LOGOUT_INTENT);}catch{}};
  async function post(path,body,csrfValue){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
   try {
    const r=await fetcher(BASE+path,{method:'POST',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal,
      headers:{'Content-Type':'application/json','X-TSS-CRM-Request':'1',...(csrfValue?{'X-TSS-CRM-CSRF':csrfValue}:{})},body:JSON.stringify(body)});
    let data;try{data=await r.json();}catch{throw Error('CRM_CONNECTION_UNCERTAIN');}
    if(!r.ok||data?.ok!==true)throw Error(data?.error||'CRM_CONNECTION_UNCERTAIN');
    return data;
   } catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw Error('CRM_CONNECTION_UNCERTAIN');throw e;}
   finally{clearTimeout(timer);}
  }
  function reset(){epoch++;current=null;}
  function accept(meta){
   if(!meta||!new RegExp('^'+MARKER+'[a-f0-9]{32}$').test(meta.marker)||!/^[a-f0-9]{64}$/.test(meta.csrf)||!Number.isSafeInteger(meta.expiresAt)||meta.expiresAt<=clock()||typeof meta.trusted!=='boolean')throw Error('NATIVE_CONTRACT_UNVERIFIED');
   current=meta;return ready(meta);
  }
  const api={
   reset,enabled:()=>enabled,active:()=>!!current,
   async retryLogout(){
    try{const d=await post(PATH,{op:'resume'});current=d.result;return await api.logout(false);}
    catch(e){if(e.message==='AUTH_REQUIRED'){logoutIntent(false);return {localSignedOut:true,serverRevocationConfirmed:true};}return {localSignedOut:false,serverRevocationConfirmed:false};}
   },
   handles:token=>!!current&&token===current.marker,
   async initialize(){
    const n=++epoch;
    let r,data;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{r=await fetcher(BASE+PATH,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});data=await r.json();}
    catch{throw Error('Session service unavailable. No sign-in was attempted.');}finally{clearTimeout(timer);}
    if(n!==epoch)throw Error('SESSION_CHANGED');
    if(!r.ok||data?.ok!==true||typeof data.enabled!=='boolean')throw Error('Session service unavailable. No sign-in was attempted.');
    enabled=data.enabled;return enabled;
   },
   async resume(){
    if(!enabled)throw Error('SESSION_NOT_CONFIGURED');const n=++epoch;
    try{if(pendingLogout())throw Error('Previous sign-out is not confirmed. Use Retry sign-out before opening the workspace.');const d=await post(PATH,{op:'resume'});if(n!==epoch)throw Error('SESSION_CHANGED');await accept(d.result);return true;}
    catch(e){if(n!==epoch)throw Error('SESSION_CHANGED');if(e.message==='AUTH_REQUIRED'){current=null;return false;}throw e;}
   },
   async rpc(fn,args){
    const s=current,n=epoch;if(!s||args[0]!==s.marker||clock()>=s.expiresAt)throw Error('AUTH_REQUIRED');
    let data;
    const tail=args.slice(1);
    if(['askAssistant','ccState','ccPropose','ccDecide','ccExecute','ccPrepareBrief'].includes(fn))data=await post('/api/crm-command',{fn,args},s.csrf);
    else if(fn==='ccResearchWebsite')data=await post('/api/crm-research',{session:s.marker,url:tail[0]},s.csrf);
    else data=await post(PATH,{op:'rpc',marker:s.marker,fn,args:tail},s.csrf);
    if(n!==epoch||current!==s)throw Error('SESSION_CHANGED');return data.result;
   },
   async service(path,body){
    const s=current,n=epoch;if(!s||body.session!==s.marker||!EXTRA.has(path))throw Error('AUTH_REQUIRED');
    const data=await post(path,body,s.csrf);if(n!==epoch||current!==s)throw Error('SESSION_CHANGED');return data;
   },
   async logout(all=false){
    const s=current;logoutIntent(true);reset();cleared();
    if(!s)return {localSignedOut:true,serverRevocationConfirmed:false};
    try{const result=(await post(PATH,{op:'logout',marker:s.marker,all},s.csrf)).result;if(result.localSignedOut)logoutIntent(false);return result;}
    catch{return {localSignedOut:false,serverRevocationConfirmed:false};}
   },
   async showLogin(message=''){
    const n=++epoch;current=null;pendingLogin=false;
    if(pendingLogout()){
     document.getElementById('main').innerHTML='<section class="panel"><h2>Sign-out not confirmed</h2><p>The workspace is hidden. The browser could not confirm cookie removal or server revocation. The original expiry still applies.</p><button id="retryCrmLogout">Retry sign-out</button></section>';
     document.getElementById('retryCrmLogout').onclick=async()=>{await api.retryLogout();await api.showLogin('Signed out here.');};return;
    }
    const main=document.getElementById('main');
    main.innerHTML='<section class="panel" style="max-width:520px;margin:35px auto"><h2>Admin login</h2><p>Sign in with your authorised TSS Google account.</p><p id="loginError" class="error" role="alert">'+escape(message)+'</p><label style="display:flex;align-items:flex-start;gap:10px"><input id="trustCrmBrowser" type="checkbox" style="width:auto;margin-top:5px"><span>Trust this browser for this session<br><small class="muted">Optional. Allows reopening until the session expires, up to one hour. Leave off on shared or cloud browsers.</small></span></label><div id="googleButton" style="margin-top:18px">Preparing secure sign-in…</div><p class="muted">Refreshing keeps a valid CRM session. Without trust, the cookie lasts for the browser session, subject to browser session-restore behaviour. Sign out when finished on a shared device. Google verification and server expiry still apply.</p><a href="/">Back to the TSS website</a></section>';
    try {
     const flow=(await post(PATH,{op:'begin'})).result;
     if(n!==epoch)return;
     if(!global.google?.accounts?.id)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.onload=resolve;script.onerror=()=>reject(Error('Google sign-in could not load.'));document.head.appendChild(script);});
     if(n!==epoch)return;
     global.google.accounts.id.initialize({client_id:'103840050410-80lukup1okjnkmt6qvmd9s2mbvi3uakf.apps.googleusercontent.com',nonce:flow.nonce,auto_select:false,callback:async response=>{
      if(n!==epoch||pendingLogin)return;pendingLogin=true;
      const trusted=document.getElementById('trustCrmBrowser').checked;
      document.getElementById('googleButton').textContent='Verifying your account…';
      try {
       const data=await post(PATH,{op:'login',credential:response.credential,trusted},flow.csrf);
       // A login response must never redraw an account after logout/navigation.
       if(n!==epoch){await post(PATH,{op:'logout',marker:data.result.marker,all:false},data.result.csrf).catch(()=>{});return;}
       await accept(data.result);
      }catch(e){if(n===epoch){document.getElementById('loginError').textContent=e.message;document.getElementById('googleButton').textContent='Sign-in did not complete. Reload to start a new sign-in.';}}
     }});
     document.getElementById('googleButton').textContent='';global.google.accounts.id.renderButton(document.getElementById('googleButton'),{theme:'outline',size:'large',text:'signin_with',width:280});
    }catch(e){if(n===epoch){document.getElementById('loginError').textContent=e.message;document.getElementById('googleButton').textContent='Sign-in unavailable. No access has been granted.';}}
   }
  };
  return api;
 }
 global.TSSBrowserSession={create};
})(globalThis);
