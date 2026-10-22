import {createSessionService} from '../lib/tssAdminSession.mjs';
import {createOperationsHandler} from '../lib/tssWhatsappOperations.mjs';
import {keylessToken} from '../lib/tssWhatsappGoogle.mjs';
import {parseFirestoreDocument} from '../lib/tssWhatsappInbox.mjs';
import {createApprovedSender,metaTestTransport} from '../lib/tssWhatsappSender.mjs';
import {operationsLedger,metaSenderSecret} from '../lib/tssWhatsappOperationsRuntime.mjs';
import {createAuditAcceptance} from '../lib/tssWhatsappAuditAcceptance.mjs';
const sessions=createSessionService();
async function loadEvent(key){
  if(!/^[a-f0-9]{64}$/.test(key||''))throw Error('event_key_invalid');
  if(process.env.TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL!=='tss-whatsapp-inbox-reader@tss-crm-508908.iam.gserviceaccount.com')throw Error('reader_not_configured');
  const token=await keylessToken(process.env,'TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL');
  const url='https://firestore.googleapis.com/v1/projects/tss-crm-508908/databases/(default)/documents/tss_whatsapp_inbox/'+key;
  const r=await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('event_unavailable');
  const document=await r.json(),record=parseFirestoreDocument(document);
  if(!record)throw Error('event_invalid');
  // Missing hold metadata is unknown, so policy previews preserve it.
  return {...record,legalHold:document.fields?.legalHold?.booleanValue!==false};
}
const env=process.env;
const sender=createApprovedSender({env,ledger:operationsLedger(env),loadEvent,
 transport:metaTestTransport({env,getToken:()=>metaSenderSecret(env)})});
export default createOperationsHandler({env,authenticate:sessions.authenticate,loadEvent,
 approvedSender:sender,auditAcceptance:createAuditAcceptance({env,ledger:operationsLedger(env)}),audit:event=>console.info(JSON.stringify(event))});
