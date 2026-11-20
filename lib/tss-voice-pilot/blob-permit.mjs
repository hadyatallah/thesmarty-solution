// Offline/opt-in adapter. No imports, SDK installation, environment reads, or network defaults.
export const PILOT_PERMIT_ID = "tss-private-live-voice-test-v1";
export const PILOT_PERMIT_PATH = "tss-receptionist-private-test/v1/permit.json";
export const UNCONSUMED = '{"version":1,"state":"unused"}';
export const CONSUMED = '{"version":1,"state":"consumed"}';
const strongEtag = x => typeof x === "string" && /^"[!-~]{1,128}"$/.test(x) && !x.slice(1,-1).includes('"');
const SAFE_ERROR = "permit unavailable";

async function readMarker(stream, signal) {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8",{fatal:true});
  let text="",count=0;
  try {
    for (;;) {
      if(signal.aborted) throw Error(SAFE_ERROR);
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw Error(SAFE_ERROR);
      count+=value.byteLength;
      if (count>64) throw Error(SAFE_ERROR);
      text+=decoder.decode(value,{stream:true});
    }
    return text+decoder.decode();
  } finally {
    reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}

// get/put and loadOidcToken are explicitly injected server-only SDK adapters.
// A separately verified fixed private store & pre-seeded marker are mandatory.
// There is deliberately no create, reset, retry, static-token or user-controlled pathname flow.
export function createBlobPilotPermit({enabled=false,storeId,get,put,loadOidcToken,
    preconditionError,canClaim,deadlineMs=4500}={}) {
  return async function takePermit(id) {
    if(enabled!==true||id!==PILOT_PERMIT_ID||!/^store_[A-Za-z0-9]{8,80}$/.test(storeId??"")||
       typeof get!=="function"||typeof put!=="function"||typeof loadOidcToken!=="function"||typeof canClaim!=="function"||
       !Number.isSafeInteger(deadlineMs)||deadlineMs<100||deadlineMs>10000) return false;
    const timeout=AbortSignal.timeout(deadlineMs);
    try {
      if(canClaim()!==true)return false;
      const oidcToken=await loadOidcToken();
      // Force explicit OIDC tier; absent/invalid cannot fall back to environment's static key.
      if(typeof oidcToken!=="string"||oidcToken.length>12000||
         !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(oidcToken)||timeout.aborted)
        return false;
      const opts={access:"private",storeId,oidcToken,abortSignal:timeout};
      const existing=await get(PILOT_PERMIT_PATH,{...opts,useCache:false});
      if(existing===null)return false;
      const metadata=existing?.blob;
      if(timeout.aborted||existing?.statusCode!==200||metadata?.pathname!==PILOT_PERMIT_PATH||
         !strongEtag(metadata.etag)||!existing.stream||!Number.isSafeInteger(metadata.size)||
         metadata.size<1||metadata.size>64) throw Error(SAFE_ERROR);
      const state=await readMarker(existing.stream,timeout);
      if(state===CONSUMED)return false;
      if(state!==UNCONSUMED||timeout.aborted) throw Error(SAFE_ERROR);
      if(canClaim()!==true)return false;
      const next=await put(PILOT_PERMIT_PATH,CONSUMED,{
        ...opts,contentType:"application/json",allowOverwrite:true,addRandomSuffix:false,
        ifMatch:metadata.etag
      });
      if(timeout.aborted||next?.pathname!==PILOT_PERMIT_PATH||!strongEtag(next.etag)||next.etag===metadata.etag)
        throw Error(SAFE_ERROR);
      return true;
    } catch(error) {
      if(typeof preconditionError==="function"&&error instanceof preconditionError) return false;
      // No upstream operation on uncertainty, and never try to restore the spent marker.
      throw Error(SAFE_ERROR);
    }
  };
}
