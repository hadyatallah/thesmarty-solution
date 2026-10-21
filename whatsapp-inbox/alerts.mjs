// Private contents, sender identifiers and server diagnostics never enter notifications.
export function createOwnerAlerts({notify,now=Date.now,cooldownMs=60000}={}){
 let baseline=false;const seen=new Set(),times=new Map();
 function emit(code){const at=now(),prior=times.get(code);if(prior!==undefined&&at-prior<cooldownMs)return;times.set(code,at);notify?.({title:'TSS WhatsApp Inbox',body:code==='new_message'?'New private message. Open your unlocked inbox.':code==='provider_failure'?'A provider event needs owner review.':'Inbox refresh failed. Open Admin to check access and system status.',tag:'tss-'+code});}
 return {
  observe(records,{append=false}={}){
   for(const r of records){if(baseline&&!append&&!seen.has(r.key)){if(r.kind==='message')emit('new_message');if(r.kind==='provider_error')emit('provider_failure');}seen.add(r.key);}
   baseline=true;
  },failure(){emit('system_failure');},reset(){baseline=false;seen.clear();times.clear();}
 };
}
