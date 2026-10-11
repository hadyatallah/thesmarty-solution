import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const rootPath = root.pathname;

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    if (name === '.git' || name === 'node_modules') return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return [path];
  });
}

test('retired backend files and scheduled bridge are absent', () => {
  for (const path of [
    'api/crm.js',
    'api/outlook/status.js',
    'api/outlook/_lib.js',
    'server/outlook/status.js',
    'server/outlook/enable.js',
    'server/outlook/disable.js',
    'server/outlook/sync.js',
    'lib/tssHubspotEnquiryHandler.mjs',
    'lib/tssHubspotEnquirySync.mjs',
    '.github/workflows/tss-hubspot-enquiry-sync-tests.yml'
  ]) {
    assert.equal(existsSync(new URL('../' + path, import.meta.url)), false, path);
  }
});

test('Vercel no longer rewrites retired Outlook capture paths', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.rewrites?.length || 0, 0);
  assert.equal(config.crons?.length || 0, 0);
});

test('active source no longer imports retired CRM bridge modules', () => {
  const blocked = [
    '../api/crm.js',
    '../lib/tssHubspotEnquiryHandler.mjs',
    '../lib/tssHubspotEnquirySync.mjs',
    '/api/outlook/status',
    '/api/outlook/ingestion',
    'captureAction='
  ];
  const offenders = [];
  for (const path of files(rootPath)) {
    const rel = relative(rootPath, path);
    if (rel.startsWith('docs/') || rel.startsWith('tests/')) continue;
    const text = readFileSync(path, 'utf8');
    for (const term of blocked) {
      if (text.includes(term)) offenders.push(rel + ' -> ' + term);
    }
  }
  assert.deepEqual(offenders, []);
});
