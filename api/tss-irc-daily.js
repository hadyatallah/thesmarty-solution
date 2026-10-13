/**
 * TSS IRC daily Vercel Cron, deliberately fail-closed.
 * One bounded daily review of existing approved Google Sheets inputs.
 * No public-person scraping, no HubSpot writes and no contact quota guarantee.
 */
import {createSign,randomUUID,timingSafeEqual} from "node:crypto";
import {objects,settings,chooseEligible,messageFor,truthy,normEmail} from "../lib/tssIrcEligibility.mjs";
const SHEET_RANGES={
 settings:"'Settings'!A1:C100",buyers:"'Buyer Enquiries'!A1:U1000",
 partners:"'Referral Organisations'!A1:Q1000",queue:"'Outreach Queue'!A1:T1000",
 suppressions:"'Suppressions'!A1:G1000",runs:"'Runs'!A1:K1000"
};
const GOOGLE="https://sheets.googleapis.com/v4/spreadsheets/";
const utc=()=>new Date().toISOString(),day=()=>utc().slice(0,10);
// No contact details, service-account material or OAuth tokens are ever logged.
const log=(event,details={})=>console.info(JSON.stringify({component:"tss-irc-daily",event,...details}));
const text=(v)=>String(v??"");
const okSecret=(actual,expected)=>{
 if(!expected||!actual)return false;
 const a=Buffer.from(text(actual)),b=Buffer.from(text(expected));
 return a.length===b.length&&timingSafeEqual(a,b);
};
function err(message){return Error(message);}
const readJson=async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw err("Provider request failed ("+r.status+")");return j;};
async function googleAccessToken(){
 const raw=process.env.TSS_GOOGLE_SERVICE_ACCOUNT_JSON;
 if(!raw)throw err("Google service-account credential not configured");
 let svc;try{svc=JSON.parse(raw)}catch{throw err("Google service-account JSON invalid");}
 if(!svc.client_email||!svc.private_key)throw err("Google service-account fields missing");
 const now=Math.floor(Date.now()/1000);
 const b64=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
 const head=b64({alg:"RS256",typ:"JWT"}),body=b64({
   iss:svc.client_email,scope:"https://www.googleapis.com/auth/spreadsheets",
   aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3300
 });
 const signing=createSign("RSA-SHA256");signing.update(head+"."+body);signing.end();
 const jwt=head+"."+body+"."+signing.sign(svc.private_key).toString("base64url");
 const r=await fetch("https://oauth2.googleapis.com/token",{
 method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
 body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt})
 });
 const j=await readJson(r);if(!j.access_token)throw err("Google token missing");
 return j.access_token;
}
const sheetId=()=>process.env.TSS_IRC_SPREADSHEET_ID||"";
async function readAll(token){
 const id=sheetId();if(!id)throw err("IRC spreadsheet is not configured");
 const p=new URLSearchParams();Object.values(SHEET_RANGES).forEach(x=>p.append("ranges",x));
 const res=await fetch(GOOGLE+encodeURIComponent(id)+"/values:batchGet?"+p,{
  headers:{authorization:"Bearer "+token},cache:"no-store"
 });
 const raw=await readJson(res),values=raw.valueRanges||[];
 if(values.length!==Object.keys(SHEET_RANGES).length)throw err("Incomplete source workbook read");
 return Object.fromEntries(Object.keys(SHEET_RANGES).map((k,i)=>[k,values[i].values||[]]));
}
async function readRange(token,range){
 const r=await fetch(GOOGLE+encodeURIComponent(sheetId())+"/values/"+encodeURIComponent(range),{
 headers:{authorization:"Bearer "+token},cache:"no-store"});
 return (await readJson(r)).values||[];
}
async function putRow(token,range,values){
 const r=await fetch(GOOGLE+encodeURIComponent(sheetId())+"/values/"+encodeURIComponent(range)+"?valueInputOption=RAW",{
 method:"PUT",headers:{authorization:"Bearer "+token,"content-type":"application/json"},
 body:JSON.stringify({range,majorDimension:"ROWS",values:[values]})
 });return readJson(r);
}
async function appendRow(token,sheetName,values){
 const range="'"+sheetName+"'!A:Z";
 const r=await fetch(GOOGLE+encodeURIComponent(sheetId())+"/values/"+encodeURIComponent(range)+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",{
 method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},
 body:JSON.stringify({values:[values]})
 });return readJson(r);
}
async function graphToken(){
 const tenant=process.env.TSS_OUTLOOK_TENANT_ID,
 client=process.env.TSS_OUTLOOK_CLIENT_ID,
 secret=process.env.TSS_OUTLOOK_CLIENT_SECRET;
 if(!tenant||!client||!secret)throw err("Outlook application credentials missing");
 const r=await fetch("https://login.microsoftonline.com/"+encodeURIComponent(tenant)+"/oauth2/v2.0/token",{
 method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
 body:new URLSearchParams({client_id:client,client_secret:secret,scope:"https://graph.microsoft.com/.default",grant_type:"client_credentials"})
 });
 const v=await readJson(r);if(!v.access_token)throw err("Outlook app token missing");
 // The existing delegated Outlook connection is NOT proof of application Mail.Send.
 let claims;try{claims=JSON.parse(Buffer.from(v.access_token.split(".")[1],"base64url").toString("utf8"));}catch{claims={};}
 if(!Array.isArray(claims.roles)||!claims.roles.includes("Mail.Send"))throw err("Microsoft Graph application Mail.Send is not granted");
 return v.access_token;
}
async function sendOne(token,entry){
 const sender="info@thesmartysolution.com";
 const m=messageFor(entry);
 const r=await fetch("https://graph.microsoft.com/v1.0/users/"+encodeURIComponent(sender)+"/sendMail",{
 method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},
 body:JSON.stringify({message:{
 subject:m.subject,
 body:{contentType:"Text",content:m.body},
 toRecipients:[{emailAddress:{address:entry.recipientEmail}}]
 },saveToSentItems:true})
 });
 if(r.status!==202)throw err("Microsoft Graph send not accepted ("+r.status+")");
 return "GRAPH_ACCEPTED_"+randomUUID();
}
function json(res,status,body){res.status(status).setHeader("Cache-Control","no-store").setHeader("Content-Type","application/json; charset=utf-8").end(JSON.stringify(body));}
export default async function handler(req,res){
 if(req.method!=="GET")return json(res,405,{ok:false,error:"method_not_allowed"});
 if(!okSecret(req.headers.authorization?.replace(/^Bearer\s+/i,""),process.env.CRON_SECRET))return json(res,401,{ok:false,error:"unauthorised"});
 const jobId="IRC-RUN-"+day(),now=utc();
 log("invoked",{runId:jobId});
 let google;
 try{
  google=await googleAccessToken();
  const data=await readAll(google);
  const opts=settings(data.settings);
  const past=objects(data.runs);
  if(past.some(x=>x.runId===jobId)){
   log("already_recorded",{runId:jobId});
   return json(res,200,{ok:true,runId:jobId,outcome:"ALREADY_RECORDED"});
  }
  const eligible=chooseEligible(data,now,Math.min(10,Number(opts.daily_send_cap)||10));
  const enabled=truthy(opts.daily_scheduler_enabled),sheetSend=truthy(opts.auto_send_enabled);
  let outcome=enabled?"RESEARCH_ONLY":"DISABLED",sent=0,held=eligible.held.length;
  if(enabled && sheetSend && process.env.TSS_IRC_AUTO_SEND_ENABLED==="true"){
    // No permission-based sends may run without an independently accepted durable
    // anti-double-send reservation. Sheets value updates alone are not atomic CAS.
    outcome="EXACTLY_ONCE_GATE_NOT_ACCEPTED";
  } else if(enabled && eligible.chosen.length && !sheetSend){
    outcome="SEND_APPROVAL_GATE_OFF";
  }
  await appendRow(google,"Runs",[jobId,now,utc(),"Approved first-party inputs only",0,0,eligible.chosen.length,sent,held,outcome,
    "Daily eligible-contact review. No personal buyer addresses harvested. Email submission held until durable idempotency and Microsoft Graph app-permission acceptance."]);
  log("completed",{runId:jobId,outcome,eligible:eligible.chosen.length,held,messagesSent:0});
  return json(res,200,{ok:true,runId:jobId,outcome,eligible:eligible.chosen.length,held,messagesSent:0,source:"approved_inputs"});
 }catch(e){
  // Only bounded internal error categories are available here, never provider response bodies.
  const error=String(e.message||"unknown").slice(0,180);
  console.error(JSON.stringify({component:"tss-irc-daily",event:"blocked",runId:jobId,error}));
  return json(res,503,{ok:false,runId:jobId,outcome:"BLOCKED",error});
 }
}
