export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({ok:false});
 const origin='https://www.thesmartysolution.com';
 const target='https://'+req.headers.host+'/api/crm';
 const started=Date.now();
 try{
  const r=await fetch(target,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','Origin':origin},body:JSON.stringify({fn:'beginGoogleLogin',args:[]})});
  const body=await r.json().catch(()=>null);
  return res.status(200).json({smoke:true,status:r.status,elapsedMs:Date.now()-started,ok:!!body?.ok,hasNonce:typeof body?.result?.nonce==='string'&&body.result.nonce.length>10,error:body?.error||null});
 }catch(e){return res.status(200).json({smoke:true,status:0,elapsedMs:Date.now()-started,ok:false,error:String(e?.message||e)});}
}