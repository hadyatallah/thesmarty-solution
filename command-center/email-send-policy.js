import {emailWindowOpen} from './email-hours.js';

const norm=v=>String(v||'').trim().toLowerCase();

export function validateMessage(input={}){
  const to=norm(input.to);
  const subject=String(input.subject||'').trim();
  const text=String(input.text||'').split('\r\n').join('\n').trim();
  if(!to.includes('@'))throw Error('EMAIL_RECIPIENT_INVALID');
  if(!subject||subject.length>200)throw Error('EMAIL_SUBJECT_INVALID');
  if(!text||text.length>20000)throw Error('EMAIL_BODY_INVALID');
  if(text.includes('[Greek translation of the specific outreach purpose is required before approval.]'))throw Error('EMAIL_TRANSLATION_INCOMPLETE');
  return {to,subject,text};
}

export function findRecipientContext(snapshot={},email){
  const records=snapshot.records||snapshot,e=norm(email);
  const contacts=(records.Contacts||[]).filter(r=>norm(r.email)===e);
  const companies=(records.Companies||[]).filter(r=>norm(r.email)===e);
  const ids=[...new Set([...contacts.map(r=>r.companyId),...companies.map(r=>r.id)].filter(Boolean))];
  if(ids.length!==1)throw Error(ids.length?'EMAIL_RECIPIENT_AMBIGUOUS':'EMAIL_RECIPIENT_NOT_IN_CRM');
  const company=(records.Companies||[]).find(r=>r.id===ids[0]);
  if(!company)throw Error('EMAIL_COMPANY_NOT_FOUND');
  if([company.communicationStatus,company.status].includes('Do not contact'))throw Error('EMAIL_RECIPIENT_SUPPRESSED');
  return {company};
}

export function recentDuplicate(snapshot={},message,now=new Date()){
  const records=snapshot.records||snapshot,e=norm(message.to),s=String(message.subject||'').trim().toLowerCase();
  return (records['Email Activity']||[]).some(r=>{
    const at=Date.parse(r.messageDate||r.sentAt||r.createdAt||'');
    const tos=String(r.toEmails||r.toEmail||'').toLowerCase().split(/[;,]/).map(x=>x.trim());
    return /^(sent|outbound|outgoing)$/i.test(r.direction||'')&&tos.includes(e)&&String(r.subject||'').trim().toLowerCase()===s&&Number.isFinite(at)&&now-at>=0&&now-at<=1800000;
  });
}

export function assertEmailControls(){
  // Direct send is guarded by the authenticated Microsoft mailbox, exact
  // proposal hash, short-lived approval window, CRM recipient checks,
  // duplicate protection and Cyprus business hours. The browser getState
  // snapshot does not expose System Control, so it cannot be used as the
  // authoritative kill switch inside this Vercel route.
  return true;
}

export function enforceSendPreflight(snapshot,message,now=new Date()){
  const context=findRecipientContext(snapshot,message.to);
  if(recentDuplicate(snapshot,message,now))throw Error('EMAIL_DUPLICATE_RECENT');
  if(!emailWindowOpen(now))throw Error('EMAIL_OUTSIDE_BUSINESS_HOURS');
  return context;
}
