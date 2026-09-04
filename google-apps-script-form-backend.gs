// The Smarty Solution website enquiry backend
// Deploy this file as a Google Apps Script Web App.
// Execute as: Me
// Who has access: Anyone

const TSS_ENQUIRY_SHEET_ID = '1Hq-pYK4XSKyIcKsKg6IjOQKI-CvKaYrRmmtY80Zojao';
const TSS_ENQUIRY_SHEET_NAME = 'Sheet1';
const TSS_NOTIFICATION_EMAIL = 'info@thesmartysolution.com';

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};

    // Honeypot. Real visitors leave this empty.
    if (p.website) {
      return jsonResponse_({ ok: true });
    }

    const name = clean_(p.name, 160);
    const email = clean_(p.email, 254);
    const phone = clean_(p.phone, 80);
    const company = clean_(p.company, 200);
    const enquiryType = clean_(p.interest || p.enquiry_type || p.type, 200);
    const message = clean_(p.message, 6000);
    const sourcePage = clean_(p.source || p.source_page, 1000);
    const conversation = clean_(p.conversation, 15000);

    if (!name || !email || (!message && !conversation)) {
      return jsonResponse_({ ok: false, error: 'Missing required fields' });
    }

    if (!isValidEmail_(email)) {
      return jsonResponse_({ ok: false, error: 'Invalid email address' });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const ss = SpreadsheetApp.openById(TSS_ENQUIRY_SHEET_ID);
      const sheet = ss.getSheetByName(TSS_ENQUIRY_SHEET_NAME);
      if (!sheet) throw new Error('Enquiry sheet not found');

      sheet.appendRow([
        new Date(),
        name,
        email,
        phone,
        company,
        enquiryType,
        message,
        sourcePage,
        conversation,
        'New'
      ]);
    } finally {
      lock.releaseLock();
    }

    sendNotification_({
      name,
      email,
      phone,
      company,
      enquiryType,
      message,
      sourcePage,
      conversation
    });

    return jsonResponse_({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonResponse_({ ok: false, error: 'Submission could not be recorded' });
  }
}

function sendNotification_(lead) {
  const subject = lead.enquiryType
    ? `New TSS website enquiry: ${lead.enquiryType}`
    : 'New enquiry - The Smarty Solution';

  const lines = [
    'A new enquiry was submitted through thesmartysolution.com.',
    '',
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone || '-'}`,
    `Company: ${lead.company || '-'}`,
    `Enquiry type: ${lead.enquiryType || '-'}`,
    `Source: ${lead.sourcePage || '-'}`,
    '',
    'Message:',
    lead.message || '-',
  ];

  if (lead.conversation) {
    lines.push('', 'AI assistant conversation:', lead.conversation);
  }

  MailApp.sendEmail({
    to: TSS_NOTIFICATION_EMAIL,
    replyTo: lead.email,
    subject,
    body: lines.join('\n')
  });
}

function clean_(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
