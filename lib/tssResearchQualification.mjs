// TSS Company Data Center — research readiness V2 (PREVIEW ONLY).
// This engine is pure and read-only. Scores measure completeness, NOT buyer intent,
// current developer activity, a verified identity, permission to contact, or sales qualification.
export const RESEARCH_SCHEMA = 'tss-research-readiness-v2-preview-2026-10-09';
const MONTHS = Object.freeze({jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12});
const SELECTED_FIELDS = Object.freeze([
  'id','name','category','district','website','source1','source2',
  'services','portfolio','fitAssessment','verificationNotes','researchDate',
  'researchOwner','researchLevel','leadScore','scoreBand','scoreReason','scoreUpdatedAt'
]);
const CONTRIBUTIONS = Object.freeze({
  canonicalIdentity:10,primarySource:20,secondSource:10,researchDate:15,
  category:5,district:5,portfolioOrServices:10,fitNarrative:10,
  verificationNotes:10,website:5
}); // EXACTLY 100 possible completeness points (not a quality or commercial score).

function clean(x){return typeof x==='string'?x.trim():x==null?'':String(x).trim();}
function isoDay(str){
  const s=clean(str);
  let y,m,d;
  let a=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if(a){y=+a[1];m=+a[2];d=+a[3];}
  else{
    a=/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(s);
    if(!a)return null;
    d=+a[1];m=MONTHS[a[2].slice(0,3).toLowerCase()];y=+a[3];
  }
  if(!m||m>12||d<1||d>31||y<2000||y>2100)return null;
  const date=new Date(Date.UTC(y,m-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()+1!==m||date.getUTCDate()!==d)return null;
  return date.toISOString().slice(0,10);
}
function httpsURL(value){
  try{const x=new URL(clean(value));return x.protocol==='https:'&&!!x.hostname&&!x.username&&!x.password&&
    !/(^|\.)localhost$/.test(x.hostname)?x.href:null;}catch{return null;}
}
const ID_RE=/^(?:TSS-CY-\d+|COM-[A-Za-z0-9-]+)$/;
function notesHaveIdentityHold(x){return /\b(?:ambiguous identity|identity conflict|identity unresolved|unresolved identity|duplicate candidate|do not merge|conflicting identity)\b/i.test(clean(x));}
function band(n){return n>=75?'Evidence-review ready':n>=45?'Enrichment needed':'Research incomplete';}
export function sourceRowsToCompanies(values){
  if(!Array.isArray(values)||!Array.isArray(values[0]))throw Error('INVALID_COMPANIES_TABLE');
  const header=values[0].map(clean);
  const required=['id','name'];
  if(required.some(f=>!header.includes(f)))throw Error('SOURCE_MISSING_REQUIRED_FIELDS');
  const indexes=Object.fromEntries(SELECTED_FIELDS.map(f=>[f,header.indexOf(f)]));
  return values.slice(1).filter(r=>Array.isArray(r)&&clean(r[indexes.id])).map(row=>
    Object.fromEntries(SELECTED_FIELDS.map(f=>[f,indexes[f]<0?'':clean(row[indexes[f]])]))
  );
}
/**
 * Preview completeness only. Numeric score is **not** verified suitability.
 * Review flags are conservative and cannot grant outreach or HubSpot lifecycle changes.
 * asOf is explicit for deterministic historical replay (YYYY-MM-DD in Cyprus date).
 */
export function assessCompany(company,{asOf,identityHold=false}={}){
  const day=isoDay(asOf);
  if(!day)throw Error('AS_OF_DATE_REQUIRED');
  if(!company||typeof company!=='object')throw Error('INVALID_COMPANY');
  const id=clean(company.id),name=clean(company.name),checkDate=isoDay(company.researchDate);
  const src=[httpsURL(company.source1),httpsURL(company.source2)].filter(Boolean);
  const sources=[...new Set(src)]; // URL presence only; two links ≠ independent corroboration.
  const age=checkDate==null?null:Math.floor((Date.parse(day+'T00:00:00Z')-Date.parse(checkDate+'T00:00:00Z'))/86400000);
  const freshness=age==null||age<0?'Unknown':age<=90?'Current':age<=365?'Aging':'Stale';
  const points={
    canonicalIdentity:ID_RE.test(id)&&name?10:0,
    primarySource:sources.length?20:0,
    secondSource:sources.length>=2?10:0,
    researchDate:freshness==='Current'?15:freshness==='Aging'?7:0,
    category:clean(company.category)?5:0,
    district:clean(company.district)?5:0,
    portfolioOrServices:clean(company.portfolio)||clean(company.services)?10:0,
    fitNarrative:clean(company.fitAssessment)?10:0,
    verificationNotes:clean(company.verificationNotes)?10:0,
    website:httpsURL(company.website)?5:0
  };
  const completeness=Object.values(points).reduce((sum,n)=>sum+n,0);
  if(completeness>100)throw Error('INVALID_SCORE');
  const reasons=[];
  if(!points.canonicalIdentity)reasons.push('IDENTITY_NEEDS_REVIEW');
  if(!sources.length)reasons.push('NO_HTTPS_EVIDENCE_SOURCE');
  if(sources.length===1)reasons.push('ONE_SOURCE_ONLY');
  if(freshness==='Unknown')reasons.push('RESEARCH_DATE_UNKNOWN');
  if(freshness==='Stale')reasons.push('RESEARCH_DATE_STALE');
  if(!points.fitNarrative)reasons.push('FIT_ASSESSMENT_NOT_RECORDED');
  if(!points.verificationNotes)reasons.push('VERIFICATION_NOTES_MISSING');
  const qa=id==='COM-8ee64d5e'||/^TSS INTERNAL (?:EMAIL )?QA\b/i.test(name);
  const conflict=identityHold||notesHaveIdentityHold(company.verificationNotes);
  let gate=qa?'INTERNAL_QA_EXCLUDED':
    conflict?'IDENTITY_HOLD':
    !points.canonicalIdentity?'IDENTITY_REVIEW':
    !sources.length?'SOURCE_REVIEW':
    freshness==='Unknown'||freshness==='Stale'?'FRESHNESS_REVIEW':'HUMAN_EVIDENCE_REVIEW_REQUIRED';
  if(qa)reasons.push('INTERNAL_TEST_NOT_A_PROSPECT');
  if(conflict)reasons.push('UNRESOLVED_IDENTITY_HOLD');
  return {
    schema:RESEARCH_SCHEMA,id,name,category:clean(company.category),district:clean(company.district),
    completeness,completenessBand:band(completeness),pointBreakdown:points,
    sourceLinkCount:sources.length,sourceQuality:'NOT_VERIFIED',researchDate:checkDate,
    freshness,ageDays:age,gate,reasons,
    legacyScore:clean(company.leadScore)||null,legacyBand:clean(company.scoreBand)||null,
    legacyScoreIsCommerciallyBlended:true,
    verifiedDeveloperRole:false,fitQualification:'NOT_ASSESSED',buyingIntent:'UNKNOWN',
    outreachAuthorized:false,hubspotLifecycleChangeAuthorized:false,
    readyForAutoHubspotPromotion:false
  };
}
export function rankResearchReview(companies,options){
  if(!Array.isArray(companies))throw Error('INVALID_COMPANY_COLLECTION');
  const reviewed=companies.map(x=>assessCompany(x,options));
  const counts=new Map();
  for(const x of reviewed)counts.set(x.id,(counts.get(x.id)||0)+1);
  for(const x of reviewed)if(counts.get(x.id)>1){x.gate='IDENTITY_HOLD';x.reasons.push('DUPLICATE_CANONICAL_ID');}
  const rankable=reviewed.filter(x=>x.gate==='HUMAN_EVIDENCE_REVIEW_REQUIRED');
  const excluded=reviewed.filter(x=>x.gate!=='HUMAN_EVIDENCE_REVIEW_REQUIRED');
  // Sorting only prioritizes *human research review*. Not prospect sales ranking.
  const byCompleteness=(a,b)=>b.completeness-a.completeness||a.id.localeCompare(b.id);
  rankable.sort(byCompleteness);excluded.sort(byCompleteness);
  return {schema:RESEARCH_SCHEMA,asOf:isoDay(options?.asOf),total:reviewed.length,
    reviewReady:rankable.length,held:excluded.length,
    companies:[...rankable,...excluded]};
}
export const RESEARCH_COMPLETENESS_WEIGHTS=CONTRIBUTIONS;
