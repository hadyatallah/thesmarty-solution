export const CN_CONTEXT_VERSION = 1;
const API='';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=['from','to','subject','text'];
// Per-page UI guards only. Authoritative checks remain in the existing API.
let inFlight=false,sessionSource=()=>'',bound=false;
const outcomes=new Map();
const normEmail=v=>String(v||'').trim().toLowerCase();
function messageValues(d){return {from:normEmail(d.from),to:normEmail(d.to),subject:String(d.subject||'').trim(),text:String(d.text||'').replace(/\r\n/g,'\n').trim()};}
function readCard(card){return Object.fromEntries(fields.map(k=>[k,card.querySelector('[data-email-'+k+']')?.textContent||'']));}
const sameMessage=(a,b)=>fields.every(k=>a[k]===b[k]);
const keyFor=m=>JSON.stringify(fields.map(k=>m[k]));

export function renderEmailDraft(d){
 const m=messageValues(d),email=d.channel==='email';
 const ready=email&&d.approvalReady===true&&m.from==='info@thesmartysolution.com'&&m.to.includes('@')&&m.subject&&m.text;
 const details=['from','to','subject'].filter(k=>m[k]).map(k=>'<li><strong>'+k[0].toUpperCase()+k.slice(1)+':</strong> <span data-email-'+k+'>'+esc(m[k])+'</span></li>').join('');
 const cn=d.cnContext&&typeof d.cnContext==='object'?d.cnContext:null;
 return '<div data-email-card'+(cn?' data-cn-context="'+esc(JSON.stringify(cn))+'"':'')+'><p data-email-stage>Draft only · '+esc(d.channel)+'</p>'+(cn?'<p>Commercial Network Match '+esc(cn.matchId)+' · '+esc(cn.disclosureLevel)+'</p>':'')+'<ul>'+details+'</ul><p data-email-text style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(m.text)+'</p>'+(ready?'<p class="muted">Review the details above. Approve and send sends this exact email. There is no second confirmation.</p><button type="button" class="primary" data-email-approve>Approve and send</button><p data-email-status role="status" aria-live="polite" aria-atomic="true"></p>':'')+'</div>';
}

function showOutcome(card,button,status,result){
 status.textContent=result.message;
 status.classList.toggle('error',result.state==='uncertain'||result.state==='blocked');
 button.textContent=result.state==='succeeded'?'Sent':result.state==='accepted'?'Accepted':result.state==='uncertain'?'Check Sent Items':'Approve and send';
 button.disabled=result.state!=='blocked';
 const label=card.querySelector('[data-email-stage]');
 if(label)label.textContent=({succeeded:'Sent · email',accepted:'Accepted by Microsoft · email',uncertain:'Send status not confirmed · email',blocked:'Draft only · email'})[result.state];
}
async function post(path,body){
 const r=await fetch(API+path,{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json();
 if(!r.ok||data?.ok!==true)throw Error(data?.error||'EMAIL_RESPONSE_UNCONFIRMED');
 return data;
}
const definiteBlocks=new Set(['CN_EMAIL_CONTEXT_INVALID','CN_EMAIL_NOT_AUTHORIZED','CN_EMAIL_CONTEXT_CHANGED','AUTH_REQUIRED','EMAIL_APPROVAL_NOT_APPLICABLE','EMAIL_OUTSIDE_BUSINESS_HOURS','EMAIL_DUPLICATE_RECENT','EMAIL_RECIPIENT_SUPPRESSED','EMAIL_CONTEXT_CHANGED','EMAIL_SENDER_CHANGED','EMAIL_SEND_REJECTED']);
const explanations={
 CN_EMAIL_CONTEXT_INVALID:'Commercial Network context could not be verified. Review the Match again.',
 CN_EMAIL_NOT_AUTHORIZED:'Current Mandate, suppression or disclosure controls do not authorize this communication.',
 CN_EMAIL_CONTEXT_CHANGED:'Commercial Network evidence or authority changed. Review a fresh draft.',
 AUTH_REQUIRED:'Sign in to the CRM again.',
 OUTLOOK_RECONNECT_REQUIRED:'Reconnect Outlook before sending.',
 EMAIL_OUTSIDE_BUSINESS_HOURS:'Sending is limited to the configured Cyprus business hours. No automatic retry is scheduled.',
 EMAIL_RECIPIENT_SUPPRESSED:'This recipient is marked Do not contact.',
 EMAIL_DUPLICATE_RECENT:'A recent matching email is already recorded. Check Sent Items before another send.',
 EMAIL_DETAILS_CHANGED:'The email or signed-in session changed. Review a fresh draft before approving it.',
 EMAIL_PROPOSAL_INVALID:'The server did not confirm the exact email. Refresh and review a fresh draft.',
 EMAIL_APPROVAL_NOT_APPLICABLE:'This approval is no longer valid. Review a fresh draft.',
 EMAIL_SEND_REJECTED:'Microsoft rejected the send request.'
};

// Called only by an explicit click on the approval button below the visible draft.
export async function sendApprovedEmail({card,button,getSession}){
 const status=card.querySelector('[data-email-status]');
 if(!status||button.disabled)return;
 if(inFlight){status.textContent='Another email is being processed. Wait for its result before approving this one.';return;}
 let cnContext=null;try{cnContext=card.dataset?.cnContext?JSON.parse(card.dataset.cnContext):null;}catch{status.textContent='Commercial Network context is invalid. Review a fresh draft.';return;}
 const canonicalCn=value=>value?JSON.stringify(Object.keys(value).sort().map(k=>[k,String(value[k]??'')])):'null';
 const reviewedCn=canonicalCn(cnContext);
 const approved=Object.freeze(readCard(card)),key=keyFor(approved)+reviewedCn;
 if(outcomes.has(key)){showOutcome(card,button,status,outcomes.get(key));return;}
 inFlight=true;button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Checking…';
 status.classList.remove('error');status.textContent='Checking current CRM and Outlook details…';
 let dispatchStarted=false;
 try{
  const session=getSession();
  if(!session)throw Error('AUTH_REQUIRED');
  if(approved.from!=='info@thesmartysolution.com'||!approved.to||!approved.subject||!approved.text)throw Error('EMAIL_DETAILS_CHANGED');
  const data=await post('/api/outlook/send/propose',{session,message:{to:approved.to,subject:approved.subject,text:approved.text},...(cnContext?{cnContext}:{})});
  const p=data.proposal;
  if(!p||typeof p.id!=='string'||!p.id||typeof p.hash!=='string'||!p.hash||!Number.isFinite(Date.parse(p.expiresAt))||Date.parse(p.expiresAt)<=Date.now())throw Error('EMAIL_PROPOSAL_INVALID');
  // Removing the second screen must not approve server-modified content.
  if(!sameMessage(approved,p)||!card.isConnected||!button.isConnected||!sameMessage(approved,readCard(card))||session!==getSession())throw Error('EMAIL_DETAILS_CHANGED');
  if(canonicalCn(p.cnContext||null)!==reviewedCn||canonicalCn(card.dataset?.cnContext?JSON.parse(card.dataset.cnContext):null)!==reviewedCn)throw Error('CN_EMAIL_CONTEXT_CHANGED');
  button.textContent='Sending…';status.textContent='Sending through Microsoft 365. Please wait for the result.';
  dispatchStarted=true;
  const result=await post('/api/outlook/send/approve',{session,id:p.id,hash:p.hash});
  let outcome;
  if(result.status==='succeeded'&&result.receipt?.reconciled===true){
   const at=Date.parse(result.receipt.sentDateTime);
   const time=Number.isFinite(at)?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Nicosia',hour:'2-digit',minute:'2-digit'}).format(at)+' Cyprus time':'';
   outcome={state:'succeeded',message:'Email sent'+(time?' at '+time:'')+'. Confirmed in Outlook Sent Items.'};
  }else if(result.status==='accepted'){
   outcome={state:'accepted',message:'Microsoft accepted this email. Sent Items confirmation is pending. Do not resend.'};
  }else throw Error('EMAIL_RESPONSE_UNCONFIRMED');
  outcomes.set(key,outcome);showOutcome(card,button,status,outcome);
 }catch(err){
  const code=String(err?.message||'EMAIL_RESPONSE_UNCONFIRMED');
  // A connection/UI failure after dispatch is not proof that mail was not sent.
  const uncertain=dispatchStarted&&!definiteBlocks.has(code);
  const outcome=uncertain?{state:'uncertain',message:'Send status not confirmed. Do not resend. Check Outlook Sent Items first.'}:{state:'blocked',message:'Not sent. '+(explanations[code]||'The request could not be completed. '+code)};
  if(uncertain)outcomes.set(key,outcome);
  showOutcome(card,button,status,outcome);
 }finally{inFlight=false;button.removeAttribute('aria-busy');}
}

export function bindOutlookApprovals({session}){
 sessionSource=typeof session==='function'?session:()=>'';
 if(bound)return;bound=true;
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-email-approve]');
  if(!button||button.disabled)return;
  const card=button.closest('[data-email-card]');
  if(card)void sendApprovedEmail({card,button,getSession:()=>sessionSource()});
 });
}

// Cached older callers must never turn a former review-only click into a send.
export async function prepareOutlookSend(){throw Error('Refresh the CRM to use the single-approval email card. Nothing was sent.');}
