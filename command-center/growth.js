import {closed,normalize} from './crm.js';
export const suppressed = r => [r.communicationStatus,r.status].includes('Do not contact') || r.status==='Not suitable' || r.suppressed===true || r.doNotContact===true;
export function classifyEmail(message,crm) {
 const email=String(message.fromEmail||'').trim().toLowerCase();
 const matches=crm.rows('Contacts').filter(r=>String(r.email||'').trim().toLowerCase()===email);
 const companyIds=[...new Set([...matches.map(r=>r.companyId),...crm.rows('Companies').filter(r=>String(r.email||'').trim().toLowerCase()===email).map(r=>r.id)].filter(Boolean))];
 // A sender-domain/signature is not authentication. These are triage suggestions.
 const system=/^(security|no-?reply|notifications?|mailer-daemon)@/i.test(email) || /security (?:alert|notice)|sign.in|verification code|password reset/i.test(message.subject||'');
 if(system)return {category:'system/security notice',companyId:null,reviewRequired:true,automaticActions:[]};
 if(companyIds.length!==1)return {category:'requires human review',companyId:null,candidates:companyIds,reviewRequired:true,automaticActions:[]};
 const company=crm.rows('Companies').find(r=>r.id===companyIds[0]);
 return {category:company?.lifecycle==='Client'?'customer reply':'prospect reply',companyId:companyIds[0],reviewRequired:false,suggestedAction:'Review reply and determine next action',automaticActions:[]};
}
export class GrowthAgent {
 constructor({crm,researchAdapter=null}){this.crm=crm;this.researchAdapter=researchAdapter;}
 readiness(company) {
  if(suppressed(company))return {eligible:false,reason:'Do not contact or not suitable'};
  const duplicate=this.crm.quality().duplicates.some(x=>x.entity==='Companies'&&x.ids.includes(company.id));
  if(duplicate)return {eligible:false,reason:'Possible duplicate requires review'};
  if(!this.crm.coverage('Email Activity').available || !this.crm.coverage('Outreach').available)return {eligible:false,reason:'Communication history unavailable; review before outreach'};
  if(this.crm.rows('Opportunities').some(r=>r.companyId===company.id&&!closed(r)))return {eligible:false,reason:'Existing opportunity; review current next action'};
  if(company.lastContact || this.crm.rows('Email Activity').some(r=>r.companyId===company.id) || this.crm.rows('Outreach').some(r=>r.companyId===company.id))return {eligible:false,reason:'Already contacted or being handled; review history'};
  if(!this.crm.coverage('Email Activity').complete || !this.crm.coverage('Outreach').complete)return {eligible:false,reason:'History is partial; cannot clear outreach'};
  return {eligible:true,reason:'Research candidate only; fit and exact send still require review'};
 }
 prospects() {
  const rows=this.crm.rows('Companies').filter(r=>r.lifecycle==='Prospect');
  return {population:'Existing CRM records explicitly marked Prospect',total:rows.length,candidates:rows.map(r=>({id:r.id,name:r.name,...this.readiness(r)})),limitations:['No artificial fit score. Eligibility does not authorize contact.']};
 }
 async research(query) {
  const match=this.crm.lookup(query);
  if(match.status==='ambiguous')return match;
  if(!this.researchAdapter)return {status:'unavailable',reason:'No current-public-research provider configured'};
  const result=await this.researchAdapter.research({company:match.record||null,query});
  const facts=(result.facts||[]).filter(f=>f.text&&/^https:\/\//.test(f.url||'')&&f.checkedAt);
  return {status:'review',companyId:match.record?.id||null,facts,assumptions:result.assumptions||[],recommendations:result.recommendations||[],limitations:['Source links and dates support review, not independent verification of every claim. No company created.']};
 }
 fit(evidence) {
  if(evidence.existingCrmWorking)return {fit:'complement_only',reason:'Keep the working CRM. Assess explicitly evidenced growth or workflow needs.'};
  if(evidence.confirmedNeed && evidence.source)return {fit:'potential',reason:evidence.confirmedNeed,source:evidence.source};
  return {fit:'unproven',reason:'No evidenced customer need. A basic website alone is insufficient.'};
 }
 draft({companyId,channel='email',purpose,followUp=false}) {
  const c=this.crm.lookup(companyId).record;
  if(!c)throw Error('EXACT_COMPANY_REQUIRED');if(suppressed(c))throw Error('SUPPRESSED');
  if(!purpose?.trim())throw Error('PURPOSE_REQUIRED');
  const text=followUp?`Hi, following up on our earlier message to ${c.name} about ${purpose}. Is this something you would like to explore?`:`Hi, I'm contacting ${c.name} from The Smarty Solution about ${purpose}. We help businesses with business development, customer management and follow-up. Would this be relevant to your team?`;
  return {status:'Draft',channel,from:channel==='email'?'info@thesmartysolution.com':null,to:channel==='email'?c.email||null:c.phone||null,subject:followUp?'Following up':'An idea for '+c.name,text:text+'\n\nThe Smarty Solution\nhttps://www.thesmartysolution.com',limitations:channel==='whatsapp'?['Prepared only. Send in WhatsApp Business App and log manually. No inbox access.']:['Prepared only. Exact recipient and final text require approval before sending.'],readiness:this.readiness(c)};
 }
 incoming() {
  if(!this.crm.coverage('Email Activity').available)return {available:false,messages:[],limitation:'Email history unavailable'};
  return {available:true,coverage:this.crm.coverage('Email Activity'),messages:this.crm.rows('Email Activity').filter(m=>/^(received|inbound|incoming)$/i.test(m.direction||'')).map(m=>({messageId:m.messageId,subject:m.subject,date:m.messageDate,...classifyEmail(m,this.crm)})),limitation:'Ledger reflects captured messages, not a live inbox or proof of unanswered status'};
 }
}
