import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseEligible,eligibility,messageFor,objects} from '../lib/tssIrcEligibility.mjs';
const Q=["queueId","leadType","leadId","recipientEmail","recipientName","jurisdiction","recipientClass","permissionBasis","permissionEvidenceURL","reviewedBy","reviewedAt","sendApproved","optedOut","sendAfter","status","messageTemplate"];
const B=["buyerId","createdAt","firstName","lastName","email","originCountry","destination","propertyType","budgetBand","purchaseHorizon","sourceType","sourceURL","sourceObservedAt","requestEvidence","contactPermission","contactPermissionAt"];
const R=["referralId","organisationName","legalName","country","website","publicEmail","organisationType","canonicalCompanyId","sourceURL","sourceObservedAt","verification"];
const S=["emailLower"];
const q=(a={})=>Object.assign({queueId:"IRC-MSG-001",leadType:"Buyer",leadId:"IRC-BUY-1",recipientEmail:"buyer@example.com",recipientName:"Pat",jurisdiction:"UK",recipientClass:"Individual",permissionBasis:"OPT_IN",permissionEvidenceURL:"https://example.com/consent/123",reviewedBy:"TSS owner",reviewedAt:"2026-10-12T08:00:00Z",sendApproved:"TRUE",optedOut:"FALSE",sendAfter:"2026-10-12T08:00:00Z",status:"READY",messageTemplate:"buyer-v1"},a);
const b=(a={})=>Object.assign({buyerId:"IRC-BUY-1",email:"buyer@example.com",contactPermission:"OPT_IN",contactPermissionAt:"2026-10-12T07:00:00Z",requestEvidence:"https://example.com/consent/123"},a);
const p=(a={})=>Object.assign({referralId:"IRC-ORG-1",publicEmail:"partners@corp.co.uk",sourceURL:"https://corp.co.uk/partners",verification:"Source supported"},a);
const mk=(schema,arr)=>[schema,...arr.map(x=>schema.map(k=>x[k]??""))];
const data=(x=q(), y=b(), z=[],s=[])=>({queue:mk(Q,[x,...z]),buyers:mk(B,[y]),partners:mk(R,[p()]),suppressions:mk(S,s)});
const now="2026-10-13T10:00:00Z";
test('explicitly requested, verified buyer enquiry can enter bounded queue',()=>{
 const result=chooseEligible(data(),now);assert.equal(result.chosen.length,1);assert.equal(result.held.length,0);
});
test('publicly discovered individuals without opt-in stay held',()=>{
 const x=data(q({permissionBasis:"PUBLIC_WEB"}));assert.equal(chooseEligible(x,now).chosen.length,0);
 const n=data(q(),b({contactPermission:"UNKNOWN"}));assert.equal(chooseEligible(n,now).chosen.length,0);
});
test('unverified consent source and unknown reviewer are blocked',()=>{
 assert.equal(chooseEligible(data(q({permissionEvidenceURL:""})),now).chosen.length,0);
 assert.equal(chooseEligible(data(q({reviewedBy:""})),now).chosen.length,0);
});
test('suppression beats an otherwise eligible record',()=>{
 const x=data(q(),b(),[],[{emailLower:"BUYER@example.com"}]);assert.equal(chooseEligible(x,now).chosen.length,0);
});
test('one-time sent and ambiguous status cannot retry',()=>{
 for(const status of ["SENT","SUBMITTED","RESERVED","NEEDS_RECONCILIATION"]){
 const result=chooseEligible(data(q({status})),now);assert.equal(result.chosen.length,0,status);
 }});
test('UK corporate published partnership invitation is boundedly permitted',()=>{
 const ref=q({leadType:"Referral",leadId:"IRC-ORG-1",recipientEmail:"partners@corp.co.uk",recipientClass:"Corporate",jurisdiction:"UK",permissionBasis:"PARTNER_INVITATION",permissionEvidenceURL:"https://corp.co.uk/partners",messageTemplate:"partner-v1"});
 const v=data(ref);assert.equal(chooseEligible(v,now).chosen.length,1);
 const za={...ref,jurisdiction:"ZA"};assert.equal(chooseEligible(data(za),now).chosen.length,0);
 const noSite={...ref,permissionEvidenceURL:""};assert.equal(chooseEligible(data(noSite),now).chosen.length,0);
});
test('max 10 and same-day duplicates stay held',()=>{
 const x=data(q(),b(),[q({queueId:"IRC-MSG-002"})]);
 const r=chooseEligible(x,now,10);assert.equal(r.chosen.length,1);
 assert.equal(r.held.some(x=>x.reason==="SAME_DAY_DUPLICATE"),true);
});
test('no unknown or earlier scheduled sends, templates include transparency',()=>{
 assert.equal(chooseEligible(data(q({sendAfter:"2026-10-14T08:00:00Z"})),now).chosen.length,0);
 assert.equal(chooseEligible(data(q({status:"HOLD"})),now).chosen.length,0);
 const msg=messageFor(q());assert.match(msg.body,/may be paid/i);
 assert.match(msg.body,/no further contact/i);
});
test('header parser maps stable id to row index',()=>{
 const r=objects([["buyerId","email"],["A","a@b.com"],["B","b@b.com"]]);
 assert.equal(r[1]._rowNumber,3);
});
