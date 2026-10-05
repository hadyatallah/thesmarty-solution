import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {validatePdfContent} from '../command-center/email-attachment-server.js';

test('PDF magic validation requires exact octets, not lossy ASCII decoding',()=>{
 const bytes=Buffer.from([0xa5,0xd0,0xc4,0xc6,0xad,0x31,0x2e,0x34]);
 assert.equal(bytes.subarray(0,5).toString('ascii'),'%PDF-');
 const metadata={filename:'Invalid.pdf',mimeType:'application/pdf',size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),documentVersion:'Invalid.pdf'};
 assert.throws(()=>validatePdfContent(metadata,{...metadata,contentBytes:bytes.toString('base64')}),/EMAIL_ATTACHMENT_NOT_PDF/);
});
