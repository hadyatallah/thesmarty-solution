// The Smarty Solution website enquiry backend
// Google Apps Script Web App
// Execute as: Me
// Access: Anyone

const TSS_ENQUIRY_SHEET_ID = '1Hq-pYK4XSKyIcKsKg6IjOQKI-CvKaYrRmmtY80Zojao';
const TSS_ENQUIRY_SHEET_NAME = 'Sheet1';
const TSS_TIMEZONE = 'Asia/Nicosia';
const TSS_MIN_FORM_TIME_MS = 3500;
const TSS_MAX_FORM_TIME_MS = 6 * 60 * 60 * 1000;
const TSS_RATE_LIMIT_SECONDS = 60;
const TSS_DUPLICATE_WINDOW_MS = 30 * 60 * 1000;
const TSS_GLOBAL_LIMIT_PER_MINUTE = 25;

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};

    // Honeypot field. Real visitors leave this empty.
    if (clean_(p.website, 200)) {
      return jsonResponse_({
        ok: false,
        blocked: true,
        code: 'SPAM_REJECTED',
        error: 'Submission rejected'
      });
    }

    const proof = validateFormProof_(p);
    if (!proof.ok) {
      return jsonResponse_({
        ok: false,
        blocked: true,
        code: proof.code,
        error: proof.error
      });
    }

    const lead = {
      name: clean_(p.name, 160),
      email: clean_(p.email, 254).toLowerCase(),
      phone: clean_(p.phone, 80),
      company: clean_(p.company, 200),
      enquiryType: clean_(p.interest || p.enquiry_type || p.type, 200),
      message: clean_(p.message, 6000),
      sourcePage: clean_(p.source || p.source_page, 1000),
      conversation: clean_(p.conversation, 15000)
    };

    if (!lead.name || !lead.email || (!lead.message && !lead.conversation)) {
      return jsonResponse_({
        ok: false,
        code: 'INVALID_REQUEST',
        error: 'Missing required fields'
      });
    }

    if (!isValidEmail_(lead.email)) {
      return jsonResponse_({
        ok: false,
        code: 'INVALID_EMAIL',
        error: 'Invalid email address'
      });
    }

    if (countUrls_(lead.message) > 3) {
      return jsonResponse_({
        ok: false,
        blocked: true,
        code: 'SPAM_REJECTED',
        error: 'Too many links'
      });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);

    let enquiryId;
    let priority;
    let followUpDue;
    let rowNumber;
    let sheet;
    let cache = null;

    try {
      const ss = SpreadsheetApp.openById(TSS_ENQUIRY_SHEET_ID);
      sheet = ss.getSheetByName(TSS_ENQUIRY_SHEET_NAME);
      if (!sheet) throw new Error('Enquiry sheet not found');

      if (isRecentDuplicate_(sheet, lead.email, lead.message, lead.conversation)) {
        return jsonResponse_({
          ok: false,
          blocked: true,
          code: 'DUPLICATE',
          error: 'Matching enquiry received recently'
        });
      }

      try {
        cache = CacheService.getScriptCache();
      } catch (cacheError) {
        console.warn('Script cache unavailable: ' + cacheError);
      }

      if (cache) {
        const nonceKey = 'nonce:' + cacheKey_(proof.nonce);
        if (cache.get(nonceKey)) {
          return jsonResponse_({
            ok: false,
            blocked: true,
            code: 'DUPLICATE',
            error: 'Submission token already used'
          });
        }

        const rateKey = 'email:' + cacheKey_(lead.email);
        if (cache.get(rateKey)) {
          return jsonResponse_({
            ok: false,
            blocked: true,
            code: 'RATE_LIMITED',
            error: 'Please wait before submitting again'
          });
        }

        const burstKey = 'burst:' + Math.floor(Date.now() / 60000);
        const burstCount = Number(cache.get(burstKey) || 0);
        if (burstCount >= TSS_GLOBAL_LIMIT_PER_MINUTE) {
          return jsonResponse_({
            ok: false,
            blocked: true,
            code: 'SERVICE_BUSY',
            error: 'Submission service is busy'
          });
        }
        cache.put(burstKey, String(burstCount + 1), 120);
      }

      enquiryId = nextEnquiryId_(sheet);
      priority = isPriority_(lead) ? 'Priority' : 'Standard';
      followUpDue = addBusinessDays_(new Date(), priority === 'Priority' ? 1 : 2);

      rowNumber = sheet.getLastRow() + 1;
      const row = [
        enquiryId,
        new Date(),
        lead.name,
        lead.email,
        lead.phone,
        lead.company,
        lead.enquiryType,
        lead.message,
        lead.sourcePage,
        lead.conversation,
        priority,
        followUpDue,
        'New',
        'No'
      ].map(safeSheetValue_);

      sheet.getRange(rowNumber, 5).setNumberFormat('@');
      sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);

      if (cache) {
        try {
          cache.put('nonce:' + cacheKey_(proof.nonce), '1', 21600);
          cache.put('email:' + cacheKey_(lead.email), '1', TSS_RATE_LIMIT_SECONDS);
        } catch (cacheError) {
          console.warn('Could not update anti-spam cache: ' + cacheError);
        }
      }
    } finally {
      lock.releaseLock();
    }

    let internalNotificationSent = false;
    let confirmationSent = false;
    let token = null;

    try {
      token = getGraphAccessToken_();
    } catch (mailError) {
      console.error('Microsoft token error: ' + mailError);
    }

    if (token) {
      try {
        sendInternalNotification_(token, lead, enquiryId, priority, followUpDue);
        internalNotificationSent = true;
      } catch (mailError) {
        console.error('Internal notification error: ' + mailError);
      }

      try {
        sendAcknowledgement_(token, lead, enquiryId);
        confirmationSent = true;
      } catch (mailError) {
        console.error('Customer confirmation error: ' + mailError);
      }
    }

    return jsonResponse_({
      ok: true,
      recorded: true,
      enquiryId,
      priority,
      duplicate: false,
      internalNotificationSent,
      confirmationSent
    });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return jsonResponse_({
      ok: false,
      code: 'SERVER_ERROR',
      error: 'Submission could not be recorded'
    });
  }
}

function sendInternalNotification_(token, lead, enquiryId, priority, followUpDue) {
  const props = PropertiesService.getScriptProperties();
  const recipients = [
    props.getProperty('NOTIFY_EMAIL_1'),
    props.getProperty('NOTIFY_EMAIL_2'),
    props.getProperty('NOTIFY_EMAIL_3')
  ].filter(Boolean);

  const prefix = priority === 'Priority' ? 'PRIORITY - ' : '';
  const subject = `${prefix}${enquiryId} - ${lead.enquiryType || 'Website enquiry'} - ${lead.name}`;
  const dueText = Utilities.formatDate(followUpDue, TSS_TIMEZONE, 'dd MMM yyyy');

  const html = [
    '<p>A new enquiry was submitted through <strong>thesmartysolution.com</strong>.</p>',
    `<p><strong>Enquiry ID:</strong> ${escapeHtml_(enquiryId)}<br>`,
    `<strong>Priority:</strong> ${escapeHtml_(priority)}<br>`,
    `<strong>Follow-up due:</strong> ${escapeHtml_(dueText)}</p>`,
    '<hr>',
    `<p><strong>Name:</strong> ${escapeHtml_(lead.name)}<br>`,
    `<strong>Email:</strong> ${escapeHtml_(lead.email)}<br>`,
    `<strong>Phone:</strong> ${escapeHtml_(lead.phone || '-')}<br>`,
    `<strong>Company:</strong> ${escapeHtml_(lead.company || '-')}<br>`,
    `<strong>Enquiry type:</strong> ${escapeHtml_(lead.enquiryType || '-')}<br>`,
    `<strong>Source:</strong> ${escapeHtml_(lead.sourcePage || '-')}</p>`,
    `<p><strong>Message</strong><br>${nl2br_(lead.message || '-')}</p>`
  ];

  if (lead.conversation) {
    html.push(`<p><strong>AI assistant conversation</strong><br>${nl2br_(lead.conversation)}</p>`);
  }

  sendGraphMail_(token, {
    to: recipients,
    subject,
    html: html.join(''),
    replyTo: lead.email
  });
}

function sendAcknowledgement_(token, lead, enquiryId) {
  const firstName = escapeHtml_(firstName_(lead.name));
  const html = `
    <p>Hi ${firstName},</p>
    <p>Thank you for contacting The Smarty Solution.</p>
    <p>We've received your enquiry and the information you provided. Our team will review it and follow up with you directly.</p>
    <p>If you need to add anything in the meantime, simply reply to this email. For time-sensitive enquiries, you can also reach us by WhatsApp or phone at <strong>+357 99 810330</strong>.</p>
    <p>Reference: <strong>${escapeHtml_(enquiryId)}</strong></p>
    <p>Regards,<br>
    <strong>The Smarty Solution</strong><br>
    Connect · Develop · Invest</p>`;

  sendGraphMail_(token, {
    to: [lead.email],
    subject: 'Thank you for contacting The Smarty Solution',
    html,
    replyTo: getRequiredProperty_('MS_SENDER_EMAIL')
  });
}

function getGraphAccessToken_() {
  const tenantId = getRequiredProperty_('MS_TENANT_ID');
  const clientId = getRequiredProperty_('MS_CLIENT_ID');
  const clientSecret = getRequiredProperty_('MS_CLIENT_SECRET');

  const response = UrlFetchApp.fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: {
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials'
      },
      muteHttpExceptions: true
    }
  );

  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error(`Microsoft token request failed (${code}): ${body}`);
  }

  const data = JSON.parse(body);
  if (!data.access_token) throw new Error('Microsoft token response did not contain an access token');
  return data.access_token;
}

function sendGraphMail_(token, options) {
  const sender = getRequiredProperty_('MS_SENDER_EMAIL');
  const toRecipients = (options.to || []).map(email => ({ emailAddress: { address: email } }));
  if (!toRecipients.length) throw new Error('No email recipients configured');

  const message = {
    subject: options.subject,
    body: {
      contentType: 'HTML',
      content: options.html
    },
    toRecipients
  };

  if (options.replyTo) {
    message.replyTo = [{ emailAddress: { address: options.replyTo } }];
  }

  const response = UrlFetchApp.fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${token}` },
      payload: JSON.stringify({ message, saveToSentItems: true }),
      muteHttpExceptions: true
    }
  );

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(`Microsoft Graph sendMail failed (${code}): ${response.getContentText()}`);
  }
}

function isPriority_(lead) {
  const text = `${lead.enquiryType} ${lead.sourcePage}`.toLowerCase();
  return text.includes('kiti') || text.includes('investor');
}

function addBusinessDays_(startDate, businessDays) {
  const d = new Date(startDate);
  let added = 0;
  while (added < businessDays) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  d.setHours(17, 0, 0, 0);
  return d;
}

function nextEnquiryId_(sheet) {
  const year = Utilities.formatDate(new Date(), TSS_TIMEZONE, 'yyyy');
  const lastRow = sheet.getLastRow();
  let max = 0;

  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().flat();
    const prefix = `TSS-${year}-`;
    ids.forEach(id => {
      if (id && id.indexOf(prefix) === 0) {
        const n = parseInt(id.slice(prefix.length), 10);
        if (!isNaN(n) && n > max) max = n;
      }
    });
  }

  return `TSS-${year}-${String(max + 1).padStart(4, '0')}`;
}

function isRecentDuplicate_(sheet, email, message, conversation) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const startRow = Math.max(2, lastRow - 99);
  const rowCount = lastRow - startRow + 1;
  const values = sheet.getRange(startRow, 2, rowCount, 9).getValues();
  const now = Date.now();
  const content = normalizeContent_(`${message || ''}\n${conversation || ''}`);

  for (let i = values.length - 1; i >= 0; i--) {
    const timestamp = values[i][0];       // B
    const rowEmail = String(values[i][2] || '').toLowerCase(); // D
    const rowMessage = String(values[i][6] || '');             // H
    const rowConversation = String(values[i][8] || '');        // J

    if (!(timestamp instanceof Date)) continue;
    if (now - timestamp.getTime() > TSS_DUPLICATE_WINDOW_MS) break;

    const rowContent = normalizeContent_(`${rowMessage}\n${rowConversation}`);
    if (rowEmail === email && rowContent === content) return true;
  }

  return false;
}

function validateFormProof_(params) {
  const startedAt = Number(params.form_started_at);
  const elapsed = Number(params.form_elapsed_ms);
  const nonce = clean_(params.form_nonce, 120);

  if (!params.form_started_at || !params.form_elapsed_ms ||
      !Number.isFinite(startedAt) || !Number.isFinite(elapsed) ||
      startedAt <= 0 || !nonce) {
    return {
      ok: false,
      code: 'FORM_VERIFICATION_REQUIRED',
      error: 'Form verification is missing'
    };
  }

  if (!/^[a-z0-9-]{12,120}$/i.test(nonce)) {
    return {
      ok: false,
      code: 'FORM_VERIFICATION_REQUIRED',
      error: 'Form verification is invalid'
    };
  }

  if (elapsed < TSS_MIN_FORM_TIME_MS) {
    return {
      ok: false,
      code: 'TOO_FAST',
      error: 'Form completed too quickly'
    };
  }

  if (elapsed > TSS_MAX_FORM_TIME_MS) {
    return {
      ok: false,
      code: 'EXPIRED_FORM',
      error: 'Form session expired'
    };
  }

  return { ok: true, nonce };
}

function countUrls_(value) {
  const matches = String(value || '').match(/https?:\/\/|www\./gi);
  return matches ? matches.length : 0;
}

function cacheKey_(value) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).slice(0, 40);
}

function safeSheetValue_(value) {
  if (typeof value !== 'string') return value;
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function normalizeContent_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function getRequiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error(`Missing Script Property: ${name}`);
  return value;
}

function firstName_(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

function clean_(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br_(value) {
  return escapeHtml_(value).replace(/\n/g, '<br>');
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
