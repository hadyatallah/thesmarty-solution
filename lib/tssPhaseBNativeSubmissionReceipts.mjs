// TSS Phase B isolated native HubSpot submission receipt candidate.
// PURE FUNCTIONS ONLY. No network, writes, provider secrets, mail, or live routes.
import { createHash } from 'node:crypto';
export const TSS_NATIVE_GENERAL_FORM_ID = 'd571803e-7777-4f28-94ea-b24df852245c';
export const TSS_COMMERCIAL_TICKET_PIPELINE = '4209185979';
export const TSS_COMMERCIAL_NEW_STAGE = '6206658800';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDER_ID = /^[A-Za-z0-9_:-]{6,200}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOSTS = new Set(['thesmartysolution.com','www.thesmartysolution.com']);
function requireFormId(formId) {
  const id=String(formId||'').trim().toLowerCase();
  if (!UUID.test(id)||id!==TSS_NATIVE_GENERAL_FORM_ID) throw Error('B2_FORM_NOT_ALLOWLISTED');
  return id;
}
function fieldsFrom(values) {
  if (!Array.isArray(values)) throw Error('B2_FIELDS_UNVERIFIED');
  const fields=new Map();
  for (const entry of values) {
    if (!entry||typeof entry.name!=='string'||typeof entry.value!=='string') continue;
    if (entry.objectTypeId&&entry.objectTypeId!=='0-1') continue;
    const name=entry.name.replace(/^0-1\//,'').trim().toLowerCase(),value=entry.value.trim();
    if (!name||name.length>100||value.length>20000) throw Error('B2_FIELD_INVALID');
    if (fields.has(name)&&fields.get(name)!==value) throw Error('B2_CONFLICTING_FIELD_VALUES');
    fields.set(name,value);
  }
  return fields;
}
function sourcePage(pageUrl) {
  if (!pageUrl) return null;
  let url;
  try { url=new URL(pageUrl); } catch { throw Error('B2_UNTRUSTED_SOURCE_PAGE'); }
  if (url.protocol!=='https:'||!HOSTS.has(url.hostname.toLowerCase())||url.username||url.password) throw Error('B2_UNTRUSTED_SOURCE_PAGE');
  return url.origin+url.pathname;
}
export function normalizeNativeSubmission(raw,{formId=TSS_NATIVE_GENERAL_FORM_ID}={}) {
  const form=requireFormId(formId);
  if (!raw||typeof raw!=='object'||Array.isArray(raw)) throw Error('B2_PROVIDER_ROW_INVALID');
  if (raw.formId&&String(raw.formId).toLowerCase()!==form) throw Error('B2_FORM_ID_MISMATCH');
  if (typeof raw.id!=='string'||!PROVIDER_ID.test(raw.id)) throw Error('B2_IMMUTABLE_SUBMISSION_ID_MISSING');
  if (!Number.isSafeInteger(raw.submittedAt)||raw.submittedAt<Date.parse('2020-01-01T00:00:00Z')) throw Error('B2_PROVIDER_TIMESTAMP_INVALID');
  const fields=fieldsFrom(raw.values),email=(fields.get('email')||'').toLowerCase(),route=fields.get('tss_enquiry_route')||'';
  const page=sourcePage(raw.pageUrl),claimedKiti=raw.pageUrl?new URL(raw.pageUrl).searchParams.get('enquiry')==='kiti':false;
  const nativeRoute=route||(page&&!claimedKiti?'General Business Enquiry':null),holds=[];
  if (!EMAIL.test(email)) holds.push('contact_identity_unverified');
  if (!nativeRoute||(claimedKiti&&route!=='Kiti Residential Development Opportunity')) holds.push('native_route_unverified');
  if (!page) holds.push('source_page_unverified');
  const ordered=[...fields.entries()].sort(([a],[b])=>a.localeCompare(b));
  const submissionFingerprint=createHash('sha256').update(JSON.stringify({ordered,submittedAt:raw.submittedAt,page})).digest('hex');
  return Object.freeze({
    formId:form,originalSubmissionId:raw.id,eventKey:'hubspot-native:'+form+':'+raw.id,
    sourceSubmittedAt:new Date(raw.submittedAt).toISOString(),sourcePage:page,
    submittedContactEmail:email||null,nativeRoute,submissionFingerprint,
    status:holds.length?'HELD_FOR_REVIEW':'RECEIPT_READY_FOR_MATCHING',holds,rawSource:'HUBSPOT_NATIVE_FORM'
  });
}
export function normalizeNativeSubmissionPage(response,{formId=TSS_NATIVE_GENERAL_FORM_ID,maxResults=100}={}) {
  requireFormId(formId);
  if (!response||!Array.isArray(response.results)||response.results.length>maxResults) throw Error('B2_UNBOUNDED_OR_INVALID_PROVIDER_PAGE');
  const after=response.paging?.next?.after;
  if (after!==undefined&&(typeof after!=='string'||after.length<1||after.length>500)) throw Error('B2_PAGING_CURSOR_INVALID');
  const rows=response.results.map(raw=>normalizeNativeSubmission(raw,{formId})),byKey=new Map();
  for (const row of rows) {
    const prior=byKey.get(row.eventKey);
    if (prior&&prior.submissionFingerprint!==row.submissionFingerprint) throw Error('B2_SAME_PROVIDER_ID_CONFLICT');
    byKey.set(row.eventKey,row);
  }
  return {receipts:[...byKey.values()],nextCursor:after||null,providerResults:response.results.length};
}
export function planCommercialHandover(receipt,contactCandidates) {
  if (!receipt?.eventKey||receipt.rawSource!=='HUBSPOT_NATIVE_FORM') throw Error('B3_INVALID_EVENT_RECEIPT');
  if (receipt.status!=='RECEIPT_READY_FOR_MATCHING') return {status:'HOLD',reason:'SOURCE_RECEIPT_REVIEW',writes:0};
  if (!Array.isArray(contactCandidates)) throw Error('B3_CONTACT_READBACK_MISSING');
  const matches=contactCandidates.filter(c=>c?.properties&&String(c.properties.email||'').trim().toLowerCase()===receipt.submittedContactEmail);
  if (matches.length!==1||!matches[0].id) return {status:'HOLD',reason:'CONTACT_IDENTITY_AMBIGUOUS_OR_MISSING',writes:0};
  if (matches[0].properties.tss_source_system==='Personal - Android Import') return {status:'HOLD',reason:'PERSONAL_CONTACT_IDENTITY',writes:0};
  if (matches[0].properties.hs_email_optout===true||matches[0].properties.hs_email_optout==='true') return {status:'HOLD',reason:'SUPPRESSION_REVIEW_REQUIRED',writes:0};
  return {
    status:'READY_FOR_ATOMIC_RESERVATION',writes:0,eventKey:receipt.eventKey,
    formId:receipt.formId,originalSubmissionId:receipt.originalSubmissionId,
    submittedAt:receipt.sourceSubmittedAt,sourcePage:receipt.sourcePage,
    contactId:String(matches[0].id),pipelineId:TSS_COMMERCIAL_TICKET_PIPELINE,newStageId:TSS_COMMERCIAL_NEW_STAGE,
    allowCompanyCreate:false,allowDealCreate:false,allowCustomerEmail:false,
    requires:['durable_atomic_reservation','unique_ticket_key_contract','approved_internal_qa','provider_association_readback']
  };
}
