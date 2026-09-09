// Lightweight client-side anti-spam controls for public enquiry forms.
// These controls reduce automated submissions without adding a third-party CAPTCHA.
(() => {
  const MIN_FILL_TIME_MS = 4500;
  const SUBMIT_COOLDOWN_MS = 60000;
  const STORAGE_KEY = 'tss_last_enquiry_submit';

  const randomInt = (min, max) => {
    if (window.crypto && window.crypto.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return min + (values[0] % (max - min + 1));
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  const setStatus = (form, message) => {
    let status = form.querySelector('[data-tss-antispam-status]');
    if (!status) {
      status = document.createElement('p');
      status.className = 'small';
      status.setAttribute('data-tss-antispam-status', '');
      status.setAttribute('role', 'alert');
      const button = form.querySelector('button[type="submit"]');
      if (button) button.insertAdjacentElement('beforebegin', status);
      else form.appendChild(status);
    }
    status.textContent = message || '';
  };

  document.querySelectorAll('form[data-tss-form]').forEach((form) => {
    const startedAt = Date.now();
    const a = randomInt(2, 9);
    const b = randomInt(2, 9);
    const expected = a + b;

    const wrap = document.createElement('div');
    wrap.setAttribute('data-tss-human-check', '');
    wrap.style.margin = '18px 0';
    wrap.innerHTML = `
      <div style="padding:14px 16px;border:1px solid #d7e1e5;border-radius:12px;background:#f7faf9">
        <label style="display:flex;gap:10px;align-items:flex-start;font-weight:400;margin-bottom:12px">
          <input type="checkbox" name="human_confirmed" value="Yes" required style="width:auto;margin-top:4px">
          <span>I confirm I am a real person and this is a genuine enquiry.</span>
        </label>
        <label for="tss-human-${form.dataset.tssForm}" style="display:block;font-weight:600;margin-bottom:6px">Human check: what is ${a} + ${b}?</label>
        <input id="tss-human-${form.dataset.tssForm}" name="human_answer" type="text" inputmode="numeric" autocomplete="off" required maxlength="2" pattern="[0-9]{1,2}" style="max-width:120px" aria-describedby="tss-human-help-${form.dataset.tssForm}">
        <div id="tss-human-help-${form.dataset.tssForm}" class="small" style="margin-top:6px">This helps us block automated spam.</div>
      </div>`;

    const button = form.querySelector('button[type="submit"]');
    if (button) button.insertAdjacentElement('beforebegin', wrap);
    else form.appendChild(wrap);

    const startedInput = document.createElement('input');
    startedInput.type = 'hidden';
    startedInput.name = 'form_started_at';
    startedInput.value = String(startedAt);
    form.appendChild(startedInput);

    const elapsedInput = document.createElement('input');
    elapsedInput.type = 'hidden';
    elapsedInput.name = 'form_elapsed_ms';
    form.appendChild(elapsedInput);

    const nonceInput = document.createElement('input');
    nonceInput.type = 'hidden';
    nonceInput.name = 'form_nonce';
    nonceInput.value = `${Date.now().toString(36)}-${randomInt(100000, 999999)}`;
    form.appendChild(nonceInput);

    form.addEventListener('submit', (event) => {
      setStatus(form, '');

      const honeypot = form.querySelector('input[name="website"]');
      if (honeypot && String(honeypot.value || '').trim()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(form, 'We could not verify this submission. Please refresh the page and try again.');
        return;
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_FILL_TIME_MS) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(form, 'Please take a moment to review the form, then submit again.');
        return;
      }

      const answer = form.querySelector('input[name="human_answer"]');
      if (!answer || Number(answer.value) !== expected) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (answer) {
          answer.setCustomValidity('Please enter the correct answer.');
          answer.reportValidity();
          answer.addEventListener('input', () => answer.setCustomValidity(''), { once: true });
        }
        setStatus(form, 'Please complete the human verification correctly.');
        return;
      }

      const humanCheck = form.querySelector('input[name="human_confirmed"]');
      if (!humanCheck || !humanCheck.checked) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(form, 'Please confirm that this is a genuine enquiry.');
        return;
      }

      const message = String((form.querySelector('[name="message"]') || {}).value || '').trim();
      const urlCount = (message.match(/https?:\/\/|www\./gi) || []).length;
      if (urlCount > 3) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(form, 'Please remove unnecessary links and submit the enquiry again.');
        return;
      }

      try {
        const lastSubmit = Number(localStorage.getItem(STORAGE_KEY) || 0);
        if (lastSubmit && Date.now() - lastSubmit < SUBMIT_COOLDOWN_MS) {
          event.preventDefault();
          event.stopImmediatePropagation();
          setStatus(form, 'An enquiry was just submitted from this browser. Please wait a minute before sending another.');
          return;
        }
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch (_) {
        // Continue if localStorage is unavailable.
      }

      elapsedInput.value = String(elapsed);
    }, true);
  });
})();
