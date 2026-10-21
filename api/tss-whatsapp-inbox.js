import { createInboxHandler } from '../lib/tssWhatsappInbox.mjs';
import { createSessionService } from '../lib/tssAdminSession.mjs';
const sessions=createSessionService();
export default createInboxHandler({
 enabled:process.env.TSS_WHATSAPP_INBOX_ENABLED==='true' && process.env.TSS_ADMIN_SESSION_ENABLED==='true',
 authenticateSession:sessions.authenticate
});
