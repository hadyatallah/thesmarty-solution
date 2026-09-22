import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {makeHandler as crmTransport} from './crm-command.js';
export const config={maxDuration:60};
export function publicIPv4(address){
 if(isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
export function researchUrl(value){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.port||isIP(u.hostname)||u.hostname.startsWith('[')||!u.hostname.includes('.')||/\.(?:local|localhost|internal|test|invalid)$/i.test(u.hostname))throw Error('PUBLIC_HTTPS_WEBSITE_REQUIRED');
 u.hash='';return u;
}
// Resolve once, reject non-public IPv4 answers, then pin the TLS request to that
// validated address. The original hostname still controls certificate validation.
function requestPage(url,address){return new Promise((resolve,reject)=>{
 const req=https.get(url,{family:4,autoSelectFamily:false,lookup:(_host,_options,cb)=>cb(null,address,4),headers:{'User-Agent':'TSS-Company-Research/1.0','Accept':'text/html'},timeout:8000},res=>{
  if([301,302,303,307,308].includes(res.statusCode)){res.resume();return resolve({redirect:res.headers.location});}
  if(res.statusCode!==200||!/^text\/html(?:;|$)/i.test(res.headers['content-type']||'')){res.resume();return reject(Error('PUBLIC_PAGE_UNAVAILABLE'));}
  let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>262144){res.destroy();reject(Error('PUBLIC_PAGE_TOO_LARGE'));}else chunks.push(chunk);});res.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8')}));res.on('error',()=>reject(Error('PUBLIC_PAGE_UNAVAILABLE')));
 });const deadline=setTimeout(()=>req.destroy(Error('PUBLIC_PAGE_TIMEOUT')),10000);req.on('close',()=>clearTimeout(deadline));req.on('timeout',()=>req.destroy(Error('PUBLIC_PAGE_TIMEOUT')));req.on('error',()=>reject(Error('PUBLIC_PAGE_UNAVAILABLE')));
});}
export async function fetchPublicPage(value,{resolve=lookup,request=requestPage}={}){
 let url=researchUrl(value);
 for(let attempt=0;attempt<4;attempt++){
  const answers=await resolve(url.hostname,{family:4,all:true});
  if(!answers.length||answers.some(x=>!publicIPv4(x.address)))throw Error('PUBLIC_ADDRESS_REQUIRED');
  const page=await request(url,answers[0].address);
  if(page.redirect){url=researchUrl(new URL(page.redirect,url).href);continue;}
  return {url:url.href,html:page.html};
 }
 throw Error('TOO_MANY_REDIRECTS');
}
const plain=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|quot|apos|lt|gt);/g,x=>({'&nbsp;':' ','&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[x])).replace(/\s+/g,' ').trim().slice(0,1200);
export function extractEvidence(page,now=new Date()){
 const html=page.html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 const title=plain(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]);
 const tags=html.match(/<meta\b[^>]*>/gi)||[];let description='';
 for(const tag of tags){const attrs=Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(m=>[m[1].toLowerCase(),m[3]]));if((attrs.name||'').toLowerCase()==='description'){description=plain(attrs.content);break;}}
 const checkedAt=now.toISOString();
 return {facts:[...(title?[{text:'Website title: '+title,url:page.url,checkedAt,kind:'observed_page_metadata'}]:[]),...(description?[{text:'Company website description: '+description,url:page.url,checkedAt,kind:'company_claim_not_independently_verified'}]:[])],assumptions:[],recommendations:['Review the source and CRM communication history before choosing an outreach angle.'],limitations:['Website metadata only; not a full company investigation. Company descriptions are self-published claims. No need, budget, buying intent or TSS fit is inferred. No public search or social-platform coverage.']};
}
export function makeResearchHandler({authenticate=crmTransport(),fetchPage=fetchPublicPage}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({ok:false,error:'INVALID_REQUEST'});}
 if(!body||typeof body.url!=='string'||body.url.length>2048)return res.status(400).json({ok:false,error:'WEBSITE_REQUIRED'});
 // Reuse the existing session authority, origin checks and no-retry transport.
 let authStatus=500,authValue;await authenticate({...req,body:{fn:'ccState',args:[body.session]}},{setHeader(){},status(n){authStatus=n;return this;},json(v){authValue=v;return this;}});
 if(authStatus!==200||authValue?.ok!==true)return res.status(authStatus===200?401:authStatus).json({ok:false,error:'CRM_AUTHENTICATION_REQUIRED'});
 try{return res.status(200).json({ok:true,result:extractEvidence(await fetchPage(body.url))});}
 catch{return res.status(422).json({ok:false,error:'Public website unavailable or unsupported. No research facts were invented.'});}
};}
export default makeResearchHandler();
