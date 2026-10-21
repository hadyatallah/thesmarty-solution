import { createInboxHandler } from '../lib/tssWhatsappInbox.mjs';

// Deliberately separate from the live inbound webhook and its create-only
// service account. Never expand webhook IAM for this owner-delegated reader.
export default createInboxHandler({
  enabled: process.env.TSS_WHATSAPP_INBOX_ENABLED === 'true'
});
