// Server-side service only. No HTTP endpoint is exposed until durable storage,
// authentication and existing saveRecord validation are bound and verified.
import {createHash, randomUUID} from 'node:crypto';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value==='object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
export const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const deny = code => { throw Object.assign(new Error(code),{code}); };
const highFields = new Set(['stage','qualificationStatus','lifecycle','communicationStatus','suppressed','doNotContact','paymentStatus','paidAmount','paidDate','agreedFee','tssFee','projectValue']);
export function actionClass(operation,fields={}) {
  if(operation==='read')return 'read';
  if(operation==='draft')return 'preparation';
  if(!['create','update'].includes(operation))return 'high_impact';
  return Object.keys(fields).some(k=>highFields.has(k))?'high_impact':'controlled_crm';
}
export class Gateway {
  constructor({store,authorize,adapter,clock=()=>new Date()}) {
    if(!store || !authorize || !adapter) throw Error('GATEWAY_DEPENDENCIES_REQUIRED');
    Object.assign(this,{store,authorize,adapter,clock});
  }
  async permit(ctx,permission){ if(!ctx?.tenantId || !ctx?.actor || !await this.authorize(ctx,permission))deny('UNAUTHORIZED'); }
  key(ctx,id){return ctx.tenantId+':'+id;}
  async audit(tx,ctx,a,result,error=null){await tx.audit({id:randomUUID(),timestamp:this.clock().toISOString(),tenantId:ctx.tenantId,agent:a.source,actor:ctx.actor,requestId:a.requestId,actionId:a.id,operation:a.operation,entity:a.entity,recordId:a.recordId,result,approvalReference:a.approval?.id||null,errorCode:error,retry:0});}
  async propose(ctx,input) {
    await this.permit(ctx,'propose');
    if(!input.source || !input.operation || !input.entity || !input.requestId || !input.expectedOutcome)deny('INVALID_ACTION');
    if(['create','update'].includes(input.operation)) await this.adapter.validate(ctx,input);
    if(input.operation==='update' && (input.expectedVersion===undefined || !input.recordId))deny('VERSION_REQUIRED');
    const payload=structuredClone({entity:input.entity,recordId:input.recordId||null,operation:input.operation,fields:input.fields||{},expectedVersion:input.expectedVersion??null,expectedOutcome:input.expectedOutcome});
    const actionId=digest({tenantId:ctx.tenantId,requestId:input.requestId,source:input.source,payload}).slice(0,32);
    const a={...payload,id:actionId,tenantId:ctx.tenantId,source:input.source,actor:ctx.actor,requestId:input.requestId,class:actionClass(input.operation,input.fields),payloadHash:digest(payload),approvalRequired:!['read','draft'].includes(input.operation),approval:null,approvalState:'pending',status:'proposed',providerReceipt:null,errorCode:null,createdAt:this.clock().toISOString(),updatedAt:this.clock().toISOString()};
    a.idempotencyKey=this.key(ctx,a.id); a.auditReference=a.id;
    return this.store.atomic(this.key(ctx,a.id),async tx=>{const existing=await tx.get();if(existing)return existing;await tx.put(a);await this.audit(tx,ctx,a,'proposed');return a;});
  }
  async approve(ctx,id,payloadHash,{expiresAt}={}) {
    await this.permit(ctx,'approve');
    const expiry=expiresAt||new Date(this.clock().getTime()+10*60000).toISOString();
    if(!(Date.parse(expiry)>this.clock().getTime()) || Date.parse(expiry)>this.clock().getTime()+10*60000)deny('INVALID_APPROVAL_EXPIRY');
    return this.store.atomic(this.key(ctx,id),async tx=>{const a=await tx.get();if(!a||a.tenantId!==ctx.tenantId)deny('NOT_FOUND');if(a.status!=='proposed'||a.payloadHash!==payloadHash)deny('APPROVAL_NOT_APPLICABLE');a.approval={id:randomUUID(),actor:ctx.actor,payloadHash,at:this.clock().toISOString(),expiresAt:expiry};a.approvalState='approved';await tx.put(a);await this.audit(tx,ctx,a,'approved');return a;});
  }
  async cancel(ctx,id) {
    await this.permit(ctx,'approve');return this.store.atomic(this.key(ctx,id),async tx=>{const a=await tx.get();if(!a||a.tenantId!==ctx.tenantId)deny('NOT_FOUND');if(a.status!=='proposed')deny('ALREADY_DISPATCHED');a.status='cancelled';a.approvalState='rejected';await tx.put(a);await this.audit(tx,ctx,a,'cancelled');return a;});
  }
  async execute(ctx,id) {
    await this.permit(ctx,'execute');
    const a=await this.store.atomic(this.key(ctx,id),async tx=>{
      const a=await tx.get();if(!a||a.tenantId!==ctx.tenantId)deny('NOT_FOUND');
      if(a.status==='succeeded')return {...a,replay:true};
      if(a.status!=='proposed')deny('RECONCILE_REQUIRED');
      if(a.approvalRequired && (!a.approval||a.approval.payloadHash!==a.payloadHash||Date.parse(a.approval.expiresAt)<=this.clock().getTime()))deny('APPROVAL_REQUIRED');
      const actualHash=digest({entity:a.entity,recordId:a.recordId,operation:a.operation,fields:a.fields,expectedVersion:a.expectedVersion,expectedOutcome:a.expectedOutcome});
      if(actualHash!==a.payloadHash)deny('PAYLOAD_CHANGED');
      if(a.operation==='update') {const current=await this.adapter.read(ctx,a.entity,a.recordId);if(!current||String(current.version)!==String(a.expectedVersion))deny('STALE_RECORD');}
      await this.adapter.validate(ctx,a); // validate permissions, suppression and current schema again
      a.status='executing';a.updatedAt=this.clock().toISOString();await tx.put(a);await this.audit(tx,ctx,a,'executing');return a;
    });
    if(a.replay)return a;
    // Mark before dispatch. Crash/timeout leaves executing or uncertain and cannot resend.
    let result, error;
    try{result=await this.adapter.execute(ctx,a);if(!result?.receipt)throw Error('MISSING_PROVIDER_RECEIPT');}catch(e){error=e;}
    return this.store.atomic(this.key(ctx,id),async tx=>{const current=await tx.get();current.updatedAt=this.clock().toISOString();if(error){current.status=error.definitelyNotExecuted===true?'failed':'uncertain';current.errorCode=error.code||'PROVIDER_ERROR';}else{current.status='succeeded';current.providerReceipt=result.receipt;}await tx.put(current);await this.audit(tx,ctx,current,current.status,current.errorCode);return current;});
  }
  async reconcile(ctx,id) {
    await this.permit(ctx,'execute');
    return this.store.atomic(this.key(ctx,id),async tx=>{const a=await tx.get();if(!a||a.tenantId!==ctx.tenantId)deny('NOT_FOUND');if(!['uncertain','executing'].includes(a.status))return a;const r=await this.adapter.reconcile(ctx,a);if(r?.receipt){a.status='succeeded';a.providerReceipt=r.receipt;}else if(r?.definitelyAbsent){a.status='failed';a.errorCode='CONFIRMED_NOT_EXECUTED';a.approvalState='expired';}await tx.put(a);await this.audit(tx,ctx,a,'reconciled');return a;});
  }
}
