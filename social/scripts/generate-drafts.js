import fs from 'node:fs/promises';
import { normalize, requireThat } from '../lib/qa.js';

// Free curated generation. New facts and creative angles are added by the editor.
// Never fabricate market figures or mark generated files as inspected/approved.
const date = process.argv[2];
requireThat(/^\d{4}-\d{2}-\d{2}$/.test(date || ''), 'Pass a date as YYYY-MM-DD');
const bank = JSON.parse(await fs.readFile('social/editorial-bank.json', 'utf8'));
const config = JSON.parse(await fs.readFile('social/publishing-config.json', 'utf8'));
const existing = await Promise.all((await fs.readdir('content-queue')).filter(f => f.endsWith('.json')).map(async f => JSON.parse(await fs.readFile(`content-queue/${f}`, 'utf8'))));
let count = 0;
for (const brief of bank) {
  if (count >= 3) break;
  if (existing.some(i => normalize(i.topic) === normalize(brief.topic))) continue;
  const format = count === 1 ? 'story' : 'feed';
  const id = `${date}-${brief.id}`;
  const item = { qaVersion: 2, id, status: 'draft', topic: brief.topic, topicKey: brief.id, headline: brief.headline, creativeKey: `${brief.id}-editorial-v2`, format, platforms: format === 'feed' ? ['instagram', 'facebook'] : ['instagram'], publishAt: `${date}T${config.slots[count]}:00+03:00`, caption: format === 'story' ? brief.question : `${brief.headline}\n\n${brief.body}\n\n${brief.question}\n\n#Cyprus #CyprusBusiness #TheSmartySolution`, creative: { format, template: 'question-debate', text: { category: brief.category, headline: brief.headline, body: brief.body, question: brief.question } }, facts: { classification: 'editorial-opinion', claims: [], sources: [] }, geography: { mode: 'no-location-imagery' } };
  // A timezone offset is intentionally not inferred from a month. The editor
  // sets publishAt for Asia/Nicosia before the final content binding is signed.
  item.publishAt = null;
  item.requestedLocalSlot = config.slots[count];
  await fs.writeFile(`content-queue/${id}.json`, JSON.stringify(item, null, 2) + '\n');
  count++;
}
console.log(`Created ${count} draft(s). Final export, source checks and visual inspection are required.`);
