/* TSS IRC first-party inbound enquiries. No HubSpot write, marketing send or buyer sharing. */
import {createSign,randomUUID} from "node:crypto";
const BOOK=()=>process.env.TSS_IRC_SPREADSHEET_ID;
const RESP=(res,status,body)=>res.status(status).setHeader("Content-Type","application/json").setHeader("Cache-Control","no-store").end(JSON.stringify(body));
const valid=(x,min,max)=>typeof x==="string"&&x.trim().length>=min&&x.trim().length<=max;
const email=x=>valid(x,5,200)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.trim());
const https=(u)=>{try{return new URL(u).protocol==="https:"}catch{return false}};
const allowedOrigins=new Set(["https://www.thesmartysolution.com","https://thesmartysolution.com"]);
async function googleToken(){
 const raw=process.env.TSS_GOOGLE_SERVICE_ACCOUNT_JSON;if(!raw)throw Error("Google identity unavailable");
 let svc;try{svc=JSON.parse(raw)}catch{throw Error("Google identity invalid");}
 if(!svc.client_email||!svc.private_key)throw Error("Google account incomplete");
 const b64=x=>Buffer.from(JSON.stringify(x)).toString("base64url"),t=Math.floor(Date.now()/1000);
 const h=b64({alg:"RS256",typ:"JWT"}),b=b64({iss:svc.client_email,scope:"https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",iat:t,exp:t+1800});
 const signer=createSign("RSA-SHA256");signer.update(h+"."+b);signer.end();
 const assertion=h+"."+b+"."+signer.sign(svc.private_key).toString("base64url");
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
 if(!r.ok)throw Error("Google permission denied");
 const v=await r.json();if(!v.access_token)throw Error("Google authentication incomplete");return v.access_token;
}
const sheets="https://sheets.googleapis.com/v4/spreadsheets/";
async function readBuyers(auth){
 const r=await fetch(sheets+encodeURIComponent(BOOK())+"/values/"+encodeURIComponent("'Buyer Enquiries'!A1:E1000"),{headers:{Authorization:"Bearer "+auth},"cache":"no-store"});
 if(!r.ok)throw Error("Buyer source unavailable");return (await r.json()).values||[];
}
async function appendBuyer(auth,record){
 const body=JSON.stringify({values:[record]});
 const r=await fetch(sheets+encodeURIComponent(BOOK())+"/values/"+encodeURIComponent("'Buyer Enquiries'!A:U")+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",{method:"POST",headers:{Authorization:"Bearer "+auth,"content-type":"application/json"},body,cache:"no-store"});
 if(!r.ok)throw Error("Buyer enquiry cannot be saved");
 const v=await r.json();if(!v.updates?.updatedRows)throw Error("Buyer enquiry acknowledgement uncertain");
}
export default async function handler(req,res){
 if(req.method!=="POST")return RESP(res,405,{ok:false,message:"Method not allowed"});
 if(process.env.TSS_IRC_BUYER_INTAKE_ENABLED!=="true")return RESP(res,503,{ok:false,message:"Property enquiry service is not accepting submissions"});
 if(!allowedOrigins.has(req.headers.origin))return RESP(res,403,{ok:false,message:"Origin not permitted"});
 const size=Number(req.headers["content-length"]||0);if(size>10000)return RESP(res,413,{ok:false,message:"Submission exceeds the limit"});
 const b=req.body;
 if(!b||typeof b!=="object"||Array.isArray(b))return RESP(res,400,{ok:false,message:"Invalid enquiry"});
 // Honeypot and time-to-complete reduce casual bot traffic, not a CAPTCHA or hard rate limit.
 if(b.websiteHidden)return RESP(res,202,{ok:true,message:"Thank you for your enquiry"});
 const duration=Date.now()-Number(b.startedAt);
 if(!Number.isFinite(duration)||duration<5000||duration>7200000)return RESP(res,400,{ok:false,message:"Please complete the form again"});
 const fields=["firstName","lastName","email","originCountry","destination","propertyType","budgetBand","purchaseHorizon"];
 for(const f of fields)if(!valid(b[f],1,f==="email"?200:120))return RESP(res,400,{ok:false,message:"Please complete every required field"});
 if(!email(b.email))return RESP(res,400,{ok:false,message:"Please enter a valid email"});
 if(!["Cyprus","Greece","Either"].includes(b.destination))return RESP(res,400,{ok:false,message:"Please select a destination"});
 if(b.requestContact!==true||b.privacyAcknowledged!==true)return RESP(res,400,{ok:false,message:"Permission to respond is required"});
 if(b.marketingOptIn!==true&&b.marketingOptIn!==false)return RESP(res,400,{ok:false,message:"Invalid marketing selection"});
 const iso=new Date().toISOString(),ref="IRC-BUY-"+randomUUID().replace(/-/g,"").slice(0,18).toUpperCase(),address=b.email.toLowerCase().trim();
 const fixed=x=>String(x??"").trim().slice(0,120).replace(/^[=+\-@]/,"'"+String(x).trim()[0]);
 const record=[
  ref,iso,fixed(b.firstName),fixed(b.lastName),address,fixed(b.originCountry),b.destination,fixed(b.propertyType),fixed(b.budgetBand),fixed(b.purchaseHorizon),
  "FIRST_PARTY_REQUEST","https://www.thesmartysolution.com/property-interest/",iso,"WEBFORM:"+ref,
  "REQUESTED",iso,"NO","NEW","TSS","","marketingOptIn="+(b.marketingOptIn?"TRUE":"FALSE")+"; client sharing requires separate permission"
 ];
 try{
  if(!BOOK())throw Error("Buyer sheet unavailable");
  const token=await googleToken(),existing=await readBuyers(token);
  // Avoid duplication without disclosing whether an address is already in our database.
  const emails=new Set(existing.slice(1).map(row=>String(row[4]||"").toLowerCase().trim()).filter(Boolean));
  if(!emails.has(address))await appendBuyer(token,record);
  return RESP(res,202,{ok:true,message:"Thank you. We have received your request and will review it."});
 }catch{
  // Never claim receipt when provider acknowledgement is uncertain; do not log personal details.
  return RESP(res,503,{ok:false,message:"We couldn't confirm your enquiry. Please email info@thesmartysolution.com."});
 }
}
