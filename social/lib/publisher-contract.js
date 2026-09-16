import crypto from 'node:crypto';

export const PUBLISHER_CONTRACT_VERSION = 3;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export function publisherPolicyDigest(policies) {
  const names = ['approvalPolicy', 'editorialIntelligence', 'audienceNeeds', 'proofRegistry', 'editorialPolicy'];
  for (const name of names) {
    if (!policies?.[name] || typeof policies[name] !== 'object') throw new Error(`Missing publisher policy: ${name}`);
  }
  const content = Object.fromEntries(names.map(name => [name, policies[name]]));
  return crypto.createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex');
}

export function enforcePublisherContract(inspection, expectedPolicyDigest) {
  if (inspection?.contractVersion !== PUBLISHER_CONTRACT_VERSION || inspection.policyDigest !== expectedPolicyDigest) {
    throw new Error('Publisher deployment is still updating or its policies are stale. No publication was reserved; retry after deployment completes.');
  }
}
