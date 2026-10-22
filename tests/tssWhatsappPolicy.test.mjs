import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalPolicyPreview} from '../lib/tssWhatsappPolicy.mjs';
test('policy preview preserves unknown/held records, dedupe and backup uncertainty',()=>{
 const result=operationalPolicyPreview({inbox:[{key:'old',receivedAt:'2025-01-01',legalHold:false},{key:'held',receivedAt:'2025-01-01',legalHold:true},{key:'unknown',receivedAt:'2025-01-01'}],sessions:[]},{now:Date.UTC(2026,9,22)});
 assert.deepEqual(result.content.candidates.map(r=>r.reference),['old']);assert.equal(result.audit.coverage,'unknown');
 assert.equal(result.deletionAllowed,false);assert.equal(result.dedupe.action,'preserve_tombstones');assert.equal(result.backups.coverage,'unknown');
 assert.throws(()=>operationalPolicyPreview({},{auditDays:0}));
});
