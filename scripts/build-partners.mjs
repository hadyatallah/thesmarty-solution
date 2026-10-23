import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const esc = (v) => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderDirectory(data) {
  const ids = new Set();
  const categories = new Map();
  for (const category of data.categories) {
    if (!/^[a-z][a-z0-9-]*$/.test(category.id) || category.id === 'all' || categories.has(category.id) || !category.label) throw new Error('Invalid, reserved or duplicate category ID');
    categories.set(category.id, category.label);
  }
  for (const item of data.entries) {
    if (!item.id || ids.has(item.id)) throw new Error('Missing or duplicate entry ID');
    ids.add(item.id);
    if (!categories.has(item.category)) throw new Error(`Unknown category: ${item.category}`);
    if (!['draft', 'published'].includes(item.status)) throw new Error('Unknown publish status');
    if (!/^(https:\/\/|\/(?!\/))/.test(item.url)) throw new Error('Only HTTPS or root-relative links are allowed');
    const url = new URL(item.url, 'https://www.thesmartysolution.com');
    if (url.protocol !== 'https:' || url.username || url.password || /[\\\s]/.test(item.url)) throw new Error('Invalid public destination URL');
    for (const field of ['name', 'description', 'relationship', 'verifiedOn']) if (!item[field]) throw new Error(`Missing ${field}`);
  }
  const published = data.entries.filter(e => e.status === 'published');
  const active = data.categories.filter(c => published.some(e => e.category === c.id));
  const filters = active.length > 1 ? `<div class="partner-filters" role="group" aria-label="Filter resources" hidden><button type="button" data-partner-filter="all" aria-pressed="true">All</button>${active.map(c => `<button type="button" data-partner-filter="${esc(c.id)}" aria-pressed="false">${esc(c.label)}</button>`).join('')}</div><p class="partner-status" aria-live="polite" hidden></p>` : '';
  return filters + '<div class="cards3 partner-directory">' + published.map(e => `<article class="card partner-card" id="${esc(e.id)}" data-partner-category="${esc(e.category)}"><p class="relationship">${esc(e.relationship)}</p><h3>${esc(e.name)}</h3><p>${esc(e.description)}</p><a class="maplink" href="${esc(e.url)}">Read more<span class="sr-only">: ${esc(e.name)}</span> <span aria-hidden="true">→</span></a></article>`).join('\n') + '</div>';
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = JSON.parse(readFileSync(resolve(root, 'partners/entries.json'), 'utf8'));
  const template = readFileSync(resolve(root, 'partners/page-shell.html'), 'utf8');
  writeFileSync(resolve(root, 'partners/index.html'), template.replace('<!-- DIRECTORY -->', renderDirectory(data)));
}
