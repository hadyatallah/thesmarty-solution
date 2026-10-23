import {getVercelOidcToken} from '@vercel/oidc';
import {ExternalAccountClient} from 'google-auth-library';
const MAIL='tss-whatsapp-owner-mail@tss-crm-508908.iam.gserviceaccount.com';
const AUDIENCE='api://AzureADTokenExchange';
const TENANT='0d3c6e54-c584-44a3-bb2d-4533b5393fc6';
const CLIENT='1b834ef7-b258-41fb-8ca9-ea9f093b4264';
// This exchange has no application secret, service-account key or token storage.
// IAM trust and mailbox-scoped Exchange authorization are separate prerequisites.
export async function federatedMailToken(env,{fetcher=fetch,subjectToken=getVercelOidcToken,exchange}={}){
 const environmentApproved=env.VERCEL_ENV==='preview'||(env.VERCEL_ENV==='production'&&env.TSS_WHATSAPP_PRODUCTION_MAIL_RELEASE==='approved');
 if(!environmentApproved||env.TSS_WHATSAPP_OWNER_EMAIL_NOTIFICATIONS!=='approved'||
    env.TSS_WHATSAPP_MAIL_SCOPE_VERIFIED!=='approved'||!/^[a-f0-9]{64}$/.test(env.TSS_WHATSAPP_MAIL_SCOPE_EVIDENCE_SHA256||'')||
    env.TSS_WHATSAPP_MAIL_AUTH!=='google-federated'||env.TSS_WHATSAPP_MAIL_SERVICE_ACCOUNT_EMAIL!==MAIL||
    env.TSS_WHATSAPP_MAIL_TENANT_ID!==TENANT||env.TSS_WHATSAPP_MAIL_CLIENT_ID!==CLIENT||
    !/^\d{15,25}$/.test(env.TSS_WHATSAPP_MAIL_GOOGLE_SUBJECT||''))throw Error('mail_federation_not_configured');
 try{
  const subject=await subjectToken();
  const client=exchange?null:ExternalAccountClient.fromJSON({type:'external_account',
   audience:'//iam.googleapis.com/projects/103840050410/locations/global/workloadIdentityPools/vercel-research-center/providers/vercel',
   subject_token_type:'urn:ietf:params:oauth:token-type:jwt',token_url:'https://sts.googleapis.com/v1/token',
   subject_token_supplier:{getSubjectToken:async()=>subject},scopes:['https://www.googleapis.com/auth/cloud-platform']});
  // Use the federated principal directly, not service-account self-impersonation.
  const access=exchange?await exchange(subject):await client.getAccessToken();
  if(typeof access?.token!=='string')throw Error();
  const idResponse=await fetcher('https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+MAIL+':generateIdToken',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:'Bearer '+access.token,'content-type':'application/json'},
   body:JSON.stringify({audience:AUDIENCE,includeEmail:true})});
  if(!idResponse.ok)throw Error();const id=await idResponse.json();if(typeof id.token!=='string')throw Error();
  // This is a sanity check on a token received directly over TLS from Google.
  // Microsoft verifies its signature, issuer, audience and federated subject.
  const claims=JSON.parse(Buffer.from(id.token.split('.')[1],'base64url').toString('utf8'));
  if(claims.iss!=='https://accounts.google.com'||claims.aud!==AUDIENCE||claims.sub!==env.TSS_WHATSAPP_MAIL_GOOGLE_SUBJECT||claims.email!==MAIL||claims.email_verified!==true)throw Error();
  const response=await fetcher('https://login.microsoftonline.com/'+env.TSS_WHATSAPP_MAIL_TENANT_ID+'/oauth2/v2.0/token',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({client_id:env.TSS_WHATSAPP_MAIL_CLIENT_ID,client_assertion:id.token,
    client_assertion_type:'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'})});
  if(!response.ok)throw Error();const result=await response.json();if(typeof result.access_token!=='string'||result.access_token.length<20)throw Error();return result.access_token;
 }catch{throw Error('mail_federation_unavailable');}
}
