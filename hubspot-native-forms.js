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
  const KITi_ROUTE_VALUE = 'Kiti Residential Development Opportunity';
  const KITi_ROUTE_FIELD = 'tss_enquiry_route';

  // A URL selection in the hidden legacy form does not reach a HubSpot iframe.
  // Kiti keeps its legacy form unless the native form exposes and confirms
  // the same route value through HubSpot's documented global Forms V4 API.
  function requiresKitiRoute() {
    try {
      return new URLSearchParams(window.location.search).get('enquiry') === 'kiti';
    } catch (_) {
      return false;
    }
  }
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
      prepared.push({ slot, legacy, frame, formId, routeVerified: !requiresKitiRoute() });
    }
    if (!prepared.length) return;

    function revealWhenVerified(pair) {
      if (pair.slot.dataset.tssHubspotMounted === 'true') return;
      if (!pair.routeVerified || !pair.frame.querySelector('iframe')) return;
      pair.slot.hidden = false;
      pair.legacy.hidden = true;
      pair.slot.dataset.tssHubspotMounted = 'true';
    }

    // Register BEFORE loading the HubSpot embed so the ready event is not lost.
    if (requiresKitiRoute()) {
      window.addEventListener('hs-form-event:on-ready', async (event) => {
        const formId = String(event?.detail?.formId || '').toLowerCase();
        const pair = prepared.find(item => item.formId.toLowerCase() === formId);
        if (!pair || pair.routeVerified) return;
        try {
          const provider = window.HubSpotFormsV4;
          if (!provider || typeof provider.getFormFromEvent !== 'function') return;
          const form = provider.getFormFromEvent(event);
          if (!form || typeof form.getFormFieldValues !== 'function' ||
              typeof form.setFieldValue !== 'function' ||
              typeof form.getFieldValue !== 'function') return;
          const fields = await form.getFormFieldValues();
          const routeField = Array.isArray(fields) && fields.find(field =>
            typeof field.name === 'string' &&
            field.name === '0-1/' + KITi_ROUTE_FIELD);
          if (!routeField) return; // Missing from native form: preserve legacy Kiti form.
          await form.setFieldValue(routeField.name, KITi_ROUTE_VALUE);
          const value = await form.getFieldValue(routeField.name);
          if (value !== KITi_ROUTE_VALUE) return;
          pair.routeVerified = true;
          revealWhenVerified(pair);
        } catch (_) {
          // HubSpot editor/configuration or provider error: keep legacy form.
        }
      });
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