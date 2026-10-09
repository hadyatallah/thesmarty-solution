// Read-only browser/Node validator for owner-selected Phase 3 known-open-exception data.
// The manifest stays on the owner's device. No restricted Company ID is bundled into the website.
export const PHASE3_HOLD_SCHEMA='tss-phase3-known-open-holds-v1';
const VALID_REASONS=new Set(['IDENTITY_RELATIONSHIP','AMBIGUOUS_DIRECTORY_MATCH','CONFLICTING_EVIDENCE']);
const COMPANY_ID=/^(?:TSS-CY-[0-9]+|COM-[A-Za-z0-9-]+)$/;
function isoDay(value){
 if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value))return null;
 const dt=new Date(value+'T00:00:00Z');
 return Number.isFinite(dt.getTime())&&dt.toISOString().slice(0,10)===value?value:null;
}
export function validatePhase3HoldManifest(input,companies,{asOf}={}){
 let m=input;
 if(typeof m==='string'){
  if(m.length>256000)throw Error('MANIFEST_TOO_LARGE');
  try{m=JSON.parse(m)}catch{throw Error('MANIFEST_JSON_INVALID')}
 }
 if(!m||typeof m!=='object'||Array.isArray(m)||m.schema!==PHASE3_HOLD_SCHEMA||
    m.coverage!=='KNOWN_OPEN_EXCEPTIONS_ONLY'||m.origin!=='TSS_PHASE3_OWNER_PREVIEW'||
    !Array.isArray(m.holds)||m.holds.length===0||m.holds.length>3000)throw Error('MANIFEST_SCHEMA_INVALID');
 const current=isoDay(asOf),captured=isoDay(m.asOf);
 if(!current||!captured)throw Error('MANIFEST_DATE_INVALID');
 const age=(Date.parse(current+'T00:00:00Z')-Date.parse(captured+'T00:00:00Z'))/86400000;
 if(age<0||age>30)throw Error('MANIFEST_DATE_OUT_OF_RANGE');
 if(!Array.isArray(companies))throw Error('SOURCE_COMPANIES_UNAVAILABLE');
 const known=new Set(companies.map(x=>String(x?.id??'').trim()).filter(Boolean));
 const held=new Set();
 const reasons=new Map();
 for(const row of m.holds){
  if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.companyId!=='string'||
    !COMPANY_ID.test(row.companyId)||!Array.isArray(row.reasons)||row.reasons.length===0||
    row.reasons.some(x=>!VALID_REASONS.has(x)))throw Error('MANIFEST_HOLD_ROW_INVALID');
  if(held.has(row.companyId)||new Set(row.reasons).size!==row.reasons.length)throw Error('MANIFEST_HOLD_DUPLICATE');
  if(!known.has(row.companyId))throw Error('MANIFEST_ID_NOT_IN_COMPANIES');
  held.add(row.companyId);
  reasons.set(row.companyId,[...row.reasons]);
 }
 return {holdIds:held,reasons,asOf:captured,coverage:'KNOWN_OPEN_EXCEPTIONS_ONLY',count:held.size,
   authoritativeCoverageEstablished:false,allowsCommercialQualification:false};
}
