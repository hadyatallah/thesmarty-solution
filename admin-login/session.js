// Shared Admin entry. Google OAuth token exists only during this exchange.
// The durable session is an opaque HttpOnly cookie, never a browser token store.
const config=window.TSS_IDC_CONFIG||{};
const $=id=>document.getElementById(id);
let csrf='',expiresAt=0;
function notice(text){$('notice').hidden=!text;$('notice').textContent=text;}
function locked(text=''){csrf='';expiresAt=0;$('workspacePanel').hidden=true;$('verifyPanel').hidden=false;notice(text);}
function unlocked(data){csrf=data.csrf;expiresAt=data.expiresAt;$('verifiedIdentity').textContent='Verified: '+data.email;$('workspacePanel').hidden=false;$('verifyPanel').hidden=true;notice('');}
async function call(method='GET',body){
 const response=await fetch('/api/tss-admin-session',{method,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-TSS-Session':'1',...(csrf?{'X-TSS-CSRF':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({error:'invalid_server_response'}));
 if(!response.ok||!data.ok)throw Error(data.error||'session_request_failed');return data;
}
$('verifyButton').addEventListener('click',()=>{
 if(!window.google?.accounts?.oauth2){notice('Google sign-in has not loaded. Refresh and retry.');return;}
 $('verifyButton').disabled=true;
 try {window.google.accounts.oauth2.initTokenClient({client_id:config.googleClientId,scope:'https://www.googleapis.com/auth/userinfo.email',login_hint:config.allowedEmail,
 callback:async result=>{try{if(result.error||!result.access_token)throw Error('Google sign-in was not completed.');unlocked(await call('POST',{accessToken:result.access_token}));}catch(e){locked('Admin sign-in failed: '+e.message);}finally{$('verifyButton').disabled=false;}},
 error_callback:()=>{$('verifyButton').disabled=false;notice('Google sign-in was cancelled or blocked.');}
 }).requestAccessToken({prompt:'',login_hint:config.allowedEmail});}
 catch {$('verifyButton').disabled=false;notice('Google sign-in could not start.');}
});
$('lockButton').textContent='Log out';
$('lockButton').addEventListener('click',async()=>{try{await call('DELETE');locked('Logged out.');}catch(e){notice('Logout could not be confirmed: '+e.message);}});
setInterval(()=>{if(expiresAt&&Date.now()>=expiresAt)locked('Session expired. Sign in again.');},1000);
locked();call().then(unlocked).catch(e=>{if(!/owner_session/.test(e.message))notice('Admin session unavailable: '+e.message);});
