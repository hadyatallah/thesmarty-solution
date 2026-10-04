const BACKEND='https://script.google.com/macros/s/AKfycbyVmqjxRsbdMoIrqGqETiFbOyOumjY3da_aUbThEn_8LdRN7CZFPDPMNUkWRaGJdHWRsQ/exec';
export async function crmCall(fn,args){
 let r=await fetch(BACKEND,{method:'POST',redirect:'manual',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({fn,args})});
 if([302,303].includes(r.status)){
  const target=new URL(r.headers.get('location')||'',BACKEND);
  if(target.protocol!=='https:'||target.hostname!=='script.googleusercontent.com'||target.username||target.password||target.port)throw Error('CRM_AUTH_UNAVAILABLE');
  r=await fetch(target.href,{method:'GET',redirect:'manual'});
 }
 if(!r.ok)throw Error('CRM_AUTH_UNAVAILABLE');
 const data=await r.json().catch(()=>null);
 if(!data?.ok)throw Error(data?.error||'AUTH_REQUIRED');
 return data.result;
}
