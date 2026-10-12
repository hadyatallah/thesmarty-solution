/*
 * TSS Intelligent Data Center: owner-reviewed ChatGPT research handoff.
 *
 * Pure in-memory validation. No Google/HubSpot writes, token handling,
 * persistence, new CRM records, or automatic submission to ChatGPT.
 */
import {text,normalized,safeExternalUrl} from './model.mjs';

const VERIFICATION=['UNVERIFIED','SOURCE SUPPORTED','DIRECTLY CONFIRMED','CONFLICTING / REVIEW REQUIRED'];
const FRESHNESS=['Current','Review Due','Stale'];
const CLASSES=['Reusable TSS Intelligence','TSS Restricted Intelligence',
 'Mandate Confidential','Highly Restricted'];
const isoDate=v=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const parsed=new Date(v+'T00:00:00Z');
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===v;
};
/**
 * Returns a request for ChatGPT, not authorization to write.
 * Only existing immutable canonical Company IDs are referenced.
 */
export function prepareResearchHandoff(company,existingEvidence,input,{today}={}){
 const errors=[],warnings=[];
 const id=text(company?.id);
 const path=text(input?.attributePath),value=text(input?.displayValue);
 const ref=text(input?.sourceRef),observed=text(input?.observedAt);
 const notes=text(input?.reviewNotes),verification=text(input?.verificationStatus);
 const freshness=text(input?.freshnessStatus),classification=text(input?.informationClass);
 if(!id||id.length>90)errors.push('Select an existing canonical Company');
 if(!path||path.length>120)errors.push('Provide an attribute path (maximum 120 characters)');
 if(!value||value.length>500)errors.push('Provide the reported fact (maximum 500 characters)');
 const href=safeExternalUrl(ref);
 if(!href||ref.length>500)errors.push('Provide a source URL beginning with https:// or http://');
 if(!isoDate(observed))errors.push('Provide a valid observed date (YYYY-MM-DD)');
 if(today&&isoDate(today)&&isoDate(observed)&&observed>today)
  errors.push('The observation date cannot be in the future');
 if(!VERIFICATION.includes(verification))errors.push('Select an approved verification status');
 if(!FRESHNESS.includes(freshness))errors.push('Select an approved freshness status');
 if(!CLASSES.includes(classification))errors.push('Select an approved information class');
 if(notes.length>1000)errors.push('Reviewer notes exceed 1,000 characters');
 if(classification==='Mandate Confidential'||classification==='Highly Restricted')
  errors.push('Confidential material requires separate private review; no ChatGPT handoff prepared here');
 const related=(existingEvidence||[]).filter(e=>e.companyId===id
  &&normalized(e.attributePath||e.factType)===normalized(path));
 const same=related.some(e=>normalized(e.displayValue)===normalized(value)
  &&text(e.sourceRef)===ref&&text(e.observedAt)===observed);
 if(same)errors.push('Equivalent dated observation already exists; do not duplicate');
 const conflict=related.some(e=>normalized(e.displayValue)!==normalized(value));
 if(conflict)warnings.push('Existing evidence differs; require human conflict/normalization review');
 if(verification==='DIRECTLY CONFIRMED')
  warnings.push('Direct confirmation must be independently established by the reviewer');
 if(verification==='CONFLICTING / REVIEW REQUIRED')
  warnings.push('Keep conflicting status until a reviewed resolution is recorded');
 if(classification==='TSS Restricted Intelligence')
  warnings.push('Restricted intelligence: check recipient context and privacy before sharing');
 const status=errors.length?'BLOCKED':warnings.length?'REVIEW_REQUIRED':'READY_TO_COPY';
 const handoffText=errors.length?'':[
  'TSS RESEARCH REVIEW REQUEST — NOT YET APPROVED FOR A WRITE',
  'Please independently review the source and existing evidence before making any change.',
  'Company ID: '+id,
  'Company name: '+text(company.name),
  'Attribute: '+path,
  'Reported fact: '+value,
  'Source URL: '+ref,
  'Observed date: '+observed,
  'Proposed verification: '+verification,
  'Proposed freshness: '+freshness,
  'Information class: '+classification,
  'Reviewer notes: '+(notes||'None provided'),
  'Existing observations for this attribute: '+related.length,
  conflict?'Existing fact conflict: YES — do not overwrite or silently resolve':'Existing fact conflict: no differing value detected in loaded archive',
  'Requested action: Check the canonical Company ID, source/date, existing research and duplicates; explain any conflicts; propose an append-only evidence entry and linked audit/decision for my explicit approval.',
  'DO NOT write to Google Sheets, HubSpot or send communications without my separate approval of this specific update.',
  'ChatGPT may use the already-connected official Google Sheets tools after approval; do not introduce a new browser writer, database, API service or OAuth scope.'
 ].join('\n');
 return Object.freeze({status,errors:Object.freeze(errors),warnings:Object.freeze(warnings),
  handoffText,existingCount:related.length,writesPerformed:0});
}
