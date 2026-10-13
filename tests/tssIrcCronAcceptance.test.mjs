import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import handler from "../api/tss-irc-daily.js";

const mkRes=()=>({
 statusCode:200,headers:{},body:"",
 status(n){this.statusCode=n;return this;},
 setHeader(k,v){this.headers[k]=v;return this;},
 end(t){this.body=String(t||"");return this;}
});
const clone=x=>JSON.parse(JSON.stringify(x));
const settings=[["key","value","purpose"],["daily_scheduler_enabled","TRUE",""],["auto_send_enabled","FALSE",""],["daily_send_cap","10",""]];
const blank=[
 {values:settings},
 {values:[["buyerId","createdAt","firstName","lastName","email","originCountry","destination","propertyType","budgetBand","purchaseHorizon","sourceType","sourceURL","sourceObservedAt","requestEvidence","contactPermission","contactPermissionAt","sharePermission","status","owner","lastContactAt","notes"]]},
 {values:[["referralId","organisationName","legalName","country","website","publicEmail","organisationType","canonicalCompanyId","sourceURL","sourceObservedAt","verification"]]},
 {values:[["queueId","leadType","leadId","recipientEmail","recipientName","jurisdiction","recipientClass","permissionBasis","permissionEvidenceURL","reviewedBy","reviewedAt","sendApproved","optedOut","sendAfter","status","messageTemplate","lastAttemptAt","sentAt","providerMessageId","notes"]]},
 {values:[["emailLower","suppressedAt","reason"]]},
 {values:[["runId","startedAt","finishedAt","discoverySources","newResearchSignals","newBuyerEnquiries","eligibleForEmail","messagesSent","held","outcome","details"]]}
];

test("authorized scheduled review persists a zero-send run with non-sensitive telemetry and rejects replay",async()=>{
 const prev={
  CRON_SECRET:process.env.CRON_SECRET,
  TSS_GOOGLE_SERVICE_ACCOUNT_JSON:process.env.TSS_GOOGLE_SERVICE_ACCOUNT_JSON,
  TSS_IRC_SPREADSHEET_ID:process.env.TSS_IRC_SPREADSHEET_ID,
  TSS_IRC_AUTO_SEND_ENABLED:process.env.TSS_IRC_AUTO_SEND_ENABLED,
  fetch:global.fetch,info:console.info,error:console.error
 };
 const keys=Object.keys(prev).filter(k=>!["fetch","info","error"].includes(k));
 const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048,publicKeyEncoding:{type:"spki",format:"pem"},privateKeyEncoding:{type:"pkcs8",format:"pem"}});
 process.env.CRON_SECRET="SYNTHETIC_TEST_KEY";
 process.env.TSS_GOOGLE_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:"qa@example.test",private_key:privateKey});
 process.env.TSS_IRC_SPREADSHEET_ID="synthetic_sheet_only";
 process.env.TSS_IRC_AUTO_SEND_ENABLED="false";
 const database=clone(blank), calls=[],logs=[],append=[];
 global.fetch=async(u,options={})=>{
  const url=String(u);calls.push(url);
  if(url.includes("oauth2.googleapis.com/token"))return {ok:true,status:200,json:async()=>({access_token:"SYNTHETIC_TOKEN"})};
  if(url.includes("values:batchGet"))return {ok:true,status:200,json:async()=>({valueRanges:clone(database)})};
  if(url.includes(":append")){
   const payload=JSON.parse(options.body||"{}");append.push(payload.values[0]);database[5].values.push(payload.values[0]);
   return {ok:true,status:200,json:async()=>({updates:{updatedRows:1}})};
  }
  throw Error("Unapproved network route in test");
 };
 console.info=(...x)=>logs.push(x.join(" "));
 console.error=(...x)=>logs.push(x.join(" "));
 try{
  const resp=mkRes();await handler({method:"GET",headers:{authorization:"Bearer SYNTHETIC_TEST_KEY"}},resp);
  assert.equal(resp.statusCode,200,resp.body);
  const outcome=JSON.parse(resp.body);
  assert.equal(outcome.outcome,"RESEARCH_ONLY");
  assert.equal(outcome.messagesSent,0);
  assert.equal(outcome.eligible,0);
  assert.equal(append.length,1);
  assert.equal(append[0][9],"RESEARCH_ONLY");
  assert.ok(logs.some(x=>x.includes('"event":"invoked"')));
  assert.ok(logs.some(x=>x.includes('"event":"completed"')));
  assert.ok(calls.every(x=>!x.includes("graph.microsoft.com")&&!x.includes("hubapi.com")));
  const again=mkRes();await handler({method:"GET",headers:{authorization:"Bearer SYNTHETIC_TEST_KEY"}},again);
  assert.equal(again.statusCode,200);
  assert.equal(JSON.parse(again.body).outcome,"ALREADY_RECORDED");
  assert.equal(append.length,1,"An ordinary sequential retry cannot append the same run twice");
  assert.equal(logs.some(x=>x.includes("buyer@example")) ,false,"Contact detail leakage");
 }finally{
  for(const k of keys)if(prev[k]===undefined)delete process.env[k];else process.env[k]=prev[k];
  global.fetch=prev.fetch;console.info=prev.info;console.error=prev.error;
 }
});
