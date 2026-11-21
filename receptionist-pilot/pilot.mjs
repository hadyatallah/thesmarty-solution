import {createVoicePilot} from "./browser-peer.mjs";
const el=id=>document.getElementById(id);
const start=el("start"), stop=el("stop"), voice=el("voice"), status=el("status");
const fallback=" The existing contact form is available.";
const labels={
  microphone_request:"Waiting for microphone permission. Tap Allow if your browser asks.",
  microphone_unavailable:"The microphone could not be opened."+fallback,
  microphone_timeout:"The microphone did not become ready in time."+fallback,
  ice_gathering:"Microphone ready. Preparing the browser voice connection.",
  ice_unavailable:"The browser could not prepare the voice connection."+fallback,
  endpoint_request:"Browser connection prepared. Contacting TSS for the voice test.",
  endpoint_rejected:"The TSS voice endpoint did not accept this attempt. Do not retry."+fallback,
  endpoint_unavailable:"The TSS voice endpoint is unavailable. Do not retry."+fallback,
  endpoint_timeout:"The voice connection did not confirm in time. Do not retry."+fallback,
  browser_connection_failed:"The browser voice connection failed to confirm. Do not retry."+fallback,
  speaking_ready:"Voice connected. Try a short fictional question, then end the test.",
  playback_blocked:"Browser blocked playback. Tap Play voice to continue, or end the test.",
  voice_closed:"Voice test ended. Nothing was emailed or booked.",
  unconfirmed:"The voice test did not finish with confirmation. Do not retry; the existing contact form is available."
};
const active=new Set(["microphone_request","ice_gathering","endpoint_request","speaking_ready","playback_blocked"]);
const unavailable="The voice test is not open right now."+fallback;
const timedOut="The readiness check took too long. No voice call was started."+fallback;
const readinessFailed="The site could not check voice readiness. No voice call was started."+fallback;

// Listen on a strict deadline even if the browser/transport never settles the request or JSON body.
export async function checkReadiness({request=fetch,timeoutMs=5000}={}){
 const abort=new AbortController();
 let deadline;
 try{
   const result=await Promise.race([
     new Promise(resolve=>{deadline=setTimeout(()=>{resolve({kind:"timeout"});abort.abort();},timeoutMs);}),
     (async()=>{
       try{
         const response=await request("/api/tss-receptionist-pilot",{
           method:"GET",cache:"no-store",credentials:"same-origin",redirect:"error",signal:abort.signal
         });
         if(!response.ok)return {kind:"unavailable"};
         const {remainingMs}=await response.json();
         return Number.isSafeInteger(remainingMs)&&remainingMs>0&&remainingMs<=300000?
           {kind:"ready",remainingMs}:{kind:"unavailable"};
       }catch{return {kind:"failed"};}
     })(),
   ]);
   return result;
 }finally{clearTimeout(deadline);}
}
const explain=result=>result.kind==="timeout"?timedOut:result.kind==="failed"?readinessFailed:unavailable;
if(window.isSecureContext&&navigator.mediaDevices?.getUserMedia&&window.RTCPeerConnection){
 let leaving=false;
 const pilot=createVoicePilot({mediaDevices:navigator.mediaDevices,Peer:window.RTCPeerConnection,
   audio:voice,budgetMs:45000,onState:state=>{
     if(leaving)return;
     status.textContent=labels[state]??labels.unconfirmed;
     if(state==="playback_blocked"){voice.hidden=false;voice.controls=true;}
     if(!active.has(state)){stop.disabled=true;voice.hidden=true;status.tabIndex=-1;status.focus();}
   }});
 void (async()=>{
   const first=await checkReadiness();
   if(leaving)return;
   if(first.kind!=="ready"){status.textContent=explain(first);return;}
   status.textContent="Start when ready. One attempt only.";
   start.disabled=false;
   const expiry=setTimeout(()=>{start.disabled=true;status.textContent=unavailable;},first.remainingMs);
   start.addEventListener("click",async()=>{
     clearTimeout(expiry);
     start.disabled=true;
     status.textContent="Checking the voice test is still open…";
     const second=await checkReadiness();
     if(leaving)return;
     if(second.kind!=="ready"){status.textContent=explain(second);return;}
     stop.disabled=false;void pilot.start();
   },{once:true});
 })();
 stop.addEventListener("click",()=>{stop.disabled=true;pilot.stop();});
 window.addEventListener("pagehide",()=>{leaving=true;pilot.stop();},{once:true});
}else status.textContent="This browser cannot start the voice test."+fallback;
