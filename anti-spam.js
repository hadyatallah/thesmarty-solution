// Low-friction client-side checks for public enquiry forms.
// Matching checks are enforced again by the Google Apps Script backend.
(() => {
  const MIN_FILL_TIME_MS = 3500;
  const MAX_FILL_TIME_MS = 6 * 60 * 60 * 1000;
  const SUBMIT_COOLDOWN_MS = 60000;
  const STORAGE_KEY = 'tss_last_enquiry_submit';
  const preparedForms = new WeakMap();

  const randomInt = (min, max) => {
    if (window.crypto && window.crypto.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return min + (values[0] % (max - min + 1));
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  const createNonce = () => {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${randomInt(100000, 999999)}-${randomInt(100000, 999999)}`;
  };

  const ensureHiddenInput = (form, name) => {
    let input = form.querySelector(`input[name="${name}"]`);
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      form.appendChild(input);
    }
    return input;
  };

  const getStatus = (form) => {
    let status = form.querySelector('[data-tss-form-status]');
    if (!status) {
      status = document.createElement('p');
      status.className = 'form-status small';
      status.setAttribute('data-tss-form-status', '');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      const button = form.querySelector('button[type="submit"]');
      if (button) button.insertAdjacentElement('afterend', status);
      else form.appendChild(status);
    }
    return status;
  };

  const setStatus = (form, message) => {
    const status = getStatus(form);
    status.dataset.state = message ? 'error' : '';
    status.textContent = message || '';
  };

  const readLastSubmit = () => {
    try {
      return Number(window.localStorage.getItem(STORAGE_KEY) || 0);
    } catch (_) {
      return 0;
    }
  };

  const markSubmitted = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch (_) {
      // Continue when storage is unavailable.
    }
  };

  const resetProof = (form) => {
    const state = preparedForms.get(form);
    if (!state) return;
    state.startedAt = Date.now();
    state.startedInput.value = String(state.startedAt);
    state.elapsedInput.value = '';
    state.nonceInput.value = createNonce();
  };

  const prepare = (form) => {
    if (!form || preparedForms.has(form)) return;

    const state = {
      startedAt: Date.now(),
      startedInput: ensureHiddenInput(form, 'form_started_at'),
      elapsedInput: ensureHiddenInput(form, 'form_elapsed_ms'),
      nonceInput: ensureHiddenInput(form, 'form_nonce')
    };
    preparedForms.set(form, state);
    resetProof(form);

    form.addEventListener('submit', (event) => {
      setStatus(form, '');

      const honeypot = form.querySelector('input[name="website"]');
      if (honeypot && String(honeypot.value || '').trim()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(form, 'We could not verify this submission. Please refresh the page and try again.');
        return;
      }

      const elapsed = Date.now() - state.startedAt;
      if (elapsed < MIN_FILL_TIME_MS) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(form, 'Please take a moment to review the form, then submit again.');
        return;
      }

      if (elapsed > MAX_FILL_TIME_MS) {
        event.preventDefault();
        event.stopImmediatePropagation();
        resetProof(form);
        setStatus(form, 'This form has been open for a while. Please review it once more, then submit again.');
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

      const lastSubmit = readLastSubmit();
      if (lastSubmit && Date.now() - lastSubmit < SUBMIT_COOLDOWN_MS) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(form, 'An enquiry was just submitted from this browser. Please wait one minute before sending another.');
        return;
      }

      state.elapsedInput.value = String(elapsed);
    }, true);

    form.addEventListener('tss:submission-confirmed', () => {
      markSubmitted();
      resetProof(form);
    });

    form.addEventListener('tss:submission-processing', () => {
      markSubmitted();
      resetProof(form);
    });
  };

  window.TSSAntiSpam = {
    markSubmitted,
    prepare,
    resetProof
  };

  document.querySelectorAll('form[data-tss-form]').forEach(prepare);
})();
