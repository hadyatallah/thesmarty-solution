import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),source=readFileSync(new URL('crm/status-display.js',root),'utf8'),html=readFileSync(new URL('crm/index.html',root),'utf8');
const context=vm.createContext({});vm.runInContext(source,context);
const ui=context.TSSStatusDisplay,now=Date.parse('2026-10-04T12:00:00Z'),recent='2026-10-04T11:50:00Z';
const obs={source:'api',receivedAt:now};
const snapshot=()=>({updatedAt:recent,records:Object.fromEntries(['Companies','Contacts','Tasks','Tickets','Opportunities','Activity'].map(n=>[n,[]]))});
for(const value of [undefined,null,'','invalid','2026-02-30T10:00:00Z','2026-10-04','2026-10-04T25:00:00Z',true,now])test('missing/invalid timestamp: '+String(value),()=>{
 const s=ui.snapshotStatus({...snapshot(),updatedAt:value},obs,now);assert.equal(s.label,'Not verified');assert.equal(s.observedAt,'Not available');
});
test('future timestamp cannot appear current',()=>{assert.equal(ui.snapshotStatus({updatedAt:'2026-10-05T12:00:00Z'},obs,now).label,'Not verified');});
test('snapshot later than receipt is contradictory',()=>{const s=ui.snapshotStatus(snapshot(),{source:'api',receivedAt:now-3600000},now);assert.equal(s.label,'Not verified');assert.match(s.reason,/later/);});
test('future receipt cannot verify snapshot',()=>{assert.equal(ui.snapshotStatus(snapshot(),{source:'api',receivedAt:now+1},now).label,'Not verified');});
test('recent observed snapshot is not overall health',()=>{const s=ui.snapshotStatus(snapshot(),obs,now);assert.equal(s.label,'Observed');assert.match(s.reason,/not overall system health/);});
test('existing two-hour threshold applies only to snapshot',()=>{assert.equal(ui.snapshotStatus({updatedAt:'2026-10-04T10:00:00Z'},obs,now).label,'Observed');assert.equal(ui.snapshotStatus({updatedAt:'2026-10-04T09:59:59Z'},obs,now).label,'Stale');});
test('missing provenance cannot establish freshness',()=>{assert.equal(ui.snapshotStatus(snapshot(),{},now).label,'Not verified');});
test('newer failed refresh is not cleared by older successful snapshot',()=>{const s=ui.snapshotStatus(snapshot(),{...obs,refreshFailed:true},now);assert.equal(s.label,'Not verified');assert.match(s.reason,/Last refresh failed/);});
test('cache never appears current even with recent timestamp',()=>{assert.equal(ui.snapshotStatus(snapshot(),{source:'cache',receivedAt:now},now).label,'Cached');});
test('cached stale date preserves warning without pretending fresh',()=>{const s=ui.snapshotStatus({updatedAt:'2026-10-03T12:00:00Z'},{source:'cache',receivedAt:now},now);assert.equal(s.label,'Cached');assert.equal(s.stale,true);});
test('missing entity coverage is partial',()=>{assert.equal(ui.coverageStatus({records:{Companies:[]}}).label,'Partial');});
test('arrays without completeness metadata do not prove coverage',()=>{assert.equal(ui.coverageStatus(snapshot()).label,'Not verified');});
test('explicit matching core coverage is scoped as reported complete',()=>{const s=snapshot();s.coverage=Object.fromEntries(Object.keys(s.records).map(n=>[n,{complete:true,available:true,total:0}]));assert.equal(ui.coverageStatus(s).label,'Reported complete');s.coverage.Tasks.total=1;assert.equal(ui.coverageStatus(s).label,'Not verified');});
test('duplicate or blank IDs cannot establish complete coverage',()=>{for(const ids of [['x','x'],['']]){const s=snapshot();s.coverage=Object.fromEntries(Object.keys(s.records).map(n=>[n,{complete:true}]));s.records.Tasks=ids.map(id=>({id}));assert.equal(ui.coverageStatus(s).label,'Not verified');}});
for(const extra of [{backupEnabled:'ON'},{emailEnabled:true},{AutomationLog:[{status:'Completed',provider:'Gmail'}]},{runs:[{provider:'Outlook',status:'Completed',at:recent},{provider:'Outlook',status:'Failed',at:'2026-10-04T11:59:00Z'}]},{backup:{configured:true,lastSuccess:recent}},{automation:{lastRun:'future',status:'Completed'}}])test('unsupported telemetry never becomes execution evidence: '+JSON.stringify(extra),()=>{
 const s={...snapshot(),...extra},out=ui.systemHealth({snapshot:s,observation:obs,now,sheet:'https://example.test/workbook'}),outreach=ui.outreachView({snapshot:s,sheet:'https://example.test/workbook'});
 assert.match(out,/Backup execution<\/span><strong[^>]*>Not verified/);assert.match(outreach,/Outlook reply processing<\/span><strong[^>]*>Not verified/);assert.doesNotMatch(outreach,/>Hourly</);assert.doesNotMatch(out,/>Healthy<|>Current<|>Enabled</);
});
test('historical backup is neither latest nor a verified recovery candidate',()=>{const out=ui.systemHealth({snapshot:snapshot(),observation:obs,now,sheet:'https://example.test/workbook'});assert.doesNotMatch(out,/Open latest|1PbGS75/);assert.match(out,/Checkpoint date and contents:<\/strong> Not available/);assert.match(out,/workbook copy alone does not recover/);});
test('untrusted timestamp and missing records are escaped and never healthy',()=>{const out=ui.systemHealth({snapshot:{updatedAt:'<img onerror=alert(1)>'},now,sheet:'https://example.test/workbook'});assert.doesNotMatch(out,/<img|>Healthy<|>Current</);assert.match(out,/Not available/);});
for(const canonical of ['Canonical class','   canonical  ',0])test('populated canonical classification preserved: '+String(canonical),()=>{const r={id:'SYN-1',classification:canonical};const before=JSON.stringify(r);assert.equal(ui.legacyClassificationHint(r,{'SYN-1':'Legacy'}),'');assert.equal(JSON.stringify(r),before);});
for(const canonical of ['',null,undefined,'   '])test('blank canonical produces only an explicit display hint: '+String(canonical),()=>{const r={id:'SYN-1',classification:canonical};const before=JSON.stringify(r),h=ui.legacyClassificationHint(r,{'SYN-1':'Legacy'});assert.match(h,/display only; not verified/);assert.match(h,/not used in filters, assistant context, exports or saves/);assert.equal(JSON.stringify(r),before);});
test('unknown/inherited IDs never get a fallback',()=>{assert.equal(ui.legacyClassificationHint({id:'UNKNOWN'},{}),'');assert.equal(ui.legacyClassificationHint({id:'constructor'},{}),'');});
test('hint escapes legacy text',()=>{assert.doesNotMatch(ui.legacyClassificationHint({id:'SYN'}, {SYN:'<img onerror=x>'}),/<img/);});
function shellHarness(overrideHtml=html){
 const store=new Map(),main={innerHTML:''},nodes={main,signOutButton:{},sync:{}};
 const sandbox={TSSStatusDisplay:ui,Date,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},state:null,cookieSessionClient:null,stateObservation:{source:'not-verified'},sessionToken:'synthetic',STATE_CACHE_KEY:'fixture',STATE_CACHE_MAX_MS:604800000,validateLoadedState:()=>[],el:k=>nodes[k]||{},render:()=>{},loadAiState:()=>{},updateAppBadge:()=>{},notice:()=>{},dataIssueView:()=>{},isInstalledApp:()=>false,esc:x=>x,classificationOverlay:{'SYN-1':'Legacy'}};
 vm.createContext(sandbox);
 for(const n of ['cacheState','loadCachedState','showCachedState','refresh','systemHealth','outreachView','filtered']){
  const line=overrideHtml.split('\n').find(x=>x.startsWith('function '+n+'(')||x.startsWith('async function '+n+'('));assert.ok(line,n+' exists');vm.runInContext(line,sandbox);
 }
 return {sandbox,store,nodes};
}
test('actual renderers delegate to the tested display module',()=>{const h=shellHarness();h.sandbox.state=snapshot();h.sandbox.systemHealth();assert.match(h.nodes.main.innerHTML,/Backup execution/);h.sandbox.outreachView();assert.match(h.nodes.main.innerHTML,/Outlook reply processing/);assert.ok(html.indexOf('/crm/status-display.js')<html.indexOf('<script>'));});
test('actual refresh preserves canonical, blank and unknown-ID payloads over repeated refreshes',async()=>{const h=shellHarness(),s=snapshot();s.updatedAt=new Date().toISOString();s.records.Companies=[{id:'SYN-1',name:'Synthetic',classification:'Canonical'},{id:'UNKNOWN',name:'Other',classification:''}];h.sandbox.call=async()=>structuredClone(s);for(let i=0;i<2;i++){await h.sandbox.refresh();assert.equal(JSON.stringify(h.sandbox.state.records),JSON.stringify(s.records));}s.records.Companies[0].classification='';await h.sandbox.refresh();assert.equal(h.sandbox.state.records.Companies[0].classification,'');assert.equal(JSON.parse(h.store.get('fixture')).schema,2);});
test('actual filters use canonical values, not fallback hints',async()=>{const h=shellHarness();Object.assign(h.sandbox,{state:{records:{Companies:[{id:'SYN-1',name:'Synthetic',classification:'Canonical'}]}},view:'Companies',query:'',companyFilters:{classification:'Legacy'},companySort:'asc'});assert.equal(h.sandbox.filtered().length,0);h.sandbox.companyFilters.classification='Canonical';assert.equal(h.sandbox.filtered().length,1);assert.equal(h.sandbox.state.records.Companies[0].classification,'Canonical');});
for(const saved of [{savedAt:Date.now(),state:snapshot()},{schema:2,savedAt:Date.now()+100000,state:snapshot()},{schema:2,savedAt:'invalid',state:snapshot()},{schema:2,savedAt:0,state:snapshot()},{schema:2,savedAt:Date.now()-604800001,state:snapshot()}])test('actual cache rejects legacy/invalid/future/expired snapshot '+JSON.stringify(saved.savedAt),()=>{const h=shellHarness();h.store.set('fixture',JSON.stringify(saved));assert.equal(h.sandbox.loadCachedState(),null);});
test('actual cache preserves canonical snapshot and marks cache provenance',()=>{const h=shellHarness();h.sandbox.state=snapshot();h.sandbox.cacheState();assert.equal(h.sandbox.showCachedState(),true);assert.equal(h.sandbox.stateObservation.source,'cache');});
test('failed actual refresh records failure even when retaining earlier state',async()=>{const h=shellHarness();h.sandbox.state=snapshot();h.sandbox.call=async()=>{throw Error('offline')};await h.sandbox.refresh();assert.equal(h.sandbox.stateObservation.refreshFailed,true);});
test('no auth routes, mailbox calls or live integration in presentation module',()=>{assert.doesNotMatch(source,/\bfetch\s*\(|\brpc\s*\(|\bcall\s*\(|localStorage|document\.cookie/);});

test('24-hour rollover is invalid telemetry, not a real observed date',()=>{assert.equal(ui.snapshotStatus({updatedAt:'2026-10-03T24:00:00Z'},{source:'api',receivedAt:now},now).label,'Not verified');});

test('draft cookie mode never caches records after frontend integration',()=>{const h=shellHarness();h.sandbox.cookieSessionClient={};h.sandbox.state=snapshot();h.sandbox.cacheState();assert.equal(h.store.has('fixture'),false);assert.equal(h.sandbox.showCachedState(),false);});
