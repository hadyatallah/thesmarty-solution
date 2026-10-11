import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rowsToObjects,filterCompanies,companyDossier,isReviewNeeded,overview,safeExternalUrl,businessOnly,isSyntheticFixture} from '../model.mjs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('source row parser preserves headers and positions, skipping empty rows',()=>{
 assert.deepEqual(rowsToObjects([['id','','district'],['TSS-01','skip','Larnaca'],['','','']]),
 [{id:'TSS-01',district:'Larnaca'}]);
});
test('canonical company search supports district, category and case-folded lookup',()=>{
 const rows=[
  {id:'TSS-CY-001',name:'Synthetic Developer',category:'Developer',district:'Larnaca',website:'https://example.invalid'},
  {id:'TSS-CY-002',name:'Other Contractor',category:'Contractor',district:'Paphos',website:''}
 ];
 assert.equal(filterCompanies(rows,{query:'synthetic',district:'Larnaca',category:'developer'}).length,1);
 assert.equal(filterCompanies(rows,{query:'unknown'}).length,0);
 assert.equal(filterCompanies(rows,{district:'Paphos'})[0].id,'TSS-CY-002');
 assert.equal(filterCompanies(rows,{query:'developer larnaca'}).length,1);
 assert.equal(filterCompanies(rows,{query:'Paphos contractor'}).length,1);
 assert.equal(filterCompanies(rows,{query:'Paphos developer'}).length,0);
});
test('dossiers join only exact canonical Company IDs and explicit project roles',()=>{
 const c={id:'TSS-CY-001',name:'Synthetic Developer'};
 const model=companyDossier(c,{evidence:[{companyId:'TSS-CY-001',evidenceId:'EV-1'},{companyId:'TSS-CY-010',evidenceId:'EV-2'}],
  profiles:[{companyId:'TSS-CY-001',disposition:'Needs Review'}],
  roles:[{projectId:'DP-1',companyId:'TSS-CY-001',projectRole:'Developer'},
         {projectId:'DP-2',companyId:'TSS-CY-002',projectRole:'Contractor'}],
  projects:[{projectId:'DP-1'},{projectId:'DP-2'}]});
 assert.deepEqual(model.evidence.map(x=>x.evidenceId),['EV-1']);
 assert.deepEqual(model.projects.map(x=>x.projectId),['DP-1']);
 assert.equal(model.profile.disposition,'Needs Review');
});
test('Unknown is not No; conflict/freshness remains review-needed',()=>{
 assert.equal(isReviewNeeded({freshnessStatus:'Review Due'}),true);
 assert.equal(isReviewNeeded({verificationStatus:'CONFLICTING / REVIEW REQUIRED'}),true);
 assert.equal(isReviewNeeded({duplicateReviewState:'Probable Duplicate'}),true);
 assert.equal(isReviewNeeded({freshnessStatus:'Current',verificationStatus:'SOURCE SUPPORTED'}),false);
 assert.equal(overview({companies:[{}],evidence:[{freshnessStatus:'Review Due'}],profiles:[]}).review,1);
});
test('only http/https URLs are surfaced as external research links',()=>{
 assert.equal(safeExternalUrl('javascript:alert(1)'),null);
 assert.equal(safeExternalUrl('data:text/html,bad'),null);
 assert.equal(safeExternalUrl('https://example.invalid/a'),'https://example.invalid/a');
});
test('browser shell never embeds real Company rows, tokens or writable old CRM APIs',()=>{
 const h=read('data-center/index.html'),app=read('data-center/app.js'),cfg=read('data-center/config.js');
 assert.match(h,/noindex,nofollow/);
 assert.match(h,/data-view="companies"/);
 assert.match(h,/data-view="projects"/);
 assert.match(h,/data-view="review"/);
 assert.match(h,/data-view="handover"/);
 assert.match(app,/https:\/\/www\.googleapis\.com\/oauth2\/v3\/userinfo/);
 assert.match(app,/spreadsheets\.readonly/);
 assert.match(app,/email_verified/);
 assert.match(app,/encodeURIComponent\(sheetId\)/);
 assert.doesNotMatch(app,/localStorage|sessionStorage|openai\.com\/v1|script\.google\.com|\/api\/crm/);
 assert.match(cfg,/googleClientId:\s*"[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com"/); // public owner-issued client identifier
 assert.doesNotMatch(cfg,/private_key|client_secret|BEGIN PRIVATE KEY|access_token\s*:/);
 const css=read('data-center/app.css');
 assert.ok(css.includes('[hidden]{display:none!important}'));
 assert.ok(app.includes('root.replaceChildren();root.hidden=true'));
 assert.ok(app.includes('oauth2?.revoke'));
 assert.ok(app.includes('records=next;loaded={master:true,research:true}'));
 assert.ok(!app.includes('records.companies=rowsToObjects'));

});

test('Android install manifest is branded, scope-limited, and has appropriate PNG icons',()=>{
 const manifest=JSON.parse(read('data-center/manifest.webmanifest'));
 assert.equal(manifest.start_url,'/data-center/');
 assert.equal(manifest.scope,'/data-center/');
 assert.equal(manifest.display,'standalone');
 assert.equal(manifest.theme_color,'#091e32');
 for(const size of [192,512]){
  const icon=manifest.icons.find(i=>i.src==='/data-center/icon-'+size+'.png');
  assert.ok(icon,'Missing Android icon '+size);
  assert.equal(icon.sizes,size+'x'+size);
  assert.equal(icon.type,'image/png');
 }
 const page=read('data-center/index.html');
 assert.match(page,/rel="manifest" href="\/data-center\/manifest\.webmanifest"/);
 assert.match(page,/rel="apple-touch-icon"/);
});
test('Service worker caches only public shell assets, never private Google API responses',()=>{
 const sw=read('data-center/sw.js'),app=read('data-center/app.js');
 assert.match(sw,/u\.origin!==self\.location\.origin/);
 assert.match(sw,/ALLOWED\.has\(u\.pathname\)/);
 assert.match(sw,/req\.method!=='GET'/);
 assert.doesNotMatch(sw,/sheets\.googleapis\.com|oauth2\/v3\/userinfo|localStorage|sessionStorage/);
 assert.doesNotMatch(sw,/masterSpreadsheetId|researchSpreadsheetId|companyId/);
 assert.match(app,/navigator\.serviceWorker\.register\('\/data-center\/sw\.js'/);
 assert.match(app,/Private data locked/);
});

test('historical synthetic preview fixtures stay archived but do not count as live research',()=>{
 const ids=[
  {candidateId:'RC-PREV-0001',discoveredName:'Demo Candidate Ltd'},
  {projectId:'DP-PREV-0001',projectName:'Demo Court (Synthetic)'},
  {evidenceId:'EV-PREV-0001',sourceRef:'synthetic://phase3/evidence-fixture/001'},
  {roleId:'DPR-PREV-0001',projectId:'DP-PREV-0001'},
  {sourceId:'SRC-TEST'}
 ];
 for(const record of ids)assert.equal(isSyntheticFixture(record),true);
 const safe=[{candidateId:'RC-P3-CPY-001',discoveredName:'Cypeir Properties Limited'},
 {projectId:'DP-P3-001',projectName:'Gelfanco 8 Court'},
 {evidenceId:'EV-P3-0001',sourceRef:'https://gelfanco.com/projects.html'}];
 assert.deepEqual(businessOnly([...ids,...safe]),safe);
 assert.equal(overview({companies:[],candidates:businessOnly([ids[0],safe[0]])}).candidates,1);
 const app=read('data-center/app.js');
 assert.ok(app.includes('businessOnly(rowsToObjects(research[i]?.values||[]))'));
});
