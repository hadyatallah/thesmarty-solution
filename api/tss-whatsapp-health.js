import {createSessionService} from '../lib/tssAdminSession.mjs';
import {createHealthHandler} from '../lib/tssWhatsappOperations.mjs';
const sessions=createSessionService();
export default createHealthHandler({authenticate:sessions.authenticate});
