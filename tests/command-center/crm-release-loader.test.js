import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url);
const html=readFileSync(new URL('crm/index.html',root),'utf8');
const entry=readFileSync(new URL('crm/command-center.js',root));
const sender=readFileSync(new URL('crm/outlook-send.js',root),'utf8');
const blobHash=createHash('sha1').update('blob '+entry.length+'\0').update(entry).digest('hex');

test('RELEASE-01 CRM entry URL changes with the Command Center source',()=>{
 const source=html.match(/<script\b[^>]*\bsrc="(\/crm\/command-center\.js\?v=[^"]+)"/);
 assert.ok(source,'CRM must load a versioned Command Center entry');
 assert.equal(source[1],'/crm/command-center.js?v='+blobHash.slice(0,12),
  'Update the CRM entry version whenever command-center.js changes; otherwise cached popup code can survive deployment.');
});
test('RELEASE-02 entry wires only the inline approval renderer and binder',()=>{
 const code=entry.toString('utf8');
 assert.match(code,/import \{renderEmailDraft,bindOutlookApprovals\} from '\.\/outlook-send\.js\?v=5'/);
 assert.match(code,/body=renderEmailDraft\(d\)/);
 assert.match(code,/bindOutlookApprovals\(\{session\}\)/);
 assert.doesNotMatch(code,/data-email-review|__tssOutlookReviewBound/);
});
test('RELEASE-03 email sender cannot display the obsolete approval popup',()=>{
 assert.doesNotMatch(sender,/showModal\(|dialog\.innerHTML|Approve exact Outlook email/);
 assert.match(sender,/data-email-approve>Approve and send/);
});
test('RELEASE-04 record refresh is not treated as an interface-code reload',()=>{
 assert.match(html,/async function refresh\(\)\{try\{state=await call\('getState'\)/);
});
