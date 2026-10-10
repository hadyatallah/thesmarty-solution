// Shared browser/server contract. Metadata only: never persist document bytes.
export const PDF_ATTACHMENT_VERSION=1;
export const PDF_MAX_BYTES=2000000; // Decimal 2 MB, deliberately not 2 MiB.
export const PDF_MIME='application/pdf';
export const PDF_QA_EMAIL='thesmartysolution@gmail.com';
export const PDF_QA_COMPANY='COM-8ee64d5e';
export const ATTACHMENT_ERRORS=Object.freeze([
 'EMAIL_ATTACHMENT_TOO_LARGE','EMAIL_ATTACHMENT_NOT_PDF','EMAIL_ATTACHMENT_CHANGED',
 'EMAIL_ATTACHMENT_INVALID','EMAIL_ATTACHMENT_MISSING','EMAIL_ATTACHMENT_AUDIT_UNAVAILABLE',
 'EMAIL_ATTACHMENT_QA_ONLY'
]);
const metadataKeys=['filename','mimeType','size','sha256','documentVersion','driveFileId'];
export function strictObject(value,allowed){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw Error('EMAIL_ATTACHMENT_INVALID');
}
export function safePdfFilename(value){
 if(typeof value!=='string')throw Error('EMAIL_ATTACHMENT_INVALID');
 const name=value.normalize('NFC').trim();
 if(!name||name.length>180||name.startsWith('.')||name.includes('..')||/[\\/<>:"|?*\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u.test(name))throw Error('EMAIL_ATTACHMENT_INVALID');
 if(!/\.pdf$/i.test(name))throw Error('EMAIL_ATTACHMENT_NOT_PDF');
 return name;
}
export function pdfMetadata(value){
 if(value===undefined||value===null)return null;
 strictObject(value,metadataKeys);
 const filename=safePdfFilename(value.filename);
 if(filename!==value.filename)throw Error('EMAIL_ATTACHMENT_INVALID');
 if(value.mimeType!==PDF_MIME)throw Error('EMAIL_ATTACHMENT_NOT_PDF');
 if(!Number.isSafeInteger(value.size)||value.size<=0)throw Error('EMAIL_ATTACHMENT_INVALID');
 if(value.size>PDF_MAX_BYTES)throw Error('EMAIL_ATTACHMENT_TOO_LARGE');
 if(typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.sha256))throw Error('EMAIL_ATTACHMENT_INVALID');
 if(value.documentVersion!==filename)throw Error('EMAIL_ATTACHMENT_INVALID');
 const result={filename,mimeType:PDF_MIME,size:value.size,sha256:value.sha256,documentVersion:filename};
 if(value.driveFileId!==undefined){
  if(typeof value.driveFileId!=='string'||!/^[-_A-Za-z0-9]{10,200}$/.test(value.driveFileId))throw Error('EMAIL_ATTACHMENT_INVALID');
  result.driveFileId=value.driveFileId; // Restricted reference only; never fetched.
 }
 return result;
}
export function sameAttachment(a,b){return JSON.stringify(pdfMetadata(a))===JSON.stringify(pdfMetadata(b));}
export function attachmentFields(p){const attachment=pdfMetadata(p.attachment);return attachment?{attachment}:{};}
export function rejectAttachmentAliases(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('EMAIL_ATTACHMENT_INVALID');
 if(Object.keys(body).some(k=>/^attachment/i.test(k)&&k!=='attachment'))throw Error('EMAIL_ATTACHMENT_INVALID');
 if(body.message&&typeof body.message==='object'&&Object.keys(body.message).some(k=>/^(?:attachment|contentBytes)/i.test(k)))throw Error('EMAIL_ATTACHMENT_INVALID');
}
export function assertPdfCapability(capability,to,companyId){
 if(capability?.version!==PDF_ATTACHMENT_VERSION||capability?.maxBytes!==PDF_MAX_BYTES||capability?.maxCount!==1||capability?.mimeType!==PDF_MIME||capability?.metadataAudit!==true)throw Error('EMAIL_ATTACHMENT_AUDIT_UNAVAILABLE');
 // Missing acceptance state fails closed. Only an explicit accepted release opens customer use.
 if(capability.customerAccepted!==true&&(to!==PDF_QA_EMAIL||companyId!==PDF_QA_COMPANY))throw Error('EMAIL_ATTACHMENT_QA_ONLY');
}
export function attachmentSummary(row){
 // The governed native writer places this line in the existing actionTaken field.
 const line=String(row?.actionTaken||'').split('\n').find(s=>s.startsWith('Attachment: '));
 return line?line.slice(12):'';
}
export function enforcePdfQaWindow(proposal,at){
 if(!proposal.attachment||proposal.to!==PDF_QA_EMAIL||proposal.companyId!==PDF_QA_COMPANY)return;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Nicosia',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(at).map(p=>[p.type,p.value]));
 if(!['Mon','Tue','Wed','Thu','Fri'].includes(parts.weekday)||Number(parts.hour)<9||Number(parts.hour)>=17)throw Error('EMAIL_OUTSIDE_BUSINESS_HOURS');
}
