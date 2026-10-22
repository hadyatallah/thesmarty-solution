import {OAuth2Client} from 'google-auth-library';
import {createNotificationWorker} from '../lib/tssWhatsappNotificationWorker.mjs';
import {outlookOwnerTransport} from '../lib/tssWhatsappNotifications.mjs';
import {operationsLedger,notificationInventory,outlookNotificationToken} from '../lib/tssWhatsappOperationsRuntime.mjs';
const env=process.env,verifier=new OAuth2Client();
export default createNotificationWorker({env,ledger:operationsLedger(env),
 async authenticateJob(req){
  const origin=env.VERCEL_ENV==='production'?'https://www.thesmartysolution.com':'https://whatsapp-preview.thesmartysolution.com';
  const authorization=req.headers?.authorization;if(typeof authorization!=='string'||!authorization.startsWith('Bearer '))throw Error('job_identity_required');
  const ticket=await verifier.verifyIdToken({idToken:authorization.slice(7),audience:origin+'/api/tss-whatsapp-notify'});
  const payload=ticket.getPayload();if(payload?.email!=='tss-whatsapp-notify-scheduler@tss-crm-508908.iam.gserviceaccount.com'||payload.email_verified!==true)throw Error('job_identity_denied');
 },loadInventory:()=>notificationInventory(env),transport:outlookOwnerTransport({env,getToken:()=>outlookNotificationToken(env)}),
 audit:event=>console.info(JSON.stringify(event))});
