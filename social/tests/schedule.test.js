import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('UTC workflow wake-ups cover every Cyprus slot and a backup across the full DST year', () => {
  const workflow = fs.readFileSync('.github/workflows/publish-instagram.yml', 'utf8');
  const match = workflow.match(/cron: '([0-9,]+) ([0-9,]+) \* \* \*'/);
  assert.ok(match, 'Expected explicit UTC wake-up times');
  assert.equal(/^\s+timezone:/m.test(workflow), false, 'Do not apply a second offset to UTC wake-ups');
  const minutes = match[1].split(',').map(Number), hours = match[2].split(',').map(Number);
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Nicosia', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let day = Date.UTC(2026, 0, 1); day < Date.UTC(2027, 0, 1); day += 86400000) {
    const wakeups = new Set(hours.flatMap(hour => minutes.map(minute => local.format(new Date(day + hour * 3600000 + minute * 60000)))));
    for (const hour of ['09', '14', '19']) {
      assert.ok(wakeups.has(`${hour}:15`), `Missing main slot ${hour}:15 on ${new Date(day).toISOString()}`);
      assert.ok(wakeups.has(`${hour}:45`), `Missing backup ${hour}:45 on ${new Date(day).toISOString()}`);
    }
  }
});
