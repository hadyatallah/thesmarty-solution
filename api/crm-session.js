import crypto from 'node:crypto';
import {OWNER,CLIENT_ID,SESSION_COOKIE,FLOW_COOKIE,MARKER,MAX_MS,fail,safeCode,settings,trustedOrigin,headers,parseBody,cookieValue,seal,unseal,sessionCookie,clearCookie,csrf,activeSession,publicSession,nativeCall,validNativeCheck} from '../server/crm-session/core.js';
export const config={maxDuration:60};
const RPC = new Map([['getState',0],['checkSession',0],['saveRecord',2],['syncEmail',0]]);
function googleClaimFilter(credential,nonce,now) {
  // This filter is NOT signature verification. The existing native googleSignIn verifier
  // MUST validate the ID token before a session is issued. Deployment is gated on that contract.
  try {
    if(typeof credential!=='string'||credential.length>16384||credential.split('.').length!==3)throw Error();
    const c=JSON.parse(Buffer.from(credential.split('.')[1],'base64url').toString('utf8'));
    if(!['accounts.google.com','https://accounts.google.com'].includes(c.iss)||c.aud!==CLIENT_ID||c.email!==OWNER||c.email_verified!==true||c.nonce!==nonce||!c.sub||!Number.isFinite(c.exp)||c.exp*1000<=now)throw Error();
  }catch{fail('SIGNIN_REJECTED');}
}
export function makeHandler({env=process.env,clock=Date.now,call=nativeCall}={}) {
 return async(req,res)=>{
  headers(res);
  const config=settings(env),now=clock();
  try {
    trustedOrigin(req,res);
    if(req.method==='OPTIONS')return res.status(204).end();
    if(req.method==='GET'&&config.requested&&!config.enabled)fail('SESSION_NOT_CONFIGURED');
    if(req.method==='GET')return res.status(200).json({ok:true,enabled:config.enabled && req.headers.host==='api.thesmartysolution.com',maxMinutes:60});
    if(req.method!=='POST')fail('METHOD_NOT_ALLOWED');
    if(!config.enabled)fail('SESSION_NOT_CONFIGURED');
    if(req.headers.host!=='api.thesmartysolution.com')fail('ORIGIN_NOT_ALLOWED');
    if(req.headers?.['x-tss-crm-request']!=='1'||!/^application\/json(?:;|$)/i.test(req.headers?.['content-type']||''))fail('CSRF_REJECTED');
    const body=parseBody(req);
    if(body.op==='begin') {
      const challenge=await call('beginGoogleLogin',[]);
      if(typeof challenge?.nonce!=='string'||challenge.nonce.length<16||challenge.nonce.length>512)fail('NATIVE_CONTRACT_UNVERIFIED');
      const flow={host:req.headers.host,nonce:challenge.nonce,csrf:crypto.randomBytes(32).toString('hex'),expiresAt:now+300000};
      res.setHeader('Set-Cookie',sessionCookie(FLOW_COOKIE,seal(flow,config.key,'flow')));
      return res.status(200).json({ok:true,result:{nonce:flow.nonce,csrf:flow.csrf}});
    }
    if(body.op==='login') {
      const flow=unseal(cookieValue(req,FLOW_COOKIE),config.key,'flow');
      if(flow.host!==req.headers.host||!Number.isSafeInteger(flow.expiresAt)||flow.expiresAt<=now||flow.expiresAt>now+300000)fail('AUTH_REQUIRED');
      csrf(req,flow.csrf);googleClaimFilter(body.credential,flow.nonce,now);
      if(typeof body.trusted!=='boolean')fail('INVALID_REQUEST');
      const native=await call('googleSignIn',[body.credential,flow.nonce]);
      if(typeof native?.token!=='string'||!native.token||native.token.length>2048||!Number.isSafeInteger(native.expiresAt)||native.expiresAt<=now)fail('NATIVE_CONTRACT_UNVERIFIED');
      validNativeCheck(await call('checkSession',[native.token]));
      const session={v:1,host:req.headers.host,owner:OWNER,token:native.token,id:crypto.randomBytes(16).toString('hex'),csrf:crypto.randomBytes(32).toString('hex'),issuedAt:now,expiresAt:Math.min(now+MAX_MS,native.expiresAt),trusted:body.trusted};
      res.setHeader('Set-Cookie',[sessionCookie(SESSION_COOKIE,seal(session,config.key,'session'),{expiresAt:session.expiresAt,now,persistent:session.trusted}),clearCookie(FLOW_COOKIE)]);
      return res.status(200).json({ok:true,result:publicSession(session)});
    }
    const s=activeSession(req,config.key,now);
    if(body.op==='resume') {
      // Same-origin/credentialed CORS + non-simple request is required before disclosing CSRF.
      validNativeCheck(await call('checkSession',[s.token]));
      return res.status(200).json({ok:true,result:publicSession(s)});
    }
    csrf(req,s.csrf);
    if(body.marker!==MARKER+s.id)fail('SESSION_CHANGED');
    if(body.op==='logout') {
      if(typeof body.all!=='boolean')fail('INVALID_REQUEST');
      // Clear only these CRM cookies. Never clear Microsoft cookies or origin storage.
      res.setHeader('Set-Cookie',[clearCookie(SESSION_COOKIE),clearCookie(FLOW_COOKIE)]);
      let revoked=false;
      try {
        await call(body.all?'signOutAll':'signOut',[s.token]);
        try { validNativeCheck(await call('checkSession',[s.token])); }
        catch(e){if(e.message==='AUTH_REQUIRED')revoked=true;}
      }catch(e){if(e.message==='AUTH_REQUIRED')revoked=true;}
      return res.status(200).json({ok:true,result:{localSignedOut:true,serverRevocationConfirmed:revoked}});
    }
    if(body.op!=='rpc'||!RPC.has(body.fn)||!Array.isArray(body.args)||body.args.length!==RPC.get(body.fn))fail('ACTION_NOT_ALLOWED');
    validNativeCheck(await call('checkSession',[s.token]));
    const result=body.fn==='checkSession'?true:await call(body.fn,[s.token,...body.args]);
    // Never echo an auth secret in a business response, even on an unexpected native contract.
    if(JSON.stringify(result)?.includes(s.token))fail('NATIVE_CONTRACT_UNVERIFIED');
    return res.status(200).json({ok:true,result});
  }catch(e){const code=safeCode(e);return res.status(['AUTH_REQUIRED','SESSION_CHANGED','SIGNIN_REJECTED'].includes(code)?401:code==='CRM_CONNECTION_UNCERTAIN'?503:400).json({ok:false,error:code});}
 };
}
export default makeHandler();
