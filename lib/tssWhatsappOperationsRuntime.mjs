import {getVercelOidcToken} from '@vercel/oidc';
import {ExternalAccountClient} from 'google-auth-library';
import {firestoreLedger} from './tssWhatsappLedger.mjs';
import {keylessToken} from './tssWhatsappGoogle.mjs';
import {parseFirestoreDocument} from './tssWhatsappInbox.mjs';
// New identities/resources are deliberately not provisioned by this module.
export async function operationsToken(env,key) {
  const email=env[key];
  const identities={TSS_WHATSAPP_OPERATIONS_SERVICE_ACCOUNT_EMAIL:'tss-whatsapp-operations@tss-crm-508908.iam.gserviceaccount.com',
    TSS_WHATSAPP_SENDER_SECRET_SERVICE_ACCOUNT_EMAIL:'tss-whatsapp-sender-secrets@tss-crm-508908.iam.gserviceaccount.com'};
  if(!identities[key]||email!==identities[key])throw Error('operations_identity_not_configured');
  const subject=await getVercelOidcToken();
  const client=ExternalAccountClient.fromJSON({type:'external_account',
    audience:'//iam.googleapis.com/projects/103840050410/locations/global/workloadIdentityPools/vercel-research-center/providers/vercel',
    subject_token_type:'urn:ietf:params:oauth:token-type:jwt',token_url:'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url:'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+email+':generateAccessToken',
    subject_token_supplier:{getSubjectToken:async()=>subject},
    scopes:[key==='TSS_WHATSAPP_OPERATIONS_SERVICE_ACCOUNT_EMAIL'?'https://www.googleapis.com/auth/datastore':'https://www.googleapis.com/auth/cloud-platform']});
  try{const result=await client.getAccessToken();if(typeof result.token!=='string')throw Error();return result.token;}catch{throw Error('operations_identity_unavailable');}
}
export function operationsLedger(env){return firestoreLedger({getToken:()=>operationsToken(env,'TSS_WHATSAPP_OPERATIONS_SERVICE_ACCOUNT_EMAIL')});}
export async function metaSenderSecret(env,fetcher=fetch){
  // Only an explicitly reviewed version of a new sender secret may be used.
  if(!/^projects\/103840050410\/secrets\/tss-whatsapp-test-sender\/versions\/\d+$/.test(env.TSS_WHATSAPP_TEST_SENDER_SECRET_VERSION||''))throw Error('sender_secret_not_configured');
  const token=await operationsToken(env,'TSS_WHATSAPP_SENDER_SECRET_SERVICE_ACCOUNT_EMAIL');
  const r=await fetcher('https://secretmanager.googleapis.com/v1/'+env.TSS_WHATSAPP_TEST_SENDER_SECRET_VERSION+':access',{
    redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:'Bearer '+token}});
  if(!r.ok)throw Error('sender_secret_unavailable');
  let settings;try{settings=JSON.parse(Buffer.from((await r.json()).payload.data,'base64').toString('utf8'));}catch{throw Error('sender_secret_invalid');}
  if(settings.wabaId!=='2882413005471663'||settings.phoneNumberId!=='1378287792033123'||typeof settings.accessToken!=='string'||settings.accessToken.length<20)throw Error('sender_secret_invalid');
  return settings.accessToken;
}
export async function notificationInventory(env,fetcher=fetch){
  const events=[],operations=[];let truncated=false;
  for(const collection of ['tss_whatsapp_inbox','tss_whatsapp_operations']){
    const token=collection==='tss_whatsapp_inbox'?await keylessToken(env,'TSS_WHATSAPP_READER_SERVICE_ACCOUNT_EMAIL'):await operationsToken(env,'TSS_WHATSAPP_OPERATIONS_SERVICE_ACCOUNT_EMAIL');
    let pageToken='';
    for(let page=0;page<5;page++){
      const url=new URL('https://firestore.googleapis.com/v1/projects/tss-crm-508908/databases/(default)/documents/'+collection);
      url.searchParams.set('pageSize','100');if(pageToken)url.searchParams.set('pageToken',pageToken);
      const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:'Bearer '+token}});
      if(!r.ok)throw Error('notification_inventory_unavailable');
      const data=await r.json();
      for(const document of data.documents||[]){
        if(collection==='tss_whatsapp_inbox'){const e=parseFirestoreDocument(document);if(e)events.push(e);}
        else{try{operations.push(JSON.parse(document.fields.record.stringValue));}catch{throw Error('audit_corrupt');}}
      }
      pageToken=data.nextPageToken||'';if(!pageToken)break;if(page===4)truncated=true;
    }
  }
  let webhookFailure=true;
  try{const r=await fetcher('https://www.thesmartysolution.com/api/tss-whatsapp-webhook',{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});webhookFailure=!(r.status===400&&(await r.text())==='Invalid challenge');}catch{}
  return {events,operations,truncated,health:{webhook_failure:webhookFailure}};
}
export async function outlookNotificationToken(env,fetcher=fetch){
  if(env.TSS_WHATSAPP_OWNER_EMAIL_NOTIFICATIONS!=='approved'||!/^projects\/103840050410\/secrets\/tss-whatsapp-owner-mail\/versions\/\d+$/.test(env.TSS_WHATSAPP_OWNER_MAIL_SECRET_VERSION||''))throw Error('owner_mail_authorization_missing');
  const token=await operationsToken(env,'TSS_WHATSAPP_SENDER_SECRET_SERVICE_ACCOUNT_EMAIL');
  const r=await fetcher('https://secretmanager.googleapis.com/v1/'+env.TSS_WHATSAPP_OWNER_MAIL_SECRET_VERSION+':access',{redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:'Bearer '+token}});
  if(!r.ok)throw Error('owner_mail_authorization_unavailable');
  let settings;try{settings=JSON.parse(Buffer.from((await r.json()).payload.data,'base64').toString('utf8'));}catch{throw Error('owner_mail_authorization_invalid');}
  const guid=/^[a-fA-F0-9-]{36}$/;
  if(!guid.test(settings.tenantId||'')||!guid.test(settings.clientId||'')||typeof settings.clientSecret!=='string'||settings.clientSecret.length<16)throw Error('owner_mail_authorization_invalid');
  const response=await fetcher('https://login.microsoftonline.com/'+settings.tenantId+'/oauth2/v2.0/token',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:settings.clientId,client_secret:settings.clientSecret,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'})});
  if(!response.ok)throw Error('owner_mail_token_unavailable');
  const result=await response.json();if(typeof result.access_token!=='string'||result.access_token.length<20)throw Error('owner_mail_token_invalid');return result.access_token;
}
