import test from 'node:test';
import assert from 'node:assert/strict';
import {
 OPERATIONAL_HEADERS,REQUIRED_TABS,APPROVAL_CONFIRMATION,
 prepareOperationalAppend,providerBatchForPrepared,verifyOperationalReadback
} from '../v2/operational-write-contract.mjs';
import {readFileSync} from 'node:fs';

const request={
 requestId:'REQ-OP-20261011-001',evidenceId:'EV-OP-20261011-001',
 auditId:'AUD-OP-20261011-001',decisionId:'DEC-OP-20261011-001',
 companyId:'TSS-CY-001',candidateId:'',
 factType:'Developer Role',attributePath:'newlyReviewedRole',
 displayValue:'Synthetic test value',valueJson:'"Synthetic test value"',
 sourceId:'SRC-OFFICIAL',sourceRef:'https://example.invalid/project',
 observedAt:'2026-10-11',verificationStatus:'SOURCE SUPPORTED',freshnessStatus:'Current',
 informationClass:'Reusable TSS Intelligence',ownerDecision:'APPROVED',
 ownerConfirmation:APPROVAL_CONFIRMATION,
 reviewer:'TSS Google owner',capturedBy:'TSS Google owner',
 rationale:'Official page observed on review date. Approve this proposal only.',
 timestamp:'2026-10-11T19:15:00Z',sourcePublishedAt:'',
 reviewNotes:'Official page observed; this example is never submitted.',
 conflictAcknowledged:'',conflictGroupId:'',supersedesEvidenceId:''
};
const makeData=()=>({
 ownerVerified:true,ledgerAclOwnerOnly:true,singleWriterReserved:true,snapshotComplete:true,
 observedMs:100000,nowMs:100200,canonicalCompanyIdsUnique:true,
 sheetIds:{evidence:1403600101,audit:1403600102,decisions:1403600103},
 tabNames:{...REQUIRED_TABS},canonicalCompanies:[{id:'TSS-CY-001',name:'Synthetic fixture only'}],
 archivedEvidence:[],
 values:Object.fromEntries(Object.keys(OPERATIONAL_HEADERS).map(k=>[k,[...[]]+OPERATIONAL_HEADERS[k]]))
});
function snapshot(){
 const d=makeData();
 d.values=Object.fromEntries(Object.keys(OPERATIONAL_HEADERS).map(k=>[k,[...[]]]));
 for(const k of Object.keys(OPERATIONAL_HEADERS))d.values[k]=[[...OPERATIONAL_HEADERS[k]]];
 return d;
}
const ready=(over={},change={})=>prepareOperationalAppend({...request,...over},{...snapshot(),...change});
const error=(fn,pattern)=>assert.throws(fn,pattern);

test('prepared operational row plan stays zero-write and has exactly 3 canonical foreign-key tabs',()=>{
 const plan=ready();
 assert.equal(plan.status,'PREPARED_NOT_WRITTEN');
 assert.equal(plan.writesPerformed,0);
 assert.equal(plan.realProposalDisposition,'READY_FOR_OWNER_REVIEW');
 assert.deepEqual(Object.keys(plan.rows),['evidence','audit','decisions']);
 assert.equal(plan.rows.evidence.length,24);
 assert.equal(plan.rows.audit.length,16);
 assert.equal(plan.rows.decisions.length,15);
 assert.equal(plan.rows.evidence[1],'TSS-CY-001');
 assert.equal(plan.rows.evidence[2],'');
 assert.equal(plan.rows.decisions[9],'APPROVED');
 assert.equal(plan.rows.audit[11],'RECORDED');
 assert.equal(plan.rows.evidence[21],request.requestId);
 assert.equal(plan.rows.evidence[22],request.decisionId);
 assert.equal(plan.rows.evidence[23],request.auditId);
 const body=providerBatchForPrepared(plan);
 assert.equal(body.requests.length,3);
 assert.deepEqual(body.requests.map(x=>x.appendCells.sheetId),[1403600101,1403600102,1403600103]);
 assert.ok(body.requests.every(x=>x.appendCells.fields==='userEnteredValue'));
 assert.throws(()=>{plan.rows.evidence[0]='changed';},TypeError);
});

test('owner decision, ACL, source freshness and single-writer reservation are all mandatory',()=>{
 error(()=>ready({ownerDecision:'PENDING REVIEW'}),/APPROVED decision/);
 error(()=>ready({ownerConfirmation:'Yes'}),/confirmation/);
 error(()=>ready({reviewer:'Automated System'}),/single owner/);
 for(const mod of [
  {ownerVerified:false},{ledgerAclOwnerOnly:false},{singleWriterReserved:false},
  {snapshotComplete:false},{canonicalCompanyIdsUnique:false},
  {observedMs:0,nowMs:30000},{sheetIds:{evidence:1,audit:1,decisions:2}},
  {canonicalCompanies:null}
 ])error(()=>ready({},mod),/required|stale|verified|distinct|integrity|snapshot/i);
});

test('synthetic QA, replayed IDs and unknown Companies never create write packets',()=>{
 error(()=>ready({requestId:'QA-IDC-V2-REQ-001'}),/Synthetic/);
 error(()=>ready({companyId:'TSS-CY-999'}),/BLOCKED/);
 error(()=>ready({candidateId:'RC-1'}),/canonical Company/);
 error(()=>ready({supersedesEvidenceId:'EV-OLD'}),/Supersession disabled/);
 const s=snapshot();
 s.values.audit.push(OPERATIONAL_HEADERS.audit.map(h=>h==='requestId'?request.requestId:''));
 error(()=>ready({},s),/already used/);
 const archive=snapshot();
 archive.archivedEvidence.push({evidenceId:request.evidenceId});
 error(()=>ready({},archive),/already used in preserved archive/);
});

test('source/date/value validity and conflicts preserve historic evidence',()=>{
 error(()=>ready({sourceRef:'javascript:alert(1)'}),/BLOCKED/);
 error(()=>ready({observedAt:'2026-10-12'}),/BLOCKED/);
 error(()=>ready({valueJson:'{"other":1}'}),/exact string encoding/);
 const s=snapshot();
 const old={companyId:request.companyId,attributePath:request.attributePath,
  displayValue:'Different historical fact',sourceRef:'https://example.invalid/old',
  observedAt:'2026-09-30',evidenceId:'EV-P3-SAFE-001'};
 s.archivedEvidence.push(old);
 error(()=>ready({},s),/Conflict\/restricted fact/);
 const plan=ready({conflictAcknowledged:'YES'},s);
 assert.equal(plan.realProposalDisposition,'REQUIRES_HUMAN_REVIEW');
 assert.equal(old.displayValue,'Different historical fact');
});

test('real restricted data requires owner acknowledgement and never auto-publishes',()=>{
 error(()=>ready({informationClass:'Highly Restricted'}),/Conflict\/restricted fact/);
 const plan=ready({informationClass:'Highly Restricted',conflictAcknowledged:'YES'});
 assert.equal(plan.rows.evidence[13],'Highly Restricted');
 assert.equal(plan.writesPerformed,0);
});

test('readback requires exactly one matching record in each tab with consistent IDs',()=>{
 const plan=ready(),s=snapshot();
 const after={values:Object.fromEntries(Object.keys(plan.rows).map(k=>[
  k,[[...OPERATIONAL_HEADERS[k]],[...plan.rows[k]]]
 ]))};
 const verified=verifyOperationalReadback(plan,after);
 assert.equal(verified.status,'THREE_TAB_APPEND_VERIFIED');
 assert.equal(verified.writesPerformed,3);
 const repeated=JSON.parse(JSON.stringify(after));
 repeated.values.evidence.push([...plan.rows.evidence]);
 assert.equal(verifyOperationalReadback(plan,repeated).status,'UNCERTAIN');
 const corrupt=JSON.parse(JSON.stringify(after));
 corrupt.values.decisions[1][14]='Highly Restricted';
 assert.equal(verifyOperationalReadback(plan,corrupt).status,'UNCERTAIN');
 const absent=JSON.parse(JSON.stringify(after));
 absent.values.audit.pop();
 assert.equal(verifyOperationalReadback(plan,absent).status,'UNCERTAIN');
});

test('operational plan contains no private workbook identifiers, new APIs or automated network writes',()=>{
 const source=readFileSync(new URL('../v2/operational-write-contract.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/1H23IygUruc3ZksDuCd4MkEhy2SKuC8xIVCyZsC6X5rU/);
 assert.doesNotMatch(source,/\bfetch\s*\(|localStorage|sessionStorage|refresh_token|client_secret|HubSpot|\/api\/crm/);
 assert.match(source,/writesPerformed:0/);
});
