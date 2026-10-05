export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'GET only'});
  const target='https://www.thesmartysolution.com/api/crm';
  const started=Date.now();
  try{
    const r=await fetch(target,{
      method:'POST',
      redirect:'manual',
      headers:{'Content-Type':'application/json','Origin':'https://www.thesmartysolution.com'},
      body:JSON.stringify({fn:'beginGoogleLogin',args:[]})
    });
    const body=await r.json().catch(()=>null);
    return res.status(200).json({
      diagnostic:true,
      elapsedMs:Date.now()-started,
      gatewayStatus:r.status,
      gatewayOk:r.ok,
      bodyOk:!!body?.ok,
      hasNonce:typeof body?.result?.nonce==='string'&&body.result.nonce.length>10,
      error:body?.error||null
    });
  }catch(e){
    return res.status(200).json({diagnostic:true,elapsedMs:Date.now()-started,gatewayStatus:0,gatewayOk:false,bodyOk:false,hasNonce:false,error:String(e?.message||e)});
  }
}