import { randomUUID } from 'node:crypto';
// One transient execution marker in the existing approved workbook. No secrets,
// new sheet, database, service or IAM grant. Metadata ID uniqueness arbitrates
// concurrent workers server-side; compare-delete never removes a successor.
export const IRC_LOCK_ID = 91452210;
export const IRC_LOCK_KEY = 'tss_irc_execution_lock_v1';
const SHEET = '1KFLZk_IlFY64IMpEW63wYvJdNF5jmfjZoRM79aVbBKs';
const ROOT = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET}`;
const LEASE_MS = 600000; // Beyond the 60s function limit and Sheets request timeout.
function removal(value) {
  return { deleteDeveloperMetadata: { dataFilter: { developerMetadataLookup: {
    metadataId: IRC_LOCK_ID, metadataKey: IRC_LOCK_KEY, metadataValue: value
  } } } };
}
export async function acquireResearchLock(token, runId, { fetcher = fetch, now = Date.now } = {}) {
  async function call(path, body) {
    return fetcher(ROOT + path, { method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(12000), headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body) });
  }
  const value = JSON.stringify({ runId, owner: randomUUID(), expiresAt: now() + LEASE_MS });
  const create = { createDeveloperMetadata: { developerMetadata: {
    metadataId: IRC_LOCK_ID, metadataKey: IRC_LOCK_KEY, metadataValue: value,
    location: { spreadsheet: true }, visibility: 'DOCUMENT'
  } } };
  let response = await call(':batchUpdate', { requests: [create] });
  if (!response.ok) {
    if (![400, 409].includes(response.status)) throw Error('IRC_LOCK_PROVIDER_' + response.status);
    const search = await call('/developerMetadata:search', { dataFilters: [{ developerMetadataLookup: { metadataId: IRC_LOCK_ID } }] });
    if (!search.ok) throw Error('IRC_LOCK_LOOKUP_' + search.status);
    const matches = (await search.json()).matchedDeveloperMetadata || [];
    const previous = matches[0]?.developerMetadata;
    if (!previous || previous.metadataKey !== IRC_LOCK_KEY) throw Error('IRC_LOCK_ID_CONFLICT');
    let record;
    try { record = JSON.parse(previous.metadataValue); } catch { throw Error('IRC_LOCK_INVALID'); }
    if (!Number.isFinite(record.expiresAt) || !record.owner || !record.runId) throw Error('IRC_LOCK_INVALID');
    if (record.expiresAt > now()) throw Error('IRC_RUN_IN_PROGRESS');
    // This atomic batch succeeds for only one recovery contender. If another
    // worker already replaced the expired marker, create fails and no delete applies.
    response = await call(':batchUpdate', { requests: [removal(previous.metadataValue), create] });
    if (!response.ok) throw Error('IRC_RUN_IN_PROGRESS');
  }
  return {
    async release() {
      const response = await call(':batchUpdate', { requests: [removal(value)] });
      if (!response.ok) throw Error('IRC_LOCK_RELEASE_' + response.status);
    }
  };
}
