import {closed,normalize} from './crm.js';
export const suppressed = r => [r.communicationStatus,r.status].includes('Do not contact') || r.status==='Not suitable' || r.suppressed===true || r.doNotContact===true;
export const TSS_EMAIL_SIGNATURE='The Smarty Solution\nConnect · Develop · Invest.\ninfo@thesmartysolution.com\n+35799810330\nhttps://www.thesmartysolution.com';
export const isCommunicationDraftRequest=q=>{
 const s=String(q||'');
 const write=/\b(?:prepare|draft|write|compose|create|send)\b/i.test(s)&&/\b(?:email|message|whatsapp|introduction)\b/i.test(s);
 const follow=/\b(?:follow[ -]?up|reply|respond)\b/i.test(s);
 return write||follow;
};
export function communicationRequest(q,crm){
 const text=String(q||'').trim(),channel=/\bwhatsapp\b/i.test(text)?'whatsapp':'email',followUp=/\b(?:follow[ -]?up|reply|respond)\b/i.test(text);
 const normalized=normalize(text),mentioned=crm.rows('Companies').filter(c=>{const n=normalize(c.name);return n.length>=3&&(' '+normalized+' ').includes(' '+n+' ');}).sort((a,b)=>String(b.name||'').length-String(a.name||'').length);
 let company=mentioned[0]||null;
 if(mentioned.length>1&&normalize(mentioned[0].name)===normalize(mentioned[1].name))company=null;
 if(!company){
  const m=text.match(/\b(?:to|for|with)\s+(.+?)(?=\s+(?:about|regarding|concerning|on)\b|$)/i);
  if(m){const found=crm.lookup(m[1].trim());if(found.record)company=found.record;}
 }
 if(!company)return {status:'needs_context',message:'Specify the exact CRM company for this communication. Nothing has been sent.'};
 const purposeMatch=text.match(/\b(?:about|regarding|concerning|on)\s+(.+)$/i);
 let purpose=purposeMatch?purposeMatch[1].trim():'';
 if(followUp&&/^(?:the |a )?(?:follow[ -]?up|email|message)$/i.test(purpose))purpose='';
 if(!followUp&&!purpose)return {status:'needs_context',message:'Specify the purpose of the message. Nothing has been sent.',companyId:company.id};
 return {companyId:company.id,channel,purpose,followUp};
}
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
  let prepared={...input};
  if(prepared.followUp&&!String(prepared.purpose||'').trim()){
   const previous=this.crm.rows('Email Activity').filter(r=>r.companyId===prepared.companyId&&/^(sent|outbound)$/i.test(r.direction||'')).sort((a,b)=>String(b.messageDate||'').localeCompare(String(a.messageDate||'')))[0];
   if(previous?.subject)prepared={...prepared,priorSubject:String(previous.subject).trim()};
  }
  const initial=this.draft(prepared);
  if(initial.channel!=='email'||initial.approvalReady||prepared.purposeGreek||!this.translatePurpose)return initial;
  try {
   const translated=await this.translatePurpose(prepared.purpose);
   if(typeof translated!=='string'||translated.length>3000||!/[\u0370-\u03ff\u1f00-\u1fff]/.test(translated))throw Error('TRANSLATION_UNAVAILABLE');
   return this.draft({...prepared,purposeGreek:translated.trim()});
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
 draft({companyId,channel='email',purpose='',purposeGreek='',followUp=false,priorSubject=''}) {
  const c=this.crm.lookup(companyId).record;
  if(!c)throw Error('EXACT_COMPANY_REQUIRED');if(suppressed(c))throw Error('SUPPRESSED');
  if(!String(purpose||'').trim()&&!priorSubject)throw Error('PURPOSE_REQUIRED');

  const internalQa=/\binternal\b/i.test(purpose)&&/\b(?:qa|test|testing)\b/i.test(purpose);
  const signature='\n\n'+TSS_EMAIL_SIGNATURE;
  const contacts=this.crm.rows('Contacts').filter(r=>r.companyId===c.id&&String(r.name||'').trim());
  const preferred=contacts.find(r=>String(r.primaryContact||'').toLowerCase()==='yes')||(contacts.length===1?contacts[0]:null);
  const firstName=preferred?String(preferred.name).trim().split(/\s+/)[0]:'';
  const englishHello=firstName?'Hi '+firstName+',':'Hi,';

  const englishBody=internalQa
   ? `${englishHello} A quick note before anything else: this is only an internal TSS QA email for ${c.name}. It is being sent to verify the controlled Outlook workflow. No customer action is required, and this is not commercial outreach.`
   : followUp&&priorSubject
    ? `${englishHello} I wanted to follow up on my earlier email, “${priorSubject}”. If it is still relevant, I would be happy to continue the conversation. If not, no problem at all.`
    : followUp
     ? `${englishHello} I wanted to follow up on my earlier note about ${purpose}. If it is relevant to ${c.name}, I would be happy to share a little more. If not, no problem at all.`
     : `${englishHello} I will keep this brief. I am reaching out with one specific idea around ${purpose} that may be relevant to ${c.name}. If it is worth exploring, I would be happy to share a little more.`;

  const greekBody=internalQa
   ? `Καλημέρα σας, μια σύντομη σημείωση πριν από οτιδήποτε άλλο: αυτό είναι μόνο ένα εσωτερικό μήνυμα QA της TSS για την εταιρεία ${c.name}. Αποστέλλεται για την επαλήθευση της ελεγχόμενης διαδικασίας Outlook. Δεν απαιτείται καμία ενέργεια και δεν αποτελεί εμπορική επικοινωνία.`
   : followUp&&priorSubject
    ? `Καλημέρα σας, ήθελα να επανέλθω στο προηγούμενο μήνυμά μου με θέμα «${priorSubject}». Αν εξακολουθεί να είναι σχετικό, θα χαρώ να συνεχίσουμε την επικοινωνία. Αν όχι, κανένα πρόβλημα.`
    : purposeGreek.trim()
     ? followUp
      ? `Καλημέρα σας, ήθελα να επανέλθω στο προηγούμενο μήνυμά μου σχετικά με ${purposeGreek}. Αν είναι σχετικό με την εταιρεία ${c.name}, θα χαρώ να μοιραστώ περισσότερες πληροφορίες. Αν όχι, κανένα πρόβλημα.`
      : `Καλημέρα σας, θα είμαι σύντομος. Επικοινωνώ με μια συγκεκριμένη ιδέα σχετικά με ${purposeGreek}, η οποία μπορεί να είναι σχετική με την εταιρεία ${c.name}. Αν αξίζει να το εξετάσουμε, θα χαρώ να μοιραστώ περισσότερες πληροφορίες.`
     : null;

  const bilingual=channel==='email';
  const outbound=bilingual
    ? englishBody+'\n\n'+(greekBody||'[Greek translation of the specific outreach purpose is required before approval.]')+signature
    : englishBody+signature;

  const subject=internalQa
    ? 'Internal TSS QA test'
    : followUp
      ? (priorSubject?'Following up: '+priorSubject+' / Συνέχεια επικοινωνίας':'Following up / Συνέχεια επικοινωνίας')
      : 'A quick idea for '+c.name+' / Μια σύντομη ιδέα για '+c.name;

  if(channel==='email'){
   if(/\[(?:your|sender)?\s*name\]|best regards|kind regards|sincerely/i.test(outbound))throw Error('EMAIL_TEMPLATE_INVALID');
   if(!outbound.endsWith(TSS_EMAIL_SIGNATURE))throw Error('EMAIL_SIGNATURE_INVALID');
  }
  return {
   status:'Draft',channel,
   from:bilingual?'info@thesmartysolution.com':null,
   to:bilingual?c.email||null:c.phone||null,
   subject,
   text:outbound,
   englishText:bilingual?englishBody:null,
   greekText:bilingual?greekBody:null,
   signatureText:signature.trim(),
   languages:bilingual?['en','el-CY']:['en'],
   translationStatus:bilingual?(greekBody?'Requires human review':'Missing Greek purpose'):'Not requested',
   approvalReady:!bilingual||!!greekBody,
   limitations:channel==='whatsapp'?['Prepared only. Send in WhatsApp Business App and log manually. No inbox access.']:['Prepared only. Both language versions must convey equivalent facts. Exact recipient, sender and final bilingual text require approval before sending.'],
   readiness:this.readiness(c)
  };
 }
 incoming() {
  if(!this.crm.coverage('Email Activity').available)return {available:false,messages:[],limitation:'Email history unavailable'};
  return {available:true,coverage:this.crm.coverage('Email Activity'),messages:this.crm.rows('Email Activity').filter(m=>/^(received|inbound|incoming)$/i.test(m.direction||'')).map(m=>({messageId:m.messageId,subject:m.subject,date:m.messageDate,...classifyEmail(m,this.crm)})),limitation:'Ledger reflects captured messages, not a live inbox or proof of unanswered status'};
 }
}
