
export const DISCOVERY_DISTRICTS = ['larnaca','limassol','nicosia','paphos','famagusta'];
export const INDEX_AGENT_BASE = 'https://agent.index.cy';
export const INDEX_USER_AGENT = 'TSS-Research-Center/1.1';

const BLOCKED_HOSTS = new Set([
  'index.cy','www.index.cy','agent.index.cy',
  'linkedin.com','www.linkedin.com','facebook.com','www.facebook.com',
  'instagram.com','www.instagram.com','youtube.com','www.youtube.com',
  'tiktok.com','www.tiktok.com','x.com','www.x.com','twitter.com','www.twitter.com',
  'wa.me','whatsapp.com','www.whatsapp.com'
]);

const stripTags = html => String(html ?? '')
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim();

export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeDomain(value) {
  if (!value) return '';
  try {
    const u = new URL(String(value).trim());
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return String(value).trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
  }
}

function looseName(value) {
  return normalizeName(value)
    .replace(/\b(limited|ltd|llc|inc|corp|corporation|gmbh|sa|sl|oy|spk|sp|co|company)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nextNumericId(rows, prefix) {
  let max = 0;
  for (const row of (rows || []).slice(1)) {
    const raw = String(row?.[0] ?? '');
    if (!raw.startsWith(prefix)) continue;
    const n = Number(raw.slice(prefix.length));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max + 1;
}

export function discoveryUrl(district, limit = 10) {
  const q = new URLSearchParams({
    deal: 'sale',
    condition: 'brand-new',
    seller_type: 'developer',
    district,
    listed_within_days: '30',
    sort: 'newest',
    detail: 'full',
    limit: String(Math.max(1, Math.min(10, limit)))
  });
  return INDEX_AGENT_BASE + '/v1/listings?' + q;
}

async function fetchWithTimeout(fetchFn, url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function jsonResponse(fetchFn, url) {
  const res = await fetchWithTimeout(fetchFn, url, {
    headers: { accept: 'application/json', 'user-agent': INDEX_USER_AGENT }
  });
  if (res.status === 404 && url.includes('/v1/')) {
    const retryUrl = url.replace('/v1/', '/api/');
    const retry = await fetchWithTimeout(fetchFn, retryUrl, {
      headers: { accept: 'application/json', 'user-agent': INDEX_USER_AGENT }
    });
    if (!retry.ok) throw Error('INDEX_API_' + retry.status);
    return { json: await retry.json(), url: retryUrl };
  }
  if (!res.ok) throw Error('INDEX_API_' + res.status);
  return { json: await res.json(), url };
}

export async function discoverDeveloperSignals(fetchFn, district, limit = 10) {
  const { json, url } = await jsonResponse(fetchFn, discoveryUrl(district, limit));
  const results = Array.isArray(json?.results) ? json.results : [];
  return {
    sourceURL: url,
    total: Number(json?.total) || results.length,
    candidates: results.map(x => ({
      listingId: x?.id ?? null,
      listingURL: x?.url || '',
      sellerName: x?.seller?.name || '',
      sellerType: x?.seller?.type || '',
      sellerURL: x?.seller?.url || '',
      district: x?.district || district,
      location: x?.location || '',
      projectName: x?.project?.name || '',
      title: x?.title || '',
      listedAt: x?.listed_at || '',
      updatedAt: x?.updated_at || ''
    })).filter(x => x.sellerName)
  };
}

export function extractFirstPartyUrl(html, baseUrl) {
  const found = [];
  for (const m of String(html ?? '').matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], baseUrl);
      if (!/^https?:$/.test(u.protocol)) continue;
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      if (BLOCKED_HOSTS.has(host)) continue;
      if (/(^|\.)google\./i.test(host) || /doubleclick|googletag|cloudfront|cloudflare/i.test(host)) continue;
      found.push(u.href);
    } catch {}
  }
  const unique = [...new Map(found.map(u => [normalizeDomain(u), u])).values()];
  unique.sort((a, b) => Number(new URL(a).protocol === 'https:') * -1 - Number(new URL(b).protocol === 'https:') * -1);
  return unique[0] || '';
}

function extractTitle(html) {
  return String(html ?? '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '';
}

function extractSiteName(html) {
  const ld = [...String(html ?? '').matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of ld) {
    try {
      const j = JSON.parse(m[1]);
      const items = Array.isArray(j) ? j : [j];
      for (const item of items) {
        const name = item?.name || item?.publisher?.name || item?.organization?.name;
        if (name) return String(name).trim();
      }
    } catch {}
  }
  return String(html ?? '').match(/<meta[^>]+(?:property|name)=["'](?:og:site_name|application-name)["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() || '';
}

export async function verifyFirstPartySource(fetchFn, sellerURL) {
  if (!sellerURL) return { verified: false, reason: 'NO_SELLER_SOURCE', firstPartyURL: '' };
  let memberRes;
  try {
    memberRes = await fetchWithTimeout(fetchFn, sellerURL, {
      headers: { 'user-agent': INDEX_USER_AGENT, accept: 'text/html' }
    });
  } catch {
    return { verified: false, reason: 'SELLER_PAGE_UNAVAILABLE', firstPartyURL: '' };
  }
  if (!memberRes.ok) return { verified: false, reason: 'SELLER_PAGE_' + memberRes.status, firstPartyURL: '' };
  const memberHtml = await memberRes.text();
  const firstPartyURL = extractFirstPartyUrl(memberHtml, sellerURL);
  if (!firstPartyURL) return { verified: false, reason: 'NO_FIRST_PARTY_LINK', firstPartyURL: '' };

  let firstRes;
  try {
    firstRes = await fetchWithTimeout(fetchFn, firstPartyURL, {
      headers: { 'user-agent': INDEX_USER_AGENT, accept: 'text/html' }
    });
  } catch {
    return { verified: false, reason: 'FIRST_PARTY_UNAVAILABLE', firstPartyURL };
  }
  if (!firstRes.ok) return { verified: false, reason: 'FIRST_PARTY_' + firstRes.status, firstPartyURL };
  const type = String(firstRes.headers?.get?.('content-type') || 'text/html');
  if (!/html/i.test(type)) return { verified: false, reason: 'FIRST_PARTY_NOT_HTML', firstPartyURL };

  const html = await firstRes.text();
  const body = stripTags(html).slice(0, 120000);
  const title = extractTitle(html);
  const siteName = extractSiteName(html);
  const textForChecks = (title + ' ' + siteName + ' ' + body).toLowerCase();
  const developerSignal = /\b(property developer|real estate developer|developer|development|developments|construction|residential development)\b/i.test(textForChecks);
  const propertySignal = /\b(real estate|properties|property|homes|apartments|villas|projects|residential)\b/i.test(textForChecks);
  const cyprusSignal = /\bcyprus\b|\bκύπρ/i.test(textForChecks) || /\.cy$/i.test(new URL(firstPartyURL).hostname);
  const agencySignal = /\b(real estate agency|estate agency|real estate agent|lettings agency)\b/i.test(textForChecks);
  const verified = Boolean(developerSignal && cyprusSignal && !agencySignal);

  return {
    verified,
    reason: verified ? 'FIRST_PARTY_DEVELOPER_VERIFIED' : agencySignal && !developerSignal ? 'FIRST_PARTY_AGENCY_NOT_DEVELOPER' : 'FIRST_PARTY_ROLE_OR_GEOGRAPHY_UNCLEAR',
    firstPartyURL,
    finalURL: firstRes.url || firstPartyURL,
    title,
    siteName,
    developerSignal,
    propertySignal,
    cyprusSignal,
    agencySignal
  };
}

function headerMap(rows) {
  const h = (rows?.[0] || []).map(x => String(x ?? ''));
  return Object.fromEntries(h.map((x, i) => [x, i]));
}

export function matchResearchRecord(candidate, rows) {
  const h = headerMap(rows);
  const nameIx = h.organisationName;
  const websiteIx = h.website;
  const names = [candidate.siteName, candidate.sellerName].filter(Boolean).map(normalizeName);
  const domain = normalizeDomain(candidate.firstPartyURL);
  for (const row of (rows || []).slice(1)) {
    if (!row?.[0]) continue;
    if (nameIx != null && names.includes(normalizeName(row[nameIx]))) return { kind: 'EXACT_NAME', id: row[0] };
    if (websiteIx != null && domain && normalizeDomain(row[websiteIx]) === domain) return { kind: 'EXACT_DOMAIN', id: row[0] };
  }
  return null;
}

export function matchMasterCompany(candidate, masterRows) {
  const h = headerMap(masterRows);
  const idIx = h.id, nameIx = h.name, websiteIx = h.website, emailIx = h.email;
  const names = [candidate.sellerName, candidate.siteName].filter(Boolean).map(normalizeName);
  const domain = normalizeDomain(candidate.firstPartyURL);
  const looseNames = [candidate.sellerName, candidate.siteName].filter(Boolean).map(looseName);
  const possible = [];

  for (const row of (masterRows || []).slice(1)) {
    if (!row?.[idIx]) continue;
    const masterName = normalizeName(row[nameIx]);
    const masterDomain = normalizeDomain(row[websiteIx]);
    if (names.includes(masterName) || (domain && domain === masterDomain)) {
      return { kind: 'EXACT', companyId: row[idIx], name: row[nameIx], website: row[websiteIx] || '' };
    }
    const masterLoose = looseName(row[nameIx]);
    if (looseNames.some(x => x && masterLoose && x === masterLoose)) {
      possible.push({ companyId: row[idIx], name: row[nameIx], website: row[websiteIx] || '' });
    }
    if (emailIx != null && candidate.publicEmail && String(row[emailIx] || '').toLowerCase() === String(candidate.publicEmail).toLowerCase()) {
      return { kind: 'EXACT_EMAIL', companyId: row[idIx], name: row[nameIx], website: row[websiteIx] || '' };
    }
  }

  if (possible.length === 1) return { kind: 'POSSIBLE', ...possible[0] };
  if (possible.length > 1) return { kind: 'AMBIGUOUS', matches: possible };
  return { kind: 'NONE' };
}

export function classifyCandidate(candidate, firstParty, masterRows, researchRows) {
  const researchMatch = matchResearchRecord(candidate, researchRows);
  if (researchMatch) {
    return {
      disposition: 'DUPLICATE_RESEARCH_RECORD',
      status: 'HOLD - DUPLICATE RESEARCH RECORD',
      reason: researchMatch.kind,
      canonicalCompanyId: '',
      existingResearchId: researchMatch.id
    };
  }

  const master = matchMasterCompany(candidate, masterRows);
  if (master.kind === 'EXACT' || master.kind === 'EXACT_EMAIL') {
    return {
      disposition: 'DUPLICATE_CANONICAL_COMPANY',
      status: 'DUPLICATE / EXISTING COMPANY',
      reason: master.kind,
      canonicalCompanyId: master.companyId
    };
  }
  if (master.kind === 'POSSIBLE' || master.kind === 'AMBIGUOUS') {
    return {
      disposition: 'POSSIBLE_CANONICAL_MATCH',
      status: 'REVIEW REQUIRED - POSSIBLE CANONICAL MATCH',
      reason: master.kind,
      canonicalCompanyId: master.companyId || ''
    };
  }
  if (firstParty.reason === 'FIRST_PARTY_AGENCY_NOT_DEVELOPER') {
    return {
      disposition: 'REJECTED_NOT_DEVELOPER',
      status: 'REJECTED - NOT A DEVELOPER',
      reason: firstParty.reason,
      canonicalCompanyId: ''
    };
  }
  if (!firstParty.verified) {
    return {
      disposition: 'HOLD_SOURCE_VERIFICATION',
      status: 'HOLD - FIRST-PARTY VERIFICATION FAILED',
      reason: firstParty.reason,
      canonicalCompanyId: ''
    };
  }
  return {
    disposition: 'ACCEPTED_RESEARCH_CANDIDATE',
    status: 'RESEARCH QUALIFIED - OUTREACH NOT AUTHORIZED',
    reason: 'FIRST_PARTY_DEVELOPER_VERIFIED',
    canonicalCompanyId: ''
  };
}

export function candidateSummary(classification) {
  if (classification.disposition === 'ACCEPTED_RESEARCH_CANDIDATE') return 'ACCEPTED';
  if (classification.disposition.startsWith('REJECTED')) return 'REJECTED';
  return 'HELD';
}

export function dayRotationIndex(date = new Date()) {
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
  const start = Date.UTC(y, 0, 1);
  return Math.floor((Date.UTC(y, m, d) - start) / 86400000) % DISCOVERY_DISTRICTS.length;
}
