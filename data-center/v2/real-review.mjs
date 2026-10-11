/*
 * V2 governed canonical research proposal evaluation.
 * Read-only: consumes exact Company/evidence records and returns a review.
 * Never performs Google/HubSpot calls, edits Companies, merges IDs or
 * changes preserved research observations.
 */
import {text,normalized,isSyntheticFixture} from '../model.mjs';
import {VERIFICATION_STATES,FRESHNESS_STATES,INFORMATION_CLASSES,inspectRealSourceCitation} from './review.mjs';

export const REAL_PROPOSAL_LIMITS=Object.freeze({
 factType:120,attributePath:120,displayValue:1000,sourceRef:500,
 reviewNotes:1500,companyId:90
});
const date=s=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
 const d=new Date(s+'T00:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?d:null;
};
const clean=s=>text(s);
const compare=(a,b)=>normalized(a)===normalized(b);

/**
 * A READY_FOR_REVIEW result is NOT authorization to write.
 * Input source records must come from a fresh owner-verified private read.
 */
export function evaluateRealProposal(input={},context={}){
 const warnings=[],errors=[],candidate={};
 for(const f of ['companyId','factType','attributePath','displayValue','sourceRef',
  'observedAt','verificationStatus','freshnessStatus','informationClass','reviewNotes']){
  candidate[f]=clean(input[f]);
 }
 const companies=context.companies,evidence=context.evidence;
 if(!Array.isArray(companies)||!Array.isArray(evidence))
  errors.push('Source Companies and Evidence must both be loaded from authorized Google Sheets');
 if(context.sourceVerified!==true)
  errors.push('Owner Google read-only source verification required');
 for(const [key,max] of Object.entries(REAL_PROPOSAL_LIMITS)){
  if(key==='reviewNotes')continue;
  if(!candidate[key])errors.push(key+': required');
  if(candidate[key].length>max)errors.push(key+': too long');
 }
 if(candidate.reviewNotes.length>REAL_PROPOSAL_LIMITS.reviewNotes)
  errors.push('reviewNotes: too long');
 if(!VERIFICATION_STATES.includes(candidate.verificationStatus))
  errors.push('verificationStatus: unapproved');
 if(!FRESHNESS_STATES.includes(candidate.freshnessStatus))
  errors.push('freshnessStatus: unapproved');
 if(!INFORMATION_CLASSES.includes(candidate.informationClass))
  errors.push('informationClass: unapproved');
 const seen=new Set((companies||[]).map(x=>clean(x.id)));
 if(candidate.companyId&&!seen.has(candidate.companyId))
  errors.push('companyId: not an exact canonical Company identifier');
 if((companies||[]).filter(x=>clean(x.id)===candidate.companyId).length!==1)
  errors.push('companyId: canonical identity must be unique');
 const cited=inspectRealSourceCitation(candidate.sourceRef);
 if(!cited.valid)errors.push('sourceRef: valid HTTP(S) research citation required');
 const observed=date(candidate.observedAt);
 if(!observed)errors.push('observedAt: valid ISO date required');
 if(observed&&context.today&&date(context.today)&&observed>date(context.today))
  errors.push('observedAt: cannot be in future');
 const prior=(evidence||[]).filter(x=>!isSyntheticFixture(x)&&x.companyId===candidate.companyId
  &&compare(x.attributePath||x.factType,candidate.attributePath));
 const equivalent=prior.filter(x=>compare(x.displayValue,candidate.displayValue)
  &&clean(x.sourceRef)===candidate.sourceRef&&clean(x.observedAt)===candidate.observedAt);
 if(equivalent.length)errors.push('Equivalent evidence observation already exists; do not duplicate');
 const differing=prior.filter(x=>!compare(x.displayValue,candidate.displayValue));
 if(differing.length)warnings.push('Existing differing fact value: human conflict/normalization decision required; preserve old evidence');
 if(candidate.verificationStatus==='DIRECTLY CONFIRMED')
  warnings.push('Direct confirmation requires recorded human/source evidence and explicit owner decision');
 if(candidate.verificationStatus==='CONFLICTING / REVIEW REQUIRED')
  warnings.push('Conflict state requires a reviewed conflict group and explicit owner decision');
 if(['TSS Restricted Intelligence','Mandate Confidential','Highly Restricted']
   .includes(candidate.informationClass))
  warnings.push('Restricted data: must not be exported to public or less-protected research surfaces');
 if(!candidate.reviewNotes)
  warnings.push('Research reviewer notes should explain source relevance and unresolved identity questions');
 const status=errors.length?'BLOCKED':warnings.length?'REQUIRES_HUMAN_REVIEW':'READY_FOR_OWNER_REVIEW';
 return Object.freeze({status,errors:Object.freeze(errors),warnings:Object.freeze(warnings),
  candidate:Object.freeze(candidate),existingEvidenceCount:prior.length,
  existingFacts:Object.freeze(prior.slice(0,25).map(e=>Object.freeze({
   evidenceId:clean(e.evidenceId),reportedValue:clean(e.displayValue),
   sourceRef:clean(e.sourceRef),observedAt:clean(e.observedAt),
   verificationStatus:clean(e.verificationStatus),freshnessStatus:clean(e.freshnessStatus)
  }))),writesPerformed:0,
  nextAction:'Record explicit owner review, reserve immutable evidence/audit IDs, perform fresh duplicate check and controlled append only after separate production write-gate approval'});
}
