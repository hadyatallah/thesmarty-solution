import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNativeSubmission,normalizeNativeSubmissionPage,planCommercialHandover,TSS_NATIVE_GENERAL_FORM_ID} from '../lib/tssPhaseBNativeSubmissionReceipts.mjs';
const mk=(id='submission-001',email='qa@example.test',route='Kiti Residential Development Opportunity')=>({
  id,submittedAt:Date.parse('2026-10-10T10:00:00Z'),
  pageUrl:'https://www.thesmartysolution.com/contact.html?enquiry=kiti',
  values:[{name:'email',value:email,objectTypeId:'0-1'},{name:'tss_enquiry_route',value:route,objectTypeId:'0-1'}]
});
const contact={id:'123',properties:{email:'qa@example.test',tss_source_system:'TSS Website'}};
test('original provider ID and source timestamp preserved',()=>{
  const x=normalizeNativeSubmission(mk());
  assert.equal(x.eventKey,'hubspot-native:'+TSS_NATIVE_GENERAL_FORM_ID+':submission-001');
  assert.equal(x.sourceSubmittedAt,'2026-10-10T10:00:00.000Z');
  assert.equal(x.status,'RECEIPT_READY_FOR_MATCHING');
});
test('same Contact can have independent submission IDs',()=>{
  assert.notEqual(normalizeNativeSubmission(mk('submission-001')).eventKey,normalizeNativeSubmission(mk('submission-002')).eventKey);
});
test('never invents provider ID from email or timestamp',()=>{
  assert.throws(()=>normalizeNativeSubmission({...mk(),id:null}),/IMMUTABLE_SUBMISSION_ID_MISSING/);
});
test('rejects other form IDs',()=>{
  assert.throws(()=>normalizeNativeSubmission(mk(),{formId:'00000000-0000-0000-0000-000000000000'}),/FORM_NOT_ALLOWLISTED/);
});
test('holds missing native Kiti route despite Kiti query parameter',()=>{
  const x=normalizeNativeSubmission(mk('submission-003','qa@example.test',''));
  assert.equal(x.status,'HELD_FOR_REVIEW');assert.equal(x.nativeRoute,null);
});
test('blank ordinary General form route remains General only',()=>{
  const row=mk('submission-general','qa@example.test','');
  row.pageUrl='https://www.thesmartysolution.com/contact.html';
  const x=normalizeNativeSubmission(row);
  assert.equal(x.nativeRoute,'General Business Enquiry');assert.equal(x.status,'RECEIPT_READY_FOR_MATCHING');
});
test('rejects untrusted source page',()=>{
  assert.throws(()=>normalizeNativeSubmission({...mk(),pageUrl:'https://example.org/contact.html'}),/UNTRUSTED_SOURCE_PAGE/);
});
test('same provider ID with changed source facts is a hard hold',()=>{
  assert.throws(()=>normalizeNativeSubmissionPage({results:[mk('submission-same'),mk('submission-same','other@example.test')]}),/SAME_PROVIDER_ID_CONFLICT/);
});
test('identical repeated provider row is one receipt but two source rows',()=>{
  const x=normalizeNativeSubmissionPage({results:[mk('submission-same'),mk('submission-same')],paging:{next:{after:'cursor-1'}}});
  assert.equal(x.receipts.length,1);assert.equal(x.providerResults,2);assert.equal(x.nextCursor,'cursor-1');
});
test('bounded page and cursor',()=>{
  assert.throws(()=>normalizeNativeSubmissionPage({results:[mk(),mk()]},{maxResults:1}),/UNBOUNDED/);
  assert.throws(()=>normalizeNativeSubmissionPage({results:[mk()],paging:{next:{after:52}}}),/PAGING_CURSOR_INVALID/);
});
test('Contact matching plans zero writes and correct commercial pipeline',()=>{
  const x=planCommercialHandover(normalizeNativeSubmission(mk()),[contact]);
  assert.equal(x.status,'READY_FOR_ATOMIC_RESERVATION');assert.equal(x.writes,0);
  assert.equal(x.pipelineId,'4209185979');assert.equal(x.allowCompanyCreate,false);
  assert.equal(x.allowDealCreate,false);assert.equal(x.allowCustomerEmail,false);
});
test('ambiguous/missing or personal imported Contacts held',()=>{
  const x=normalizeNativeSubmission(mk());
  assert.equal(planCommercialHandover(x,[]).status,'HOLD');
  assert.equal(planCommercialHandover(x,[contact,{...contact,id:'456'}]).status,'HOLD');
  assert.equal(planCommercialHandover(x,[{...contact,properties:{...contact.properties,tss_source_system:'Personal - Android Import'}}]).reason,'PERSONAL_CONTACT_IDENTITY');
});
test('conflicting repeated native field names held',()=>{
  assert.throws(()=>normalizeNativeSubmission({...mk(),values:[...mk().values,{name:'email',value:'different@example.test',objectTypeId:'0-1'}]}),/CONFLICTING_FIELD_VALUES/);
});
test('non-numeric timestamps held',()=>{
  assert.throws(()=>normalizeNativeSubmission({...mk(),submittedAt:'2026-10-10'}),/TIMESTAMP_INVALID/);
});
