// Private GPT-Live WebRTC pilot. Call start only from a visible owner gesture.
export function createVoicePilot({mediaDevices, Peer, audio, request=fetch, onState=()=>{},
  budgetMs=45000, setupMs=10000, closeMs=5000}={}) {
  let current=null;
  let used=false;
  function finish(run,state) {
    if(current!==run) return;
    current=null;
    clearTimeout(run.deadline); clearTimeout(run.ready); clearTimeout(run.drain);
    run.abort.abort();
    run.stream?.getTracks().forEach(t=>t.stop());
    run.events?.close(); run.peer?.close();
    audio.srcObject=null;
    onState(state);
  }
  function stop() {
    const run=current;
    if(!run || run.closing) return;
    run.closing=true;
    run.stream?.getTracks().forEach(t=>{t.enabled=false;});
    if(!run.started || run.events?.readyState!=="open") return finish(run,"unconfirmed");
    clearTimeout(run.deadline);
    run.drain=setTimeout(()=>finish(run,"unconfirmed"),closeMs);
    try { run.events.send(JSON.stringify({type:"session.close"})); }
    catch { finish(run,"unconfirmed"); }
  }
  async function start() {
    if(current||used) return;
    used=true;
    const run={abort:new AbortController(),started:false,closing:false};
    current=run;onState("starting");
    run.deadline=setTimeout(stop,budgetMs);
    try {
      if(!mediaDevices?.getUserMedia||!Peer||!audio) throw Error("unsupported");
      const stream=await mediaDevices.getUserMedia({audio:true,video:false});
      if(current!==run){stream.getTracks().forEach(t=>t.stop());return;}
      run.stream=stream;
      const peer=run.peer=new Peer();
      peer.addEventListener("track", event=>{
        if(current===run && event.streams?.[0]) {
          audio.srcObject=event.streams[0];
          Promise.resolve(audio.play?.()).catch(()=>{ if(current===run) onState("playback_blocked"); });
        }
      });
      peer.addEventListener("connectionstatechange", ()=>{
        if(["failed","closed"].includes(peer.connectionState)) finish(run,"unconfirmed");
      });
      for(const track of stream.getTracks()) peer.addTrack(track,stream);
      const events=run.events=peer.createDataChannel("oai-events");
      events.addEventListener("message", event=>{
        if(current!==run || typeof event.data!=="string" || event.data.length>65536) return;
        let data; try{data=JSON.parse(event.data);}catch{return;}
        if(data.type==="session.started"&&!run.closing){
          run.started=true;clearTimeout(run.ready);onState("speaking_ready");
        }
        if(data.type==="session.closed")finish(run,"voice_closed");
        if(data.type==="error")stop();
      });
      await peer.setLocalDescription(await peer.createOffer());
      if(current!==run) return;
      await iceComplete(peer,run.abort.signal,setupMs);
      if(current!==run || !peer.localDescription?.sdp) throw Error("offer unavailable");
      run.ready=setTimeout(()=>finish(run,"unconfirmed"),setupMs+12000);
      const response=await request("/api/tss-receptionist-pilot",{
        method:"POST",credentials:"same-origin",redirect:"error",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({sdp:peer.localDescription.sdp}),signal:run.abort.signal,
      });
      if(response.status!==201) throw Error("voice endpoint unavailable");
      const {sdp}=await response.json();
      if(current!==run || typeof sdp!=="string" || sdp.length>32768) throw Error("answer unavailable");
      await peer.setRemoteDescription({type:"answer",sdp});
    } catch { finish(run,"unconfirmed"); }
  }
  return {start,stop};
}
function iceComplete(peer,signal,timeoutMs) {
  return new Promise((resolve,reject)=>{
    let timer;
    function done(error){
      clearTimeout(timer);
      signal.removeEventListener("abort",aborted);
      peer.removeEventListener("icegatheringstatechange",check);
      error?reject(error):resolve();
    }
    const aborted=()=>done(new Error("aborted"));
    const check=()=>{if(peer.iceGatheringState==="complete")done();};
    timer=setTimeout(()=>done(new Error("ICE not ready")),timeoutMs);
    peer.addEventListener("icegatheringstatechange",check);
    signal.addEventListener("abort",aborted,{once:true});
    signal.aborted?aborted():check();
  });
}
