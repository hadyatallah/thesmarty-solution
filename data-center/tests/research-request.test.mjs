import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareSimpleCompanyRequest} from '../research-request.mjs';

const company={id:'TSS-CY-001',name:'Synthetic Developer',category:'Developer',district:'Larnaca'};

test('an optional question is enough to prepare a request for the selected Company',()=>{
 const r=prepareSimpleCompanyRequest(company,'Find recent projects and verify the website');
 assert.equal(r.status,'READY_TO_COPY');
 assert.equal(r.writesPerformed,0);
 assert.match(r.handoffText,/TSS-CY-001/);
 assert.match(r.handoffText,/Synthetic Developer/);
 assert.match(r.handoffText,/Find recent projects and verify the website/);
 assert.match(r.handoffText,/not yet verified/i);
 assert.match(r.handoffText,/ask for my approval/i);
 assert.match(r.handoffText,/Do not change Google Sheets or HubSpot/);
});

test('blank question still works: ChatGPT is asked to review the Company',()=>{
 const r=prepareSimpleCompanyRequest(company,'  ');
 assert.equal(r.status,'READY_TO_COPY');
 assert.match(r.handoffText,/review this Company and suggest the next useful research checks/);
 assert.match(r.handoffText,/Canonical Company ID: TSS-CY-001/);
});

test('no canonical Company selection cannot prepare a request',()=>{
 const r=prepareSimpleCompanyRequest(null,'Find projects');
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.handoffText,'');
 assert.equal(r.writesPerformed,0);
});

test('oversized notes block handoff rather than silently truncate',()=>{
 const r=prepareSimpleCompanyRequest(company,'X'.repeat(1201));
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.handoffText,'');
});

test('handoff does not invent source verification or authorize new records',()=>{
 const r=prepareSimpleCompanyRequest(company,'Update contact email');
 assert.match(r.handoffText,/verify the Company ID, dated evidence, sources/);
 assert.match(r.handoffText,/separate explicit approval/);
 assert.doesNotMatch(r.handoffText,/APPROVED FOR WRITE|WRITE COMPLETED/);
});

test('one-box request is pure: no extra OAuth, browser storage or backend',()=>{
 const file=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
 const helper=file('data-center/research-request.mjs');
 const app=file('data-center/app.js');
 const cfg=file('data-center/config.js');
 const worker=file('data-center/sw.js');
 assert.doesNotMatch(helper,/\bfetch\s*\(|localStorage|sessionStorage|XMLHttpRequest|sendBeacon|\/api\/crm/);
 assert.doesNotMatch(app,/spreadsheets\.write|\/api\/crm|localStorage|sessionStorage/);
 assert.match(app,/prepareSimpleCompanyRequest/);
 assert.match(app,/Copy for ChatGPT/);
 assert.match(app,/Open ChatGPT/);
 assert.doesNotMatch(app,/Prepare request for ChatGPT|Attribute \/ research field|Source URL|Information class/);
 assert.match(cfg,/readOnly:\s*true/);
 assert.match(worker,/\/data-center\/research-request\.mjs/);
});
