(function(root){
'use strict';
const collections=['roles','signals','commercialOpportunities','mandates','matches','partnerRelationships'];
const text=v=>String(v??'');
const active=rows=>(rows||[]).filter(r=>r.recordState!=='Archived');
function analyze(snapshot,options={}){
 if(!snapshot?.permissions?.canRead)return {available:false,reason:'Commercial Network access unavailable',suggestions:[],candidates:[],reminders:[]};
 const now=options.now?Date.parse(options.now):Date.now(),suggestions=[],reminders=[],sources=[],rows={};
 for(const name of collections)rows[name]=active(snapshot[name]);
 for(const [name,list] of Object.entries(rows))for(const record of list){
  const id=text(record.id);if(!id)continue;
  const add=(kind,reason)=>suggestions.push({kind,recordId:id,collection:name,reason,requiresHumanReview:true});
  if(record.verificationStatus&&record.verificationStatus!=='Directly Confirmed')add('Evidence review','Verification is '+record.verificationStatus+'. No upgrade is applied.');
  if(record.freshnessStatus&&record.freshnessStatus!=='Current')add('Stale intelligence','Freshness is '+record.freshnessStatus+'.');
  if(/Other|Unknown|Unclassified/.test([record.roleType,record.signalType,record.opportunityType].join(' ')))add('Classification review','Existing classification requires review. No role or appetite is inferred.');
  if(['roles','signals'].includes(name)&&!record.sourceRef)add('Research gap','Source reference is missing.');
  if(name==='matches')for(const field of ['gaps','researchNeeded'])if(record[field])add('Research gap',text(record[field]));
  for(const field of ['reviewDueAt','nextReviewAt','expiresAt','followUp'])if(record[field]){const at=Date.parse(record[field]);if(Number.isFinite(at)&&at<=now)reminders.push({recordId:id,collection:name,field,dueAt:record[field],reason:field==='expiresAt'?'Expiry review required':'Review or follow-up due',scheduled:false});}
  for(const field of ['description','matchReason','scopeSummary','internalSummary','credentialsEvidence'])if(record[field])sources.push({recordId:id,field,excerpt:text(record[field]).slice(0,1000),sourceRef:text(record.sourceRef),verificationStatus:text(record.verificationStatus||'Unknown')});
 }
 const candidates=[];
 if(typeof options.evaluateMandate==='function')for(const mandate of rows.mandates)for(const company of (options.companies||[]).slice(0,100)){
  const evaluation=options.evaluateMandate(mandate,{companies:options.companies,roles:rows.roles,signals:rows.signals,partners:rows.partnerRelationships,matches:rows.matches},company.id);
  candidates.push({mandateId:mandate.id,companyId:company.id,evaluation,suggestionOnly:true});
 }
 return {available:true,generatedAt:new Date(now).toISOString(),candidateCoverage:{companiesConsidered:Math.min(100,(options.companies||[]).length),companiesAvailable:(options.companies||[]).length,partial:(options.companies||[]).length>100},counts:Object.fromEntries(collections.map(k=>[k,rows[k].length])),suggestions,sources,candidates,reminders,summary:`${rows.matches.length} Match records, ${suggestions.length} review items and ${reminders.length} due reminders in the authorized snapshot.`,authority:'Suggestions only. Qualification, shortlist, outreach, disclosure and Mandate permissions remain human decisions.',provider:'deterministic'};
}
async function assist(snapshot,options={}){
 const local=analyze(snapshot,options);if(!local.available||typeof options.provider!=='function')return local;
 let timer;try{const result=await Promise.race([options.provider({mode:'extract',recordIds:[...new Set(local.sources.map(x=>x.recordId))].slice(0,25)}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Provider timeout')),options.timeoutMs||8000);})]);if(!result||!Array.isArray(result.extractions))throw Error('Invalid provider result');
  const safe=result.extractions.every(x=>Object.keys(x).every(k=>['recordId','field','excerpt'].includes(k))&&local.sources.some(s=>s.recordId===x.recordId&&s.field===x.field&&s.excerpt.includes(x.excerpt)));
  if(!safe)throw Error('Unsupported provider claim');return {...local,extractions:result.extractions,provider:result.provider||'deterministic',providerStatus:result.providerStatus||'available'};
 }catch{return {...local,providerStatus:'unavailable',provider:'deterministic'};}finally{clearTimeout(timer);}
}
const esc=value=>text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(result){if(!result.available)return '<p>Commercial Network assistance unavailable. Existing CRM remains available.</p>';return '<section aria-label="Commercial Network internal assistance"><h3>Internal review</h3><p>'+esc(result.summary)+'</p><p>'+esc(result.authority)+'</p>'+(result.providerStatus==='unavailable'?'<p>AI provider unavailable. Showing structured review results.</p>':'')+'<ul>'+result.suggestions.map(s=>'<li><strong>'+esc(s.recordId)+' · '+esc(s.kind)+'</strong>: '+esc(s.reason)+'</li>').join('')+'</ul><h4>Due reminders</h4><ul>'+result.reminders.map(s=>'<li>'+esc(s.recordId)+' · '+esc(s.reason)+' · '+esc(s.dueAt)+'</li>').join('')+'</ul><h4>Evidence excerpts</h4><ul>'+(result.extractions||result.sources).map(s=>'<li>'+esc(s.recordId)+' · '+esc(s.field)+': '+esc(s.excerpt)+'</li>').join('')+'</ul><details><summary>Candidate review ('+result.candidates.length+')</summary><p>'+esc(result.candidateCoverage.partial?'Limited to first 100 supplied Companies.':'Supplied Company scope reviewed.')+'</p><ul>'+result.candidates.map(c=>'<li>'+esc(c.mandateId)+' / '+esc(c.companyId)+': '+esc(JSON.stringify(c.evaluation))+'</li>').join('')+'</ul></details></section>';}
root.TSS_CN_AGENT={analyze,assist,render};
})(typeof window!=='undefined'?window:globalThis);
