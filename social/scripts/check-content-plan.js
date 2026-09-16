import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Assess the researched-bank shortfall without approving, exporting or posting.
const history = 'social-results/history.json';
await fs.access(history);
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Nicosia' }).format(new Date());
const report = JSON.parse(execFileSync(process.execPath, ['social/scripts/generate-drafts.js', date, '--history', history, '--dry-run'], { encoding: 'utf8' }));
await fs.writeFile('social-results/content-plan.json', JSON.stringify(report, null, 2) + '\n');
const remaining = report.gaps.reduce((sum, gap) => sum + gap.remaining, 0);
const summary = `Content planning: ${report.created} candidate draft(s); ${remaining} topic/format positions still need reviewed briefs. No content approved or published by planning.\n`;
console.log(summary.trim());
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
