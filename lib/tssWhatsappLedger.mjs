import {createHash} from 'node:crypto';
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ROOT='projects/tss-crm-508908/databases/(default)/documents/tss_whatsapp_operations';
const safeId=id=>typeof id==='string'&&/^[a-f0-9]{64}_[a-z0-9_]{1,80}$/.test(id);
export function seal(record,previousHash='') {
  const data={schemaVersion:1,...record,previousHash};
  return {...data,recordHash:digest(data)};
}
export function validSeal(record) {
  if(!record||typeof record!=='object')return false;
  const {recordHash,...data}=record;return recordHash===digest(data);
}
// Real create-only Firestore adapter. No update, delete or collection override.
// Identity/IAM must be approved separately. Never reuse the session writer.
export function firestoreLedger({getToken,fetcher=fetch}) {
  async function call(id,method,record) {
    if(!safeId(id))throw Error('audit_id_invalid');
    const create=method==='POST';
    const url=create?'https://firestore.googleapis.com/v1/'+ROOT+'?documentId='+id:
      'https://firestore.googleapis.com/v1/'+ROOT+'/'+id;
    const response=await fetcher(url,{method,redirect:'error',signal:AbortSignal.timeout(8000),
      headers:{authorization:'Bearer '+await getToken(),'content-type':'application/json'},
      ...(create?{body:JSON.stringify({fields:{record:{stringValue:JSON.stringify(record)}}})}:{})});
    if(create&&response.status===409){const body=await response.json().catch(()=>({}));if(body.error?.status==='ALREADY_EXISTS')return false;}
    if(!create&&response.status===404)return null;
    if(!response.ok)throw Error('audit_unavailable');
    if(create)return true;
    let recordValue;try{recordValue=JSON.parse((await response.json()).fields.record.stringValue);}catch{throw Error('audit_corrupt');}
    if(!validSeal(recordValue))throw Error('audit_integrity_failed');
    return recordValue;
  }
  return {create:async(id,record)=>{if(!validSeal(record))throw Error('audit_unsealed');return call(id,'POST',record);},get:id=>call(id,'GET')};
}
