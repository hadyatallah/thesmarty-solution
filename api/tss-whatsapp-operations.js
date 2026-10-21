import {createSessionService} from '../lib/tssAdminSession.mjs';
import {createOperationsHandler} from '../lib/tssWhatsappOperations.mjs';
import {keylessToken} from '../lib/tssWhatsappGoogle.mjs';
import {parseFirestoreDocument} from '../lib/tssWhatsappInbox.mjs';
const sessions=createSessionService();
export default createOperationsHandler({authenticate:sessions.authenticate,
 async loadEvent(key){
  if(process.env.TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL!=='tss-whatsapp-inbox-reader@tss-crm-508908.iam.gserviceaccount.com')throw Error('reader_not_configured');
  const token=await keylessToken(process.env,'TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL');
  const url='https://firestore.googleapis.com/v1/projects/tss-crm-508908/databases/(default)/documents/tss_whatsapp_inbox/'+key;
  const r=await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('event_unavailable');
  return parseFirestoreDocument(await r.json());
 },audit:event=>console.info(JSON.stringify(event))});
