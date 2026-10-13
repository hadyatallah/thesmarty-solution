import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import buyerIntake from "../api/irc-buyer-enquiry.js";

const res=()=>({code:200,headers:{},body:"",
 status(c){this.code=c;return this;},
 setHeader(k,v){this.headers[k]=v;return this;},
 end(s){this.body=String(s||"");return this;}
});
const mkBody=(a={})=>Object.assign({
 firstName:"TSS Internal",lastName:"QA",email:"qa+irc-optin-acceptance@thesmartysolution.com",
 originCountry:"United Kingdom",destination:"Cyprus",propertyType:"House / villa",
 budgetBand:"€300,000–€600,000",purchaseHorizon:"6–12 months",
 requestContact:true,privacyAcknowledged:true,marketingOptIn:false,
 websiteHidden:"",startedAt:Date.now()-12000
},a);
const mkReq=(body,headers={})=>({method:"POST",headers:Object.assign({
 origin:"https://www.thesmartysolution.com","content-type":"application/json",
 "content-length":String(Buffer.byteLength(JSON.stringify(body)))
},headers),body});

test("draft buyer intake denies unsupported traffic without touching Google Sheets",async()=>{
 const prior=process.env.TSS_IRC_BUYER_INTAKE_ENABLED;
 const origFetch=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;throw Error("Never fetch under denial tests");};
 try{
  const get=res();await buyerIntake({method:"GET",headers:{}},get);assert.equal(get.code,405);
  delete process.env.TSS_IRC_BUYER_INTAKE_ENABLED;
  const off=res();await buyerIntake(mkReq(mkBody()),off);assert.equal(off.code,503);
  process.env.TSS_IRC_BUYER_INTAKE_ENABLED="true";
  const cross=res();await buyerIntake(mkReq(mkBody(),{origin:"https://unknown.site"}),cross);assert.equal(cross.code,403);
  const type=res();await buyerIntake(mkReq(mkBody(),{"content-type":"text/plain"}),type);assert.equal(type.code,415);
  const huge=res();await buyerIntake(mkReq(mkBody({firstName:"x".repeat(10500)}),{"content-length":"1"}),huge);assert.equal(huge.code,413);
  const consent=res();await buyerIntake(mkReq(mkBody({requestContact:false})),consent);assert.equal(consent.code,400);
  const marketing=res();await buyerIntake(mkReq(mkBody({marketingOptIn:"TRUE"})),marketing);assert.equal(marketing.code,400);
  const property=res();await buyerIntake(mkReq(mkBody({propertyType:"Unknown"})),property);assert.equal(property.code,400);
  const honeypot=res();await buyerIntake(mkReq(mkBody({websiteHidden:"bot"})),honeypot);assert.equal(honeypot.code,202);
  assert.equal(calls,0);
 }finally{
  if(prior===undefined)delete process.env.TSS_IRC_BUYER_INTAKE_ENABLED;else process.env.TSS_IRC_BUYER_INTAKE_ENABLED=prior;
  global.fetch=origFetch;
 }
});

test("draft buyer intake stores one requested contact as NEW with no partner sharing or marketing send",async()=>{
 const prev={
  flag:process.env.TSS_IRC_BUYER_INTAKE_ENABLED,
  book:process.env.TSS_IRC_SPREADSHEET_ID,
  google:process.env.TSS_GOOGLE_SERVICE_ACCOUNT_JSON,
  fetch:global.fetch
 };
 const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048,publicKeyEncoding:{type:"spki",format:"pem"},privateKeyEncoding:{type:"pkcs8",format:"pem"}});
 process.env.TSS_IRC_BUYER_INTAKE_ENABLED="true";
 process.env.TSS_IRC_SPREADSHEET_ID="SYNTHETIC_ONLY";
 process.env.TSS_GOOGLE_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:"qa@example.test",private_key:privateKey});
 const items=[["buyerId","createdAt","firstName","lastName","email"]];
 const sends=[],calls=[];
 global.fetch=async(url,options={})=>{
  const address=String(url);calls.push(address);
  if(address.includes("oauth2.googleapis.com/token"))return {ok:true,json:async()=>({access_token:"QA_ONLY"})};
  if(address.includes(":append")){
   const payload=JSON.parse(options.body);const row=payload.values?.[0];
   assert.ok(row&&row.length===21);
   items.push(row);sends.push(row);
   return {ok:true,json:async()=>({updates:{updatedRows:1}})};
  }
  if(address.includes("/values/"))return {ok:true,json:async()=>({values:items})};
  throw Error("Unexpected network address in mock");
 };
 try{
  const rq=mkReq(mkBody()),result=res();
  await buyerIntake(rq,result);
  assert.equal(result.code,202,result.body);
  assert.equal(sends.length,1);
  assert.match(sends[0][0],/^IRC-BUY-/);
  assert.equal(sends[0][4],"qa+irc-optin-acceptance@thesmartysolution.com");
  assert.equal(sends[0][14],"REQUESTED");
  assert.equal(sends[0][16],"NO","Do not automatically permit client sharing");
  assert.equal(sends[0][17],"NEW");
  assert.match(sends[0][20],/marketingOptIn=FALSE/);
  assert.equal(calls.some(u=>/graph\.microsoft\.com|hubapi\.com/i.test(u)),false,"No external communication or CRM promotion");
  const repeat=res();await buyerIntake(rq,repeat);
  assert.equal(repeat.code,202);
  assert.equal(sends.length,1,"Sequential same-email replay does not duplicate research rows");
 }finally{
  if(prev.flag===undefined)delete process.env.TSS_IRC_BUYER_INTAKE_ENABLED;else process.env.TSS_IRC_BUYER_INTAKE_ENABLED=prev.flag;
  if(prev.book===undefined)delete process.env.TSS_IRC_SPREADSHEET_ID;else process.env.TSS_IRC_SPREADSHEET_ID=prev.book;
  if(prev.google===undefined)delete process.env.TSS_GOOGLE_SERVICE_ACCOUNT_JSON;else process.env.TSS_GOOGLE_SERVICE_ACCOUNT_JSON=prev.google;
  global.fetch=prev.fetch;
 }
});
