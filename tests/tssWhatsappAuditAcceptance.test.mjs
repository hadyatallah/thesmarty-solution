import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuditAcceptance} from '../lib/tssWhatsappAuditAcceptance.mjs';
import {validSeal} from '../lib/tssWhatsappLedger.mjs';
const time=Date.UTC(2026,9,22,12),session={email:'thesmartysolution@gmail.com',expiresAt:time+900000,csrfHash:'valid-session-hash'};
function fixture(){const rows=new Map();return {rows,ledger:{async create(id,row){if(rows.has(id))return false;rows.set(id,structuredClone(row));return true;},async get(id){return rows.get(id)||null;}}};}
test('audit acceptance uses the actual sender claim algorithm and notifier with no provider transport',async()=>{
 const f=fixture(),runId='a'.repeat(32),execute=createAuditAcceptance({env:{VERCEL_ENV:'preview',TSS_WHATSAPP_AUDIT_ACCEPTANCE:'approved'},ledger:f.ledger,now:()=>time});
 const result=await execute({session,runId});assert.equal(result.actualWhatsAppTransmissions,0);assert.equal(result.actualEmailTransmissions,0);
 assert.equal(result.simulatedTransportCalls,1);for(const value of Object.values(result.tests))assert.equal(value,true);
 for(const row of f.rows.values())assert.ok(validSeal(row));const count=f.rows.size;
 assert.equal((await execute({session,runId})).repeated,true);assert.equal(f.rows.size,count);
});
test('audit acceptance fails closed for production, absent approval, unauthorized and expired sessions',async()=>{
 for(const env of [{VERCEL_ENV:'production',TSS_WHATSAPP_AUDIT_ACCEPTANCE:'approved'},{VERCEL_ENV:'preview'}]){
  const f=fixture();await assert.rejects(createAuditAcceptance({env,ledger:f.ledger,now:()=>time})({session,runId:'a'.repeat(32)}));assert.equal(f.rows.size,0);
 }
 for(const bad of [{...session,email:'other@example.com'},{...session,expiresAt:time}]){
  const f=fixture();await assert.rejects(createAuditAcceptance({env:{VERCEL_ENV:'preview',TSS_WHATSAPP_AUDIT_ACCEPTANCE:'approved'},ledger:f.ledger,now:()=>time})({session:bad,runId:'a'.repeat(32)}));assert.equal(f.rows.size,0);
 }
});
