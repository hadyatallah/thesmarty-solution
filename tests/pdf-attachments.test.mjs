import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import propose from '../api/outlook/send/propose.js';
import approve from '../api/outlook/send/approve.js';
import {seal,open,SESSION_COOKIE} from '../api/outlook/_lib.js';
import {PDF_MAX_BYTES,PDF_MIME,pdfMetadata,safePdfFilename,assertPdfCapability,enforcePdfQaWindow,attachmentSummary} from '../command-center/email-attachment.js';
import {proposalHash,sendFingerprint,validatePdfContent,verifySentPdf} from '../command-center/email-attachment-server.js';
import {TSS_EMAIL_SIGNATURE,withTssSignature,assertTssSignature} from '../command-center/email-signature.js';
import {emailWindowOpen} from '../command-center/email-hours.js';

Object.assign(process.env,{TSS_OUTLOOK_TENANT_ID:'synthetic',TSS_OUTLOOK_CLIENT_ID:'synthetic',TSS_OUTLOOK_CLIENT_SECRET:'synthetic',TSS_OUTLOOK_REDIRECT_URI:'https://example.invalid/callback',TSS_OUTLOOK_MAILBOX:'info@thesmartysolution.com',TSS_OUTLOOK_SESSION_SECRET:'isolated-test-key-not-a-real-secret'});
const nativeDate=Date,nativeFetch=globalThis.fetch,nativeTimer=globalThis.setTimeout;
let now=Date.parse('2026-10-05T09:00:00Z');
class FixedDate extends nativeDate {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const pdf=Buffer.from('%PDF-1.4\n% Harmless synthetic PDF integrity fixture; no customer contents\n%%EOF\n');
const metadata=(bytes=pdf,name='Internal_QA_v1.pdf')=>({filename:name,mimeType:PDF_MIME,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),documentVersion:name});
const attachment=(bytes=pdf,name)=>({...metadata(bytes,name),contentBytes:bytes.toString('base64')});
const clone=v=>JSON.parse(JSON.stringify(v));
const response=(value,status=200,headers={})=>new Response(status===202?null:JSON.stringify(value),{status,headers});
const result=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;},end(){return this;}});
function harness(options={}){
 now=Date.parse('2026-10-05T09:00:00Z');globalThis.Date=FixedDate;globalThis.setTimeout=fn=>{queueMicrotask(fn);return 0;};
 const h={calls:[],graph:[],rows:[],claims:new Map(),logs:[],options,state:{records:{Companies:[{id:'COM-8ee64d5e',name:'Internal QA',email:'thesmartysolution@gmail.com'}],Contacts:[],'Email Activity':[]}}};
 const oldInfo=console.info,oldWarn=console.warn;
 console.info=(...x)=>h.logs.push(x.join(' '));console.warn=(...x)=>h.logs.push(x.join(' '));
 globalThis.fetch=async(url,init={})=>{
  const u=String(url);let body=init.body?JSON.parse(u.includes('oauth2')?'{}':init.body):null;
  h.calls.push({url:u,body});
  if(u.startsWith('https://script.google.com/')){
   assert.equal(body.args[0],'synthetic-crm-session');
   switch(body.fn){
    case 'getState':return response({ok:true,result:h.state});
    case 'outlookPdfAttachmentSupport':return response(options.noAudit?{ok:false,error:'UNKNOWN_FUNCTION'}:{ok:true,result:{version:1,maxBytes:PDF_MAX_BYTES,maxCount:1,mimeType:PDF_MIME,metadataAudit:true,customerAccepted:options.customerAccepted===true}});
    case 'outlookClaimSend':{
     const c=body.args[1],prior=[...h.claims.values()].find(s=>s.input.id===c.id||s.input.fingerprint===c.fingerprint||s.input.to===c.to&&s.input.subject===c.subject);
     if(prior)return response({ok:true,result:{claimed:false}});
     h.claims.set(c.id,{input:clone(c),status:'dispatch-claimed'});
     return response({ok:true,result:{claimed:true,...(c.attachment&&!options.dropClaimAudit?{attachmentAudited:true,attachmentSha256:c.attachment.sha256}:{})}});
    }
    case 'outlookSendState':return response({ok:true,result:h.claims.get(body.args[1])||null});
    case 'outlookRecordReceipt':{
     const [,id,hash,r]=body.args,s=h.claims.get(id);assert.equal(hash,s.input.hash);
     if(options.receiptFailure)return response({ok:false,error:'SYNTHETIC_RECEIPT_FAILURE'});
     s.status=r.reconciled&&(!r.attachment||r.attachmentVerification?.level==='metadata')?'succeeded':'accepted';s.receipt=clone(r);
     if(r.reconciled&&!h.rows.some(x=>x.messageId===r.id))h.rows.push({companyId:s.input.companyId,messageId:r.id,...clone(r)});
     return response({ok:true,result:{recorded:true,...(r.attachment?{attachmentRecorded:true,attachmentSha256:r.attachment.sha256}:{})}});
    }
    case 'outlookRecordSendOutcome':{let s=h.claims.get(body.args[1]);s.status=body.args[3].status;return response({ok:true,result:{recorded:true}});}
    default:throw Error('Unexpected native action '+body.fn);
   }
  }
  if(u.includes('oauth2/v2.0/token'))return response({access_token:'synthetic-provider-token',refresh_token:'synthetic-refresh'});
  if(u.includes('/me?$select='))return response({mail:'info@thesmartysolution.com'});
  if(u.endsWith('/me/sendMail')){h.graph.push(clone(body));if(options.transportFailure)throw Error('synthetic network failure');return response({},options.graphStatus||202,{'request-id':'synthetic-request'});}
  if(u.includes("mailFolders('SentItems')")){
   const m=h.graph.at(-1)?.message;
   return response({value:options.noSent?[]:[{id:'synthetic-provider-id',internetMessageId:'synthetic-internet-id',subject:m.subject,sentDateTime:new Date().toISOString(),bodyPreview:m.body.content.slice(0,255),toRecipients:m.toRecipients,hasAttachments:!!m.attachments,internetMessageHeaders:options.noActionHeader?[]:m.internetMessageHeaders}]});
  }
  if(u.includes('/attachments?$select=')){
   assert(!u.includes('contentBytes'));
   if(options.flagOnly)return response({},403);
   const a=h.graph.at(-1).message.attachments[0];return response({value:[{id:'synthetic-attachment',name:options.wrongProviderName?'Wrong.pdf':a.name,contentType:a.contentType,size:Buffer.from(a.contentBytes,'base64').length,isInline:false}]});
  }
  throw Error('Unexpected network call: '+u);
 };
 h.restore=()=>{globalThis.Date=nativeDate;globalThis.fetch=nativeFetch;globalThis.setTimeout=nativeTimer;console.info=oldInfo;console.warn=oldWarn;};
 h.oauth=SESSION_COOKIE+'='+encodeURIComponent(seal({refreshToken:'synthetic-refresh'}));
 h.request=async(handler,body,cookie='')=>{const r=result();await handler({method:'POST',headers:{origin:'https://www.thesmartysolution.com',cookie:h.oauth+(cookie?'; '+cookie:'')},body},r);return r;};
 h.propose=async(a,extra={})=>h.request(propose,{session:'synthetic-crm-session',message:{to:'thesmartysolution@gmail.com',subject:'Internal PDF QA',text:withTssSignature('This is an internal QA fixture.')},...(a?{attachment:a}:{}),...extra});
 h.approve=async(p,a,extra={})=>h.request(approve,{session:'synthetic-crm-session',id:p.data.proposal.id,hash:p.data.proposal.hash,...(a?{attachment:a}:{}),...extra},String(p.headers['set-cookie']).split(';')[0]);
 return h;
}
async function scenario(options,fn){const h=harness(options);try{await fn(h);}finally{h.restore();}}
const blocked=(r,code)=>{assert.equal(r.statusCode,400);assert.equal(r.data.ok,false);assert.equal(r.data.error,code);};

test('01 text-only proposal preserves original fields and fingerprint',()=>scenario({},async h=>{const r=await h.propose();assert.equal(r.data.ok,true);assert(!('attachment'in r.data.proposal));assert.equal(h.calls.some(c=>c.body?.fn==='outlookPdfAttachmentSupport'),false);const p=r.data.proposal;assert.equal(p.hash,crypto.createHash('sha256').update(JSON.stringify({id:p.id,from:p.from,to:p.to,subject:p.subject,text:p.text,companyId:p.companyId})).digest('hex'));}));
test('02 text-only approved send retains saveToSentItems and exact signature',()=>scenario({},async h=>{const p=await h.propose(),r=await h.approve(p);assert.equal(r.data.status,'succeeded');assert.equal(h.graph.length,1);assert.equal(h.graph[0].saveToSentItems,true);assert(!('attachments'in h.graph[0].message));assertTssSignature(h.graph[0].message.body.content);}));
test('03 valid small PDF is accepted, sent and fully observed',()=>scenario({},async h=>{const p=await h.propose(metadata()),r=await h.approve(p,attachment());assert.equal(r.data.status,'succeeded');assert.equal(r.data.receipt.attachmentVerification.level,'metadata');assert.equal(r.data.receipt.attachmentVerification.hasAttachments,true);}));
test('04 filename safely preserved including spaces Unicode and uppercase extension',()=>{for(const name of ['Mutual_NDA_v2.pdf','Signed agreement.PDF','Συμφωνία 2026.pdf'])assert.equal(validatePdfContent(metadata(pdf,name),attachment(pdf,name)).name,name);for(const name of ['../x.pdf','a/b.pdf','a\\b.pdf','a\u202eb.pdf','.hidden.pdf','a\n.pdf'])assert.throws(()=>safePdfFilename(name),/EMAIL_ATTACHMENT_INVALID/);});
test('05 exact SHA256, filename, size and version enter approval and duplicate fingerprint',()=>{const p={id:'1',from:'f',to:'t',subject:'s',text:'b',companyId:'c'};const withPdf={...p,attachment:metadata()};assert.notEqual(proposalHash(p),proposalHash(withPdf));assert.notEqual(sendFingerprint(p),sendFingerprint(withPdf));for(const change of [{sha256:'a'.repeat(64)},{size:pdf.length+1},{filename:'Other.pdf',documentVersion:'Other.pdf'}])assert.notEqual(proposalHash(withPdf),proposalHash({...withPdf,attachment:{...metadata(),...change}}));});
test('06 changed bytes after proposal rejected before durable claim and Graph',()=>scenario({},async h=>{const p=await h.propose(metadata()),bad=Buffer.from(pdf);bad[15]^=1;blocked(await h.approve(p,{...attachment(),contentBytes:bad.toString('base64')}),'EMAIL_ATTACHMENT_CHANGED');assert.equal(h.graph.length,0);assert.equal(h.claims.size,0);}));
test('07 same filename with different file digest cannot use prior approval',()=>scenario({},async h=>{const p=await h.propose(metadata()),bad=Buffer.from(pdf);bad[20]^=1;blocked(await h.approve(p,attachment(bad)),'EMAIL_ATTACHMENT_CHANGED');assert.equal(h.graph.length,0);}));
test('08 oversized metadata and actual content rejected',()=>{assert.throws(()=>pdfMetadata({...metadata(),size:PDF_MAX_BYTES+1}),/EMAIL_ATTACHMENT_TOO_LARGE/);assert.throws(()=>validatePdfContent(metadata(),{...attachment(),contentBytes:'A'.repeat(4*Math.ceil(PDF_MAX_BYTES/3)+4)}),/EMAIL_ATTACHMENT_TOO_LARGE/);});
test('09 empty PDF rejected',()=>{assert.throws(()=>pdfMetadata(metadata(Buffer.alloc(0))),/EMAIL_ATTACHMENT_INVALID/);assert.throws(()=>validatePdfContent(metadata(),{...attachment(),contentBytes:''}),/EMAIL_ATTACHMENT_INVALID/);});
test('10 fake extension without PDF magic rejected',()=>{const b=Buffer.from('not a real PDF');assert.throws(()=>validatePdfContent(metadata(b),attachment(b)),/EMAIL_ATTACHMENT_NOT_PDF/);});
test('11 non-PDF MIME and extension rejected',()=>{assert.throws(()=>pdfMetadata({...metadata(),mimeType:'image/png'}),/EMAIL_ATTACHMENT_NOT_PDF/);assert.throws(()=>pdfMetadata({...metadata(),filename:'x.txt',documentVersion:'x.txt'}),/EMAIL_ATTACHMENT_NOT_PDF/);});
test('12 multiple attachments and unexpected attachment fields rejected',()=>scenario({},async h=>{blocked(await h.propose(null,{attachments:[metadata(),metadata()]}),'EMAIL_ATTACHMENT_INVALID');blocked(await h.propose({...metadata(),url:'https://example.invalid/private.pdf'}),'EMAIL_ATTACHMENT_INVALID');const p=await h.propose(metadata());blocked(await h.approve(p,null,{attachment:[attachment(),attachment()]}),'EMAIL_ATTACHMENT_INVALID');assert.equal(h.graph.length,0);}));
test('13 attachment approval replay with another file is rejected',()=>scenario({},async h=>{const p=await h.propose(metadata());await h.approve(p,attachment());blocked(await h.approve(p,attachment(Buffer.concat([pdf,Buffer.from('x')]))),'EMAIL_ATTACHMENT_CHANGED');assert.equal(h.graph.length,1);}));
test('14 recipient and message mutation at approve remain rejected',()=>scenario({},async h=>{const p=await h.propose(metadata());for(const extra of [{to:'external@example.invalid'},{message:{subject:'Changed'}},{hash:'0'.repeat(64)}])blocked(await h.approve(p,attachment(),extra),'EMAIL_APPROVAL_NOT_APPLICABLE');assert.equal(h.graph.length,0);}));
test('15 existing duplicate-email protection remains effective',()=>scenario({},async h=>{h.state.records['Email Activity']=[{direction:'Sent',toEmails:'thesmartysolution@gmail.com',subject:'Internal PDF QA',messageDate:new Date().toISOString()}];blocked(await h.propose(metadata()),'EMAIL_DUPLICATE_RECENT');assert.equal(h.graph.length,0);}));
test('16 suppression still blocks propose and rechecked approval',()=>scenario({},async h=>{const p=await h.propose(metadata());h.state.records.Companies[0].communicationStatus='Do not contact';blocked(await h.propose(metadata()),'EMAIL_RECIPIENT_SUPPRESSED');blocked(await h.approve(p,attachment()),'EMAIL_RECIPIENT_SUPPRESSED');assert.equal(h.graph.length,0);}));
test('17 business hours: existing window unchanged, stricter internal PDF QA respected',()=>scenario({},async h=>{now=Date.parse('2026-10-05T05:30:00Z');assert.equal(emailWindowOpen(new Date()),true);const p=await h.propose(metadata());blocked(await h.approve(p,attachment()),'EMAIL_OUTSIDE_BUSINESS_HOURS');now=Date.parse('2026-10-05T19:00:00Z');const q=await h.propose();blocked(await h.approve(q),'EMAIL_OUTSIDE_BUSINESS_HOURS');assert.equal(h.graph.length,0);}));
test('18 durable same approval replay returns existing receipt with no second Graph send',()=>scenario({},async h=>{const p=await h.propose(metadata());await h.approve(p,attachment());const r=await h.approve(p,attachment());assert.equal(r.data.replayed,true);assert.equal(h.graph.length,1);assert.equal(h.rows.length,1);}));
test('19 exact fileAttachment payload retains TSS action header and Sent Items',()=>scenario({},async h=>{const p=await h.propose(metadata());await h.approve(p,attachment());const body=h.graph[0];assert.equal(body.saveToSentItems,true);assert.deepEqual(body.message.attachments,[{'@odata.type':'#microsoft.graph.fileAttachment',name:metadata().filename,contentType:PDF_MIME,contentBytes:pdf.toString('base64')}]);assert.equal(body.message.internetMessageHeaders[0].value,p.data.proposal.id);}));
test('20 no document bytes/base64 in application logs, cookies, CRM calls or receipts',()=>scenario({},async h=>{const p=await h.propose(metadata());await h.approve(p,attachment());const logged=h.logs.join('\n'),native=JSON.stringify(h.calls.filter(c=>c.body?.fn)),cookie=open(decodeURIComponent(String(p.headers['set-cookie']).split(';')[0].split('=').slice(1).join('=')));for(const s of [logged,native,JSON.stringify(cookie),JSON.stringify(h.rows)]){assert(!s.includes(pdf.toString('base64')));assert(!s.includes('Harmless synthetic PDF integrity'));assert(!s.includes('contentBytes'));}assert(cookie.attachment.sha256);}));
test('21 audit request records approved metadata and actual provider evidence',()=>scenario({},async h=>{const p=await h.propose(metadata());await h.approve(p,attachment());const c=h.calls.find(c=>c.body?.fn==='outlookRecordReceipt').body.args[3];assert.deepEqual(c.attachment,metadata());assert.equal(c.id,'synthetic-provider-id');assert.equal(c.attachmentVerification.level,'metadata');assert(c.sentDateTime);}));
test('22 correct internal Company association remains present in claim and email record',()=>scenario({},async h=>{const p=await h.propose(metadata());await h.approve(p,attachment());assert.equal([...h.claims.values()][0].input.companyId,'COM-8ee64d5e');assert.equal(h.rows[0].companyId,'COM-8ee64d5e');}));
test('23 text-only blocked, replay and reconciliation behavior remains intact',()=>scenario({},async h=>{const p=await h.propose();const r=await h.approve(p);assert.equal(r.data.receipt.reconciled,true);assert.equal((await h.approve(p)).data.replayed,true);assert.equal(h.graph.length,1);assert.equal(h.rows.length,1);}));
test('24 frontend module parses and standard single-file input is present',async()=>{const m=await import('../crm/outlook-send.js');const html=m.renderEmailDraft({channel:'email',approvalReady:true,from:'info@thesmartysolution.com',to:'thesmartysolution@gmail.com',subject:'QA',text:'Hello'});assert.match(html,/type="file"/);assert.match(html,/accept="\.pdf,application\/pdf"/);assert(!/\bmultiple\b/.test(html));assert.match(html,/Attach PDF/);assert.match(html,/Remove/);assert.equal((html.match(/data-email-approve/g)||[]).length,1);});
test('25 missing attachment and attachment added to text-only approval rejected',()=>scenario({},async h=>{const p=await h.propose(metadata());blocked(await h.approve(p),'EMAIL_ATTACHMENT_MISSING');const q=await h.propose();blocked(await h.approve(q,attachment()),'EMAIL_ATTACHMENT_CHANGED');assert.equal(h.graph.length,0);}));
test('26 native metadata capability missing: PDF fail-closed; text-only still works',()=>scenario({noAudit:true},async h=>{blocked(await h.propose(metadata()),'EMAIL_ATTACHMENT_AUDIT_UNAVAILABLE');const p=await h.propose();assert.equal((await h.approve(p)).data.status,'succeeded');assert.equal(h.graph.length,1);}));
test('27 durable claim must confirm attachment audit before Graph dispatch',()=>scenario({dropClaimAudit:true},async h=>{const p=await h.propose(metadata());blocked(await h.approve(p,attachment()),'EMAIL_ATTACHMENT_AUDIT_UNAVAILABLE');assert.equal(h.graph.length,0);assert.equal([...h.claims.values()][0].status,'failed');}));
test('28 flag-only provider result is never labelled full attachment verification',()=>scenario({flagOnly:true},async h=>{const p=await h.propose(metadata()),r=await h.approve(p,attachment());assert.equal(r.data.status,'accepted');assert.equal(r.data.receipt.attachmentVerification.level,'flag-only');assert.equal(r.data.receipt.attachmentVerification.filenameVerified,false);}));
test('29 provider filename mismatch is accepted-but-unverified, not success',()=>scenario({wrongProviderName:true},async h=>{const p=await h.propose(metadata()),r=await h.approve(p,attachment());assert.equal(r.data.status,'accepted');assert.equal(r.data.receipt.attachmentVerification.level,'mismatch');assert.equal(h.graph.length,1);}));
test('30 PDF reconciliation requires exact action header',()=>scenario({noActionHeader:true},async h=>{const p=await h.propose(metadata()),r=await h.approve(p,attachment());assert.equal(r.data.status,'accepted');assert.equal(r.data.receipt.reconciled,false);assert.equal(h.rows.length,0);}));
test('31 transport uncertainty and repeated approval never dispatch twice',()=>scenario({transportFailure:true},async h=>{const p=await h.propose(metadata()),r=await h.approve(p,attachment());assert.equal(r.data.error,'EMAIL_SEND_UNCERTAIN');assert.equal((await h.approve(p,attachment())).data.error,'EMAIL_SEND_UNCERTAIN');assert.equal(h.graph.length,1);}));
test('32 post-send audit failure cannot be described as Not Sent',()=>scenario({receiptFailure:true},async h=>{const p=await h.propose(metadata()),r=await h.approve(p,attachment());assert.equal(r.statusCode,409);assert.equal(r.data.error,'EMAIL_SEND_UNCERTAIN');assert.equal(h.graph.length,1);}));
test('33 signature normalized once, exact ending, no personal suffix appended',()=>{const prior=TSS_EMAIL_SIGNATURE.slice(10);for(const input of ['Hello','Hello\n\n'+prior,'Hello\n\n'+TSS_EMAIL_SIGNATURE,'Hello\n\n'+TSS_EMAIL_SIGNATURE+'\n\n'+TSS_EMAIL_SIGNATURE]){const t=withTssSignature(input);assertTssSignature(t);assert(t.endsWith(TSS_EMAIL_SIGNATURE));assert.equal(t.split('The Smarty Solution').length,2);}assert.throws(()=>assertTssSignature('Hello'),/EMAIL_SIGNATURE_INVALID/);});
test('34 customer PDF dispatch locked before internal QA acceptance',()=>{const c={version:1,maxBytes:PDF_MAX_BYTES,maxCount:1,mimeType:PDF_MIME,metadataAudit:true,customerAccepted:false};assert.doesNotThrow(()=>assertPdfCapability(c,'thesmartysolution@gmail.com','COM-8ee64d5e'));assert.throws(()=>assertPdfCapability(c,'external@example.invalid','COM-other'),/EMAIL_ATTACHMENT_QA_ONLY/);});
test('35 restricted Drive reference is metadata only and bound to approval',()=>{const p={id:'1',from:'f',to:'t',subject:'s',text:'b',companyId:'c',attachment:metadata()};const q={...p,attachment:{...metadata(),driveFileId:'1exampleRestrictedFileId'}};assert.notEqual(proposalHash(p),proposalHash(q));assert.doesNotThrow(()=>validatePdfContent(q.attachment,{...attachment(),driveFileId:q.attachment.driveFileId}));assert.throws(()=>pdfMetadata({...metadata(),driveFileId:'https://example.invalid/x.pdf'}),/EMAIL_ATTACHMENT_INVALID/);});
test('36 attachment timeline summary uses only governed filename line',()=>{assert.equal(attachmentSummary({actionTaken:'Controlled send\nAttachment: Internal_QA_v1.pdf\nTSS_PDF_V1: {}'}),'Internal_QA_v1.pdf');assert.equal(attachmentSummary({}), '');});
test('37 exact limit accepted, one extra byte rejected',()=>{const b=Buffer.alloc(PDF_MAX_BYTES,32);b.write('%PDF-1.4');assert(validatePdfContent(metadata(b),attachment(b)));assert.throws(()=>pdfMetadata(metadata(Buffer.alloc(PDF_MAX_BYTES+1))),/EMAIL_ATTACHMENT_TOO_LARGE/);});
test('38 unsafe base64 rejected rather than silently decoded',()=>{for(const c of [pdf.toString('base64')+'\n','data:application/pdf;base64,'+pdf.toString('base64'),'%%%=', 'AAAA='])assert.throws(()=>validatePdfContent(metadata(),{...attachment(),contentBytes:c}),/EMAIL_ATTACHMENT_INVALID/);});
test('39 request origin denied with no Graph dispatch',()=>scenario({},async h=>{const r=result();await propose({method:'POST',headers:{origin:'https://evil.invalid'},body:{}},r);assert.equal(r.data.ok,false);assert.equal(h.graph.length,0);}));
test('40 attachment observation requests cannot fetch arbitrary user URL',async()=>{let observed;const r=await verifySentPdf({id:'a/b?evil=https://evil.invalid',hasAttachments:true},metadata(),'synthetic',async u=>{observed=u;return response({},403);});assert(observed.startsWith('https://graph.microsoft.com/v1.0/me/messages/a%2Fb%3Fevil%3Dhttps%3A%2F%2Fevil.invalid/attachments?'));assert.equal(r.level,'flag-only');});
test('41 PDF content cannot be smuggled into metadata-only proposal fields',()=>scenario({},async h=>{blocked(await h.propose(metadata(),{contentBytes:pdf.toString('base64')}),'EMAIL_ATTACHMENT_INVALID');assert.equal(h.graph.length,0);}));
