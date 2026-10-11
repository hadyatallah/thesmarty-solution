/*
 * TSS native HubSpot Forms adapter.
 * Public enquiries are handled by HubSpot's native embed only.
 *
 * Form IDs and embedScriptUrl are copied from HubSpot's UPDATED form editor.
 * Do not use legacy-editor embed APIs for a form built in HubSpot's updated editor.
 */
(function () {
  'use strict';

  const config = Object.freeze({
    enabled: true,
    portalId: '149509919',
    region: 'eu1',
    embedScriptUrl: 'https://js-eu1.hsforms.net/forms/embed/149509919.js',
    forms: Object.freeze({
      contact: 'd6b2a98a-ef6b-4a18-9c99-cf39ea2925e5'
    })
  });
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isApprovedScript(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' &&
        ['js.hsforms.net', 'js-eu1.hsforms.net'].includes(parsed.hostname) &&
        parsed.pathname === '/forms/embed/' + config.portalId + '.js' &&
        !parsed.search && !parsed.hash && !parsed.username && !parsed.password;
    } catch (_) {
      return false;
    }
  }
  function mount() {
    if (!config.enabled) return;
    if (!isApprovedScript(config.embedScriptUrl)) return;

    const slots = Array.from(document.querySelectorAll('.tss-hubspot-form[data-hs-form-id]'));
    if (!slots.length) return;
    const prepared = [];
    for (const slot of slots) {
      const formId = slot.getAttribute('data-hs-form-id') || config.forms.contact;
      if (!validId.test(formId || '')) continue;
      const frame = document.createElement('div');
      frame.className = 'hs-form-frame';
      frame.setAttribute('data-region', config.region);
      frame.setAttribute('data-portal-id', config.portalId);
      frame.setAttribute('data-form-id', formId);
      slot.appendChild(frame);
      prepared.push({ slot, frame, formId });
    }
    if (!prepared.length) return;

    function revealWhenVerified(pair) {
      if (pair.slot.dataset.tssHubspotMounted === 'true') return;
      if (!pair.frame.querySelector('iframe')) return;
      pair.slot.dataset.tssHubspotMounted = 'true';
    }

    const observer = new MutationObserver(() => {
      for (const pair of prepared) revealWhenVerified(pair);
      if (prepared.every(pair => pair.slot.dataset.tssHubspotMounted === 'true')) {
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 20000);

    const script = document.createElement('script');
    script.src = config.embedScriptUrl;
    script.async = true;
    script.onerror = () => {
      observer.disconnect();
      for (const pair of prepared) {
        pair.slot.dataset.tssHubspotMounted = 'false';
      }
    };
    document.head.appendChild(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
