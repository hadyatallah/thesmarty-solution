import { ACCOUNT, QA_VERSION, enforceUserApproval, immutableAssetUrl, requireThat, sha256, sign, validateImage, validateManifest, verifySignature, checkSources } from '../social/lib/qa.js';
import approvalPolicy from '../social/user-approval-policy.json' with { type: 'json' };

const VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const credentials = () => ({
  ig: process.env.INSTAGRAM_ACCESS_TOKEN,
  igId: process.env.INSTAGRAM_USER_ID,
  fb: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN,
  fbId: process.env.FACEBOOK_PAGE_ID || process.env.META_PAGE_ID || process.env.FB_PAGE_ID || ACCOUNT.facebookId,
});
async function graph(host, route, token, method = 'GET', params = {}) {
  const url = new URL(`https://${host}/${VERSION}${route}`);
  const options = { method, headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(20000) };
  if (method === 'GET') for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  else { options.headers['Content-Type'] = 'application/x-www-form-urlencoded'; options.body = new URLSearchParams(params); }
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const e = new Error('Meta request failed');
    e.safeMeta = { code: data.error?.code, subcode: data.error?.error_subcode, type: data.error?.type };
    throw e;
  }
  return data;
}
async function identities(c, needFacebook = false) {
  requireThat(c.ig && c.igId === ACCOUNT.instagramId, 'Instagram credentials missing or wrong account identifier');
  const ig = await graph('graph.instagram.com', `/${c.igId}`, c.ig, 'GET', { fields: 'id,user_id,username' });
  const matches = { id: String(ig.id) === ACCOUNT.instagramId, userId: String(ig.user_id) === ACCOUNT.instagramId, username: ig.username === ACCOUNT.username };
  requireThat((matches.id || matches.userId) && matches.username, `Unexpected Instagram account (idMatch=${matches.id}, userIdMatch=${matches.userId}, usernameMatch=${matches.username})`);
  ig.id = String(ig.user_id || ig.id);
  let fb = null;
  if (c.fb && c.fbId) {
    requireThat(c.fbId === ACCOUNT.facebookId, 'Unexpected Facebook Page identifier');
    // A Page token must identify this Page via /me, not merely read a public Page.
    fb = await graph('graph.facebook.com', '/me', c.fb, 'GET', { fields: 'id,name' });
    requireThat(String(fb.id) === ACCOUNT.facebookId && fb.name === ACCOUNT.facebookName, 'Unexpected Facebook Page');
  }
  requireThat(!needFacebook || fb, 'Facebook Page publishing credentials are not configured');
  return { instagram: ig, facebook: fb, facebookConfigured: Boolean(fb) };
}
async function inspect(c) {
  const accounts = await identities(c);
  const recent = [];
  let after;
  for (let page = 0; page < 3; page++) {
    const data = await graph('graph.instagram.com', `/${c.igId}/media`, c.ig, 'GET', { fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp', limit: '100', ...(after ? { after } : {}) });
    recent.push(...(data.data || []));
    after = data.paging?.cursors?.after;
    if (!data.paging?.next || !after || recent.some(p => Date.parse(p.timestamp) < Date.now() - 30 * 86400000)) break;
    requireThat(page < 2, 'Recent content history could not be fully checked');
  }
  const keys = ['TSS_PUBLISHER_KEY', 'INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_USER_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_TOKEN', 'META_PAGE_ACCESS_TOKEN', 'FB_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID', 'META_PAGE_ID', 'FB_PAGE_ID', 'FACEBOOK_USER_ACCESS_TOKEN', 'FACEBOOK_ACCESS_TOKEN', 'META_USER_ACCESS_TOKEN'];
  const environmentReferences = Object.fromEntries(keys.map(name => [name, Boolean(process.env[name])]));
  return { ...accounts, recent, qaVersion: QA_VERSION, environmentReferences, userApprovalPolicy: { requiredCount: approvalPolicy.requiredCount, recordedCount: approvalPolicy.firstPostIds.filter(id => approvalPolicy.approvals[id]).length } };
}
async function validate(item, c) {
  validateManifest(item);
  const accounts = await identities(c, item.platforms.includes('facebook'));
  const response = await fetch(immutableAssetUrl(item.asset), { redirect: 'error', signal: AbortSignal.timeout(20000) });
  requireThat(response.ok, 'Inspected export is not publicly available');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (item.format === 'reel') {
    const q = item.asset.videoQA;
    requireThat(bytes.length <= 32 * 1024 * 1024 && bytes.toString('ascii', 4, 8) === 'ftyp' && sha256(bytes) === item.asset.sha256, 'Inspected MP4 export changed or failed to load');
    requireThat(q?.sha256 === item.asset.sha256 && q.width === 1080 && q.height === 1920 && q.codec === 'h264' && q.pixelFormat === 'yuv420p' && q.duration >= 6 && q.duration <= 60 && q.fullDecodePassed === true, 'Signed Reel decode evidence missing');
  } else {
    requireThat((response.headers.get('content-type') || '').startsWith('image/'), 'Inspected image failed to load');
    await validateImage(bytes, item);
  }
  await checkSources(item);
  return accounts;
}
async function ready(containerId, token) {
  for (let i = 0; i < 12; i++) {
    const status = await graph('graph.instagram.com', `/${containerId}`, token, 'GET', { fields: 'status_code,status' });
    if (status.status_code === 'FINISHED') return status.status_code;
    requireThat(!['ERROR', 'EXPIRED', 'PUBLISHED'].includes(status.status_code), 'Container is failed, expired or already published');
    if (i < 11) await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error('Container did not finish. No publication attempted');
}
function numeric(value) { requireThat(typeof value === 'string' && /^\d+(?:_\d+)?$/.test(value), 'Invalid Meta identifier'); return value; }
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed' }); }
  const key = process.env.TSS_PUBLISHER_KEY;
  if (!key || req.headers['x-tss-publisher-key'] !== key) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const { payload, signature } = req.body || {};
  const c = credentials();
  try {
    if (req.body?.action === 'inspect') return res.status(200).json({ ok: true, ...await inspect(c) });
    if (req.body?.action === 'verifyInstagram') {
      const id = numeric(req.body.mediaId);
      await identities(c);
      const media = await graph('graph.instagram.com', `/${id}`, c.ig, 'GET', { fields: 'id,caption,media_type,media_url,permalink,timestamp' });
      return res.status(200).json({ ok: true, media });
    }
    if (req.body?.action === 'verifyFacebook') {
      const id = numeric(req.body.postId);
      await identities(c, true);
      const media = await graph('graph.facebook.com', `/${id}`, c.fb, 'GET', { fields: 'id,message,permalink_url,attachments{media}' });
      return res.status(200).json({ ok: true, media });
    }
    requireThat(verifySignature(payload, signature, key), 'Signed QA manifest required. Legacy direct publish requests are blocked');
    const { item, action } = payload;
    requireThat(['dryRun', 'prepare', 'publishInstagram', 'publishFacebook'].includes(action), 'Invalid publishing action');
    if (action !== 'dryRun') {
      requireThat(item?.qaOnly !== true, 'QA-only assets cannot be published');
      requireThat(!item?.platforms?.includes('facebook') || c.fb, 'Facebook Page publishing credentials are not configured');
      enforceUserApproval(item, approvalPolicy);
    }
    const accounts = await validate(item, c);
    if (action === 'dryRun') return res.status(200).json({ ok: true, dryRun: true, qaVersion: QA_VERSION, accounts, assetSha256: item.asset.sha256 });
    if (action === 'prepare') {
      requireThat(item.platforms.includes('instagram'), 'Instagram not requested');
      const params = item.format === 'reel'
        ? { video_url: immutableAssetUrl(item.asset), media_type: 'REELS', caption: item.caption }
        : { image_url: immutableAssetUrl(item.asset), ...(item.format === 'story' ? { media_type: 'STORIES' } : { caption: item.caption, alt_text: item.headline }) };
      const container = await graph('graph.instagram.com', `/${c.igId}/media`, c.ig, 'POST', params);
      requireThat(container.id, 'No media container returned');
      const ticket = sign({ id: item.id, assetSha256: item.asset.sha256, containerId: container.id, format: item.format }, key);
      // Return immediately so the runner checkpoints this ID before any publish call.
      return res.status(200).json({ ok: true, containerId: container.id, ticket });
    }
    if (action === 'publishInstagram') {
      const containerId = numeric(payload.containerId);
      requireThat(payload.ticket === sign({ id: item.id, assetSha256: item.asset.sha256, containerId, format: item.format }, key), 'Container is not bound to this inspected asset');
      await ready(containerId, c.ig);
      const data = await graph('graph.instagram.com', `/${c.igId}/media_publish`, c.ig, 'POST', { creation_id: containerId });
      requireThat(data.id, 'No Instagram media identifier returned');
      return res.status(200).json({ ok: true, mediaId: data.id });
    }
    if (action === 'publishFacebook') {
      requireThat(item.format === 'feed' && item.platforms.includes('facebook'), 'Only explicit Facebook feed photos are enabled');
      const data = await graph('graph.facebook.com', `/${c.fbId}/photos`, c.fb, 'POST', { url: immutableAssetUrl(item.asset), caption: item.caption, published: 'true' });
      requireThat(data.post_id && data.id, 'No Facebook post identifier returned');
      return res.status(200).json({ ok: true, postId: data.post_id, photoId: data.id });
    }
  } catch (error) {
    // No tokens, raw Graph errors, request bodies or image URLs in logs or responses.
    console.error('TSS publishing blocked', { qaVersion: QA_VERSION, meta: error.safeMeta || null });
    return res.status(422).json({ ok: false, error: error.safeMeta ? 'Meta rejected the request. Check credentials, permissions and account status.' : error.message, meta: error.safeMeta });
  }
}
