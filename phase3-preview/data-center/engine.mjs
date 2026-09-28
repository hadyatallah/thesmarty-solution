export const ENUMS = Object.freeze({
  candidateStatus: ['New','Matching','Needs Review','Linked Existing Company','Approved New Company','Duplicate / Alias','Not Relevant','Inactive / Unverifiable','Deferred'],
  candidateDisposition: ['New','Matching','Needs Review','Linked Existing Company','Approved New Company','Duplicate / Alias','Related Company','Project / Brand Only','Not Relevant','Inactive / Unverifiable','Deferred'],
  verificationStatus: ['UNVERIFIED','SOURCE SUPPORTED','DIRECTLY CONFIRMED','CONFLICTING / REVIEW REQUIRED'],
  freshnessStatus: ['Current','Review Due','Stale'],
  researchDepth: ['Basic','Profiled','Commercially Researched','Active Intelligence'],
  informationClass: ['Reusable TSS Intelligence','TSS Restricted Intelligence','Mandate Confidential','Highly Restricted'],
  identityRelationship: ['Same Company / Duplicate Candidate','Trading Name','Former Name','Brand Operated By','Project Brand','Parent','Subsidiary','Group Sibling','Development JV','SPV / Project Vehicle','JV Participant','Possibly Related / Review Required'],
  projectRole: ['Developer','Development vehicle / SPV','JV participant','Landowner','Contractor','Architect','Project manager','Sales agent','Operator','Brand'],
  operatingStatus: ['Observed Operating','Operating Status Unknown','Confirmed Inactive'],
  developmentActivity: ['Observed Active Development','Observed Current Project Commercialization','Historical Development Evidenced','Development Activity Unknown','Confirmed Development Activity Ceased']
});

export const SCHEMAS = Object.freeze({
  ResearchCandidate: ['candidateId','discoveredName','normalizedName','website','normalizedDomain','country','region','locality','sectorHint','roleHints','discoverySourceRef','discoverySourceRefs','discoveredAt','candidateStatus','possibleCompanyId','possibleCompanyIds','identityMatchBasis','matchReviewState','assignedResearchOwner','reviewedAt','disposition','notes','createdAt','updatedAt','version'],
  ResearchSource: ['sourceId','sourceName','sourceType','baseUrl','publisher','geographyScope','sectorScope','sourceUsageLevel','accessMethod','active','lastSweptAt','nextReviewAt','sourceLimitations','notes'],
  EvidenceObservation: ['evidenceId','companyId','candidateId','factType','attributePath','valueJson','displayValue','sourceId','sourceRef','sourcePublishedAt','observedAt','verificationStatus','freshnessStatus','informationClass','supersedesEvidenceId','conflictGroupId','capturedBy','reviewNotes','createdAt','updatedAt','version'],
  IdentityRelationship: ['relationshipId','relationshipType','fromCompanyId','fromCandidateId','toCompanyId','toCandidateId','evidenceId','verificationStatus','observedAt','reviewState','notes','createdAt','updatedAt','version'],
  ResearchRun: ['runId','sector','geography','sourceSet','methodologyVersion','startedAt','completedAt','candidatesFound','matchedExisting','newCanonicalCompanies','duplicateOrAliasReviews','unresolvedCandidates','inaccessibleSources','knownCoverageLimits','operator','notes','idempotencyKey','status','createdAt','updatedAt','version'],
  DeveloperProject: ['projectId','projectName','normalizedName','district','locality','developmentType','propertyType','observedStatus','statusDate','website','firstObservedAt','lastObservedAt','researchState','createdAt','updatedAt','version'],
  DeveloperProjectCompanyRole: ['roleId','projectId','companyId','candidateId','projectRole','verificationState','evidenceId','observedAt','notes','createdAt','updatedAt','version'],
  DataCenterAudit: ['auditId','timestamp','actor','action','entityType','recordId','requestId','priorVersion','newVersion','outcome','details']
});

export const DEVELOPER_SECTOR = Object.freeze({
  geography: 'Republic of Cyprus',
  excludedGeography: 'Northern Cyprus unless later approved',
  districts: ['Famagusta','Larnaca','Limassol','Nicosia','Paphos'],
  developerRoles: ['Residential Developer','Commercial Developer','Mixed-use Developer','Land Developer','Hospitality Development','Industrial / Logistics Development','Redevelopment','Developer + Contractor','Developer + Agency / Sales','Developer + Investment / Asset Ownership'],
  operatingStatus: ENUMS.operatingStatus,
  developmentActivity: ENUMS.developmentActivity,
  projectRoles: ENUMS.projectRole,
  salesBuyerJourney: ['Direct sales','Enquiry form','Sales phone','Sales email','WhatsApp','Sales office','External agents','Property portals','International associates','Multilingual site','Downloadable brochure','Viewing/request route'],
  digitalFootprint: ['Website','Project sites','LinkedIn','Instagram','Facebook / business page','Google / business listing','Property portal','WhatsApp / public messaging','Live chat','Enquiry form'],
  observableTechnologySignals: ['Visible web form technology','Visible CRM / marketing integration signals','Booking / viewing flow','Chatbot / live-chat technology','Marketing automation signals','Portal feed / integration behaviour'],
  queryFamilies: ['English developer searches','Greek developer searches','District searches','Locality searches','Project-driven searches','Company-confirmation searches','Project-confirmation searches','Site-specific source sweeps','Portal-driven project discovery','Social-discovery review']
});

export const SOURCE_REGISTER = Object.freeze([
  ['SRC-CPDA','Cyprus Property Developers Association','Association','https://lbda.com.cy/members-2/?lang=en','Association-controlled directory','Republic of Cyprus','Property development','Structured Market Discovery','Manual review','Member population only; membership is not full market coverage.'],
  ['SRC-ASSOC','Other industry associations','Association','', 'Association publishers','Republic of Cyprus','Construction and property','Structured Market Discovery','Manual review','Membership populations may be incomplete and can include non-developer roles.'],
  ['SRC-DIR','Commercial developer directories','Commercial directory','https://cyprusdevelopers.com/; https://cyprusconstruction.com/; https://cyprusestateagents.com/','Directory publishers','Republic of Cyprus','Property and construction','Structured Market Discovery','Manual review','Directory inclusion does not prove current operating or development activity; populations overlap.'],
  ['SRC-COMPANY','Company websites','Company website','', 'Company controlled','Republic of Cyprus','Property development','First-Party Evidence','Manual page review','Supports company statements; not independent confirmation of performance or capacity.'],
  ['SRC-PROJECT','Project websites','Project website','', 'Project/company controlled','Republic of Cyprus','Property projects','First-Party Evidence','Manual page review','Project identity does not establish a separate canonical Company.'],
  ['SRC-WEB','Google / web search','Search engine','', 'Search provider','Republic of Cyprus','Property development','Discovery Only','Search then open underlying page','Search snippets are discovery only; open source before treating as evidence.'],
  ['SRC-LISTING','Google / business listings','Business listing','', 'Listing platform / public user edits','Republic of Cyprus','Property development','Discovery Only','Manual listing review','Listing identity and status require corroboration.'],
  ['SRC-PORTAL','Property portals','Property portal','', 'Portal publisher / advertisers','Republic of Cyprus','Property projects','Structured Market Discovery','Manual listing review','Listing or agent activity does not establish developer role or agent dependence.'],
  ['SRC-LINKEDIN','LinkedIn','Social / company page','', 'Company/person controlled','Republic of Cyprus','Property development','First-Party Evidence','Manual public-page review','Social presence alone does not prove legal identity. Public people are not automatically marketing contacts.'],
  ['SRC-INSTAGRAM','Instagram','Social / company page','', 'Account controlled','Republic of Cyprus','Property development','Discovery Only','Manual profile review','Existing screening has unresolved identity and geography; handle alone is insufficient.'],
  ['SRC-FACEBOOK','Facebook / business pages','Social / company page','', 'Page controlled / user edits','Republic of Cyprus','Property development','Discovery Only','Manual page review','Page ownership and legal identity require corroboration.'],
  ['SRC-MEDIA','Construction / property media','Media','', 'Independent publisher','Republic of Cyprus','Property development','Independent Corroboration','Manual article review','Publication date and claim scope must be retained.'],
  ['SRC-PRESS','Press releases','Press release','', 'Issuer / publisher','Republic of Cyprus','Property development','First-Party Evidence','Manual release review','Issuer claims remain first-party unless independently corroborated.'],
  ['SRC-PLANNING','Planning / development announcements','Official planning source','', 'Republic of Cyprus public authority','Republic of Cyprus','Planning and development','Identity / Official Evidence','Manual official-source review','Availability and fields vary by authority; absence of a result is not proof of inactivity.'],
  ['SRC-PARTNER','Partner websites','Partner reference','', 'Architect / contractor / consultant / agent','Republic of Cyprus','Property projects','Independent Corroboration','Manual page review','Relationship and project role must be supported by the cited page.'],
  ['SRC-CRM','Existing TSS CRM Companies','CRM catalogue','', 'TSS internal','Republic of Cyprus','All current CRM sectors','Structured Market Discovery','Read-only workbook scan','Legacy category is a classification hint, not verified Company Role.'],
  ['SRC-MARKET','Existing TSS Market study','Research workbook tab','', 'TSS internal','Republic of Cyprus','Existing market coverage','Structured Market Discovery','Read-only workbook review','Prior market-study populations overlap and are not a market denominator.'],
  ['SRC-COVERAGE','Existing TSS Coverage tab','Research workbook tab','', 'TSS internal','Republic of Cyprus','Existing source populations','Structured Market Discovery','Read-only workbook review','Counts describe the current catalogue/source population, not a census.'],
  ['SRC-IGSCREEN','Existing Instagram screening','Research workbook tab','', 'TSS internal','Republic of Cyprus','Public Instagram accounts','Discovery Only','Manual account review','3,418 exported handles; 71 matched; 2,845 unclassified in current Coverage.']
].map(([sourceId,sourceName,sourceType,baseUrl,publisher,geographyScope,sectorScope,sourceUsageLevel,accessMethod,sourceLimitations]) => ({sourceId,sourceName,sourceType,baseUrl,publisher,geographyScope,sectorScope,sourceUsageLevel,accessMethod,active:true,lastSweptAt:'',nextReviewAt:'',sourceLimitations,notes:'Registered for future review; not marked as swept by this preview build.'})));

const FREE_EMAIL_DOMAINS = new Set(['gmail.com','yahoo.com','yahoo.co.uk','hotmail.com','outlook.com','live.com','icloud.com','proton.me','protonmail.com','mail.com','aol.com']);
const clean = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('en').replace(/&/g,' and ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
export function normalizeName(value) { return clean(value); }
export function normalizeDomain(value) {
  const raw=String(value??'').trim(); if(!raw) return '';
  try { const u=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`); return u.hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,''); } catch { return ''; }
}
export function normalizePhone(value) { return String(value??'').replace(/[^\d+]/g,'').replace(/^00/,'+'); }
export function normalizeAddress(value) { return clean(value).replace(/\b(street|st|road|rd|avenue|ave)\b/g,''); }
export function candidateKey(candidate) {
  const location=[candidate.country,candidate.region,candidate.locality].map(x=>String(x||'').trim().toLowerCase()).join('|');
  return [normalizeName(candidate.discoveredName),normalizeDomain(candidate.website),location].join('|');
}
export function makeCandidate(candidate, now=new Date()) {
  const normalizedName=normalizeName(candidate.discoveredName), normalizedDomain=normalizeDomain(candidate.website);
  if(!normalizedName) throw new Error('DISCOVERED_NAME_REQUIRED');
  const stamp=now.toISOString();
  const refs=[...new Set([...(candidate.discoverySourceRefs||[]),candidate.discoverySourceRef].filter(Boolean))];
  return {...candidate,candidateId:candidate.candidateId||`RC-${stableHash(candidateKey({...candidate,normalizedName,normalizedDomain}))}`,normalizedName,normalizedDomain,discoverySourceRefs:refs,candidateStatus:candidate.candidateStatus||'New',matchReviewState:candidate.matchReviewState||'UNREVIEWED',disposition:candidate.disposition||'New',createdAt:candidate.createdAt||stamp,updatedAt:stamp,version:Number(candidate.version||1)};
}
export function stageCandidateIdempotent(rows,candidate,now=new Date()) {
  const key=candidateKey(candidate), existing=rows.find(r=>candidateKey(r)===key);
  if(existing) {
    const refs=[...new Set([...(existing.discoverySourceRefs||[]),...(candidate.discoverySourceRefs||[]),candidate.discoverySourceRef].filter(Boolean))];
    if(refs.length===(existing.discoverySourceRefs||[]).length) return {record:existing,created:false};
    return {record:{...existing,discoverySourceRefs:refs,updatedAt:now.toISOString(),version:Number(existing.version||1)+1},created:false,updatedSourceLineage:true};
  }
  const record=makeCandidate(candidate,now); return {record,created:true};
}
function stableHash(text) { let h=2166136261; for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);} return (h>>>0).toString(16).padStart(8,'0'); }
function emailDomain(email) { const m=String(email||'').trim().toLowerCase().match(/@([^@\s]+)$/); return m?m[1].replace(/^www\./,''):''; }
function identityAnchor(company) { return normalizeDomain(company.website)||normalizeDomain(company.domain); }
export function matchCandidate(candidate, companies) {
  const c=makeCandidate(candidate);
  const domain=c.normalizedDomain, email=emailDomain(candidate.email);
  const businessEmailDomain=email&&!FREE_EMAIL_DOMAINS.has(email)?email:'';
  const exactDomain=domain?companies.filter(x=>identityAnchor(x)===domain):[];
  const emailDomainMatches=businessEmailDomain?companies.filter(x=>identityAnchor(x)===businessEmailDomain):[];
  const exactName=companies.filter(x=>normalizeName(x.name)===c.normalizedName);
  const matchPool=exactDomain.length?exactDomain:emailDomainMatches.length?emailDomainMatches:exactName;
  const basis=exactDomain.length?'EXACT_NORMALIZED_DOMAIN':emailDomainMatches.length?'OFFICIAL_EMAIL_DOMAIN':exactName.length?'EXACT_NORMALIZED_NAME_ONLY':'';
  const supplementary=companies.filter(x=>{
    const phoneMatch=candidate.phone&&normalizePhone(x.phone)===normalizePhone(candidate.phone);
    const addressMatch=candidate.businessAddress&&normalizeAddress(x.businessAddress)===normalizeAddress(candidate.businessAddress);
    const groupMatch=candidate.groupName&&normalizeName(x.groupName)===normalizeName(candidate.groupName);
    return Boolean(phoneMatch||addressMatch||groupMatch);
  });
  if(matchPool.length) return {candidateId:c.candidateId,candidateStatus:matchPool.length===1&&basis!=='EXACT_NORMALIZED_NAME_ONLY'?'Matching':'Needs Review',matchReviewState:'REVIEW_REQUIRED',possibleCompanyId:matchPool.length===1?matchPool[0].id:'',possibleCompanyIds:matchPool.map(x=>x.id),identityMatchBasis:basis,supplementaryCompanyIds:supplementary.map(x=>x.id),autoLink:false,autoCreate:false};
  if(supplementary.length) return {candidateId:c.candidateId,candidateStatus:'Needs Review',matchReviewState:'REVIEW_REQUIRED',possibleCompanyId:'',possibleCompanyIds:supplementary.map(x=>x.id),identityMatchBasis:'WEAK_SIGNAL_ONLY',supplementaryCompanyIds:supplementary.map(x=>x.id),autoLink:false,autoCreate:false};
  return {candidateId:c.candidateId,candidateStatus:'New',matchReviewState:'NO_SUPPORTED_MATCH',possibleCompanyId:'',possibleCompanyIds:[],identityMatchBasis:'NO_SUPPORTED_MATCH',supplementaryCompanyIds:[],autoLink:false,autoCreate:false};
}
export function appendEvidence(evidenceRows,input,now=new Date()) {
  const factScope=(input.companyId?`company:${input.companyId}`:`candidate:${input.candidateId}`)+`:${input.attributePath}`;
  if(Boolean(input.companyId)===Boolean(input.candidateId)) throw new Error('EXACTLY_ONE_EVIDENCE_SUBJECT_REQUIRED');
  if(!input.sourceId||!input.sourceRef||!input.attributePath) throw new Error('EVIDENCE_LINEAGE_REQUIRED');
  if(!ENUMS.verificationStatus.includes(input.verificationStatus)) throw new Error('INVALID_VERIFICATION_STATUS');
  if(!ENUMS.freshnessStatus.includes(input.freshnessStatus)) throw new Error('INVALID_FRESHNESS_STATUS');
  if(!ENUMS.informationClass.includes(input.informationClass)) throw new Error('INVALID_INFORMATION_CLASS');
  const previous=evidenceRows.filter(e=>`${e.companyId?`company:${e.companyId}`:`candidate:${e.candidateId}`}:${e.attributePath}`===factScope);
  const conflicts=previous.filter(e=>JSON.stringify(e.valueJson)!==JSON.stringify(input.valueJson)&&e.verificationStatus!=='UNVERIFIED'&&input.verificationStatus!=='UNVERIFIED');
  const stamp=now.toISOString(), record={...input,evidenceId:input.evidenceId||`EV-${stableHash(`${factScope}|${input.sourceRef}|${stamp}`)}`,observedAt:input.observedAt||stamp,createdAt:stamp,updatedAt:stamp,version:1,conflictGroupId:input.conflictGroupId||(conflicts.length?`CF-${stableHash(factScope)}`:''),verificationStatus:conflicts.length?'CONFLICTING / REVIEW REQUIRED':input.verificationStatus};
  return {record,previousEvidenceIds:previous.map(e=>e.evidenceId),conflict:conflicts.length>0,overwrote:false};
}
export function assessFreshness(observedAt,reviewAfterDays,now=new Date()) {
  if(!observedAt||!Number.isFinite(Date.parse(observedAt))) return 'Review Due';
  const age=(now.getTime()-Date.parse(observedAt))/86400000;
  if(age>reviewAfterDays) return 'Stale';
  if(age>reviewAfterDays*0.8) return 'Review Due';
  return 'Current';
}
export function inferAbsence(value) {
  if(value===undefined||value===null||value==='') return 'Unknown';
  return value;
}
export function createResearchRunIdempotent(runs,run,now=new Date()) {
  if(!run.idempotencyKey) throw new Error('RUN_IDEMPOTENCY_KEY_REQUIRED');
  const found=runs.find(x=>x.idempotencyKey===run.idempotencyKey);
  if(found) return {record:found,created:false};
  const stamp=now.toISOString();
  return {record:{...run,runId:run.runId||`RR-${stableHash(run.idempotencyKey)}`,startedAt:run.startedAt||stamp,status:run.status||'Running',candidatesFound:0,matchedExisting:0,newCanonicalCompanies:0,duplicateOrAliasReviews:0,unresolvedCandidates:0,inaccessibleSources:0,createdAt:stamp,updatedAt:stamp,version:1},created:true};
}
export function auditEvent(input,now=new Date()) { return {auditId:`AUD-${stableHash(`${input.requestId}|${input.action}`)}`,timestamp:now.toISOString(),outcome:'Recorded',...input}; }
export function candidateCanOutreach() { return false; }
export function assertNoOutreach(entityType,action) { if(entityType==='ResearchCandidate'&&/outreach|email|whatsapp|send|contact/i.test(action)) throw new Error('RESEARCH_CANDIDATE_OUTREACH_PROHIBITED'); }
export function createCompanyFromCandidate(candidate,review) {
  if(review?.approved!==true||review?.humanReviewer===undefined||!review?.identityMatchBasis) throw new Error('HUMAN_IDENTITY_APPROVAL_REQUIRED');
  if(candidate.candidateStatus!=='Approved New Company'||candidate.disposition!=='Approved New Company') throw new Error('CANDIDATE_NOT_APPROVED_FOR_COMPANY');
  return {name:candidate.discoveredName,sourceCandidateId:candidate.candidateId,sourceLineage:candidate.discoverySourceRef,approvedBy:review.humanReviewer};
}
export function createIdentityRelationship(input) {
  if(!ENUMS.identityRelationship.includes(input.relationshipType)) throw new Error('INVALID_IDENTITY_RELATIONSHIP');
  if(input.relationshipType==='Same Company / Duplicate Candidate'&&input.autoMerge) throw new Error('AUTOMATIC_MERGE_PROHIBITED');
  return {...input,autoMerge:false,verificationStatus:input.verificationStatus||'UNVERIFIED',reviewState:input.reviewState||'Needs Review'};
}
export function developerRoleForProject(input) {
  if(!ENUMS.projectRole.includes(input.projectRole)) throw new Error('INVALID_PROJECT_ROLE');
  if(!input.projectId||(!input.companyId&&!input.candidateId)||!input.evidenceId) throw new Error('PROJECT_ROLE_EVIDENCE_REQUIRED');
  return {...input,roleId:input.roleId||`DPR-${stableHash(`${input.projectId}|${input.companyId||input.candidateId}|${input.projectRole}|${input.evidenceId}`)}`,verificationState:input.verificationState||'SOURCE SUPPORTED'};
}

export function buildCompanyDossier(companyId, companies, evidenceRows=[], companyRoles=[], projectRoles=[], projects=[], explicitResearchDepth='') {
  const company=companies.find(row=>row.id===companyId);
  if(!company) throw new Error('CANONICAL_COMPANY_NOT_FOUND');
  if(explicitResearchDepth&&!ENUMS.researchDepth.includes(explicitResearchDepth)) throw new Error('INVALID_DATA_CENTER_RESEARCH_DEPTH');
  const evidence=evidenceRows.filter(row=>row.companyId===companyId);
  const projectRoleRows=projectRoles.filter(row=>row.companyId===companyId);
  const projectIds=new Set(projectRoleRows.map(row=>row.projectId));
  return {
    canonicalCompany:{id:company.id,name:company.name},
    identity:{category:company.category||'',legacyResearchLevel:company.researchLevel||'',district:company.district||'',website:company.website||''},
    crmRelationship:{status:company.status||'',lifecycle:company.lifecycle||'',communicationStatus:company.communicationStatus||'',leadScore:company.leadScore??'',scoreBand:company.scoreBand||''},
    researchDepth:explicitResearchDepth||'Unassigned',
    evidence:evidence.map(row=>({evidenceId:row.evidenceId,attributePath:row.attributePath,displayValue:row.displayValue,sourceId:row.sourceId,sourceRef:row.sourceRef,observedAt:row.observedAt,verificationStatus:row.verificationStatus,freshnessStatus:row.freshnessStatus,informationClass:row.informationClass})),
    companyRoles:companyRoles.filter(row=>row.companyId===companyId),
    projects:projects.filter(row=>projectIds.has(row.projectId)),
    projectRoles:projectRoleRows,
    researchGaps:['developerRole','developmentActivity','operatingGeography','digitalFootprint','publicContactRoute'].filter(path=>!evidence.some(row=>row.attributePath===path)),
    commercialQualification:'Not assessed by Data Center preview'
  };
}
export function companyRoleInheritanceAllowed() { return false; }
export function assertExistingCompanyCompatibility(before,after) {
  const protectedFields=['id','category','researchLevel','leadScore','scoreBand','scoreReason','version'];
  for(const key of protectedFields) if(String(before?.[key]??'')!==String(after?.[key]??'')) throw new Error(`LEGACY_FIELD_PROTECTED:${key}`);
  return true;
}

export function evaluatePilotCase(fixture) {
  const entityType=fixture.entityType||'company';
  const matches=Array.isArray(fixture.companyMatches)?fixture.companyMatches:[];
  let identityState='Research Candidate',disposition='New';
  if(entityType==='project-brand'&&!fixture.canonicalOrganizationEvidence){identityState='Project / Brand Only';disposition='Project / Brand Only';}
  else if(fixture.outOfScope===true){identityState=matches.length?'Linked Existing Company':'Research Candidate';disposition='Not Relevant';}
  else if(fixture.relatedCompany===true){identityState='Related Companies';disposition='Related Company';}
  else if(matches.length>1||fixture.identityConflict===true){identityState=fixture.duplicateReview?'Probable Duplicate Review':'Relationship Review';disposition='Needs Review';}
  else if(matches.length===1){identityState='Existing Company';disposition='Linked Existing Company';}
  else if(fixture.projectVehicleEvidence===true||fixture.developerRoleEvidence===true){identityState='Research Candidate';disposition='Needs Review';}
  const developerRole=fixture.developerRoleEvidence?'SOURCE SUPPORTED':'Not Supported';
  const contractorRole=fixture.contractorRoleEvidence?'SOURCE SUPPORTED':'Not Supported';
  const developmentActivity=fixture.activeDevelopmentEvidence?'Observed Active Development':fixture.currentCommercializationEvidence?'Observed Current Project Commercialization':fixture.historicalDevelopmentEvidence?'Historical Development Evidenced':'Development Activity Unknown';
  const result={identityState,disposition,developerRole,contractorRole,operatingStatus:fixture.operatingStatusEvidence?'Observed Operating':'Operating Status Unknown',developmentActivity,companyMatches:matches,createdCanonicalCompany:false,merged:false,outreachTriggered:false,roleInherited:false};
  if(fixture.legacyCategory)result.legacyCategoryPreserved=fixture.legacyCategory;
  if(fixture.projectVehicleEvidence)result.relationshipHint='SPV / Project Vehicle';
  if(fixture.relatedCompany)result.relationshipHint=fixture.relationshipType||'Group / related entity';
  return result;
}
