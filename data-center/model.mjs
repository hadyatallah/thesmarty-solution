/* Pure, dependency-free read-only projections.
 * Treat all Sheet cells as untrusted text; DOM rendering uses textContent.
 */
export function rowsToObjects(values) {
 if (!Array.isArray(values) || values.length===0) return [];
 const headers=(values[0]||[]).map(v=>String(v||'').trim());
 return values.slice(1).filter(r=>Array.isArray(r)&&r.some(v=>String(v??'').trim())).map(row=>
  Object.fromEntries(headers.map((header,i)=>[header,String(row[i]??'').trim()]).filter(([header])=>Boolean(header))));
}
export function text(value){return String(value??'').trim();}
export function normalized(value){return text(value).toLocaleLowerCase('en').normalize('NFKC');}
export function filterCompanies(companies,{query='',district='',category=''}={}) {
 const terms=normalized(query).split(/\s+/).filter(Boolean), d=normalized(district), c=normalized(category);
 const filtered=companies.filter(company=>{
  if(d && normalized(company.district)!==d)return false;
  if(c && !normalized(company.category).includes(c))return false;
  if(!terms.length)return true;
  const searchable=[company.id,company.name,company.category,company.district,company.email,
          company.phone,company.website,company.researchLevel].map(normalized);
  return terms.every(term=>searchable.some(value=>value.includes(term)));
 });
 return filtered.sort((a,b)=>normalized(a.name).localeCompare(normalized(b.name)));
}
export function isSyntheticFixture(row){
 // Historical preview fixtures remain in archived Sheets for audit,
 // but are not operational developer research.
 if(!row||typeof row!=='object')return false;
 const ids=['RC-PREV-0001','DP-PREV-0001','DPR-PREV-0001','EV-PREV-0001','SRC-TEST'];
 const keys=['candidateId','projectId','roleId','evidenceId','sourceId','relationshipId'];
 if(keys.some(key=>ids.includes(text(row[key]))))return true;
 return ['sourceRef','discoverySourceRef','website','baseUrl'].some(key=>normalized(row[key]).startsWith('synthetic://'));
}
export function businessOnly(records){
 return records.filter(record=>!isSyntheticFixture(record));
}
export function recordById(records,field,value){return records.filter(r=>text(r[field])===text(value));}
export function isReviewNeeded(e) {
 return /conflict|review required|review due|stale|needs review|probable duplicate/i.test(
  [e.verificationStatus,e.freshnessStatus,e.duplicateReviewState,e.disposition,e.reviewState].map(text).join(' '));
}
export function companyDossier(company,records) {
 const id=company.id;
 const evidence=recordById(records.evidence||[],'companyId',id);
 const profile=recordById(records.profiles||[],'companyId',id)[0]||null;
 const roles=recordById(records.roles||[],'companyId',id);
 const linkedIds=new Set(roles.map(r=>r.projectId));
 const projects=(records.projects||[]).filter(p=>linkedIds.has(p.projectId));
 return {company,evidence,profile,roles,projects};
}
export function overview(records) {
 return {
  companies:(records.companies||[]).length,
  candidates:(records.candidates||[]).length,
  projects:(records.projects||[]).length,
  evidence:(records.evidence||[]).length,
  review:(records.evidence||[]).filter(isReviewNeeded).length+(records.profiles||[]).filter(isReviewNeeded).length
 };
}
export function safeExternalUrl(raw) {
 try {const u=new URL(text(raw));return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}
}
