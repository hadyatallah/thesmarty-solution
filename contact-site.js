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
