import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderDirectory } from '../scripts/build-partners.mjs';
const data = JSON.parse(readFileSync(new URL('../partners/entries.json', import.meta.url)));
test('published information pages have explicit own-content labels and no empty filters', () => {
 const html = renderDirectory(data);
 assert.equal((html.match(/class="card partner-card"/g) || []).length, 3);
 assert.match(html, /TSS · Our own information/);
 assert.doesNotMatch(html, /data-partner-filter|Angela|Layman/);
});
test('drafts stay hidden and populated categories create filters', () => {
 const fixture = structuredClone(data);
 fixture.entries.push({...fixture.entries[0],id:'test-editorial',category:'editorial',name:'Test fixture',status:'draft'});
 assert.doesNotMatch(renderDirectory(fixture), /test-editorial/);
 fixture.entries.at(-1).status='published';
 assert.match(renderDirectory(fixture), /data-partner-filter="editorial"/);
 assert.doesNotMatch(renderDirectory(fixture), /data-partner-filter="commercial"/);
});
test('invalid links, duplicates and unknown categories fail closed', () => {
 for (const patch of [{url:'javascript:alert(1)'},{url:'https://'},{url:'https://[bad host'},{category:'unknown'},{status:'pending'}]) {
  const fixture=structuredClone(data);Object.assign(fixture.entries[0],patch);assert.throws(()=>renderDirectory(fixture));
 }
 const fixture=structuredClone(data);fixture.entries.push(fixture.entries[0]);assert.throws(()=>renderDirectory(fixture));
});
test('generated page matches its source', () => {
 const root=new URL('../',import.meta.url);
 const expected=readFileSync(new URL('partners/page-shell.html',root),'utf8').replace('<!-- DIRECTORY -->',renderDirectory(data));
 assert.equal(readFileSync(new URL('partners/index.html',root),'utf8'),expected);
});

test('category IDs are unique, nonempty and do not use the all-filter sentinel', () => {
 for (const id of ['all', '', 'resources']) {
  const fixture=structuredClone(data);fixture.categories.push({id,label:'Test'});assert.throws(()=>renderDirectory(fixture));
 }
});
