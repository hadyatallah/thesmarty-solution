/* Contact page shell only: no CRM, Apps Script, submission or third-party API logic. */
(() => {
  'use strict';
  const button = document.querySelector('.menu');
  const navigation = document.querySelector('.navlinks');
  if (button && navigation) {
    button.addEventListener('click', () => {
      const open = navigation.classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
    });
    navigation.addEventListener('click', event => {
      if (!event.target.closest('a')) return;
      navigation.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
    });
  }
  // Display the enquiry context. HubSpot owns the form submission and fields.
  const params = new URLSearchParams(window.location.search);
  const route = (params.get('enquiry') || '').trim().toLowerCase();
  const routeLabel = {
    'kiti': 'Kiti Residential Development',
    'business-growth': 'Business Growth',
    'market-entry': 'Market Entry & Representation',
    'strategic-connections': 'Strategic Connections',
    'opportunity-development': 'Opportunity Development',
    'business-systems': 'Business Systems'
  }[route];
  const context = document.getElementById('tssEnquiryContext');
  if (context && routeLabel) {
    context.hidden = false;
    context.textContent = route === 'kiti'
      ? 'Your enquiry concerns the TSS-owned Kiti Residential Development project. Please select Kiti in the form enquiry type, if offered, or start your message with “Kiti Residential Development”.'
      : 'Enquiry topic: ' + routeLabel + '. Please confirm this topic in the form if requested.';
  }
  document.querySelectorAll('[data-year]').forEach(el => {
    el.textContent = String(new Date().getFullYear());
  });
  const footer = document.querySelector('.footer');
  if (!footer) return;
  const contactColumn = Array.from(footer.querySelectorAll('.footergrid > div')).find(col =>
    col.querySelector('h3')?.textContent.trim().toLowerCase() === 'contact'
  );
  const links = contactColumn?.querySelector('ul');
  if (!links || links.querySelector('.footer-socials')) return;
  const item = document.createElement('li');
  item.className = 'footer-socials';
  const socialLinks = [
    ['Instagram', 'https://www.instagram.com/thesmartysolution/'],
    ['Facebook', 'https://www.facebook.com/share/1U5CfVZhT1/']
  ];
  for (const [name, url] of socialLinks) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = name;
    a.setAttribute('aria-label', name);
    a.style.marginRight = '12px';
    item.appendChild(a);
  }
  links.appendChild(item);
})();
