import {planOwnerAlerts,createOwnerNotifier} from './tssWhatsappNotifications.mjs';
import {randomBytes} from 'node:crypto';
import {digest,seal,validSeal} from './tssWhatsappLedger.mjs';
// A platform job, not a browser timer. Runtime wiring stays disabled until
// dedicated identities, mail authorization, start time and costs are approved.
export function createNotificationWorker({env,authenticateJob,loadInventory,ledger,transport,now=Date.now,audit=()=>{}}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  const reply=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
  try{
   if(req.method!=='POST')return reply(405,{ok:false,error:'method_not_allowed'});
   if(env.TSS_WHATSAPP_NOTIFICATION_WORKER!=='approved'||env.TSS_WHATSAPP_OWNER_EMAIL_NOTIFICATIONS!=='approved')return reply(423,{ok:false,error:'notification_worker_disabled'});
   try{await authenticateJob(req);}catch{return reply(401,{ok:false,error:'job_identity_required'});}
   const start=Date.parse(env.TSS_WHATSAPP_NOTIFICATION_START_AT||'');
   if(!Number.isFinite(start)||start>now())throw Error('start_policy_required');
   const inventory=await loadInventory();if(inventory.truncated)throw Error('notification_inventory_incomplete');
   for(const record of inventory.operations)if(!validSeal(record))throw Error('audit_integrity_failed');
   const syntheticActions=new Set(inventory.operations.filter(x=>x.kind==='audit_acceptance_run'&&x.synthetic===true).map(x=>x.syntheticActionId));
   const liveOperations=inventory.operations.filter(x=>!syntheticActions.has(x.actionId));
   const reviewedKeys=liveOperations.filter(x=>x.kind==='inbox_review').map(x=>x.eventKey);
   const outcomes=liveOperations.filter(x=>x.kind==='provider_outcome');
   const outcomeIds=new Set(outcomes.map(x=>x.actionId));
   // A dispatch claim with no saved outcome is uncertain after the invocation
   // timeout, even when the process died before recording its transport result.
   outcomes.push(...liveOperations.filter(x=>x.kind==='dispatch_claim'&&!outcomeIds.has(x.actionId)&&now()-x.at>120000).map(x=>({actionId:x.actionId,state:'UNKNOWN_REVIEW_REQUIRED'})));
   const alerts=planOwnerAlerts({events:inventory.events.filter(x=>Date.parse(x.receivedAt)>=start),outcomes,reviewedKeys,health:inventory.health||{},now:now(),unreadMinutes:Number(env.TSS_WHATSAPP_UNREAD_MINUTES||15)});
   const notify=createOwnerNotifier({ledger,transport,now});
   const results=[];for(const alert of alerts)results.push(await notify(alert));
   const counts={submittedUnverified:results.filter(x=>x.state==='SUBMITTED_UNVERIFIED'&&x.attempted).length,
    failed:results.filter(x=>x.state==='FAILED').length,uncertain:results.filter(x=>x.state==='UNKNOWN_REVIEW_REQUIRED').length};
   const healthy=counts.failed===0&&counts.uncertain===0;
   const cycleId=digest(['notification-cycle',now(),randomBytes(16).toString('hex')])+'_cycle';
   const cycle=seal({kind:'notification_cycle',at:now(),healthy,...counts,deliveryVerified:false});
   if(!await ledger.create(cycleId,cycle)||(await ledger.get(cycleId))?.recordHash!==cycle.recordHash)throw Error('cycle_readback_failed');
   audit({component:'whatsapp_notifications',event:'cycle_complete',...counts});
   return reply(healthy?200:503,{ok:healthy,...counts,cycleId,deliveryVerified:false});
  }catch{
   // If Firestore is down, its outbox cannot record the failure. A separate
   // platform uptime/failure monitor is mandatory before production activation.
   audit({component:'whatsapp_notifications',event:'cycle_failed'});
   return reply(503,{ok:false,error:'notification_cycle_unavailable',independentMonitorRequired:true});
  }
 };
}
