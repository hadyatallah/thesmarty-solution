export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'GET only' });
  const target = 'https://script.google.com/macros/s/AKfycbyVmqjxRsbdMoIrqGqETiFbOyOumjY3da_aUbThEn_8LdRN7CZFPDPMNUkWRaGJdHWRsQ/exec';
  const post = async payload => {
    const started = Date.now();
    const r = await fetch(target, {
      method:'POST', redirect:'follow', cache:'no-store',
      headers:{'Content-Type':'text/plain;charset=UTF-8'},
      body:JSON.stringify(payload)
    });
    const text = await r.text();
    let body=text; try{body=JSON.parse(text)}catch{}
    return {elapsedMs:Date.now()-started,status:r.status,ok:r.ok,url:r.url,contentType:r.headers.get('content-type')||'',body};
  };
  try {
    const begin = await post({fn:'beginGoogleLogin',args:[]});
    let invalidCredential = null;
    const nonce = begin && begin.body && begin.body.result && begin.body.result.nonce;
    if (nonce) invalidCredential = await post({fn:'googleSignIn',args:['invalid-diagnostic-token',nonce]});
    return res.status(200).json({diagnostic:true,begin,invalidCredential});
  } catch(e) {
    return res.status(200).json({diagnostic:true,networkError:String(e&&e.message||e)});
  }
}