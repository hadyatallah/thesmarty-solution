const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;

function send(res, status, body) {
  res.status(status).json(body);
}

function countHashtags(text = '') {
  return (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeMetaError(data, status) {
  const error = new Error(data?.error?.message || `Meta API request failed (${status})`);
  error.meta = data?.error || data;
  error.status = status;
  return error;
}

async function metaPost(path, token, params) {
  const body = new URLSearchParams(params);
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw makeMetaError(data, response.status);
  return data;
}

async function metaGet(path, token, params = {}) {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw makeMetaError(data, response.status);
  return data;
}

async function waitForContainer(containerId, token) {
  const maxAttempts = 12;
  const delayMs = 1500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const status = await metaGet(`/${containerId}`, token, {
      fields: 'status_code,status',
    });

    if (status.status_code === 'FINISHED') return status;

    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      const error = new Error(`Instagram media processing failed: ${status.status || status.status_code}`);
      error.meta = status;
      error.status = 422;
      throw error;
    }

    if (attempt < maxAttempts) await sleep(delayMs);
  }

  const error = new Error('Instagram media is still processing. Please retry in a moment.');
  error.status = 503;
  throw error;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const publisherKey = process.env.TSS_PUBLISHER_KEY;
  const providedKey = req.headers['x-tss-publisher-key'];
  if (!publisherKey || !providedKey || providedKey !== publisherKey) {
    return send(res, 401, { ok: false, error: 'Unauthorized' });
  }

  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const instagramUserId = process.env.INSTAGRAM_USER_ID;
  if (!accessToken || !instagramUserId) {
    return send(res, 503, {
      ok: false,
      error: 'Publisher is not configured. Missing Instagram environment variables.',
    });
  }

  const { imageUrl, caption = '', dryRun = false } = req.body || {};

  if (!isHttpsUrl(imageUrl)) {
    return send(res, 400, { ok: false, error: 'imageUrl must be a public HTTPS URL.' });
  }

  if (typeof caption !== 'string' || caption.length > 2200) {
    return send(res, 400, { ok: false, error: 'Caption must be 2,200 characters or fewer.' });
  }

  const hashtagCount = countHashtags(caption);
  if (hashtagCount > 5) {
    return send(res, 400, {
      ok: false,
      error: `TSS publishing rule: maximum 5 hashtags. Received ${hashtagCount}.`,
    });
  }

  if (dryRun === true) {
    return send(res, 200, {
      ok: true,
      dryRun: true,
      validated: {
        imageUrl,
        captionLength: caption.length,
        hashtagCount,
        instagramUserId,
      },
    });
  }

  try {
    const container = await metaPost(`/${instagramUserId}/media`, accessToken, {
      image_url: imageUrl,
      caption,
    });

    if (!container.id) {
      throw new Error('Meta did not return a media container ID.');
    }

    const processing = await waitForContainer(container.id, accessToken);

    const published = await metaPost(`/${instagramUserId}/media_publish`, accessToken, {
      creation_id: container.id,
    });

    return send(res, 200, {
      ok: true,
      containerId: container.id,
      processingStatus: processing.status_code,
      mediaId: published.id || null,
      hashtagCount,
    });
  } catch (error) {
    console.error('Instagram publishing failed', {
      message: error.message,
      status: error.status,
      meta: error.meta,
    });

    return send(res, error.status === 503 ? 503 : 502, {
      ok: false,
      error: error.message || 'Instagram publishing failed.',
      meta: error.meta || undefined,
    });
  }
}
