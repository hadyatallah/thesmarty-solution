// Synthetic-only localhost server for browser acceptance. No external network call is made.
import http from 'node:http';
import {harness,response} from './session-support.mjs';
import {makeHandler} from '../api/crm-session.js';
let h=harness();h.setNow(Date.now());
const handler=()=>makeHandler({env:h.env,clock:h.clock,call:h.call});
const server=http.createServer(async(req,res)=>{
 let raw='';for await (const chunk of req){raw+=chunk;if(raw.length>1000000){res.writeHead(413).end();return;}}
 try{
  const input=raw?JSON.parse(raw):{};
  if(req.url==='/control'){
   if(input.reset){h=harness();h.setNow(Date.now());}
   if(input.revoke)for(const s of h.store.values())s.revoked=true;
   if(input.advance)h.advance(input.advance);
   if(input.outage!==undefined)h.behavior.outage=input.outage;
   if(input.enabled!==undefined)h.env.TSS_CRM_BROWSER_SESSION_ENABLED=String(input.enabled);
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({calls:h.calls.map(x=>x.fn),sessions:h.store.size}));return;
  }
  if(req.url==='/native'){
   let value;try{value={ok:true,result:await h.call(input.fn,input.args)};}catch(e){value={ok:false,error:e.message};}
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:200,headers:{'content-type':'application/json'},value}));return;
  }
  if(req.url!=='/dispatch'){res.writeHead(404).end();return;}
  const r=response();await handler()({method:input.method,headers:input.headers,body:input.body},r);
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:r.statusCode,headers:r.headers,value:r.value||null}));
 }catch{res.writeHead(500,{'Content-Type':'application/json'}).end('{"error":"synthetic fixture failure"}');}
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port})));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
