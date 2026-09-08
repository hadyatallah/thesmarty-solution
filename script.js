const TSS_FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxwAe2Jdq390XmsRmSpFb6DWTxM19VVMjf7bSLg9QNUxiBMufOifmjR8appeD354CKy/exec';

const menuButton = document.querySelector('.menu');
const menu = document.querySelector('.navlinks');

if (menuButton && menu) {
  menuButton.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
  });

  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      menu.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
    }
  });
}

document.querySelectorAll('[data-year]').forEach((element) => {
  element.textContent = new Date().getFullYear();
});

// Social links in the footer across all site pages.
(() => {
  const footer = document.querySelector('.footer');
  if (!footer || footer.querySelector('.footer-socials')) return;

  const contactColumn = Array.from(footer.querySelectorAll('.footergrid > div')).find((column) => {
    const heading = column.querySelector('h3');
    return heading && heading.textContent.trim().toLowerCase() === 'contact';
  });
  const list = contactColumn && contactColumn.querySelector('ul');
  if (!list) return;

  const style = document.createElement('style');
  style.textContent = `
    .footer-socials{display:flex;align-items:center;gap:9px;margin-top:14px!important}
    .footer-socials a{display:inline-grid;place-items:center;width:38px;height:38px;border:1px solid rgba(255,255,255,.18);border-radius:50%;color:#dbe7ee!important;background:rgba(255,255,255,.04);transition:.2s}
    .footer-socials a:hover{color:#fff!important;border-color:rgba(92,230,223,.72);background:rgba(18,199,192,.13);transform:translateY(-2px)}
    .footer-socials svg{width:18px;height:18px;display:block}
  `;
  document.head.appendChild(style);

  const item = document.createElement('li');
  item.className = 'footer-socials';
  item.innerHTML = `
    <a href="https://www.instagram.com/thesmartysolution/" target="_blank" rel="noopener noreferrer" aria-label="The Smarty Solution on Instagram" title="Instagram">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
    </a>
    <a href="https://www.facebook.com/share/1U5CfVZhT1/" target="_blank" rel="noopener noreferrer" aria-label="The Smarty Solution on Facebook" title="Facebook">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.8 22v-8h2.7l.4-3.1h-3.1V8.9c0-.9.3-1.5 1.6-1.5H17V4.6c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.3H8.2V14h2.6v8h3z"/></svg>
    </a>`;
  list.appendChild(item);
})();

function tssFormParams_(data) {
  const params = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (typeof value === 'string') params.append(key, value);
  }
  return params;
}

async function submitTssEnquiry_(data) {
  const response = await fetch(TSS_FORM_ENDPOINT, {
    method: 'POST',
    mode: 'no-cors',
    body: tssFormParams_(data)
  });
  return response;
}

// Website enquiry forms
(() => {
  document.querySelectorAll('form[data-tss-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      const button = form.querySelector('button[type="submit"]');
      const originalLabel = button ? button.textContent : '';
      let status = form.querySelector('[data-tss-form-status]');
      if (!status) {
        status = document.createElement('p');
        status.className = 'small';
        status.setAttribute('data-tss-form-status', '');
        status.setAttribute('role', 'status');
        if (button) button.insertAdjacentElement('afterend', status);
        else form.appendChild(status);
      }

      const data = new FormData(form);
      data.set('source', window.location.href);

      if (form.dataset.tssForm === 'kiti') {
        const originalMessage = String(data.get('message') || '').trim();
        const detailedMessage = [
          `Role: ${data.get('profile') || '-'}`,
          `Structure to assess: ${data.get('structure') || '-'}`,
          `Development / investment background: ${data.get('experience') || '-'}`,
          `Indicative timing: ${data.get('timing') || '-'}`,
          `Indicative project / investment capacity: ${data.get('capital') || '-'}`,
          `Privacy consent: ${data.get('privacy_consent') || '-'}`,
          '',
          'What they would like to evaluate:',
          originalMessage
        ].join('\n');
        data.set('message', detailedMessage);
        data.set('interest', 'Kiti property opportunity');
      }

      if (button) {
        button.disabled = true;
        button.textContent = 'Sending...';
      }
      status.textContent = '';

      try {
        await submitTssEnquiry_(data);
        form.reset();
        status.textContent = 'Thank you. Your enquiry has been received. A confirmation email has been sent to the address you provided.';
        if (button) button.textContent = 'Sent';
      } catch (error) {
        status.textContent = 'Your enquiry could not be sent. Please try again or contact us by WhatsApp.';
        if (button) button.textContent = originalLabel || 'Try again';
      } finally {
        if (button) {
          setTimeout(() => {
            button.disabled = false;
            button.textContent = originalLabel;
          }, 2500);
        }
      }
    });
  });
})();

// TSS Business Assistant
(() => {
  const endpoint = window.TSS_AGENT_ENDPOINT || 'https://thesmarty-solution-agent.vercel.app/api/tss-agent';

  const style = document.createElement('style');
  style.textContent = `
    .tss-agent-launch{position:fixed;right:22px;bottom:94px;z-index:46;display:flex;align-items:center;gap:10px;min-height:52px;padding:0 18px;border:0;border-radius:999px;background:#07182b;color:#fff;font:800 .88rem Inter,system-ui,sans-serif;box-shadow:0 12px 34px rgba(3,17,31,.28);cursor:pointer;transition:.2s}
    .tss-agent-launch:hover{transform:translateY(-2px);background:#0d2942}.tss-agent-launch span:first-child{display:grid;place-items:center;width:27px;height:27px;border-radius:50%;background:#12c7c0;color:#07182b;font-size:.78rem}
    .tss-agent{position:fixed;right:22px;bottom:158px;z-index:60;width:min(410px,calc(100vw - 28px));height:min(650px,calc(100svh - 190px));display:none;grid-template-rows:auto 1fr auto;overflow:hidden;border:1px solid #dce5e8;border-radius:24px;background:#fff;box-shadow:0 28px 90px rgba(3,17,31,.28);font-family:Inter,system-ui,sans-serif}
    .tss-agent.open{display:grid}.tss-agent-head{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:18px 19px;background:#07182b;color:#fff}.tss-agent-id{display:flex;align-items:center;gap:11px}.tss-agent-mark{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:#12c7c0;color:#07182b;font-weight:900}.tss-agent-head strong{display:block;line-height:1.2}.tss-agent-head small{display:block;margin-top:3px;color:#a9bdc8}.tss-agent-close{border:0;background:transparent;color:#fff;font-size:1.6rem;line-height:1;cursor:pointer}
    .tss-agent-body{overflow:auto;padding:18px;background:#f7f8f7}.tss-msg{max-width:88%;margin:0 0 12px;padding:11px 13px;border-radius:16px;white-space:pre-wrap;font-size:.9rem;line-height:1.5}.tss-msg.agent{border:1px solid #dce5e8;border-bottom-left-radius:5px;background:#fff;color:#21384b}.tss-msg.user{margin-left:auto;border-bottom-right-radius:5px;background:#0d2942;color:#fff}.tss-msg.status{background:transparent;color:#667988;font-size:.8rem;padding-left:3px}
    .tss-quick{display:flex;flex-wrap:wrap;gap:7px;margin:3px 0 14px}.tss-quick button{padding:8px 10px;border:1px solid #cbd8de;border-radius:999px;background:#fff;color:#21384b;font:700 .76rem Inter,system-ui,sans-serif;cursor:pointer}.tss-quick button:hover{border-color:#0a8f91;background:#e8faf8}
    .tss-lead-link{display:inline-flex;margin:4px 0 14px;padding:9px 12px;border:0;border-radius:999px;background:#e8faf8;color:#075e61;font:800 .78rem Inter,system-ui,sans-serif;cursor:pointer}
    .tss-lead{display:none;margin:4px 0 14px;padding:14px;border:1px solid #dce5e8;border-radius:16px;background:#fff}.tss-lead.open{display:grid;gap:9px}.tss-lead strong{font-size:.9rem;color:#07182b}.tss-lead input{width:100%;padding:10px 11px;border:1px solid #cbd8de;border-radius:9px;font:inherit}.tss-lead .two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tss-lead button{min-height:40px;border:0;border-radius:999px;background:#07182b;color:#fff;font-weight:800;cursor:pointer}.tss-lead small{color:#667988;line-height:1.4}
    .tss-agent-foot{padding:12px;border-top:1px solid #dce5e8;background:#fff}.tss-agent-form{display:grid;grid-template-columns:1fr auto;gap:8px}.tss-agent-input{min-width:0;padding:12px 13px;border:1px solid #cbd8de;border-radius:13px;font:inherit}.tss-agent-input:focus{outline:3px solid rgba(18,199,192,.15);border-color:#0a8f91}.tss-agent-send{width:46px;border:0;border-radius:13px;background:#12c7c0;color:#07182b;font-size:1.1rem;font-weight:900;cursor:pointer}.tss-agent-note{margin:7px 2px 0;color:#7a8b96;font-size:.67rem;line-height:1.35}
    @media(max-width:620px){.tss-agent-launch{right:15px;bottom:82px}.tss-agent{right:14px;bottom:145px;height:min(620px,calc(100svh - 165px))}.tss-agent-launch .label{display:none}}
  `;
  document.head.appendChild(style);

  const launch = document.createElement('button');
  launch.className = 'tss-agent-launch';
  launch.type = 'button';
  launch.setAttribute('aria-label', 'Open The Smarty Solution business assistant');
  launch.innerHTML = '<span>TSS</span><span class="label">Ask TSS</span>';

  const panel = document.createElement('section');
  panel.className = 'tss-agent';
  panel.setAttribute('aria-label', 'The Smarty Solution business assistant');
  panel.innerHTML = `
    <div class="tss-agent-head">
      <div class="tss-agent-id"><div class="tss-agent-mark">TSS</div><div><strong>TSS Business Assistant</strong><small>Cyprus · Opportunities · Business Development</small></div></div>
      <button class="tss-agent-close" type="button" aria-label="Close assistant">×</button>
    </div>
    <div class="tss-agent-body" aria-live="polite"></div>
    <div class="tss-agent-foot">
      <form class="tss-agent-form"><input class="tss-agent-input" maxlength="1200" autocomplete="off" placeholder="Ask about Cyprus, opportunities or TSS" aria-label="Message"><button class="tss-agent-send" type="submit" aria-label="Send">→</button></form>
      <div class="tss-agent-note">General information only. Legal, tax, planning, valuation and investment matters should be independently verified with the appropriate professional.</div>
    </div>`;

  document.body.append(launch, panel);

  const body = panel.querySelector('.tss-agent-body');
  const form = panel.querySelector('.tss-agent-form');
  const input = panel.querySelector('.tss-agent-input');
  const close = panel.querySelector('.tss-agent-close');
  const messages = [];
  let started = false;
  let leadBox;

  const addMessage = (role, text, className = '') => {
    const item = document.createElement('div');
    item.className = `tss-msg ${className || role}`;
    item.textContent = text;
    body.appendChild(item);
    body.scrollTop = body.scrollHeight;
    return item;
  };

  const addLeadCapture = () => {
    if (leadBox) return;
    const trigger = document.createElement('button');
    trigger.className = 'tss-lead-link';
    trigger.type = 'button';
    trigger.textContent = 'Share my details with TSS';
    body.appendChild(trigger);

    leadBox = document.createElement('form');
    leadBox.className = 'tss-lead';
    leadBox.innerHTML = `
      <strong>Send this conversation to TSS</strong>
      <div class="two"><input name="name" required placeholder="Full name"><input name="company" placeholder="Company"></div>
      <div class="two"><input name="email" type="email" required placeholder="Business email"><input name="phone" placeholder="Phone"></div>
      <button type="submit">Send for review</button>
      <small>Your details and this chat summary will be sent to The Smarty Solution for follow-up. Do not submit confidential documents or banking information here.</small>`;
    body.appendChild(leadBox);

    trigger.addEventListener('click', () => {
      leadBox.classList.toggle('open');
      body.scrollTop = body.scrollHeight;
    });

    leadBox.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = leadBox.querySelector('button');
      button.disabled = true;
      button.textContent = 'Sending...';
      const data = new FormData(leadBox);
      data.append('interest', 'AI assistant website enquiry');
      data.append('message', 'Qualified lead submitted through the TSS Business Assistant.');
      data.append('source', window.location.href);
      data.append('conversation', messages.map((m) => `${m.role}: ${m.content}`).join('\n\n'));
      try {
        await submitTssEnquiry_(data);
        leadBox.innerHTML = '<strong>Sent to TSS for review.</strong><small>A confirmation email has been sent to you. A member of the team can follow up using the details you provided.</small>';
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Try again';
        addMessage('status', 'Your details could not be sent. Please use the website contact form or WhatsApp instead.', 'status');
      }
      body.scrollTop = body.scrollHeight;
    });
  };

  const quickPrompts = () => {
    const wrap = document.createElement('div');
    wrap.className = 'tss-quick';
    [
      'Investing in Cyprus',
      'Cyprus real estate',
      'Explore opportunities',
      'Grow my business',
      'Submit an opportunity'
    ].forEach((text) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.addEventListener('click', () => {
        wrap.remove();
        send(text);
      });
      wrap.appendChild(button);
    });
    body.appendChild(wrap);
  };

  const openAgent = () => {
    panel.classList.add('open');
    launch.setAttribute('aria-expanded', 'true');
    if (!started) {
      started = true;
      addMessage('assistant', 'I can help you explore Cyprus investment and real estate, understand TSS services, review current opportunities, or discuss an opportunity you would like TSS to evaluate.');
      quickPrompts();
    }
    setTimeout(() => input.focus(), 50);
  };

  launch.addEventListener('click', () => panel.classList.contains('open') ? panel.classList.remove('open') : openAgent());
  close.addEventListener('click', () => panel.classList.remove('open'));

  async function send(text) {
    const value = String(text || '').trim();
    if (!value) return;
    addMessage('user', value);
    messages.push({ role: 'user', content: value });
    input.value = '';
    input.disabled = true;
    const status = addMessage('status', 'Reviewing your question...', 'status');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, page: window.location.href })
      });
      const data = await response.json();
      if (!response.ok || !data.reply) throw new Error(data.error || 'Agent unavailable');
      status.remove();
      addMessage('assistant', data.reply);
      messages.push({ role: 'assistant', content: data.reply });
      if (messages.filter((m) => m.role === 'user').length >= 2) addLeadCapture();
    } catch (error) {
      status.textContent = 'The assistant is temporarily unavailable. You can still use the enquiry form or WhatsApp.';
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    send(input.value);
  });
})();