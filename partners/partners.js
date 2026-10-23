// Progressive enhancement: all published entries remain readable without JavaScript.
(() => {
  const filters = document.querySelector('.partner-filters');
  if (!filters) return;
  const cards = [...document.querySelectorAll('[data-partner-category]')];
  const status = document.querySelector('.partner-status');
  filters.hidden = false;
  filters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-partner-filter]');
    if (!button) return;
    const category = button.dataset.partnerFilter;
    filters.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    cards.forEach(card => { card.hidden = category !== 'all' && card.dataset.partnerCategory !== category; });
    if (status) {
      status.hidden = false;
      const count = cards.filter(c => !c.hidden).length;
      status.textContent = `${count} ${count === 1 ? 'resource' : 'resources'} shown`;
    }
  });
})();
