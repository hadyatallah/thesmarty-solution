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
 constructor({crm,researchAdapter=null,translatePurpose=null}){this.crm=crm;this.researchAdapter=researchAdapter;this.translatePurpose=translatePurpose;}
 async prepareDraft(input) {
  const initial=this.draft(input);
  if(initial.channel!=='email'||input.purposeGreek||!this.translatePurpose)return initial;
  try {
   const translated=await this.translatePurpose(input.purpose);
   if(typeof translated!=='string'||translated.length>3000||!/[\u0370-\u03ff\u1f00-\u1fff]/.test(translated))throw Error('TRANSLATION_UNAVAILABLE');
   return this.draft({...input,purposeGreek:translated.trim()});
  }catch{return {...initial,limitations:[...initial.limitations,'Greek translation is unavailable. Nothing was sent. Review and complete the draft before approval.']};}
 }
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
  return {status:'review',companyId:match.record?.id||null,facts,assumptions:result.assumptions||[],recommendations:result.recommendations||[],readiness:match.record?this.readiness(match.record):{eligible:false,reason:'New public research only; CRM matching and history review required'},limitations:[...(result.limitations||[]),'Source links and dates support review, not independent verification of every claim. No company created.']};
 }
 fit(evidence) {
  if(evidence.existingCrmWorking)return {fit:'complement_only',reason:'Keep the working CRM. Assess explicitly evidenced growth or workflow needs.'};
  if(evidence.confirmedNeed && evidence.source)return {fit:'potential',reason:evidence.confirmedNeed,source:evidence.source};
  return {fit:'unproven',reason:'No evidenced customer need. A basic website alone is insufficient.'};
 }
 draft({companyId,channel='email',purpose,purposeGreek='',followUp=false}) {
  const c=this.crm.lookup(companyId).record;
  if(!c)throw Error('EXACT_COMPANY_REQUIRED');if(suppressed(c))throw Error('SUPPRESSED');
  if(!purpose?.trim())throw Error('PURPOSE_REQUIRED');
  const internalQa=/\binternal\b/i.test(purpose)&&/\b(?:qa|test|testing)\b/i.test(purpose);
  const text=internalQa?`Hello, this is an internal TSS QA message for ${c.name}. It is being sent only to verify the controlled Outlook send workflow. No customer action is required and this message should not be treated as commercial outreach.`:followUp?`Hi, following up on our earlier message to ${c.name} about ${purpose}. Is this something you would like to explore?`:`Hi, I'm contacting ${c.name} from The Smarty Solution about ${purpose}. We help businesses with business development, customer management and follow-up. Would this be relevant to your team?`;
  const signature='\n\nThe Smarty Solution\ninfo@thesmartysolution.com\nhttps://www.thesmartysolution.com';
  const english=text+signature;
  const greek=internalQa?`Καλημέρα σας, αυτό είναι ένα εσωτερικό μήνυμα ελέγχου ποιότητας (QA) της TSS για την εταιρεία ${c.name}. Αποστέλλεται αποκλειστικά για την επαλήθευση της ελεγχόμενης διαδικασίας αποστολής μέσω Outlook. Δεν απαιτείται καμία ενέργεια και το μήνυμα αυτό δεν αποτελεί εμπορική επικοινωνία.`+signature:purposeGreek.trim()?(followUp?`Καλημέρα σας, επανέρχομαι στο προηγούμενο μήνυμά μας προς την εταιρεία ${c.name} σχετικά με ${purposeGreek}. Θα σας ενδιέφερε να το συζητήσουμε;`:`Καλημέρα σας, επικοινωνώ με την εταιρεία ${c.name} εκ μέρους της The Smarty Solution σχετικά με ${purposeGreek}. Βοηθούμε επιχειρήσεις στην επιχειρηματική ανάπτυξη, στη διαχείριση πελατών και στη συστηματική επικοινωνία μαζί τους. Θα ήταν χρήσιμο για την ομάδα σας;`)+signature:null;
  const bilingual=channel==='email';
  return {status:'Draft',channel,from:bilingual?'info@thesmartysolution.com':null,to:bilingual?c.email||null:c.phone||null,subject:followUp?'Following up / Συνέχεια επικοινωνίας':'An idea for '+c.name+' / Μια ιδέα για την εταιρεία '+c.name,text:bilingual?'English\n'+english+'\n\nΕλληνικά\n'+(greek||'[Greek translation of the specific outreach purpose is required before approval.]'):english,languages:bilingual?['en','el-CY']:['en'],translationStatus:bilingual?(greek?'Requires human review':'Missing Greek purpose'):'Not requested',approvalReady:!bilingual||!!greek,limitations:channel==='whatsapp'?['Prepared only. Send in WhatsApp Business App and log manually. No inbox access.']:['Prepared only. Both language versions must convey equivalent facts. Exact recipient, sender and final bilingual text require approval before sending.'],readiness:this.readiness(c)};
 }
 incoming() {
  if(!this.crm.coverage('Email Activity').available)return {available:false,messages:[],limitation:'Email history unavailable'};
  return {available:true,coverage:this.crm.coverage('Email Activity'),messages:this.crm.rows('Email Activity').filter(m=>/^(received|inbound|incoming)$/i.test(m.direction||'')).map(m=>({messageId:m.messageId,subject:m.subject,date:m.messageDate,...classifyEmail(m,this.crm)})),limitation:'Ledger reflects captured messages, not a live inbox or proof of unanswered status'};
 }
}
