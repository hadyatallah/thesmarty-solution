export async function checkMicrophone({secure,topLevel,media,policy}){
 if(!secure||!topLevel||typeof media?.getUserMedia!=="function")return "unavailable";
 if(typeof policy?.allowsFeature==="function"){
  try{if(policy.allowsFeature("microphone")===false)return "site_blocked";}catch{}
 }
 let stream;
 try{
  stream=await media.getUserMedia({audio:true,video:false});
  return stream?.getAudioTracks().some(track=>track.readyState==="live")?"passed":"device_missing";
 }catch(e){
  if(["NotAllowedError","PermissionDeniedError","SecurityError"].includes(e?.name))return "permission_denied";
  if(["NotFoundError","DevicesNotFoundError"].includes(e?.name))return "device_missing";
  return "unavailable";
 }finally{
  for(const t of stream?.getTracks?.()??[]){try{t.stop();}catch{}}
 }
}
export async function checkLocalConnection({Peer,timeoutMs=10000}){
 if(typeof Peer!=="function")return "peer_unsupported";
 let peer,timer,listener,cancelled=false;
 try{
  // No STUN/TURN servers, peer, network submission or microphone attached.
  peer=new Peer({iceServers:[]});
  peer.addTransceiver("audio",{direction:"sendrecv"});
  await Promise.race([
   (async()=>{
    const offer=await peer.createOffer();
    if(cancelled)return;
    await peer.setLocalDescription(offer);
    if(cancelled)return;
    if(peer.iceGatheringState==="complete")return;
    await new Promise(resolve=>{
     listener=()=>{if(peer.iceGatheringState==="complete")resolve();};
     peer.addEventListener("icegatheringstatechange",listener);
     listener();
    });
   })(),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("timeout")),timeoutMs);})
  ]);
  return "passed";
 }catch{return "connection_failed";}
 finally{
  cancelled=true;clearTimeout(timer);
  if(peer&&listener)peer.removeEventListener("icegatheringstatechange",listener);
  try{peer?.close();}catch{}
 }
}
export function attachPreflight({button,status,check}){
 if(!button||!status)return;
 const strings={
  passed:"Microphone and browser setup worked. No call was started.",
  peer_unsupported:"Microphone access worked, but this browser does not support internet calls. No call was started.",
  connection_failed:"Microphone access worked, but the browser could not prepare the call connection. No call was started.",
  site_blocked:"The page cannot access your microphone. Use the contact form.",
  permission_denied:"Microphone permission was not granted. Use the contact form or check your browser permissions.",
  device_missing:"No microphone was available. You can still use the contact form.",
  unavailable:"The microphone check could not run. You can still use the contact form.",
 };
 let pending=false;
 button.addEventListener("click",async()=>{
  if(pending)return;
  pending=true;button.disabled=true;
  status.textContent="Checking the microphone and browser. Allow microphone access if asked.";
  try{const result=await check();status.textContent=strings[result]??strings.unavailable;}
  catch{status.textContent=strings.unavailable;}
  finally{pending=false;button.disabled=false;}
 });
 button.disabled=false;
}
if(typeof document!=="undefined"){
 attachPreflight({
  button:document.getElementById("tss-check-mic"),status:document.getElementById("tss-mic-status"),
  check:async()=>{
   const mic=await checkMicrophone({secure:window.isSecureContext,topLevel:window.top===window.self,
    media:navigator.mediaDevices, policy:document.permissionsPolicy??document.featurePolicy});
   return mic==="passed"?checkLocalConnection({Peer:window.RTCPeerConnection}):mic;
  },
 });
}
