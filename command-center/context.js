// Shared projections only. No independent CRM store or provider dispatch.
import {validDate} from './crm.js';

const dateOf=r=>r?.timestamp||r?.createdAt||r?.updatedAt||r?.messageDate||'';
const latest=(rows,predicate=()=>true)=>rows.filter(r=>predicate(r)&&validDate(dateOf(r))).sort((a,b)=>Date.parse(dateOf(b))-Date.parse(dateOf(a)))[0];
const controls=rows=>Object.fromEntries((rows||[]).filter(r=>r?.setting).map(r=>[r.setting,r]));

export function operationalEvidence(snapshot={}) {
 const evidence={...(snapshot.operationalEvidence||{})};
 const records=snapshot.records||{};

 const mail=records['Email Activity'];
 if(Array.isArray(mail)){
  const captured=mail.filter(r=>r.messageId&&validDate(r.createdAt||r.updatedAt));
  const latestMail=captured.sort((a,b)=>Date.parse(b.createdAt||b.updatedAt)-Date.parse(a.createdAt||a.updatedAt))[0];
  if(latestMail)evidence['Outlook ingestion']={...evidence['Outlook ingestion'],lastBusinessSuccess:latestMail.createdAt||latestMail.updatedAt,reference:latestMail.messageId,source:'CRM Email Activity capture',limitation:'Captured ledger evidence only. Mailbox completeness, ingestion heartbeat and backlog remain unverified.'};
 }

 const activity=Array.isArray(records.Activity)?records.Activity:[];
 const inbound=latest(activity,r=>/inbound enquiry/i.test(r.action||'')||/^website enquiry\b/i.test(r.summary||''));
 if(inbound){
  const receipt=(String(inbound.summary||'').match(/TSS-\d{4}-\d+/)||[])[0]||inbound.id||null;
  evidence['Website enquiries']={...evidence['Website enquiries'],lastBusinessSuccess:dateOf(inbound),reference:receipt,source:'CRM Activity inbound-enquiry receipt',limitation:'A persisted inbound enquiry is proven. Absence of newer enquiries is not a service failure and no traffic SLA is inferred.'};
  evidence['CRM transfers']={...evidence['CRM transfers'],lastBusinessSuccess:dateOf(inbound),reference:inbound.recordId||receipt,source:'CRM Activity linked-record receipt',limitation:'At least one enquiry-to-CRM write is evidenced. Backlog and every website submission are not proven by this projection.'};
 }

 const automation=Array.isArray(records['Automation Log'])?records['Automation Log']:[];
 const control=controls(records['System Control']);

 const backup=latest(automation,r=>/^crm backup$/i.test(r.component||'')&&/^success$/i.test(r.status||''));
 if(backup && String(control.backupEnabled?.value||'ON').toUpperCase()!=='OFF')evidence.Backups={...evidence.Backups,lastBusinessSuccess:dateOf(backup),reference:backup.runReference||backup.details||null,source:'Automation Log CRM Backup receipt',maxAgeMs:36*60*60*1000,limitation:'Backup creation is evidenced. Restore-test recency is a separate control.'};

 const openIssues=automation.filter(r=>!/^yes$/i.test(r.resolved||'')&&/(warning|error|critical|fail)/i.test([r.status,r.severity].join(' ')));
 const latestAutomation=latest(automation,r=>!/(draft|planned)/i.test(r.status||''));
 if(openIssues.length)evidence.Jobs={...evidence.Jobs,backlog:openIssues.length,lastBusinessSuccess:latestAutomation?dateOf(latestAutomation):null,source:'Automation Log unresolved issues',reason:'Unresolved automation or health items require review'};
 else if(latestAutomation)evidence.Jobs={...evidence.Jobs,lastBusinessSuccess:dateOf(latestAutomation),source:'Automation Log latest execution evidence',limitation:'Latest logged execution is evidence only for logged jobs; unlogged schedulers are not covered.'};

 const prod=control.commandCenterProductionStatus,deploy=control.commandCenterDeploymentId;
 if(prod?.value==='LIVE'&&deploy?.value)evidence.Deployment={...evidence.Deployment,lastBusinessSuccess:deploy.updatedAt||prod.updatedAt,reference:deploy.value,source:'System Control production record',limitation:'CRM control record only. Live Vercel provider state must still be checked independently when release health matters.'};

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
