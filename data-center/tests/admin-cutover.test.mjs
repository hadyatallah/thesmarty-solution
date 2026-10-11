import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('website Admin Login redirects to stable production app, not retired CRM or interim Docs',()=>{
 const c=JSON.parse(read('vercel.json'));
 for(const path of ['/admin','/admin/']){
  const matches=c.redirects.filter(x=>x.source===path);
  assert.equal(matches.length,1);
  assert.equal(matches[0].destination,'/data-center/');
  assert.equal(matches[0].permanent,false);
 }
 assert.doesNotMatch(JSON.stringify(c),/script\.google\.com|\/crm\//);
});
test('Data Center remains owner-authenticated and preserves native commercial Contact form',()=>{
 const app=read('data-center/app.js'),config=read('data-center/config.js'),contact=read('contact.html'),index=read('index.html');
 assert.match(app,/spreadsheets\.readonly/);
 assert.match(app,/email_verified/);
 assert.match(app,/cfg\.allowedEmail/);
 assert.match(config,/allowedEmail: "thesmartysolution@gmail\.com"/);
 assert.match(contact,/d6b2a98a-ef6b-4a18-9c99-cf39ea2925e5/);
 assert.match(index,/href="\/admin"/);
});
test('retired CRM stays retired while PWA points at private app route',()=>{
 const manifest=JSON.parse(read('data-center/manifest.webmanifest'));
 assert.equal(manifest.start_url,'/data-center/');
 assert.equal(manifest.scope,'/data-center/');
 const app=read('data-center/app.js');
 assert.doesNotMatch(app,/\/api\/crm|script\.google\.com/);
});
