import crypto from 'node:crypto';
import {PDF_MAX_BYTES,pdfMetadata,strictObject,sameAttachment,attachmentFields,assertPdfCapability} from './email-attachment.js';

const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function proposalHash(p){return hash({id:p.id,from:p.from,to:p.to,subject:p.subject,text:p.text,companyId:p.companyId,...attachmentFields(p)});}
export function sendFingerprint(p){return hash({from:p.from,to:p.to,subject:p.subject,text:p.text,companyId:p.companyId,...attachmentFields(p)});}
export function validatePdfContent(expected,input){
 const approved=pdfMetadata(expected);
 if(!approved){if(input!==undefined&&input!==null)throw Error('EMAIL_ATTACHMENT_CHANGED');return null;}
 if(input===undefined||input===null)throw Error('EMAIL_ATTACHMENT_MISSING');
 strictObject(input,['filename','mimeType','size','sha256','documentVersion','driveFileId','contentBytes']);
 const {contentBytes,...metadata}=input;
 if(!sameAttachment(approved,metadata))throw Error('EMAIL_ATTACHMENT_CHANGED');
 if(typeof contentBytes!=='string')throw Error('EMAIL_ATTACHMENT_MISSING');
 if(!contentBytes.length)throw Error('EMAIL_ATTACHMENT_INVALID');
 if(contentBytes.length>4*Math.ceil(PDF_MAX_BYTES/3))throw Error('EMAIL_ATTACHMENT_TOO_LARGE');
 if(contentBytes.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(contentBytes))throw Error('EMAIL_ATTACHMENT_INVALID');
 const bytes=Buffer.from(contentBytes,'base64');
 if(bytes.toString('base64')!==contentBytes)throw Error('EMAIL_ATTACHMENT_INVALID');
 if(!bytes.length)throw Error('EMAIL_ATTACHMENT_INVALID');
 if(bytes.length>PDF_MAX_BYTES)throw Error('EMAIL_ATTACHMENT_TOO_LARGE');
 if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('EMAIL_ATTACHMENT_NOT_PDF');
 if(bytes.length!==approved.size||crypto.createHash('sha256').update(bytes).digest('hex')!==approved.sha256)throw Error('EMAIL_ATTACHMENT_CHANGED');
 return {'@odata.type':'#microsoft.graph.fileAttachment',name:approved.filename,contentType:approved.mimeType,contentBytes};
}
export function hasActionHeader(message,actionId){return (message.internetMessageHeaders||[]).some(h=>String(h.name||'').toLowerCase()==='x-tss-action-id'&&h.value===actionId);}
export async function verifySentPdf(message,expected,accessToken,fetcher=fetch){
 const a=pdfMetadata(expected),hasAttachments=message.hasAttachments===true;
 const result={level:hasAttachments?'flag-only':'not-observed',hasAttachments,filenameVerified:false,mimeTypeVerified:false,sizeVerified:false};
 if(!hasAttachments)return result;
 try{
  const url='https://graph.microsoft.com/v1.0/me/messages/'+encodeURIComponent(message.id)+'/attachments?$select=id,name,contentType,size,isInline';
  const response=await fetcher(url,{headers:{Authorization:'Bearer '+accessToken,Prefer:'IdType="ImmutableId"'}});
  if(!response.ok)return result;
  const data=await response.json();
  if(!Array.isArray(data.value)||data.value.length!==1||data['@odata.nextLink'])return {...result,level:'mismatch'};
  const observed=data.value[0];
  result.filenameVerified=observed.name===a.filename;
  result.mimeTypeVerified=String(observed.contentType||'').toLowerCase()===a.mimeType;
  result.sizeVerified=observed.size===a.size;
  result.providerAttachment={id:String(observed.id||'').slice(0,1500),filename:String(observed.name||'').slice(0,180),mimeType:String(observed.contentType||'').slice(0,100),size:Number.isSafeInteger(observed.size)?observed.size:null};
  result.level=result.filenameVerified&&result.mimeTypeVerified&&result.sizeVerified&&observed.isInline!==true?'metadata':'mismatch';
  return result;
 }catch{return result;} // Dispatch already happened: never turn an observation failure into "Not sent".
}
export async function requirePdfAuditSupport(backend,session,to,companyId,fetcher=fetch){
 let response;
 try{
  response=await fetcher(backend,{method:'POST',redirect:'manual',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({fn:'outlookPdfAttachmentSupport',args:[session]})});
  if([302,303].includes(response.status)){
   const target=new URL(response.headers.get('location')||'',backend);
   if(target.protocol!=='https:'||target.hostname!=='script.googleusercontent.com'||target.username||target.password||target.port)throw Error();
   response=await fetcher(target.href,{redirect:'manual'});
  }
  const data=await response.json();
  if(!response.ok||!data?.ok)throw Error(String(data?.error||'').includes('AUTH_REQUIRED')?'AUTH_REQUIRED':'EMAIL_ATTACHMENT_AUDIT_UNAVAILABLE');
  assertPdfCapability(data.result,to,companyId);
 }catch(error){
  if(['AUTH_REQUIRED','EMAIL_ATTACHMENT_QA_ONLY'].includes(error.message))throw error;
  throw Error('EMAIL_ATTACHMENT_AUDIT_UNAVAILABLE');
 }
}
