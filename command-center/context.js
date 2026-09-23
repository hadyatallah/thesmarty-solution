// Shared projections only. No independent CRM store or provider dispatch.
import {validDate} from './crm.js';
export function operationalEvidence(snapshot={}) {
 const evidence={...(snapshot.operationalEvidence||{})};
 const mail=snapshot.records?.['Email Activity'];
 if(Array.isArray(mail)){
  const captured=mail.filter(r=>r.messageId&&validDate(r.createdAt||r.updatedAt));
  const latest=captured.sort((a,b)=>Date.parse(b.createdAt||b.updatedAt)-Date.parse(a.createdAt||a.updatedAt))[0];
  if(latest)evidence['Outlook ingestion']={...evidence['Outlook ingestion'],lastBusinessSuccess:latest.createdAt||latest.updatedAt,reference:latest.messageId,source:'CRM Email Activity capture',limitation:'Captured ledger evidence only. Mailbox completeness, ingestion heartbeat and backlog remain unverified.'};
 }
 return evidence;
}
export function notificationItems(runtime,now=new Date()){
 if(!runtime)return [];
 const items=[];
 for(const a of runtime.actions||[]){
  const expired=a.approvalState==='approved'&&Date.parse(a.approval?.expiresAt)<=now.getTime();
  if(a.status==='proposed')items.push({key:'action:'+a.id+':'+(expired?'expired':a.approvalState),kind:expired?'Warning':'Needs Approval',reference:a.id,text:expired?'Approval expired. Review the current record and prepare a fresh approval.':a.operation+' '+a.entity+' '+(a.recordId||'new record')});
  else if(['failed','uncertain','executing'].includes(a.status))items.push({key:'action:'+a.id+':'+a.status,kind:a.status==='failed'?'Failed':'Warning',reference:a.id,text:a.status==='failed'?'Action failed. Review the audit.':'Execution outcome needs reconciliation. Do not repeat this action.'});
 }
 for(const j of runtime.jobs||[])if(['failed','retry','partial','stale','changed','running'].includes(j.status))items.push({key:'job:'+j.id+':'+j.status,kind:j.status==='failed'?'Failed':'Warning',reference:j.id,text:j.type+' · '+j.status});
 const seen=new Set();return items.filter(x=>{if(seen.has(x.key))return false;seen.add(x.key);return true;});
}
export function approvalSummary(runtime){return runtime?{actions:runtime.actions||[],notifications:notificationItems(runtime),checkedAt:runtime.checkedAt,limitations:['Approval applies only to the exact recorded proposal. Use the approval controls below.']}:{unavailable:'Approval service unavailable. No action executed.'};}
