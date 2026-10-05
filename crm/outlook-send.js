import {PDF_MAX_BYTES,PDF_MIME,pdfMetadata,safePdfFilename,sameAttachment,ATTACHMENT_ERRORS} from '../command-center/email-attachment.js';
import {withTssSignature} from '../command-center/email-signature.js';
const API='https://api.thesmartysolution.com';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=['from','to','subject','text'];
// Per-page UI guards only. Authoritative checks remain in the existing API.
let inFlight=false,sessionSource=()=>'',bound=false;
const outcomes=new Map(),attachments=new WeakMap();
const normEmail=v=>String(v||'').trim().toLowerCase();
function messageValues(d){const text=String(d.text||'').replace(/\r\n/g,'\n').trim();return {from:normEmail(d.from),to:normEmail(d.to),subject:String(d.subject||'').trim(),text:d.channel==='email'&&normEmail(d.from)==='info@thesmartysolution.com'&&text?withTssSignature(text):text};}
function readCard(card){return Object.fromEntries(fields.map(k=>[k,card.querySelector('[data-email-'+k+']')?.textContent||'']));}
const sameMessage=(a,b)=>fields.every(k=>a[k]===b[k]);
const keyFor=(m,a)=>JSON.stringify([...fields.map(k=>m[k]),a||null]);
const stateFor=card=>{if(!attachments.has(card))attachments.set(card,{revision:0,file:null,metadata:null,pending:false,locked:false,error:null});return attachments.get(card);};
const sizeLabel=n=>new Intl.NumberFormat('en-GB',{maximumFractionDigits:2}).format(n/1000)+' KB · PDF · '+n.toLocaleString('en-GB')+' bytes';
const metadataLabel=a=>a.filename+' — '+sizeLabel(a.size);
function fileControls(card,disabled){for(const selector of ['[data-email-attach]','[data-email-file]','[data-email-remove]','[data-email-drive]']){const e=card.querySelector(selector);if(e)e.disabled=disabled;}}
function attachmentView(card){
 const s=stateFor(card),box=card.querySelector('[data-email-attachment-info]'),name=card.querySelector('[data-email-attachment-name]'),size=card.querySelector('[data-email-attachment-size]');
 if(box)box.hidden=!s.metadata;
 if(name)name.textContent=s.metadata?.filename||'';
 if(size)size.textContent=s.metadata?sizeLabel(s.metadata.size):'';
 const remove=card.querySelector('[data-email-remove]');if(remove)remove.hidden=!s.metadata&&!s.pending&&!s.error;
 const button=card.querySelector('[data-email-approve]');if(button&&!s.locked)button.disabled=s.pending||!!s.error;
}
function setAttachmentStatus(card,text,error=false){const e=card.querySelector('[data-email-attachment-status]');if(e){e.textContent=text;e.classList.toggle('error',error);}}
async function metadataForFile(file,driveFileId,bytes){
 if(!file||typeof file.arrayBuffer!=='function')throw Error('EMAIL_ATTACHMENT_INVALID');
 if(!Number.isSafeInteger(file.size)||file.size<=0)throw Error('EMAIL_ATTACHMENT_INVALID');
 if(file.size>PDF_MAX_BYTES)throw Error('EMAIL_ATTACHMENT_TOO_LARGE');
 if(typeof file.type!=='string'||(file.type&&file.type.toLowerCase()!==PDF_MIME))throw Error('EMAIL_ATTACHMENT_NOT_PDF');
 const filename=safePdfFilename(file.name);
 bytes=bytes||new Uint8Array(await file.arrayBuffer());
 if(bytes.byteLength!==file.size)throw Error('EMAIL_ATTACHMENT_CHANGED');
 if(String.fromCharCode(...bytes.subarray(0,5))!=='%PDF-')throw Error('EMAIL_ATTACHMENT_NOT_PDF');
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const sha256=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 return pdfMetadata({filename,mimeType:PDF_MIME,size:bytes.byteLength,sha256,documentVersion:filename,...(driveFileId?{driveFileId}:{})});
}
export async function selectPdfAttachment({card,files}){
 const s=stateFor(card);if(s.locked){++s.revision;return {ok:false,error:'EMAIL_ATTACHMENT_CHANGED'};}
 const revision=++s.revision;s.file=null;s.metadata=null;s.error=null;s.pending=true;attachmentView(card);
 setAttachmentStatus(card,'Checking PDF locally. Nothing is being sent.');
 try{
  if(!files||files.length!==1)throw Error('EMAIL_ATTACHMENT_INVALID');
  const file=files[0],driveFileId='';const drive=card.querySelector('[data-email-drive]');if(drive)drive.value='';
  const metadata=await metadataForFile(file,driveFileId);
  if(s.revision!==revision)return {ok:false,error:'EMAIL_ATTACHMENT_CHANGED'};
  s.file=file;s.metadata=metadata;s.pending=false;attachmentView(card);
  setAttachmentStatus(card,'PDF selected. Review the email and attachment before approving.');
  return {ok:true,attachment:metadata};
 }catch(error){
  if(s.revision!==revision)return {ok:false,error:'EMAIL_ATTACHMENT_CHANGED'};
  s.pending=false;s.error=String(error?.message||'EMAIL_ATTACHMENT_INVALID');
  const input=card.querySelector('[data-email-file]');if(input)input.value='';
  attachmentView(card);setAttachmentStatus(card,'Not sent. '+(explanations[s.error]||'The PDF could not be checked. Remove it or select a valid PDF.'),true);
  return {ok:false,error:s.error};
 }
}
export function removePdfAttachment(card){
 const s=stateFor(card);if(s.locked){++s.revision;return;}
 ++s.revision;s.file=null;s.metadata=null;s.error=null;s.pending=false;
 const input=card.querySelector('[data-email-file]');if(input)input.value='';
 const drive=card.querySelector('[data-email-drive]');if(drive)drive.value='';
 attachmentView(card);setAttachmentStatus(card,'Attachment removed. A fresh proposal is required on approval.');
}
function changeDriveReference(card){
 const s=stateFor(card);if(s.locked){++s.revision;return;}
 ++s.revision;
 if(!s.metadata)return;
 try{const {driveFileId:old,...a}=s.metadata;const id=String(card.querySelector('[data-email-drive]')?.value||'').trim();s.metadata=pdfMetadata({...a,...(id?{driveFileId:id}:{})});s.error=null;setAttachmentStatus(card,'Reference updated. Review the attachment before approving.');}
 catch{s.error='EMAIL_ATTACHMENT_INVALID';setAttachmentStatus(card,'Not sent. Use a restricted Google Drive file ID, not a URL. The reference is never fetched.',true);}
 attachmentView(card);
}
function attachmentUnchanged(card,snapshot){
 const s=stateFor(card);
 if(s.revision!==snapshot.revision||s.file!==snapshot.file||s.pending||s.error||!sameAttachment(s.metadata,snapshot.metadata))return false;
 if(!snapshot.metadata)return true;
 return String(card.querySelector('[data-email-drive]')?.value||'').trim()===(snapshot.metadata.driveFileId||'')&&card.querySelector('[data-email-attachment-name]')?.textContent===snapshot.metadata.filename&&card.querySelector('[data-email-attachment-size]')?.textContent===sizeLabel(snapshot.metadata.size);
}
function fileBase64(bytes){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}

export function renderEmailDraft(d){
 const m=messageValues(d),email=d.channel==='email';
 const ready=email&&d.approvalReady===true&&m.from==='info@thesmartysolution.com'&&m.to.includes('@')&&m.subject&&m.text;
 const details=['from','to','subject'].filter(k=>m[k]).map(k=>'<li><strong>'+k[0].toUpperCase()+k.slice(1)+':</strong> <span data-email-'+k+'>'+esc(m[k])+'</span></li>').join('');
 const attachment=email?'<section aria-label="PDF attachment" style="overflow-wrap:anywhere"><button type="button" data-email-attach>Attach PDF</button><input type="file" data-email-file accept=".pdf,application/pdf" aria-label="Choose one PDF, maximum 2 MB" hidden><span class="muted"> One PDF · maximum 2 MB (2,000,000 bytes)</span><div data-email-attachment-info hidden><p><strong>Attachment:</strong><br><span data-email-attachment-name></span><br><span data-email-attachment-size></span></p><label>Restricted Drive file ID (optional; reference only)<input type="text" data-email-drive maxlength="200" autocomplete="off" style="max-width:100%;box-sizing:border-box" aria-label="Restricted Google Drive file ID"></label></div><button type="button" data-email-remove hidden>Remove attachment</button><p data-email-attachment-status role="status" aria-live="polite"></p></section>':'';
 return '<div data-email-card data-pdf-attachments="v1"><p data-email-stage>Draft only · '+esc(d.channel)+'</p><ul>'+details+'</ul>'+attachment+'<p data-email-text style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(m.text)+'</p>'+(ready?'<p class="muted">Review the details above. Approve and send sends this exact email and selected PDF, if any. There is no second confirmation.</p><button type="button" class="primary" data-email-approve>Approve and send</button><p data-email-status role="status" aria-live="polite" aria-atomic="true"></p>':'')+'</div>';
}

function showOutcome(card,button,status,result){
 status.textContent=result.message;
 status.classList.toggle('error',result.state==='uncertain'||result.state==='blocked');
 button.textContent=result.state==='succeeded'?'Sent':result.state==='accepted'?'Accepted':result.state==='uncertain'?'Check Sent Items':'Approve and send';
 button.disabled=result.state!=='blocked';
 const label=card.querySelector('[data-email-stage]');
 if(label)label.textContent=({succeeded:'Sent · email',accepted:'Accepted by Microsoft · email',uncertain:'Send status not confirmed · email',blocked:'Draft only · email'})[result.state];
}
async function post(path,body){
 const r=await fetch(API+path,{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json();
 if(!r.ok||data?.ok!==true)throw Error(data?.error||'EMAIL_RESPONSE_UNCONFIRMED');
 return data;
}
const definiteBlocks=new Set([...ATTACHMENT_ERRORS,'EMAIL_SIGNATURE_INVALID','AUTH_REQUIRED','EMAIL_APPROVAL_NOT_APPLICABLE','EMAIL_OUTSIDE_BUSINESS_HOURS','EMAIL_DUPLICATE_RECENT','EMAIL_RECIPIENT_SUPPRESSED','EMAIL_CONTEXT_CHANGED','EMAIL_SENDER_CHANGED','EMAIL_SEND_REJECTED']);
const explanations={
 AUTH_REQUIRED:'Sign in to the CRM again.',
 OUTLOOK_RECONNECT_REQUIRED:'Reconnect Outlook before sending.',
 EMAIL_OUTSIDE_BUSINESS_HOURS:'Sending is limited to the configured Cyprus business hours. No automatic retry is scheduled.',
 EMAIL_RECIPIENT_SUPPRESSED:'This recipient is marked Do not contact.',
 EMAIL_DUPLICATE_RECENT:'A recent matching email is already recorded. Check Sent Items before another send.',
 EMAIL_DETAILS_CHANGED:'The email or signed-in session changed. Review a fresh draft before approving it.',
 EMAIL_PROPOSAL_INVALID:'The server did not confirm the exact email. Refresh and review a fresh draft.',
 EMAIL_APPROVAL_NOT_APPLICABLE:'This approval is no longer valid. Review a fresh draft.',
 EMAIL_SEND_REJECTED:'Microsoft rejected the send request.',
 EMAIL_SIGNATURE_INVALID:'The email must use the approved TSS signature. Refresh and review a fresh draft.',
 EMAIL_ATTACHMENT_TOO_LARGE:'The PDF exceeds 2 MB (2,000,000 bytes).',
 EMAIL_ATTACHMENT_NOT_PDF:'The selected file is not an accepted PDF. Select a PDF document.',
 EMAIL_ATTACHMENT_CHANGED:'The attachment changed. Review the current file and approve a fresh proposal.',
 EMAIL_ATTACHMENT_INVALID:'Select exactly one non-empty PDF with a safe filename. No other attachment fields or file URLs are accepted.',
 EMAIL_ATTACHMENT_MISSING:'The approved PDF is missing. Select it again and review a fresh proposal.',
 EMAIL_ATTACHMENT_AUDIT_UNAVAILABLE:'PDF sending is not enabled until the CRM attachment audit upgrade is verified. Text-only email remains available.',
 EMAIL_ATTACHMENT_QA_ONLY:'PDF sending is limited to the Internal QA Company until controlled acceptance is recorded.'
};

// Called only by an explicit click on the approval button below the visible draft.
export async function sendApprovedEmail({card,button,getSession}){
 const status=card.querySelector('[data-email-status]');
 if(!status||button.disabled)return;
 if(inFlight){status.textContent='Another email is being processed. Wait for its result before approving this one.';return;}
 const s=stateFor(card);if(s.pending||s.error){status.textContent='Not sent. Check or remove the selected attachment first.';return;}
 const snapshot={revision:s.revision,file:s.file,metadata:s.metadata?Object.freeze({...s.metadata}):null};
 const approved=Object.freeze(readCard(card)),key=keyFor(approved,snapshot.metadata);
 if(outcomes.has(key)){showOutcome(card,button,status,outcomes.get(key));return;}
 inFlight=true;s.locked=true;fileControls(card,true);button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Checking…';
 status.classList.remove('error');status.textContent='Checking current CRM and Outlook details…';
 let dispatchStarted=false,finished=false;
 try{
  const session=getSession();
  if(!session)throw Error('AUTH_REQUIRED');
  if(approved.from!=='info@thesmartysolution.com'||!approved.to||!approved.subject||!approved.text)throw Error('EMAIL_DETAILS_CHANGED');
  if(!attachmentUnchanged(card,snapshot))throw Error('EMAIL_ATTACHMENT_CHANGED');
  const data=await post('/api/outlook/send/propose',{session,message:{to:approved.to,subject:approved.subject,text:approved.text},...(snapshot.metadata?{attachment:snapshot.metadata}:{})});
  const p=data.proposal;
  if(!p||typeof p.id!=='string'||!p.id||typeof p.hash!=='string'||!p.hash||!Number.isFinite(Date.parse(p.expiresAt))||Date.parse(p.expiresAt)<=Date.now())throw Error('EMAIL_PROPOSAL_INVALID');
  // The click approves only the visible package, never server-modified content.
  if(!sameMessage(approved,p)||!card.isConnected||!button.isConnected||!sameMessage(approved,readCard(card))||session!==getSession())throw Error('EMAIL_DETAILS_CHANGED');
  if(!sameAttachment(snapshot.metadata,p.attachment)||!attachmentUnchanged(card,snapshot))throw Error('EMAIL_ATTACHMENT_CHANGED');
  let attachment;
  if(snapshot.metadata){
   const bytes=new Uint8Array(await snapshot.file.arrayBuffer());
   const current=await metadataForFile(snapshot.file,snapshot.metadata.driveFileId,bytes);
   if(!sameAttachment(snapshot.metadata,current))throw Error('EMAIL_ATTACHMENT_CHANGED');
   attachment={...snapshot.metadata,contentBytes:fileBase64(bytes)};
  }
  if(!sameMessage(approved,readCard(card))||!card.isConnected||!button.isConnected||session!==getSession())throw Error('EMAIL_DETAILS_CHANGED');
  if(!attachmentUnchanged(card,snapshot))throw Error('EMAIL_ATTACHMENT_CHANGED');
  button.textContent='Sending…';status.textContent='Sending through Microsoft 365. Please wait for the result.';
  dispatchStarted=true;
  const result=await post('/api/outlook/send/approve',{session,id:p.id,hash:p.hash,...(attachment?{attachment}:{})});
  let outcome;
  if(result.status==='succeeded'&&result.receipt?.reconciled===true&&(!snapshot.metadata||result.receipt.attachmentVerification?.level==='metadata')){
   const at=Date.parse(result.receipt.sentDateTime);
   const time=Number.isFinite(at)?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Nicosia',hour:'2-digit',minute:'2-digit'}).format(at)+' Cyprus time':'';
   outcome={state:'succeeded',message:'Email sent'+(time?' at '+time:'')+'. Confirmed in Outlook Sent Items.'+(snapshot.metadata?' PDF filename, type and size confirmed: '+metadataLabel(snapshot.metadata)+'.':'')};
  }else if(result.status==='accepted'){
   const verification=result.receipt?.attachmentVerification;
   const detail=snapshot.metadata?(verification?.level==='flag-only'?' Sent Items indicates an attachment, but its filename, type and size were not verified.':verification?.level==='mismatch'?' Attachment metadata does not match; review Sent Items.':' Attachment confirmation is pending.'):' Sent Items confirmation is pending.';
   outcome={state:'accepted',message:'Microsoft accepted this email.'+detail+' Do not resend.'};
  }else throw Error('EMAIL_RESPONSE_UNCONFIRMED');
  finished=true;outcomes.set(key,outcome);showOutcome(card,button,status,outcome);
 }catch(err){
  const code=String(err?.message||'EMAIL_RESPONSE_UNCONFIRMED');
  // A connection/UI failure after dispatch is not proof that mail was not sent.
  const uncertain=dispatchStarted&&!definiteBlocks.has(code);
  const outcome=uncertain?{state:'uncertain',message:'Send status not confirmed. Do not resend. Check Outlook Sent Items first.'}:{state:'blocked',message:'Not sent. '+(explanations[code]||'The request could not be completed. '+code)};
  if(uncertain){finished=true;outcomes.set(key,outcome);}
  showOutcome(card,button,status,outcome);
 }finally{
  inFlight=false;s.locked=finished;fileControls(card,finished);button.removeAttribute('aria-busy');
  if(finished){s.file=null;const input=card.querySelector('[data-email-file]');if(input)input.value='';}
 }
}

export function bindOutlookApprovals({session}){
 sessionSource=typeof session==='function'?session:()=>'';
 if(bound)return;bound=true;
 document.addEventListener('change',event=>{const target=event.target,card=target.closest?.('[data-email-card]');if(!card)return;if(target.matches('[data-email-file]'))void selectPdfAttachment({card,files:target.files});});
 document.addEventListener('input',event=>{if(event.target.matches?.('[data-email-drive]')){const card=event.target.closest('[data-email-card]');if(card)changeDriveReference(card);}});
 document.addEventListener('click',event=>{
  const control=event.target.closest?.('[data-email-attach], [data-email-remove]');
  if(control&&!control.disabled){const card=control.closest('[data-email-card]');if(control.matches('[data-email-attach]'))card.querySelector('[data-email-file]').click();else removePdfAttachment(card);return;}
  const button=event.target.closest?.('[data-email-approve]');
  if(!button||button.disabled)return;
  const card=button.closest('[data-email-card]');
  if(card)void sendApprovedEmail({card,button,getSession:()=>sessionSource()});
 });
}

// Cached older callers must never turn a former review-only click into a send.
export async function prepareOutlookSend(){throw Error('Refresh the CRM to use the single-approval email card. Nothing was sent.');}
