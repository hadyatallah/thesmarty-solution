import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rowsToObjects,filterCompanies,companyDossier,isReviewNeeded,overview,safeExternalUrl} from '../model.mjs';
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
 assert.match(cfg,/googleClientId:\s*""/); // remains blocked pending official OAuth setup
 assert.doesNotMatch(cfg,/private_key|client_secret|BEGIN PRIVATE KEY|access_token\s*:/);
 const css=read('data-center/app.css');
 assert.ok(css.includes('[hidden]{display:none!important}'));
 assert.ok(app.includes('root.replaceChildren();root.hidden=true'));
 assert.ok(app.includes('oauth2?.revoke'));
 assert.ok(app.includes('records=next;loaded={master:true,research:true}'));
 assert.ok(!app.includes('records.companies=rowsToObjects'));

});
