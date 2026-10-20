import { createWebhookHandler } from '../lib/tssWhatsappWebhook.mjs';
import { googleDependencies } from '../lib/tssWhatsappGoogle.mjs';

// Required for raw-byte HMAC validation in the existing Vercel Node architecture.
export const config = { api: { bodyParser: false } };
export default createWebhookHandler({
  enabled: process.env.TSS_WHATSAPP_WEBHOOK_ENABLED === 'true',
  loadDependencies: googleDependencies(),
  audit: (code, counts = {}) => console.info(JSON.stringify({ component: 'whatsapp_webhook', code, ...counts }))
});
