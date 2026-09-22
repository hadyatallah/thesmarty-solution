// Replace only syncEmail_ in the existing private Code.gs. This is not a second trigger.
// Remote Gmail reads must never hold the CRM ScriptLock. A ten-minute lease
// fences overlapping scans (longer than Apps Script's six-minute execution cap).
function syncEmail_(){
 const p=PropertiesService.getScriptProperties(),lock=LockService.getScriptLock();
 const runId=Utilities.getUuid();let scan,since,scanRaw;
 lock.waitLock(20000);
 try{
  if(p.getProperty('EMAIL_ENABLED')!=='true')throw Error('Email capture has not been enabled.');
  const lease=JSON.parse(p.getProperty('EMAIL_SYNC_LEASE')||'null');
  if(lease&&Number(lease.expiresAt)>Date.now())return {status:'already_running',scanned:0,created:0,updated:0};
  since=Number(p.getProperty('EMAIL_ENABLED_AT'));
  const last=Number(p.getProperty('EMAIL_LAST_OK')||since);
  scanRaw=p.getProperty('EMAIL_SCAN');
  scan=JSON.parse(scanRaw||'null')||{scanStart:Date.now(),after:Math.floor(Math.max(since,last-86400000)/1000),token:''};
  p.setProperty('EMAIL_SYNC_LEASE',JSON.stringify({runId,expiresAt:Date.now()+600000}));
 }finally{lock.releaseLock();}
 try{
  const messages=[],q='in:inbox -category:promotions -category:social after:'+scan.after;
  let token=scan.token||'',pages=0;
  do{
   const result=googleApi_('messages?maxResults=50&q='+encodeURIComponent(q)+(token?'&pageToken='+encodeURIComponent(token):''));
   for(const brief of result.messages||[]){
    const msg=googleApi_('messages/'+encodeURIComponent(brief.id)+'?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID');
    if(Number(msg.internalDate)>=since)messages.push(msg);
   }
   token=result.nextPageToken||'';pages++;
  }while(token&&pages<2);
  lock.waitLock(20000);
  try{
   const lease=JSON.parse(p.getProperty('EMAIL_SYNC_LEASE')||'null');
   if(!lease||lease.runId!==runId||Number(lease.expiresAt)<=Date.now())throw Error('EMAIL_SYNC_LEASE_LOST');
   if(p.getProperty('EMAIL_ENABLED')!=='true'||Number(p.getProperty('EMAIL_ENABLED_AT'))!==since||p.getProperty('EMAIL_SCAN')!==scanRaw)throw Error('EMAIL_SYNC_STATE_CHANGED');
   // Re-read authoritative records after the slow remote reads, under the same
   // lock used by existing CRM writes. No stale record snapshot is written back.
   const companies=rows_('Companies'),tickets=rows_('Tickets');let scanned=0,created=0,updated=0;
   for(const msg of messages){
 const h=Object.fromEntries((msg.payload?.headers||[]).map(x=>[x.name.toLowerCase(),x.value]));const sender=(h.from||'').match(/<([^>]+)>/)?.[1]||(h.from||'').trim();
 if([OWNER,'info@thesmartysolution.com'].includes(sender.toLowerCase()))continue;
 const matches=companies.filter(c=>c.email.toLowerCase()===sender.toLowerCase());const subject=h.subject||'(No subject)';
 if(!matches.length&&!/enquir|inquir|kiti|partnership|investment|consultancy|business development/i.test(subject))continue;
 scanned++;const existing=tickets.find(t=>t.threadId===msg.threadId);
 const marker='Email message: '+msg.id;if(existing&&existing.notes.includes(marker))continue;
 const summary=marker+'\nFrom: '+sender+'\nSubject: '+subject+'\nReceived: '+new Date(Number(msg.internalDate)).toISOString()+'\nOpen Gmail for the complete message.';
 if(existing){existing.notes=(existing.notes+'\n\n'+summary).slice(-19000);existing.updatedAt=new Date().toISOString();existing.version=String(Date.now());if(['Closed','Resolved'].includes(existing.status))existing.status='In progress';writeRecord_('Tickets',existing);audit_('Tickets',existing.id,'Email received',subject);updated++;}
 else{const now=new Date().toISOString(),due=new Date(Date.now()+2*86400000);const t={id:'TIC-'+Utilities.getUuid().slice(0,8),name:subject.slice(0,250),companyId:matches.length===1?matches[0].id:'',contactEmail:sender,category:'Enquiry',priority:'Normal',status:'New',dueDate:Utilities.formatDate(due,'Asia/Nicosia','yyyy-MM-dd'),threadId:msg.threadId,notes:summary+(matches.length>1?'\nMultiple companies share this email. Link manually.':''),createdAt:now,updatedAt:now,version:'1'};append_('Tickets',t);tickets.push(t);audit_('Tickets',t.id,'Email captured',subject);created++;}
   }
   if(!token){p.setProperty('EMAIL_LAST_OK',String(scan.scanStart));p.deleteProperty('EMAIL_SCAN');}
   else p.setProperty('EMAIL_SCAN',JSON.stringify({scanStart:scan.scanStart,after:scan.after,token}));
   p.deleteProperty('EMAIL_ERROR');p.deleteProperty('EMAIL_SYNC_LEASE');
   return {scanned,created,updated,morePending:!!token};
  }finally{lock.releaseLock();}
 }catch(e){
  // Preserve the scan cursor on failure. Existing message markers make a
  // subsequent bounded scan safe after a partial sheet write.
  lock.waitLock(20000);
  try{
   const lease=JSON.parse(p.getProperty('EMAIL_SYNC_LEASE')||'null');
   if(lease&&lease.runId===runId){p.setProperty('EMAIL_ERROR',String(e.message).slice(0,300));p.deleteProperty('EMAIL_SYNC_LEASE');}
  }finally{lock.releaseLock();}
  throw e;
 }
}
