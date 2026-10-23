import {digest,seal,validSeal} from './tssWhatsappLedger.mjs';
const ROOT='https://firestore.googleapis.com/v1/projects/tss-crm-508908/databases/(default)/documents';
const BUSINESS=new Set(['inbox_review','provider_outcome','dispatch_claim','audit_acceptance_run']);
const BASELINE=digest(['notification-inventory-legacy-baseline',1])+'_inventory_baseline';
// Query only business records and the newest cycle; historical heartbeat volume
// cannot exhaust the bounded business-event inventory. No index or data deletion.
export async function notificationOperationsInventory({ledger,getToken,fetcher=fetch}){
 const token=await getToken();
 const call=async(url,options={})=>{const r=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:'Bearer '+token,'content-type':'application/json'}});if(!r.ok)throw Error('notification_inventory_unavailable');return r.json();};
 const record=document=>{let value;try{value=JSON.parse(document.fields.record.stringValue);}catch{throw Error('audit_corrupt');}if(!validSeal(value))throw Error('audit_integrity_failed');return value;};
 let baseline=await ledger.get(BASELINE);
 if(!baseline){
  const legacy=[];let pageToken='';
  for(let page=0;page<5;page++){
   const url=new URL(ROOT+'/tss_whatsapp_operations');url.searchParams.set('pageSize','100');if(pageToken)url.searchParams.set('pageToken',pageToken);
   const data=await call(url);for(const document of data.documents||[]){const value=record(document);if(!document.fields.recordKind&&BUSINESS.has(value.kind))legacy.push(value);}
   pageToken=data.nextPageToken||'';if(!pageToken)break;
  }
  if(pageToken)throw Error('legacy_inventory_review_required');
  const row=seal({kind:'notification_inventory_baseline',records:legacy});await ledger.create(BASELINE,row);
  baseline=await ledger.get(BASELINE);if(!baseline||!validSeal(baseline)||baseline.kind!=='notification_inventory_baseline'||!Array.isArray(baseline.records))throw Error('audit_readback_failed');
 }
 if(!validSeal(baseline)||!Array.isArray(baseline.records)||baseline.records.some(x=>!validSeal(x)||!BUSINESS.has(x.kind)))throw Error('audit_integrity_failed');
 const query=async structuredQuery=>{
  const result=await call(ROOT+':runQuery',{method:'POST',body:JSON.stringify({structuredQuery:{from:[{collectionId:'tss_whatsapp_operations'}],...structuredQuery}})});
  if(!Array.isArray(result))throw Error('notification_inventory_unavailable');return result.filter(x=>x.document).map(x=>record(x.document));
 };
 const business=await query({where:{fieldFilter:{field:{fieldPath:'recordKind'},op:'IN',value:{arrayValue:{values:[...BUSINESS].map(stringValue=>({stringValue}))}}}},limit:501});
 if(business.some(x=>!BUSINESS.has(x.kind)))throw Error('audit_integrity_failed');
 const cycles=await query({orderBy:[{field:{fieldPath:'notificationCycleAt'},direction:'DESCENDING'}],limit:1});
 if(cycles.some(x=>x.kind!=='notification_cycle'))throw Error('audit_integrity_failed');
 return {operations:[...new Map([...baseline.records,...business,...cycles].map(x=>[x.recordHash,x])).values()],truncated:business.length>500};
}
