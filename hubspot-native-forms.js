/*
 * TSS native HubSpot Forms adapter.
 * The original enquiry form remains usable if HubSpot fails to load or render.
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
      contact: 'd571803e-7777-4f28-94ea-b24df852245c'
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

    const slots = Array.from(document.querySelectorAll('[data-tss-hubspot-form]'));
    if (!slots.length) return;
    const prepared = [];
    for (const slot of slots) {
      const route = slot.getAttribute('data-tss-hubspot-form');
      const formId = config.forms[route];
      const legacy = document.querySelector('form[data-tss-form="' + route + '"]');
      if (!legacy || !validId.test(formId || '')) continue;
      const frame = document.createElement('div');
      frame.className = 'hs-form-frame';
      frame.setAttribute('data-region', config.region);
      frame.setAttribute('data-portal-id', config.portalId);
      frame.setAttribute('data-form-id', formId);
      slot.appendChild(frame);
      prepared.push({ slot, legacy, frame });
    }
    if (!prepared.length) return;

    const observer = new MutationObserver(() => {
      for (const pair of prepared) {
        if (pair.slot.dataset.tssHubspotMounted === 'true') continue;
        // Never hide the existing form until the native iframe exists.
        const iframe = pair.frame.querySelector('iframe');
        if (!iframe) continue;
        pair.slot.hidden = false;
        pair.legacy.hidden = true;
        pair.slot.dataset.tssHubspotMounted = 'true';
      }
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
        pair.slot.hidden = true;
        pair.legacy.hidden = false;
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