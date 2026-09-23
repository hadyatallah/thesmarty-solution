/* TSS Outlook -> CRM write-back.
 * Purpose: record a Microsoft 365 message that has already been accepted/sent.
 * This module never sends mail. It only writes authoritative CRM history after
 * requireSession_ validates the caller's existing CRM session.
 */

function ccNormalizeEmail_(v){return String(v||'').trim().toLowerCase();}

function ccEmailWritebackCore_(input,now){
 if(!input||typeof input!=='object')throw Error('CC_EMAIL_INVALID');
 const mailbox=ccNormalizeEmail_(input.mailbox);
 const to=ccNormalizeEmail_(input.to);
 const subject=String(input.subject||'').trim();
 const messageId=String(input.messageId||input.internetMessageId||'').trim();
 const actionId=String(input.actionId||'').trim();
 const sentAt=String(input.sentAt||'').trim();
 const bodyPreview=String(input.bodyPreview||'').slice(0,1000);
 if(mailbox!=='info@thesmartysolution.com')throw Error('CC_EMAIL_MAILBOX_INVALID');
 if(!to||!to.includes('@')||!subject||!messageId||!sentAt||!Number.isFinite(Date.parse(sentAt)))throw Error('CC_EMAIL_FIELDS_REQUIRED');
 if(actionId && !/^[a-z0-9-]{8,80}$/i.test(actionId))throw Error('CC_EMAIL_ACTION_INVALID');

 const existing=rows_('Email Activity').find(r=>String(r.messageId||'')===messageId || (actionId&&String(r.actionTaken||'').includes('Command Center action '+actionId)));
 if(existing)return {status:'exists',emailActivityId:existing.emailActivityId||existing.id||'',companyId:existing.companyId||'',contactId:existing.contactId||''};

 const companies=rows_('Companies'),contacts=rows_('Contacts');
 const contactMatches=contacts.filter(r=>ccNormalizeEmail_(r.email)===to);
 const companyMatches=companies.filter(r=>ccNormalizeEmail_(r.email)===to);
 const companyIds=[...new Set([...contactMatches.map(r=>r.companyId),...companyMatches.map(r=>r.id)].filter(Boolean))];
 const companyId=companyIds.length===1?companyIds[0]:'';
 const contactId=contactMatches.length===1?contactMatches[0].id:'';
 const matchedBy=companyIds.length===1?(contactId?'Exact contact email':'Exact company email'):companyIds.length>1?'Ambiguous email match':'No CRM email match';
 const syncStatus=companyIds.length===1?'Matched':companyIds.length>1?'Review':'Unmatched';
 const createdAt=(now||new Date()).toISOString();
 const record={
  emailActivityId:'EMA-'+Utilities.getUuid().slice(0,8),
  messageId,
  direction:'Sent',
  mailbox:'info@thesmartysolution.com',
  companyId,
  contactId,
  fromEmail:'info@thesmartysolution.com',
  toEmails:to,
  subject:subject.slice(0,500),
  messageDate:new Date(sentAt).toISOString(),
  classification:'Sent',
  matchedBy,
  syncStatus,
  bodyPreview,
  actionTaken:(companyIds.length===1?'Recorded Command Center outbound email and updated CRM communication history.':'Recorded Command Center outbound email for review.')+(actionId?' Command Center action '+actionId+'.':''),
  threadKey:String(input.threadKey||subject).slice(0,500),
  createdAt,
  updatedAt:createdAt
 };
 append_('Email Activity',record);

 if(companyIds.length===1){
  const company=companies.find(r=>r.id===companyId);
  if(company){
   company.lastContact=new Date(sentAt).toISOString().slice(0,10);
   if(!company.communicationStatus||company.communicationStatus==='Not contacted')company.communicationStatus='Contacted';
   company.updatedAt=createdAt;
   company.version=String(Date.now());
   writeRecord_('Companies',company);
  }
  if(contactId){
   const contact=contacts.find(r=>r.id===contactId);
   if(contact){
    contact.lastInteraction=new Date(sentAt).toISOString().slice(0,10);
    contact.updatedAt=createdAt;
    contact.version=String(Date.now());
    writeRecord_('Contacts',contact);
   }
  }
 }
 audit_('Email Activity',record.emailActivityId,'Outlook sent email recorded',record.subject);
 return {status:'recorded',emailActivityId:record.emailActivityId,companyId,contactId,syncStatus};
}

function ccRecordEmailActivity(token,input){
 requireSession_(token);
 return ccLock_(()=>ccEmailWritebackCore_(input,new Date()));
}
