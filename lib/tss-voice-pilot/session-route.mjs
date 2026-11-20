// Unwired, fail-closed draft for the single owner-approved private voice test.
const LIVE_URL = "https://api.openai.com/v1/live/sessions";
const LIMIT = 32768;
const PROMPT = "You are the limited pilot receptionist for The Smarty Solution. This is a simulation with fictional details only. Ask what the caller needs and their preferred time. Never say that any inquiry was sent, received or booked. The contact form is the manual fallback. Keep replies short and natural.";
const mediaSdp = (s) => typeof s === "string" && s.length <= LIMIT && /^v=0\r?\n/.test(s) && /\nm=audio /.test(s);
const standardHeaders = {
  "Content-Type":"application/json; charset=utf-8", "Cache-Control":"private, no-store",
  "X-Content-Type-Options":"nosniff", "Referrer-Policy":"no-referrer",
};
const reply = (status, data) => new Response(JSON.stringify(data), {status, headers: standardHeaders});

async function bodyJson(message) {
  if (!message.body) throw new Error("no body");
  if (Number(message.headers.get("content-length")) > LIMIT) throw new RangeError("too large");
  const reader = message.body.getReader();
  const decoder = new TextDecoder("utf-8", {fatal:true});
  let count=0, text="";
  try {
    for (;;) {
      const {done, value}=await reader.read();
      if(done) break;
      count+=value.byteLength;
      if(count>LIMIT) throw new RangeError("too large");
      text+=decoder.decode(value,{stream:true});
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.cancel().catch(()=>{});
  }
}

// verifyOwner must validate the signed Cloudflare Access JWT (issuer, the exact app audience,
// signature, expiry and allowlisted identity). takePermit must be a durable atomic reserve-once
// shared across all Worker instances and versions OF THIS test. There is no in-memory fallback.
export function createSessionRoute({verifyOwner, takePermit, prepareClose, canStartProvider, providerFetch=fetch, now=Date.now}={}) {
  return async (request, env={}) => {
    const url=new URL(request.url);
    if(url.pathname!=="/api/tss-receptionist-pilot"||url.search) return reply(404,{error:"not_found"});
    if(request.method!=="POST") return reply(405,{error:"method_not_allowed"});
    if(env.TSS_PRIVATE_ORIGIN!==url.origin || url.protocol!=="https:" ||
       request.headers.get("origin")!==url.origin) return reply(403,{error:"forbidden"});
    if(typeof verifyOwner!=="function" || typeof takePermit!=="function" || typeof prepareClose!=="function" || typeof canStartProvider!=="function") return reply(503,{error:"pilot_closed"});
    try { if(await verifyOwner(request,env)!==true) return reply(403,{error:"forbidden"}); }
    catch { return reply(403,{error:"forbidden"}); }
    if(env.TSS_LIVE_PILOT!=="armed" || typeof env.OPENAI_API_KEY!=="string" || !env.OPENAI_API_KEY ||
       env.TSS_LIVE_MODEL!=="gpt-live-1.1" || !/^voice_[A-Za-z0-9_-]{4,100}$/.test(env.TSS_LIVE_VOICE_ID??""))
      return reply(503,{error:"pilot_closed"});
    if(request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply(415,{error:"unsupported_type"});
    let payload;
    try { payload=await bodyJson(request); }
    catch(error) { return reply(error instanceof RangeError?413:400,{error:"invalid_offer"}); }
    if(!payload || Object.keys(payload).length!==1 || !mediaSdp(payload.sdp))
      return reply(400,{error:"invalid_offer"});
    if(request.signal.aborted) return reply(408,{error:"request_stopped"});
    try {
      if(canStartProvider()!==true)return reply(503,{error:"pilot_closed"});
      if(await takePermit("tss-private-live-voice-test-v1",env)!==true) return reply(409,{error:"pilot_not_available"});
    } catch { return reply(503,{error:"pilot_closed"}); }
    // The permit stays consumed on any error: provider processing may have happened.
    if(request.signal.aborted) return reply(408,{error:"request_stopped"});
    const session = {
      model:env.TSS_LIVE_MODEL, instructions:PROMPT, delegation:null,
      audio:{output:{voice:{id:env.TSS_LIVE_VOICE_ID}}},
      client:{data_channel:{allowed_client_events:["session.close"],allowed_server_events:["session.started","session.closed","error"]}},
    };
    try {
      if(canStartProvider()!==true)return reply(503,{error:"pilot_closed"});
      const createdStart=now();
      const upstream=await providerFetch(LIVE_URL,{
        method:"POST", redirect:"error",
        headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},
        body:JSON.stringify({session,transport:{type:"webrtc",sdp:payload.sdp}}),
        signal:AbortSignal.any([request.signal,AbortSignal.timeout(12000)]),
      });
      if(upstream.status!==201) return reply(502,{error:"voice_unavailable"});
      const result=await bodyJson(upstream);
      if(typeof result?.session?.id!=="string" || !result.session.id.trim() ||
         result.transport?.type!=="webrtc" || !mediaSdp(result.transport.sdp))
        return reply(502,{error:"voice_unavailable"});
      if(await prepareClose(result.session.id,createdStart,env)!==true) return reply(502,{error:"voice_unavailable"});
      // Do not pass through upstream headers, session ID, config, diagnostics or errors.
      return reply(201,{sdp:result.transport.sdp});
    } catch { return reply(502,{error:"voice_unavailable"}); }
  };
}
