// Owner-only browser viewer. All private data and short-lived OAuth credentials
// remain in this tab's memory. No automatic messages, CRM writes, or local storage.
const allowedEmail = 'thesmartysolution@gmail.com';
const googleClientId = window.TSS_IDC_CONFIG?.googleClientId || '103840050410-dlhipb15600ot54jk7m6qj0olrbms7i4.apps.googleusercontent.com';
const byId = id => document.getElementById(id);
const ui = Object.fromEntries([
  'notice','identity','lockButton','loginButton','loginCard','inboxShell','refreshButton','notifyButton',
  'eventList','detail','detailTitle','replyPanel','replyDraft','copyDraft','draftStatus',
  'kindFilter','searchInput','nextButton','count'
].map(id => [id, byId(id)]));
let accessToken = '';
let entries = [];
let nextPageToken = '';
let selectedKey = '';
let pendingDrafts = new Map();
let seenKeys = new Set();
let hasLoaded = false;
let loading = false;
let monitor = null;
let alertsEnabled = false;
let idleTimer = null;
const IDLE_LOCK_MS = 15 * 60 * 1000;
function renewIdleLock() {
  if (idleTimer) clearTimeout(idleTimer);
  if (accessToken) idleTimer = setTimeout(() => lock('Session locked after 15 minutes of inactivity.'), IDLE_LOCK_MS);
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
  if (monitor) clearInterval(monitor);
  if (idleTimer) clearTimeout(idleTimer);
  monitor = null; idleTimer = null;
  accessToken = ''; entries = []; nextPageToken = ''; selectedKey = '';
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
  if (!accessToken || loading) return;
  loading = true; ui.refreshButton.disabled = true; ui.nextButton.disabled = true;
  if (!quiet) notice('Reading the protected WhatsApp inbox…');
  try {
    const params = new URLSearchParams();
    if (append && nextPageToken) params.set('pageToken', nextPageToken);
    if (new URLSearchParams(location.search).get('diagnostic') === '1') params.set('diagnostic', '1');
    const path = '/api/tss-whatsapp-inbox' + (params.toString() ? '?' + params.toString() : '');
    const response = await fetch(path, {
      method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error',
      headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
      signal: AbortSignal.timeout(18000)
    });
    const data = await response.json().catch(() => ({ ok: false, error: 'invalid_server_response' }));
    if (response.status === 401 && data.error === 'google_identity_invalid') {
      const reason = data.reason ? ' (' + data.reason.replace(/_/g, ' ') + ')' : '';
      lock('Google identity validation failed' + reason + '.'); return;
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
    if (hasLoaded && !append) {
      const unseen = data.records.filter(record => !seenKeys.has(record.key));
      if (unseen.length && alertsEnabled && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('TSS WhatsApp Inbox', { body: 'New private event received. Open your unlocked inbox to review.' }); } catch {}
      }
    }
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
    if (!quiet) notice('Private inbox refreshed. No outbound messages can be sent from this page.', 'ok');
  } catch (err) {
    // Fail closed: never leave a stale private snapshot visible after a failed refresh.
    const reason = err?.message || 'Unable to read private messages.';
    lock(reason + ' Session locked; sign in again to refresh.');
    notice(reason + ' Session locked; sign in again to refresh.', 'error');
  } finally {
    loading = false; ui.refreshButton.disabled = !accessToken; ui.nextButton.disabled = !nextPageToken;
  }
}
let googleInitialized = false;
function signIn() {
  if (accessToken || googleInitialized) return;
  if (!googleClientId) {
    notice('The existing TSS Google OAuth client is unavailable. No Google credentials were requested.', 'error'); return;
  }
  const initialize = () => {
    if (googleInitialized || !window.google?.accounts?.id) return false;
    google.accounts.id.initialize({
      client_id: googleClientId,
      auto_select: false,
      callback: async response => {
        if (!response?.credential) { notice('Google identity verification was not completed.', 'error'); return; }
        accessToken = response.credential; // short-lived Google ID token, never Firestore OAuth scope
        renewIdleLock();
        await fetchEvents();
      }
    });
    ui.loginButton.replaceChildren();
    google.accounts.id.renderButton(ui.loginButton, {
      type: 'standard', theme: 'outline', size: 'large',
      text: 'signin_with', width: 240
    });
    googleInitialized = true;
    notice('Use the Google sign-in control above to continue.');
    return true;
  };
  if (initialize()) return;
  notice('Loading Google sign-in…');
  let attempts = 0;
  const wait = setInterval(() => {
    if (initialize() || ++attempts >= 100) {
      clearInterval(wait);
      if (attempts >= 100 && !window.google?.accounts?.id)
        notice('Google sign-in did not load. Refresh the page and try again.', 'error');
    }
  }, 100);
}
async function enableAlerts() {
  if (!accessToken) return;
  if (!('Notification' in window)) { notice('This browser does not support local notifications. Use Refresh to check new events.'); return; }
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') { notice('Browser notification permission was not granted. The inbox remains usable.'); return; }
  alertsEnabled = true;
  ui.notifyButton.textContent = 'Alerts on (while open)';
  if (!monitor) monitor = setInterval(() => { if (accessToken && !document.hidden) fetchEvents({ quiet: true }); }, 60000);
  notice('Private event alerts enabled only while this page is open and unlocked. No background service is running.', 'ok');
}
signIn();
byId('manualSignIn')?.addEventListener('click', signIn);

ui.lockButton.addEventListener('click', () => lock());
ui.refreshButton.addEventListener('click', () => fetchEvents());
ui.notifyButton.addEventListener('click', enableAlerts);
ui.kindFilter.addEventListener('change', renderList);
ui.searchInput.addEventListener('input', renderList);
ui.nextButton.addEventListener('click', () => fetchEvents({ append: true }));
ui.replyDraft.addEventListener('input', () => {
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
lock('Private WhatsApp inbox preview. Connect the TSS owner account to continue.');

// Any owner interaction extends the short active-session window. Do not persist it.
for (const eventName of ['pointerdown', 'keydown']) {
  document.addEventListener(eventName, renewIdleLock, { passive: true });
}

