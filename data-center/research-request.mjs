/*
 * One-box ChatGPT research handoff for the existing owner-only Data Center.
 * No Google/HubSpot API calls, new OAuth scopes, or browser persistence.
 */
import {text} from './model.mjs';

/**
 * The selected canonical Company is supplied by the existing authenticated
 * Company directory. This only prepares an owner-initiated clipboard request.
 * It never verifies a source, authorizes a write or sends anything remotely.
 */
export function prepareSimpleCompanyRequest(company,question=''){
 const id=text(company?.id),name=text(company?.name);
 const note=text(question);
 const errors=[];
 if(!id||id.length>90||!name)errors.push('Select a Company from the existing directory.');
 if(note.length>1200)errors.push('Keep your question under 1,200 characters.');
 if(errors.length)return Object.freeze({
  status:'BLOCKED',errors:Object.freeze(errors),handoffText:'',writesPerformed:0
 });
 const handoffText=[
  'TSS DATA CENTER — COMPANY RESEARCH REQUEST',
  'Company: '+name,
  'Canonical Company ID: '+id,
  'Category: '+(text(company.category)||'Unknown'),
  'District: '+(text(company.district)||'Unknown'),
  note?'My question or research note (not yet verified): '+note:
   'Please review this Company and suggest the next useful research checks.',
  'Use the existing connected TSS Google Sheets sources to verify the Company ID, dated evidence, sources, potential duplicates and any conflicting facts.',
  'Explain your findings clearly. Suggest changes only after verification and ask for my approval of each specific research update before recording it.',
  'Do not change Google Sheets or HubSpot, merge records, send communications or start outreach without separate explicit approval.',
  'Do not build a new CRM, integration, browser writer, database or paid service.'
 ].join('\n');
 return Object.freeze({
  status:'READY_TO_COPY',errors:Object.freeze([]),handoffText,writesPerformed:0
 });
}
