// This adapter does not provision resources, grant IAM roles, or fall back to keys.
import { getVercelOidcToken } from '@vercel/oidc';
import { ExternalAccountClient } from 'google-auth-library';

export async function keylessToken(env = process.env) {
  const required = ['GCP_PROJECT_NUMBER', 'GCP_WORKLOAD_IDENTITY_POOL_ID', 'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID', 'GCP_SERVICE_ACCOUNT_EMAIL'];
  if (required.some(key => !env[key])) throw Error('CONFIGURATION_INCOMPLETE');
  const client = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: `//iam.googleapis.com/projects/${env.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${env.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${env.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: getVercelOidcToken }
  });
  if (!client) throw Error('CONFIGURATION_INCOMPLETE');
  const token = await client.getAccessToken();
  if (!token) throw Error('TOKEN_UNAVAILABLE');
  return token;
}

export function googleDependencies({ env = process.env, fetcher = fetch, getToken = () => keylessToken(env) } = {}) {
  async function call(url, options = {}) {
    return fetcher(url, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' }
    });
  }
  return async () => {
    const resource = env.TSS_WHATSAPP_SECRET_VERSION;
    const parent = env.TSS_WHATSAPP_FIRESTORE_PARENT;
    // Resource paths are public configuration. Secret contents never enter env settings.
    if (!/^projects\/[a-zA-Z0-9_-]+\/secrets\/[a-zA-Z0-9_-]+\/versions\/\d+$/.test(resource || '') ||
        !/^projects\/[a-zA-Z0-9_-]+\/databases\/[a-zA-Z0-9_()-]+\/documents$/.test(parent || '')) throw Error('CONFIGURATION_INCOMPLETE');
    const response = await call(`https://secretmanager.googleapis.com/v1/${resource}:access`);
    if (!response.ok) throw Error('SECRET_UNAVAILABLE');
    const secret = await response.json();
    if (typeof secret.payload?.data !== 'string') throw Error('SECRET_UNAVAILABLE');
    const settings = JSON.parse(Buffer.from(secret.payload.data, 'base64').toString('utf8'));
    if (typeof settings.appSecret !== 'string' || settings.appSecret.length < 16 ||
        typeof settings.verifyToken !== 'string' || settings.verifyToken.length < 32 ||
        !Array.isArray(settings.allowedPairs) || !settings.allowedPairs.length ||
        settings.allowedPairs.some(pair => !/^\d+$/.test(pair.wabaId) || !/^\d+$/.test(pair.phoneNumberId))) throw Error('CONFIGURATION_INCOMPLETE');
    const store = {
      async putIfAbsent(event) {
        const fields = {
          event: { stringValue: JSON.stringify(event) },
          receivedAt: { timestampValue: new Date().toISOString() },
          state: { stringValue: 'held_for_review' },
          schemaVersion: { integerValue: '1' }
        };
        const response = await call(`https://firestore.googleapis.com/v1/${parent}/tss_whatsapp_inbox?documentId=${event.eventKey}`, {
          method: 'POST', body: JSON.stringify({ fields })
        });
        if (response.ok) return true;
        // Only an explicit provider ALREADY_EXISTS proves an event was committed.
        if (response.status === 409) {
          const body = await response.json().catch(() => ({}));
          if (body.error?.status === 'ALREADY_EXISTS') return false;
        }
        throw Error('INBOX_UNAVAILABLE');
      }
    };
    return { ...settings, store };
  };
}
