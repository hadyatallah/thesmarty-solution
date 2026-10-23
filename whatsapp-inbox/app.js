import {createOwnerAlerts} from './alerts.mjs';
// Owner-only browser viewer. All private data and short-lived OAuth credentials
// remain in this tab's memory. No automatic messages, CRM writes, or local storage.
const allowedEmail = 'thesmartysolution@gmail.com';
const byId = id => document.getElementById(id);
const ui = Object.fromEntries([
  'notice','identity','lockButton','loginButton','loginCard','inboxShell','refreshButton','notifyButton',
  'eventList','detail','detailTitle','replyPanel','replyDraft','copyDraft','draftStatus',
  'kindFilter','searchInput','nextButton','count','validateTestReply','policyPreview',
  'testApproval','auditAcceptance','markTestReviewed','approveExact','approveTestReply','sendApprovedTestReply'
].map(id => [id, byId(id)]));
let sessionActive = false;
let csrf = '';
let sessionExpiresAt = 0;
let generation = 0;
const sessionChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('tss-admin-session') : null;
if(sessionChannel) sessionChannel.onmessage=event=>{if(event.data==='logout')lock('Logged out from Admin.');};
let entries = [];
let nextPageToken = '';
let selectedKey = '';
let pendingDrafts = new Map();
let seenKeys = new Set();
let hasLoaded = false;
let loading = false;
let monitor = null;
let alertsEnabled = false;
let testApproval=null,testCapabilities={canApprove:false,canSendTest:false};
function clearTestApproval(){testApproval=null;ui.approveExact.checked=false;ui.approveTestReply.disabled=true;ui.sendApprovedTestReply.disabled=true;}
const ownerAlerts=createOwnerAlerts({notify:message=>{if(alertsEnabled&&sessionActive&&'Notification' in window&&Notification.permission==='granted'){try{new Notification(message.title,{body:message.body,tag:message.tag});}catch{}}}});
let idleTimer = null;
const IDLE_LOCK_MS = 15 * 60 * 1000;
function renewIdleLock() {
  if (idleTimer) clearTimeout(idleTimer);
  if (sessionActive) idleTimer = setTimeout(() => lock('Session locked after 15 minutes of inactivity.'), IDLE_LOCK_MS);
}

function notice(message, level = '') {
  ui.notice.textContent = message;
  ui.notice.className = 'notice' + (level ? ' ' + level : '');
}
function humanTime(value) {
  const d = new Date(value || '');
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : 'Time unavailable';
}
function element(tag, cls = '', content = '') {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.textContent = String(content ?? '');
  return node;
}
function lock(reason = 'Session locked. Connect the owner Google account to reopen the inbox.') {
  clearTestApproval();testCapabilities={canApprove:false,canSendTest:false};ui.testApproval.hidden=true;ui.auditAcceptance.hidden=true;
  if (monitor) clearInterval(monitor);
  if (idleTimer) clearTimeout(idleTimer);
  monitor = null; idleTimer = null;
  ownerAlerts.reset();
  generation++;
  sessionActive = false; entries = []; nextPageToken = ''; selectedKey = '';
  pendingDrafts.clear(); seenKeys.clear(); hasLoaded = false; alertsEnabled = false; loading = false;
  ui.loginCard.hidden = false; ui.inboxShell.hidden = true; ui.lockButton.hidden = true;
  ui.identity.textContent = 'Locked'; ui.eventList.replaceChildren(); ui.detail.replaceChildren();
  ui.replyDraft.value = ''; ui.draftStatus.textContent = ''; ui.notifyButton.textContent = 'Enable browser alerts';
  ui.refreshButton.disabled = true;
  notice(reason);
}
function updateToolbar() {
  ui.count.textContent = entries.length + ' events loaded · Review only';
  ui.nextButton.hidden = !nextPageToken;
}
function storeCurrentDraft() {
  if (selectedKey) pendingDrafts.set(selectedKey, ui.replyDraft.value);
}
function selectEvent(key) {
  clearTestApproval();
  storeCurrentDraft();
  selectedKey = key;
  const item = entries.find(x => x.key === key);
  if (!item) { ui.detailTitle.textContent = 'Select an event'; ui.detail.replaceChildren(); ui.replyPanel.hidden = true; return; }
  ui.detailTitle.textContent = item.kind === 'message' ? 'Incoming message' : item.kind === 'status' ? 'Delivery status' : 'Provider event';
  const rows = [
    ['Kind', item.kind], ['Received', humanTime(item.receivedAt)], ['Status', item.state || 'Not recorded'],
    ['Sender / recipient', item.sender || 'Not provided'], ['Type', item.type || 'Unknown'],
    ['Test WABA', item.wabaId], ['Phone number ID', item.phoneNumberId],
    ['Message ID', item.messageId || 'Not supplied']
  ];
  const parent = document.createDocumentFragment();
  for (const [k, v] of rows) {
    const row = element('div', 'row'), label = element('span', 'key', k), value = element('span', 'value', v);
    row.append(label, value); parent.append(row);
  }
  if (item.body || item.hasMedia) parent.append(element('div', 'event-body', item.body || '[Attachment event: media is not fetched automatically]'));
  ui.detail.replaceChildren(parent);
  ui.replyPanel.hidden = !item.canDraft;
  ui.replyDraft.value = item.canDraft ? pendingDrafts.get(item.key) || '' : '';
  ui.copyDraft.disabled = !ui.replyDraft.value.trim();
  ui.draftStatus.textContent = '';
  renderList();
}
function matches(item) {
  const kind = ui.kindFilter.value;
  if (kind !== 'all' && item.kind !== kind) return false;
  const query = ui.searchInput.value.trim().toLowerCase();
  if (!query) return true;
  return [item.sender, item.body, item.type, item.messageId].some(s => String(s || '').toLowerCase().includes(query));
}
function renderList() {
  const visible = entries.filter(matches);
  const list = document.createDocumentFragment();
  for (const item of visible) {
    const button = element('button', 'event' + (selectedKey === item.key ? ' active' : ''));
    button.type = 'button'; button.setAttribute('role','listitem');
    const top = element('div','event-top');
    top.append(element('span','sender', item.sender || 'System event'),element('span','date',humanTime(item.receivedAt)));
    const kind = element('span','tag ' + item.kind, item.kind.replace(/_/g,' '));
    const excerpt = element('div','summary',item.body || (item.hasMedia ? '[Attachment, not downloaded]' : item.type || 'No text content'));
    button.append(top,kind,excerpt);
    button.addEventListener('click',()=>selectEvent(item.key));
    list.append(button);
  }
  if (!visible.length) list.append(element('p','empty',entries.length ? 'No events match this filter.' : 'No inbox events found. The production number has not been migrated.'));
  ui.eventList.replaceChildren(list);
  updateToolbar();
}
async function fetchEvents({ append = false, quiet = false } = {}) {
  if (!sessionActive || loading) return;
  const requestGeneration = generation;
  loading = true; ui.refreshButton.disabled = true; ui.nextButton.disabled = true;
  if (!quiet) notice('Reading the protected WhatsApp inbox…');
  try {
    const params = new URLSearchParams();
    if (append && nextPageToken) params.set('pageToken', nextPageToken);
    if (new URLSearchParams(location.search).get('diagnostic') === '1') params.set('diagnostic', '1');
    const path = '/api/tss-whatsapp-inbox' + (params.toString() ? '?' + params.toString() : '');
    const response = await fetch(path, {
      method: 'GET', cache: 'no-store', credentials: 'same-origin', redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(18000)
    });
    const data = await response.json().catch(() => ({ ok: false, error: 'invalid_server_response' }));
    if (requestGeneration !== generation) return;
    if (Date.now() >= sessionExpiresAt) { lock('Admin session expired. Open Admin Login to continue.'); return; }
    if (response.status === 401) { lock('Admin sign-in required. Open Admin Login to continue.'); return; }
    if (response.status === 401 && data.error === 'google_identity_invalid') {
      const reason = data.reason ? ' (' + data.reason.replace(/_/g, ' ') + ')' : '';
      lock('Google identity validation failed' + reason + '.'); return;
    }
    // A 401 without an application error code may be emitted by Vercel's
    // deployment protection before the request reaches this API handler.
    // Do not misclassify it as a Google or Firestore rejection.
    if (response.status === 401 && !data.error) {
      notice('Owner diagnostic: HTTP_401_UNATTRIBUTED. Check preview deployment protection and API response content type.', 'error');
      return;
    }
    if (response.status === 401) {
      const allowed = new Set(['google_sign_in_required', 'google_identity_invalid', 'google_session_expired']);
      const category = allowed.has(data.error) ? data.error : 'unclassified_401';
      notice('Owner diagnostic: HTTP_401_' + category.toUpperCase() + '. Authentication was rejected before inbox readback.', 'error');
      return;
    }
    if (data.diagnostic === true) {
      const categories = new Set(['FIRESTORE_200', 'TOKEN_EXPIRED', 'MISSING_SCOPE', 'TOKEN_TYPE_INVALID', 'FIRESTORE_401', 'IAM_OR_FIRESTORE_DENIAL', 'FIRESTORE_UPSTREAM_FAILURE', 'OIDC_UNAVAILABLE', 'STS_OR_WIF_REJECTED', 'IMPERSONATION_DENIED', 'TOKEN_SHAPE_INVALID', 'READER_TOKEN_UNAVAILABLE']);
      const category = categories.has(data.category) ? data.category : 'DIAGNOSTIC_UNCLASSIFIED';
      notice('Owner diagnostic: ' + category + ' (HTTP ' + String(data.httpStatus || response.status) + ').', category === 'FIRESTORE_200' ? 'ok' : 'error');
      return;
    }
    if (data.error === 'reader_token_rejected') {
      const reasons = {
        access_token_expired: 'access token expired',
        access_token_type_unsupported: 'access token type unsupported',
        access_token_scope_insufficient: 'access token scope insufficient',
        auth_token_invalid: 'authentication token invalid',
        credentials_missing: 'credentials missing',
        account_state_invalid: 'account state invalid',
        service_disabled: 'service disabled', consumer_invalid: 'consumer invalid',
        google_unauthenticated: 'Google unauthenticated',
        unclassified_upstream_401: 'unclassified upstream 401'
      };
      const reason = reasons[data.reason] || 'unclassified upstream 401';
      throw Error('The dedicated Firestore reader token was rejected (' + reason + '). Owner identity was accepted.'); 
    }
    if (!response.ok || !data.ok || !Array.isArray(data.records)) {
      if (response.status === 403 && data.error === 'firestore_permission_or_scope_denied')
        throw Error('Firestore reader permissions are not yet configured. No broad browser permissions are required.');
      if (data.error === 'inbox_not_enabled') throw Error('Private inbox preview is not yet enabled for this deployment.');
      throw Error('Private inbox unavailable (' + response.status + '). No customer messages were exposed.');
    }
    ownerAlerts.observe(data.records,{append});
    for (const record of data.records) seenKeys.add(record.key);
    const combined = append ? [...entries, ...data.records] : data.records;
    entries = [...new Map(combined.filter(x => x && x.key).map(x => [x.key, x])).values()];
    entries.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
    nextPageToken = data.nextPageToken || '';
    hasLoaded = true;
    renewIdleLock();
    ui.loginCard.hidden = true; ui.inboxShell.hidden = false; ui.lockButton.hidden = false;
    ui.identity.textContent = allowedEmail;
    if (selectedKey && !entries.some(x => x.key === selectedKey)) selectedKey = '';
    if (!selectedKey && entries.length) selectEvent(entries[0].key);
    else if (selectedKey) selectEvent(selectedKey);
    else renderList();
    if (!quiet) notice('Private inbox refreshed. Production sending is disabled.', 'ok');
  } catch (err) {
    // Fail closed: never leave a stale private snapshot visible after a failed refresh.
    const reason = err?.message || 'Unable to read private messages.';
    ownerAlerts.failure();
    lock(reason + ' Session locked; sign in again to refresh.');
    notice(reason + ' Session locked; sign in again to refresh.', 'error');
  } finally {
    loading = false; ui.refreshButton.disabled = !sessionActive; ui.nextButton.disabled = !nextPageToken;
  }
}
async function openAdminSession() {
  try {
    const response=await fetch('/api/tss-admin-session',{credentials:'same-origin',cache:'no-store',redirect:'error'});
    const data=await response.json();
    if(!response.ok||!data.ok)throw Error('Admin sign-in required. Open Admin Login to continue.');
    csrf=data.csrf;sessionExpiresAt=data.expiresAt;sessionActive=true;
    renewIdleLock();await fetchEvents();
    try{testCapabilities=await operationalRequest({action:'capabilities'});ui.testApproval.hidden=!testCapabilities.canApprove;ui.auditAcceptance.hidden=!testCapabilities.canAudit;}catch{ui.testApproval.hidden=true;ui.auditAcceptance.hidden=true;}
  }catch(e){lock(e.message);}
}
async function logout() {
  try {
    const response=await fetch('/api/tss-admin-session',{method:'DELETE',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'X-TSS-CSRF':csrf}});
    if(!response.ok)throw Error('Logout could not be confirmed. Retry.');
    sessionChannel?.postMessage('logout');
    lock('Logged out.');
  }catch(e){notice(e.message,'error');}
}
async function checkIngestionHealth(){
 if(!alertsEnabled||!sessionActive)return;
 try{
  const r=await fetch('/api/tss-whatsapp-health',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok)ownerAlerts.failure();
 }catch{ownerAlerts.failure();}
}
async function enableAlerts() {
  if (!sessionActive) return;
  if (!('Notification' in window)) { notice('This browser does not support local notifications. Use Refresh to check new events.'); return; }
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') { notice('Browser notification permission was not granted. The inbox remains usable.'); return; }
  alertsEnabled = true;
  checkIngestionHealth();
  ui.notifyButton.textContent = 'Alerts on (while open)';
  if (!monitor) monitor = setInterval(() => { if (sessionActive && !document.hidden) { fetchEvents({ quiet: true }); checkIngestionHealth(); } }, 60000);
  notice('Private event alerts enabled only while this page is open and unlocked. No background service is running.', 'ok');
}


ui.lockButton.textContent='Log out';
ui.lockButton.addEventListener('click', logout);
ui.refreshButton.addEventListener('click', () => fetchEvents());
ui.notifyButton.addEventListener('click', enableAlerts);
ui.kindFilter.addEventListener('change', renderList);
ui.searchInput.addEventListener('input', renderList);
ui.nextButton.addEventListener('click', () => fetchEvents({ append: true }));
ui.replyDraft.addEventListener('input', () => {
  clearTestApproval();
  ui.copyDraft.disabled = !ui.replyDraft.value.trim();
  ui.draftStatus.textContent = '';
  if (selectedKey) pendingDrafts.set(selectedKey, ui.replyDraft.value);
});
ui.copyDraft.addEventListener('click', async () => {
  if (!selectedKey || !ui.replyDraft.value.trim()) return;
  try {
    await navigator.clipboard.writeText(ui.replyDraft.value.trim());
    ui.draftStatus.textContent = 'Draft copied. No WhatsApp message was sent.';
  } catch {
    ui.draftStatus.textContent = 'Clipboard unavailable. Select and copy the draft manually.';
  }
});
lock('Checking your Admin session…');
openAdminSession();
setInterval(()=>{if(sessionActive && Date.now()>=sessionExpiresAt)lock('Admin session expired. Open Admin Login to continue.');},1000);

// Any owner interaction extends the short active-session window. Do not persist it.
for (const eventName of ['pointerdown', 'keydown']) {
  document.addEventListener(eventName, renewIdleLock, { passive: true });
}



ui.validateTestReply.addEventListener('click',async()=>{
 if(!sessionActive||!selectedKey||!ui.replyDraft.value.trim())return;
 ui.validateTestReply.disabled=true;
 try{
  const r=await fetch('/api/tss-whatsapp-operations',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-TSS-CSRF':csrf},body:JSON.stringify({action:'prepare-test-reply',eventKey:selectedKey,text:ui.replyDraft.value})});
  const data=await r.json();
  if(!sessionActive)return;
  ui.draftStatus.textContent=r.ok&&data.sent===false?'Test draft validated. Nothing sent.':data.error==='reply_workflow_disabled'?'Test workflow is disabled. Nothing sent.':'Test draft rejected. Nothing sent.';
 }catch{ui.draftStatus.textContent='Test validation unavailable. Nothing sent.';}
 finally{ui.validateTestReply.disabled=false;}
});
async function operationalRequest(body){
 const r=await fetch('/api/tss-whatsapp-operations',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-TSS-CSRF':csrf},body:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw Error('operation_unavailable');return data;
}
ui.policyPreview.addEventListener('click',async()=>{
 if(!sessionActive||!selectedKey)return;
 try{const p=await operationalRequest({action:'policy-preview',eventKey:selectedKey,retentionDays:90});
  if(sessionActive)ui.draftStatus.textContent='Review preview: '+p.candidates.length+' candidate(s) for the selected event. Legal holds or unknown hold status: '+p.inventory.legalHoldOrUnknown+'. Nothing deleted.';
 }catch{if(sessionActive)ui.draftStatus.textContent='Retention preview unavailable. Nothing deleted.';}
});
ui.approveExact.addEventListener('change',()=>{ui.approveTestReply.disabled=!testCapabilities.canApprove||!ui.approveExact.checked||!ui.replyDraft.value.trim();});
ui.approveTestReply.addEventListener('click',async()=>{
 if(!sessionActive||!ui.approveExact.checked||!testCapabilities.canApprove)return;
 const key=selectedKey,text=ui.replyDraft.value;ui.approveTestReply.disabled=true;
 try{const a=await operationalRequest({action:'approve-test-reply',eventKey:key,text,explicitApproval:true});
  if(!sessionActive||key!==selectedKey||text!==ui.replyDraft.value)return;
  testApproval={...a,key,text};ui.sendApprovedTestReply.disabled=!testCapabilities.canSendTest;
  ui.draftStatus.textContent='Exact test reply approval recorded. Nothing sent.';
 }catch{if(sessionActive)ui.draftStatus.textContent='Approval was not confirmed. Nothing sent.';}
});
ui.sendApprovedTestReply.addEventListener('click',async()=>{
 if(!sessionActive||!testApproval||!testCapabilities.canSendTest)return;
 const approval=testApproval;clearTestApproval();
 try{const r=await operationalRequest({action:'send-approved-test-reply',eventKey:approval.key,text:approval.text,approvalId:approval.approvalId,approvalToken:approval.approvalToken});
  if(sessionActive)ui.draftStatus.textContent=r.state==='SUBMITTED'?'Provider accepted the test reply. Delivery is not confirmed.':'Test reply outcome: '+r.state+'. Review before any further action.';
 }catch{if(sessionActive)ui.draftStatus.textContent='Test reply outcome is uncertain. Do not resend. Review the audit first.';}
});

ui.markTestReviewed.addEventListener('click',async()=>{
 if(!sessionActive||!selectedKey||!testCapabilities.canApprove)return;
 try{await operationalRequest({action:'mark-test-reviewed',eventKey:selectedKey});
  if(sessionActive)ui.draftStatus.textContent='Test message review recorded. No reply sent.';
 }catch{if(sessionActive)ui.draftStatus.textContent='Review acknowledgement unavailable. Nothing sent.';}
});

ui.auditAcceptance.addEventListener('click',async()=>{
 if(!sessionActive||!testCapabilities.canAudit)return;
 ui.auditAcceptance.disabled=true;const runId=crypto.randomUUID().replaceAll('-','');
 try{const result=await operationalRequest({action:'audit-acceptance',runId});
  if(sessionActive)ui.draftStatus.textContent='Audit acceptance saved: '+result.runId+'. No WhatsApp or email transmitted. Independent Cloud Shell readback pending.';
 }catch{if(sessionActive)ui.draftStatus.textContent='Audit acceptance not confirmed. No messages transmitted. Run reference: '+runId;}
 finally{ui.auditAcceptance.disabled=false;}
});

// Owner-session request uses the same CSRF path as other operations. Never sends mail.
const mailAuthButton=document.createElement('button');
mailAuthButton.type='button';mailAuthButton.textContent='Check mail authentication';
mailAuthButton.addEventListener('click',async()=>{
 if(!sessionActive)return;
 mailAuthButton.disabled=true;
 try{await operationalRequest({action:'mail-auth-check'});if(sessionActive)ui.draftStatus.textContent='Mail token exchange passed. No email sent.';}
 catch{if(sessionActive)ui.draftStatus.textContent='Mail authentication check failed. No email sent.';}
 finally{mailAuthButton.disabled=false;}
});
ui.auditAcceptance.after(mailAuthButton);
