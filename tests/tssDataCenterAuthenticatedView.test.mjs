import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html=readFileSync(new URL('../crm/index.html', import.meta.url),'utf8');
const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const section=html.slice(html.indexOf('async function dataCenterResearchView()'),html.indexOf('function render(){'));
test('all classic inline CRM scripts remain syntactically valid',()=>{
 const all=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
   .filter(m=>m[1].trim()&&!/\btype\s*=\s*["']module["']/i.test(m[0]));
 assert.ok(all.some(m=>m[1].includes('function render(){')));
 for(const m of all)new Script(m[1]);
});
test('authenticated Research Data Center is not a public data endpoint',()=>{
 assert.ok(section.includes('if(!state||!sessionToken||!Array.isArray(state.records?.Companies))'));
 assert.ok(section.includes("rankResearchReview(state.records.Companies,{asOf:today()})"));
 assert.ok(section.includes("import('/crm/data-center-research-engine.mjs')"));
 assert.ok(section.includes("stateObservation?.source==='cache'"));
 assert.ok(html.includes("'Data Center Research'"));
 assert.ok(html.includes("['Research',['Data Center Research']]"));
 assert.ok(html.includes("else if(view==='Data Center Research')dataCenterResearchView()"));
 assert.ok(!vercel.rewrites?.some(x=>/research|data-center/i.test(x.source)));
});
test('Research Data Center client view is read-only and does not call external services',()=>{
 assert.ok(section.length>1000);
 for(const unsafe of [/\bfetch\s*\(/,/\bcall\s*\(/,/\brpc\s*\(/,/\bsaveRecord\s*\(/,/\bhubspot\s*\(/i,/window\.open\s*\(/]){
  assert.ok(!unsafe.test(section),String(unsafe));
 }
 assert.ok(section.includes("readyForAutoHubspotPromotion")===false);
 assert.ok(section.includes("HubSpot remains the operational CRM"));
});
test('active legacy CRM business views and original default remain intact',()=>{
 assert.ok(html.includes("view=['Today','Management'"));
 assert.ok(html.includes("else if(view==='Prospect Queue')prospectQueue()"));
 assert.ok(html.includes("else if(view==='Outreach')outreachView()"));
 assert.ok(html.includes("else records()"));
});
