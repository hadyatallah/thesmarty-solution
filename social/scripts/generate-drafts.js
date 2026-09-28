import fs from 'node:fs/promises';
import { requireThat } from '../lib/qa.js';
import { validateEditorialConfiguration } from '../lib/editorial.js';
import { planDrafts } from '../lib/draft-planner.js';

// Curated draft planning only. A fresh state-branch snapshot is mandatory so
// recent publications and monthly usage cannot disappear from the selection.
const [date, ...args] = process.argv.slice(2);
const historyIndex = args.indexOf('--history');
requireThat(historyIndex >= 0 && args[historyIndex + 1], 'Pass --history /path/to/current/state-branch/social/history.json');
requireThat(args.every((arg, index) => index === historyIndex || index === historyIndex + 1 || arg === '--dry-run'), 'Unknown draft-planning argument');
const dryRun = args.includes('--dry-run');
const read = file => fs.readFile(file, 'utf8').then(JSON.parse);
const [bank, config, plan, intelligence, needs, feedback, trends, proofRegistry, catalog, state] = await Promise.all([
  read('social/editorial-bank.json'), read('social/publishing-config.json'), read('social/monthly-content-plan.json'),
  read('social/editorial-intelligence.json'), read('social/audience-needs.json'), read('social/performance-feedback.json'),
  read('social/trend-candidates.json'), read('social/social-proof-registry.json'), read('social/photo-catalog.json'), read(args[historyIndex + 1])
]);
validateEditorialConfiguration(intelligence, needs, feedback, trends, proofRegistry);
const queue = await Promise.all((await fs.readdir('content-queue')).filter(file => file.endsWith('.json')).map(file => read(`content-queue/${file}`)));
const result = planDrafts({ date, plan, config, bank, trends, intelligence, needs, feedback, catalog, queue, history: state.items });
if (!dryRun) for (const item of result.drafts) {
  await fs.writeFile(`content-queue/${item.id}.json`, JSON.stringify(item, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ ...result.report, dryRun, draftIds: result.drafts.map(item => item.id), message: 'Drafts remain unapproved. Verified research, composition, final export inspection and a complete QA seal are required before they can enter the authorized automatic publishing queue.' }, null, 2));
