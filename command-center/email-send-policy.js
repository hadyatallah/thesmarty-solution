import {emailWindowOpen} from './email-hours.js';

export function normalizeEmail(v){return String(v||'').trim().toLowerCase();}
export function validateMessage(input={}){
 const to=normalizeEmail(input.to),subject=String(input.subject||'').trim(),text=String(input.text||'').replace(/
/g,'
').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))throw Error('EMAIL_RECIPIENT_INVALID');
 if(!subject||subject.length>200)throw Error('EMAIL_SUBJECT_INVALID');
 if(!text||text.length>20000)throw Error('EMAIL_BODY_INVALID');
 if(/Greek translation of the specific outreach purpose is required before approval/i.test(text))throw Error('EMAIL_TRANSLATION_INCOMPLETE');
 return {to,subject,text};
}
export function findRecipientContext(snapshot={},email){
 const e=normalizeEmail(email),records=snapshot.records||snapshot;
 const contacts=(records.Contacts||[]).filter(r=>normalizeEmail(r.email)===e);
 const companies=(records.Companies||[]).filter(r=>normalizeEmail(r.email)===e);
 const ids=[...new Set([...contacts.map(r=>r.companyId),...companies.map(r=>r.id)].filter(Boolean))];
 if(ids.length!==1)throw Error(ids.length?'EMAIL_RECIPIENT_AMBIGUOUS':'EMAIL_RECIPIENT_NOT_IN_CRM');
 const company=(records.Companies||[]).find(r=>r.id===ids[0]);
 if(!company)throw Error('EMAIL_COMPANY_NOT_FOUND');
 if([company.communicationStatus,company.status].includes('Do not contact')||company.suppressed===true||company.doNotContact===true)throw Error('EMAIL_RECIPIENT_SUPPRESSED');
 return {company,contact:contacts.length===1?contacts[0]:null};
}
export function recentDuplicate(snapshot={},message,now=new Date(),windowMs=30*60*1000){
 const records=snapshot.records||snapshot,e=normalizeEmail(message.to),subject=String(message.subject||'').trim().toLowerCase();
 return (records['Email Activity']||[]).some(r=>{
  if(!/^(sent|outbound|outgoing)$/i.test(r.direction||''))return false;
  const tos=String(r.toEmails||r.toEmail||r.recipientEmail||'').toLowerCase().split(/[;,]/).map(x=>x.trim());
  const at=Date.parse(r.messageDate||r.sentAt||r.createdAt||'');
  return tos.includes(e)&&String(r.subject||'').trim().toLowerCase()===subject&&Number.isFinite(at)&&now.getTime()-at>=0&&now.getTime()-at<=windowMs;
 });
}
export function enforceSendPreflight(snapshot,message,now=new Date()){
 const context=findRecipientContext(snapshot,message.to);
 if(recentDuplicate(snapshot,message,now))throw Error('EMAIL_DUPLICATE_RECENT');
 if(!emailWindowOpen(now))throw Error('EMAIL_OUTSIDE_BUSINESS_HOURS');
 return context;
}

export function assertEmailControls(snapshot={}){
 const records=snapshot.records||snapshot,settings=Object.fromEntries((records['System Control']||[]).filter(r=>r?.setting).map(r=>[r.setting,String(r.value??'')]));
 if(settings.commandCenterDirectEmailSendEnabled!=='ON')throw Error('EMAIL_DIRECT_SEND_DISABLED');
 if(settings.approvalRequired!=='YES')throw Error('EMAIL_APPROVAL_CONTROL_INVALID');
 if(String(settings.defaultMailbox||'').toLowerCase()!=='info@thesmartysolution.com')throw Error('EMAIL_MAILBOX_CONTROL_INVALID');
 if(settings.outreachAutomationEnabled==='OFF')throw Error('EMAIL_OUTREACH_DISABLED');
 return true;
}
