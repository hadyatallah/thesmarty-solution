export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'GET only' });
  const target = 'https://script.google.com/macros/s/AKfycbyVmqjxRsbdMoIrqGqETiFbOyOumjY3da_aUbThEn_8LdRN7CZFPDPMNUkWRaGJdHWRsQ/exec';
  const started = Date.now();
  try {
    const r = await fetch(target, {
      method: 'POST',
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ fn:'beginGoogleLogin', args:[] })
    });
    const text = await r.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    return res.status(200).json({
      diagnostic:true,
      elapsedMs:Date.now()-started,
      upstreamStatus:r.status,
      upstreamOk:r.ok,
      upstreamUrl:r.url,
      contentType:r.headers.get('content-type') || '',
      body: parsed || text.slice(0,2000)
    });
  } catch (e) {
    return res.status(200).json({
      diagnostic:true,
      elapsedMs:Date.now()-started,
      networkError:String(e && e.message || e)
    });
  }
}