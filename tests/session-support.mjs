import {makeHandler} from '../api/crm-session.js';
import {CLIENT_ID,OWNER,SESSION_COOKIE,FLOW_COOKIE} from '../server/crm-session/core.js';
export const ORIGIN='https://www.thesmartysolution.com';
export function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(n){this.statusCode=n;return this;},json(value){this.value=value;return this;},end(){return this;}};}
export function harness(){
 const env={TSS_CRM_BROWSER_SESSION_ENABLED:'true',TSS_CRM_SESSION_CONTRACT_ACCEPTED:'true',TSS_CRM_BROWSER_SESSION_KEY:'f1'.repeat(32)};
 const store=new Map(),calls=[],used=new Set();let now=1791118800000,counter=0,nonceCounter=0;
 const behavior={outage:false,check:false,ttl:3600000,wrongResult:null,leak:false,logoutFails:false};
 const call=async(fn,args)=>{
  calls.push({fn,args});if(behavior.outage)throw Error('CRM_CONNECTION_UNCERTAIN');
  if(fn==='beginGoogleLogin')return {nonce:'synthetic-nonce-'+(++nonceCounter).toString().padStart(16,'0')};
  if(fn==='googleSignIn'){
   if(args[0].split('.')[2]!=='synthetic-signature'||used.has(args[1]))throw Error('SIGNIN_REJECTED');
   used.add(args[1]);const token='synthetic-native-bearer-'+(++counter);store.set(token,{expiresAt:now+behavior.ttl,revoked:false});
   return behavior.wrongResult||{token,expiresAt:now+behavior.ttl};
  }
  const s=store.get(args[0]);if(!s||s.revoked||now>=s.expiresAt)throw Error('AUTH_REQUIRED');
  if(fn==='checkSession')return behavior.check||true;
  if(fn==='signOut'||fn==='signOutAll'){if(behavior.logoutFails)throw Error('CRM_CONNECTION_UNCERTAIN');for(const [token,v] of store)if(token===args[0]||fn==='signOutAll')v.revoked=true;return true;}
  if(fn==='getState')return {updatedAt:new Date(now).toISOString(),aiEnabled:false,enums:{},fields:{},records:{...Object.fromEntries(['Companies','Contacts','Tasks','Tickets','Opportunities','Activity','Outreach','Email Activity','System Control','Automation Log','Revenue Tracker','Proposal Tracker','Prospect Queue'].map(k=>[k,[]])),Companies:[{id:'synthetic-company',name:'Synthetic Example',status:'Active',lifecycle:'Company'}]},...(behavior.leak?{token:args[0]}:{})};
  if(fn==='saveRecord')return {id:'synthetic-record',audited:true};
  if(fn==='syncEmail')return {synthetic:true};
  throw Error('ACTION_NOT_ALLOWED');
 };
 const handler=makeHandler({env,clock:()=>now,call});
 const jar={};
 async function invoke(body,{method='POST',headers={},useJar=true,saveCookies=true}={}){
  const req={method,body,headers:{origin:ORIGIN,host:'api.thesmartysolution.com','content-type':'application/json','x-tss-crm-request':'1',...(useJar?{cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; ')}:{}),...headers}};
  const res=response();await handler(req,res);
  if(saveCookies)for(const raw of [res.headers['set-cookie']||[]].flat()){const [nv]=raw.split(';'),i=nv.indexOf('=');if(raw.includes('Max-Age=0'))delete jar[nv.slice(0,i)];else jar[nv.slice(0,i)]=nv.slice(i+1);}
  return res;
 }
 function credential(nonce,claims={},signature='synthetic-signature'){return ['synthetic-header',Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:CLIENT_ID,email:OWNER,email_verified:true,sub:'synthetic-owner',nonce,exp:Math.floor(now/1000)+3600,...claims})).toString('base64url'),signature].join('.');}
 async function login(trusted=false,claims={},signature){const flow=await invoke({op:'begin'});return invoke({op:'login',credential:credential(flow.value.result.nonce,claims,signature),trusted},{headers:{'x-tss-crm-csrf':flow.value.result.csrf}});}
 return {env,jar,store,calls,behavior,call,invoke,credential,login,clock:()=>now,advance:ms=>now+=ms,setNow:x=>now=x};
}
export {SESSION_COOKIE,FLOW_COOKIE};
