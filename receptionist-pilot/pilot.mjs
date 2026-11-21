import {createVoicePilot} from "./browser-peer.mjs";
const el=id=>document.getElementById(id);
const start=el("start"), stop=el("stop"), voice=el("voice"), status=el("status");
const labels={
  starting:"Starting the voice pilot. Allow the microphone if your browser asks.",
  speaking_ready:"Voice connected. Try a short fictional question, then end the test.",
  playback_blocked:"Browser blocked playback. Tap Play voice to continue, or end the test.",
  voice_closed:"Voice test ended. Nothing was emailed or booked.",
  unconfirmed:"The voice test did not finish with confirmation. Do not retry; the existing contact form is available."
};
if(window.isSecureContext&&navigator.mediaDevices?.getUserMedia&&window.RTCPeerConnection){
 const pilot=createVoicePilot({mediaDevices:navigator.mediaDevices,Peer:window.RTCPeerConnection,
   audio:voice,budgetMs:45000,onState:state=>{
     status.textContent=labels[state]??labels.unconfirmed;
     if(state==="playback_blocked"){ voice.hidden=false; voice.controls=true; }
     if(state==="voice_closed"||state==="unconfirmed"){stop.disabled=true; voice.hidden=true; status.tabIndex=-1; status.focus();}
   }});
 const unavailable="The voice test is not open right now. The contact form is available.";
 const check=async()=>{
   try{
     const response=await fetch("/api/tss-receptionist-pilot",{cache:"no-store", credentials:"same-origin",redirect:"error"});
     if(!response.ok)return false;
     const {remainingMs}=await response.json();
     return Number.isSafeInteger(remainingMs)&&remainingMs>0&&remainingMs<=300000?remainingMs:false;
   }catch{return false;}
 };
 void (async()=>{
   const remaining=await check();
   if(!remaining){status.textContent=unavailable;return;}
   status.textContent="Start when ready. One attempt only.";
   start.disabled=false;
   const expiry=setTimeout(()=>{start.disabled=true;status.textContent=unavailable;},remaining);
   start.addEventListener("click",async()=>{
     clearTimeout(expiry);start.disabled=true;
     if(!await check()){status.textContent=unavailable;return;}
     stop.disabled=false;void pilot.start();
   },{once:true});
 })();
 stop.addEventListener("click",()=>{stop.disabled=true;pilot.stop();});
 window.addEventListener("pagehide",()=>pilot.stop(),{once:true});
}else status.textContent="This browser cannot start the voice test. The existing contact form is available.";
