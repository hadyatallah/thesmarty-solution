import {governedKitiMatchFixture} from './kiti-pilot-data-center-snapshot.js';

export const DISCLOSURE_ORDER = ['D0','D1','D2','D3','D4','D5','D6'];

export const KITI_PUBLIC_FACTS = Object.freeze({
  title: 'Kiti Residential Development Opportunity',
  location: 'Kiti, Larnaca District, Cyprus',
  opportunityType: 'Land / Development',
  sector: 'Residential Development',
  siteArea: 'Approx. 859 m²',
  conceptStage: 'Preliminary concept completed',
  structures: ['Acquisition','Development Partnership','Joint Venture','Investor-funded development'],
  caveat: 'Subject to planning, technical and commercial due diligence.'
});

export const KITI_RESTRICTED_KEYS = new Set([
  'landownerIdentity',
  'architectIdentity',
  'peopleBehindTSS',
  'confidentialStudies',
  'unapprovedProjections'
]);

export function disclosureRank(level){
  const i = DISCLOSURE_ORDER.indexOf(String(level || '').toUpperCase());
  return i < 0 ? 0 : i;
}

export function minDisclosure(...levels){
  const valid = levels.filter(Boolean).map(v => String(v).toUpperCase());
  if (!valid.length) return 'D0';
  return valid.reduce((a,b)=> disclosureRank(a) <= disclosureRank(b) ? a : b);
}

export function deriveOperatingPhase(opportunity, mandate, matches=[]){
  const status = opportunity?.status || 'Potential';
  const stage = opportunity?.developmentStage || 'Preparation';
  if (['Potential','Under Review','Needs Readiness'].includes(status) || stage === 'Preparation') return 'PREPARE';
  const activeMandate = mandate?.status === 'Active';
  const criteriaReady = Boolean(mandate?.criteriaReady);
  const packageReady = Boolean(opportunity?.informationPackageReady);
  if (!activeMandate || !criteriaReady || !packageReady) return 'LOAD';
  const converting = matches.some(m => ['Interested','Introduction Approved','Introduced','Active Discussion','Negotiation','Closed'].includes(m.engagementState));
  if (converting || ['Interest','Introduction','Active Discussion','Negotiation / Professional Handoff','Outcome'].includes(stage)) return 'CONVERT';
  return 'LAUNCH';
}

export function criterionOutcome(value){
  const v = String(value || 'Unknown');
  return ['Meets','Does Not Meet','Unknown','Conflicting / Review Required','Stale / Revalidation Required'].includes(v) ? v : 'Unknown';
}

export function aggregateMandatory(criteria=[]){
  const mandatory = criteria.filter(c => c.type === 'Mandatory');
  if (!mandatory.length) return 'INCOMPLETE';
  const outcomes = mandatory.map(c => criterionOutcome(c.outcome));
  if (outcomes.includes('Does Not Meet')) return 'FAIL';
  if (outcomes.includes('Conflicting / Review Required')) return 'REVIEW REQUIRED';
  if (outcomes.includes('Unknown') || outcomes.includes('Stale / Revalidation Required')) return 'INCOMPLETE';
  return 'PASS';
}

export function candidateQueueGroup(match){
  if (match?.suppressed || match?.blocked) return 'Blocked';
  const mandatory = aggregateMandatory(match?.criteria || []);
  if (mandatory === 'FAIL') return 'Blocked';
  if (mandatory === 'REVIEW REQUIRED' || mandatory === 'INCOMPLETE') return 'Research First';
  const preferred = (match?.criteria || []).filter(c => c.type === 'Preferred');
  const meets = preferred.filter(c => criterionOutcome(c.outcome) === 'Meets').length;
  const unknown = preferred.filter(c => ['Unknown','Stale / Revalidation Required','Conflicting / Review Required'].includes(criterionOutcome(c.outcome))).length;
  if (meets >= 2 && unknown <= Math.max(1, Math.floor(preferred.length/2))) return 'Priority Review';
  return 'Standard Review';
}

export function effectiveDisclosure({mandateCeiling='D0', recipientLevel='D0', documentLevel='D6'}={}){
  return minDisclosure(mandateCeiling, recipientLevel, documentLevel);
}

export function outreachGate({mandate, match, suppressed=false, recipientKnown=true}={}){
  if (!mandate || mandate.status !== 'Active') return {allowed:false, reason:'Active Mandate required'};
  if (mandate.authorityOutreach !== 'Granted') return {allowed:false, reason:'Outreach authority not granted'};
  if (!match) return {allowed:false, reason:'Match required'};
  if (match.qualificationState !== 'Outreach Approved') return {allowed:false, reason:'Match is not Outreach Approved'};
  if (suppressed) return {allowed:false, reason:'Company is suppressed / do not contact'};
  if (!recipientKnown) return {allowed:false, reason:'Recipient identity not confirmed'};
  return {allowed:true, reason:'Controlled communication workflow available'};
}

export function packProjection({facts={}, requestedLevel='D1', mandateCeiling='D0', recipientLevel='D0', fieldRules={}}={}){
  const effectiveLevel = minDisclosure(requestedLevel, mandateCeiling, recipientLevel);
  const included = {};
  const excluded = [];
  for (const [key,value] of Object.entries(facts)) {
    const rule = fieldRules[key] || {minLevel:'D0', maxLevel:'D6', restricted:false};
    if (rule.restricted || KITI_RESTRICTED_KEYS.has(key)) {
      excluded.push({key,reason:'Restricted'});
      continue;
    }
    if (disclosureRank(effectiveLevel) < disclosureRank(rule.minLevel || 'D0')) {
      excluded.push({key,reason:'Above effective disclosure'});
      continue;
    }
    included[key] = value;
  }
  return {effectiveLevel,included,excluded};
}

export function interpretMessage(text=''){
  const s = String(text).trim();
  const lower = s.toLowerCase();
  const detected = [];
  const proposals = [];
  const negativeInterest=/\bnot interested\b|\bno interest\b/i.test(s);
  if (negativeInterest) {
    detected.push('Explicitly not interested');
    proposals.push({field:'engagementState',value:'Not Interested',confidence:'explicit'});
  } else if (/\b(interested|keen to explore|would like to explore)\b/i.test(s)) {
    detected.push('Expressed interest');
    proposals.push({field:'engagementState',value:'Interested',confidence:'explicit'});
  }
  if (/planning|permit|approval/i.test(s)) detected.push('Planning information requested');
  if (/joint venture|\bjv\b/i.test(s)) detected.push('JV structure queried');
  if (/remove me|do not contact|unsubscribe/i.test(s)) {
    detected.push('Do-not-contact instruction');
    proposals.push({field:'suppression',value:'Do not contact',confidence:'explicit'});
  }
  if (/signed nda|non-disclosure agreement.*attached|nda.*attached/i.test(lower)) detected.push('Possible executed NDA received');
  if (/who owns|owner identity|landowner/i.test(lower)) detected.push('Restricted identity requested');
  if (/offer|price|€|eur|usd|\$/i.test(s)) detected.push('Commercial term may be present');
  return {detected,proposals,qualificationChange:null};
}

export function validateDraftClaims(draft='', lockedFacts={}){
  const failures = [];
  const text = String(draft || '');
  if (/full planning approval|fully approved planning/i.test(text) && !lockedFacts.planningApproval) failures.push('Unsupported claim: planning approval');
  if (/\b(irr|roi|return|yield|profit)\b/i.test(text) && !lockedFacts.financialProjectionApproved) failures.push('Unsupported financial projection');
  const area = lockedFacts.siteArea;
  if (area && /\b\d{3,4}\s*m²(?=\s|[.,;:!?)]|$)/.test(text) && !text.includes(area.replace('Approx. ',''))) failures.push('Locked fact mismatch: site area');
  return failures;
}

export function kitiFixture(){
  return {
    opportunity:{
      id:'COP-KITI-PILOT',
      title:KITI_PUBLIC_FACTS.title,
      opportunityType:'Land / Development',
      status:'Accepted',
      developmentStage:'Targeting',
      geographyCountry:'Cyprus',
      geographyRegion:'Larnaca District',
      geographyLocality:'Kiti',
      sector:'Residential Development',
      informationClass:'TSS Restricted Intelligence',
      informationPackageReady:true
    },
    mandate:{
      id:'MAN-KITI-RESEARCH-ONLY',
      status:'Active',
      authorityResearch:'Granted',
      authorityOutreach:'Not Granted',
      authorityDisclosure:'Conditional',
      authorityIntroduction:'Not Granted',
      authorityRepresentation:'Not Granted',
      authorityNegotiation:'Not Granted',
      authorityBinding:'Not Granted',
      maxDisclosureLevel:'D1',
      criteriaReady:true
    },
    matches:[governedKitiMatchFixture()]
  };
}
