import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireResearchLock, IRC_LOCK_ID, IRC_LOCK_KEY } from '../lib/tssIrcLock.mjs';
function server(initial) {
  let metadata=initial;
  const calls=[];
  return {get metadata(){return metadata;},calls,fetcher:async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    const result=(status,body)=>({ok:status===200,status,json:async()=>body});
    if(url.endsWith('/developerMetadata:search'))return result(200,{matchedDeveloperMetadata:metadata?[{developerMetadata:structuredClone(metadata)}]:[]});
    assert.match(url,/\/spreadsheets\/1KFLZk_IlFY64IMpEW63wYvJdNF5jmfjZoRM79aVbBKs:batchUpdate$/);
    let next=metadata;
    for(const request of JSON.parse(options.body).requests){
      if(request.deleteDeveloperMetadata){const lookup=request.deleteDeveloperMetadata.dataFilter.developerMetadataLookup;if(next&&next.metadataId===lookup.metadataId&&next.metadataKey===lookup.metadataKey&&next.metadataValue===lookup.metadataValue)next=undefined;}
      if(request.createDeveloperMetadata){if(next)return result(400,{});next=structuredClone(request.createDeveloperMetadata.developerMetadata);}
    }
    metadata=next;return result(200,{replies:[]});
  }};
}
test('independent concurrent workers get one server-side execution owner',async()=>{
  const s=server();
  const attempts=await Promise.allSettled([1,2,3].map(n=>acquireResearchLock('synthetic','RUN-'+n,{fetcher:s.fetcher,now:()=>1000})));
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
  for(const x of attempts.filter(x=>x.status==='rejected'))assert.equal(x.reason.message,'IRC_RUN_IN_PROGRESS');
  await attempts.find(x=>x.status==='fulfilled').value.release();
  assert.equal(s.metadata,undefined);
});
test('expired owner is replaced atomically and cannot release its successor',async()=>{
  const s=server();
  const old=await acquireResearchLock('synthetic','OLD',{fetcher:s.fetcher,now:()=>1000});
  const contenders=await Promise.allSettled([1,2].map(n=>acquireResearchLock('synthetic','RECOVERY-'+n,{fetcher:s.fetcher,now:()=>700000})));
  assert.equal(contenders.filter(x=>x.status==='fulfilled').length,1);
  const current=s.metadata.metadataValue;
  await old.release();
  assert.equal(s.metadata.metadataValue,current);
  await contenders.find(x=>x.status==='fulfilled').value.release();
  assert.equal(s.metadata,undefined);
});
test('foreign or invalid metadata is never overwritten',async()=>{
  for(const metadata of [{metadataId:IRC_LOCK_ID,metadataKey:'unrelated',metadataValue:'private'}, {metadataId:IRC_LOCK_ID,metadataKey:IRC_LOCK_KEY,metadataValue:'malformed'}]){
    const s=server(metadata);
    await assert.rejects(acquireResearchLock('synthetic','RUN',{fetcher:s.fetcher,now:()=>700000}),/IRC_LOCK_(ID_CONFLICT|INVALID)/);
    assert.deepEqual(s.metadata,metadata);
  }
});
test('provider errors expose a fixed code, never an upstream response body',async()=>{
  await assert.rejects(acquireResearchLock('synthetic','RUN',{fetcher:async()=>({ok:false,status:403,json:async()=>({secret:'private'})})}),/^Error: IRC_LOCK_PROVIDER_403$/);
});
