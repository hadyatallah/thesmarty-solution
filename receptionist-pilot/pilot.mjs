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
 status.textContent="Start when ready. One attempt only.";
 start.disabled=false;
 start.addEventListener("click",()=>{start.disabled=true; stop.disabled=false; void pilot.start();});
 stop.addEventListener("click",()=>{stop.disabled=true;pilot.stop();});
 window.addEventListener("pagehide",()=>pilot.stop(),{once:true});
}else status.textContent="This browser cannot start the voice test. The existing contact form is available.";
