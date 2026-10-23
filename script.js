// Public website presentation and consent only.
// The single contact form is hosted and processed by HubSpot, not Apps Script.
// Historical TSS CRM and API-based AI assistant transports are retired.
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

// Phase 7 public positioning: normalize public navigation/footer while preserving legacy URLs.
(() => {
  const current = window.location.pathname.toLowerCase();
  const nav = document.querySelector('.navlinks');
  if (nav) {
    const whatCurrent = current.endsWith('/divisions.html') ? ' aria-current="page"' : '';
    const aboutCurrent = current.endsWith('/about.html') ? ' aria-current="page"' : '';
    const contactCurrent = current.endsWith('/contact.html') ? ' aria-current="page"' : '';
    nav.innerHTML =
      '<li><a href="divisions.html"' + whatCurrent + '>What We Do</a></li>' +
      
      '<li><a href="how-we-work.html">How We Work</a></li>' +
      '<li><a href="about.html"' + aboutCurrent + '>About</a></li>' +
      '<li><a class="navcta" href="contact.html"' + contactCurrent + ' data-tss-event="discuss_business_click" data-cta-location="header">Discuss Your Business</a></li>';
  }

  document.querySelectorAll('.footer').forEach((footer) => {
    const cols = Array.from(footer.querySelectorAll('.footergrid > div'));
    const brandCol = cols[0];
    if (brandCol) {
      const p = brandCol.querySelector('p');
      if (p) p.textContent = 'Business growth, market entry, strategic connections and opportunity development. Cyprus first, selected EMEA.';
    }

    const navCol = cols.find((column) => {
      const h = column.querySelector('h3');
      return h && h.textContent.trim().toLowerCase() === 'navigate';
    });
    if (navCol) {
      const list = navCol.querySelector('ul');
      if (list) list.innerHTML = '<li><a href="divisions.html">What We Do</a></li><li><a href="how-we-work.html">How We Work</a></li><li><a href="about.html">About</a></li><li><a href="contact.html">Discuss Your Business</a></li>';
    }

    const contactCol = cols.find((column) => {
      const h = column.querySelector('h3');
      return h && h.textContent.trim().toLowerCase() === 'contact';
    });
    if (contactCol) {
      Array.from(contactCol.querySelectorAll('li')).forEach((li) => {
        if (!li.querySelector('a') && /cyprus|lebanon|emea/i.test(li.textContent)) {
          li.textContent = 'Cyprus · Selected EMEA';
        }
      });
    }

    const bottom = footer.querySelector('.footerbottom');
    if (bottom) {
      bottom.innerHTML = '© ' + new Date().getFullYear() + ' The Smarty Solution Ltd. <a href="privacy.html">Privacy</a> · Business development and consultancy. Specialist or regulated matters require the appropriate professional. <a class="tss-admin-login" href="/admin-login/">Admin Login</a>';
    }
  });
})();

window.tssTrackEvent_ = function tssTrackEvent_(name, params = {}) {
  if (!window.__tssAnalyticsLoaded || typeof window.gtag !== 'function') return;
  const safe = {};
  ['page_path','service_route','cta_location','opportunity_key'].forEach((key) => {
    if (params[key] !== undefined && params[key] !== null) safe[key] = String(params[key]).slice(0, 120);
  });
  window.gtag('event', name, safe);
};

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-tss-event]');
  if (!target) return;
  window.tssTrackEvent_(target.dataset.tssEvent, {
    page_path: window.location.pathname,
    service_route: target.dataset.serviceRoute || '',
    cta_location: target.dataset.ctaLocation || '',
    opportunity_key: target.dataset.opportunityKey || ''
  });
});

// Social links in the footer across all site pages.
(() => {
  const footer = document.querySelector('.footer');
  if (!footer) return;

  footer.querySelectorAll('a[href*="instagram.com/thesmartysolution"],a[href*="facebook.com/share/1U5CfVZhT1"]').forEach((link) => {
    const legacyItem = link.closest('li');
    if (legacyItem && !legacyItem.classList.contains('footer-socials')) legacyItem.remove();
  });
  if (footer.querySelector('.footer-socials')) return;

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

// Optional Google Analytics. Nothing is sent to Google until the visitor accepts.
(() => {
  const consentKey = 'tss_analytics_consent_v1';
  const measurementId = 'G-EEB0TW6TB8';

  const loadAnalytics = () => {
    if (window.__tssAnalyticsLoaded) return;
    window.__tssAnalyticsLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', measurementId, { anonymize_ip: true });

    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    document.head.appendChild(tag);
  };

  const saved = (() => {
    try { return window.localStorage.getItem(consentKey); } catch (error) { return null; }
  })();
  if (saved === 'accepted') loadAnalytics();
  if (saved) return;

  const style = document.createElement('style');
  style.textContent = '.tss-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:100;max-width:680px;margin:auto;padding:18px 20px;border-radius:14px;background:#07182b;color:#fff;box-shadow:0 14px 42px rgba(0,0,0,.3);font:14px/1.45 Inter,system-ui,sans-serif}.tss-consent p{margin:0 0 13px}.tss-consent a{color:#8ff3ed}.tss-consent-actions{display:flex;gap:10px;flex-wrap:wrap}.tss-consent button{padding:9px 14px;border-radius:8px;font:700 14px Inter,system-ui,sans-serif;cursor:pointer}.tss-consent-accept{border:1px solid #16bcb4;background:#16bcb4;color:#062033}.tss-consent-reject{border:1px solid rgba(255,255,255,.5);background:transparent;color:#fff}';
  document.head.appendChild(style);

  const notice = document.createElement('section');
  notice.className = 'tss-consent';
  notice.setAttribute('role', 'dialog');
  notice.setAttribute('aria-label', 'Analytics cookies');
  notice.innerHTML = '<p>We use optional analytics cookies to understand how the website is used. We do not send enquiry text, names, email addresses or phone numbers to Google Analytics. <a href="/privacy.html">Privacy notice</a></p><div class="tss-consent-actions"><button type="button" class="tss-consent-accept">Accept analytics</button><button type="button" class="tss-consent-reject">Reject</button></div>';
  document.body.appendChild(notice);

  const choose = (value) => {
    try { window.localStorage.setItem(consentKey, value); } catch (error) {}
    notice.remove();
    if (value === 'accepted') loadAnalytics();
  };
  notice.querySelector('.tss-consent-accept').addEventListener('click', () => choose('accepted'));
  notice.querySelector('.tss-consent-reject').addEventListener('click', () => choose('rejected'));
})();

// One shared discovery menu for articles, confirmed partners and useful resources.
(() => {
  const nav=document.querySelector('.navlinks');
  if(nav&&!nav.querySelector('[data-insights-menu]')){
    const item=document.createElement('li');item.dataset.insightsMenu='';
    item.innerHTML='<details class="insights-menu"><summary>Insights &amp; Resources</summary><ul><li><a href="/insights/">Explore Insights &amp; Resources</a></li><li><a href="/insights/#articles">Articles</a></li><li><a href="/insights/#partners">Partners</a></li><li><a href="/insights/#resources">Useful Resources</a></li></ul></details>';
    const cta=nav.querySelector('.navcta')?.closest('li');cta?nav.insertBefore(item,cta):nav.appendChild(item);
    const details=item.querySelector('details');
    document.addEventListener('click',event=>{if(!item.contains(event.target))details.open=false;});
    item.addEventListener('click',event=>{if(event.target.closest('a'))details.open=false;});
    item.addEventListener('keydown',event=>{if(event.key==='Escape'){details.open=false;item.querySelector('summary').focus();}});
  }
  document.querySelectorAll('.navlinks a,.footer a').forEach(a=>{const href=a.getAttribute('href');if(href&&/^[a-z][a-z0-9-]*\.html(?:[?#].*)?$/.test(href))a.setAttribute('href','/'+href);});
  document.querySelectorAll('.footergrid').forEach(grid=>{
    const column=[...grid.children].find(el=>el.querySelector('h3')?.textContent.trim().toLowerCase()==='navigate');const list=column?.querySelector('ul');
    if(list&&!list.querySelector('a[href="/insights/"]')){const item=document.createElement('li');item.innerHTML='<a href="/insights/">Insights &amp; Resources</a>';list.appendChild(item);}
  });
})();
