const API='https://api.thesmartysolution.com';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function prepareOutlookSend({session,message,dialog}){
 const r=await fetch(API+'/api/outlook/send/propose',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,message})});
 const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'EMAIL_PROPOSAL_FAILED');
 const p=data.proposal;
 dialog.innerHTML='<h3>Approve exact Outlook email</h3><p><strong>From:</strong> '+esc(p.from)+'</p><p><strong>To:</strong> '+esc(p.to)+'</p><p><strong>Subject:</strong> '+esc(p.subject)+'</p><pre style="white-space:pre-wrap">'+esc(p.text)+'</pre><p class="muted">Approval applies only to this exact email and expires shortly.</p><button type="button" data-send-email>Approve exact email and send</button> <button type="button" data-close>Cancel</button><p data-send-status role="status"></p>';
 if(!dialog.open)dialog.showModal();
 dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
 dialog.querySelector('[data-send-email]').addEventListener('click',async e=>{
  e.currentTarget.disabled=true;const status=dialog.querySelector('[data-send-status]');status.textContent='Sending through Microsoft 365…';
  try{
   const sr=await fetch(API+'/api/outlook/send/approve',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,id:p.id,hash:p.hash})});
   const sd=await sr.json();if(!sr.ok||!sd.ok)throw Error(sd.error||'EMAIL_SEND_FAILED');
   status.textContent=sd.status==='succeeded'?'Sent and reconciled with Microsoft 365 at '+sd.receipt.sentDateTime+'.':'Accepted by Microsoft 365 at '+sd.receipt.acceptedAt+'. Sent Items reconciliation is still pending. Do not resend.';e.currentTarget.remove();
  }catch(err){status.textContent=err.message==='EMAIL_SEND_UNCERTAIN'?'Outcome uncertain. Do not retry. Check Sent Items first.':'Not sent: '+err.message;e.currentTarget.disabled=false;}
 });
}
