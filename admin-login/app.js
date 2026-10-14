// Private workspace chooser. Identity is verified by Google's userinfo API.
// This is not an email-code service. Each workspace retains its own OAuth gates.
(() => {
  'use strict';
  const config = window.TSS_IDC_CONFIG || {};
  const allowed = String(config.allowedEmail || '').trim().toLowerCase();
  const clientId = String(config.googleClientId || '');
  const verifyPanel = document.getElementById('verifyPanel');
  const workspacePanel = document.getElementById('workspacePanel');
  const verifyButton = document.getElementById('verifyButton');
  const lockButton = document.getElementById('lockButton');
  const identity = document.getElementById('verifiedIdentity');
  const noticeBox = document.getElementById('notice');
  let verified = false;
  let pending = false;

  function notice(text, error = false) {
    noticeBox.textContent = text;
    noticeBox.hidden = !text;
    noticeBox.classList.toggle('error', error);
  }

  function lock() {
    verified = false;
    pending = false;
    identity.textContent = 'Verified account';
    workspacePanel.hidden = true;
    verifyPanel.hidden = false;
    verifyButton.disabled = false;
    notice('');
  }

  async function onVerifiedToken(result) {
    try {
      if (!result || result.error || !result.access_token) {
        throw new Error('Google verification was not completed.');
      }
      const accessToken = result.access_token;
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + accessToken },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('Google could not verify your email. Retry.');
      const account = await response.json();
      if (account.email_verified !== true || String(account.email || '').toLowerCase() !== allowed) {
        throw new Error('This Google account is not authorized for TSS private workspaces.');
      }
      verified = true;
      workspacePanel.hidden = false;
      verifyPanel.hidden = true;
      identity.textContent = 'Verified: ' + account.email;
      notice('');
    } catch (error) {
      lock();
      notice(error.message || 'Verification failed.', true);
    } finally {
      pending = false;
      verifyButton.disabled = false;
    }
  }

  function verify() {
    if (pending || verified) return;
    if (!allowed || !/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
      notice('Google owner verification is not configured.', true);
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      notice('Google sign-in has not loaded. Check your connection and retry.', true);
      return;
    }
    pending = true;
    verifyButton.disabled = true;
    notice('');
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/userinfo.email',
        login_hint: allowed,
        callback: onVerifiedToken,
        error_callback: () => {
          lock();
          notice('Google sign-in was cancelled or blocked.', true);
        }
      });
      client.requestAccessToken({ prompt: '', login_hint: allowed });
    } catch (error) {
      lock();
      notice('Google sign-in could not start. Try again.', true);
    }
  }

  // Direct workspace URLs aren't access grants: apps separately check Google
  // identity and original spreadsheet permissions before exposing any data.
  for (const link of workspacePanel.querySelectorAll('a.option')) {
    link.addEventListener('click', (event) => {
      if (!verified) event.preventDefault();
    });
  }
  verifyButton.addEventListener('click', verify);
  lockButton.addEventListener('click', lock);
  lock();
})();
