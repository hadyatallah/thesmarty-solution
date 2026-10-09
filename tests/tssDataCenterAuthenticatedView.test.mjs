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
 assert.ok(section.includes('sessionToken!==initialSessionToken||state!==initialState'));
 assert.ok(section.includes('Phase 3 identity-hold register is not joined.'));
 assert.ok(section.includes('Review holds (minimum)'));
 assert.ok(section.includes("import('/crm/data-center-phase3-import.mjs')"));
 assert.ok(section.includes('sessionToken===initialSessionToken&&state===initialState'));
 assert.ok(section.includes('tssResearchHoldCount'));
 assert.ok(section.includes('tssResearchHumanCount'));
 assert.ok(section.includes('installPhase3HoldImport({mount,companies:initialState.records.Companies'));
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

test('Research Data Center keeps the authenticated CRM responsive shell intact',()=>{
 assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
 assert.ok(html.includes('button,a,input,select{min-height:44px}'));
 assert.ok(html.includes('@media(max-width:850px)'));
 assert.ok(html.includes('.cards{grid-template-columns:repeat(2,1fr)}'));
 assert.ok(html.includes('main{padding:18px}'));
 assert.ok(html.includes('.toolbar select{max-width:none;flex:1}'));
 assert.ok(html.includes('@media(max-width:520px)'));
 assert.ok(html.includes('nav{flex-wrap:wrap}'));
 assert.ok(html.includes('.filter-panel{grid-template-columns:1fr}'));
 assert.ok(section.includes('<div class="cards"><div class="panel metric"><span>Loaded companies</span>'));
 assert.ok(section.includes('<div class="toolbar"><input type="search" id="tssResearchSearch"'));
 assert.ok(section.includes('<select id="tssResearchGate" aria-label="Research review gate"'));
 assert.ok(section.includes('<div id="tssResearchRows" class="list"></div>'));
 assert.ok(!section.includes('<table'));
});
test('unjoined private holds fail closed before any research ranking is shown',()=>{
 assert.ok(section.includes('let tssResearchHoldsJoined=false;'));
 const gate=section.indexOf('if(!tssResearchHoldsJoined){');
 const ranking=section.indexOf("const term=input.value.toLowerCase().trim()");
 assert.ok(gate>0&&ranking>gate,'The hold join gate must precede filtering and rendering');
 assert.match(section,/if\(!tssResearchHoldsJoined\)\{\s*list\.replaceChildren\(\);/);
 assert.match(section,/count\.textContent='Research ranking locked:/);
 assert.match(section,/model=updated;\s*tssResearchHoldsJoined=true;/);
 assert.ok(section.includes('Research ranking is locked until a valid private known-exception manifest is imported.'));
 assert.ok(section.includes("isCurrent:active,onApply:(updated)=>"));
 assert.ok(!section.includes('localStorage.setItem('),'Restricted hold overlays must never be saved in localStorage');
 assert.ok(!section.includes('sessionStorage.setItem('),'Restricted hold overlays must never be saved in sessionStorage');
});
