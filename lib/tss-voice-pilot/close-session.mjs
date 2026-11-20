// Server-side duration control for one public call. No audio or events are logged/persisted.
const urlStart="wss://api.openai.com/v1/live/sessions/";
export function createCloseSupervisor({Socket,waitUntil,now=Date.now,attachMs=2000,
                                        closeAtMs=35000,drainMs=5000}){
  return async (id,startedAt,env)=>{
    if(typeof id!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(id)||typeof Socket!=="function"||
      typeof waitUntil!=="function"||!env.OPENAI_API_KEY||now()>=startedAt+closeAtMs)return false;
    let socket, armed=false, done=false, closeTimer, drainTimer, ready;
    const ack=new Promise(resolve=>{ ready=resolve; });
    let finish;
    const job=new Promise(resolve=>{finish=resolve;});
    const clean=()=>{
      if(done)return;done=true;
      clearTimeout(closeTimer);clearTimeout(drainTimer);
      ready(false);try{ socket?.close(); }catch{}
      finish();
    };
    try{
      socket=new Socket(urlStart+id+"/attach",{headers:{Authorization:"Bearer "+env.OPENAI_API_KEY},
        handshakeTimeout:attachMs,maxPayload:262144,followRedirects:false});
      closeTimer=setTimeout(()=>{
        if(!armed||socket.readyState!==1){clean();return;}
        try{socket.send(JSON.stringify({type:"session.close"}));drainTimer=setTimeout(clean,drainMs);}
        catch{clean();}
      },Math.max(0,startedAt+closeAtMs-now()));
      socket.on("message",raw=>{
        try{if(JSON.parse(String(raw))?.type==="session.closed")clean();}catch{}
      });
      socket.once("error",clean);
      socket.once("close",clean);
      socket.once("open",()=>{
        if(!done&&now()<startedAt+closeAtMs){armed=true;ready(true);}
        else clean();
      });
      waitUntil(job);
      const timer=setTimeout(clean,attachMs);
      const ok=await ack;
      clearTimeout(timer);
      return ok&&!done;
    }catch{clean();return false;}
  };
}
