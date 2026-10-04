export function captureControls(){return '<h4>Scheduled Outlook capture</h4><p>Capture Inbox and Sent Items into CRM email history every 15 minutes, starting with the last 30 days. This does not send emails.</p><p data-capture-status role="status" aria-live="polite">Capture status not checked.</p><button type="button" data-capture-enable disabled>Enable scheduled Outlook capture</button> <button type="button" data-capture-disable hidden>Pause scheduled capture</button> <button type="button" data-capture-refresh>Refresh capture status</button>';}
export function captureSummary(s){
 const state=s.enabled?'Enabled':s.bound?'Paused':'Not enabled';
 return state+' · '+s.mailbox+'. '+(s.lastSuccessfulCycle?'Last completed cycle: '+s.lastSuccessfulCycle+'. ':'No completed cycle recorded. ')+(s.pending?.length?'Initial/history pages still pending. ':'')+(s.error?'Latest error: '+s.error:'');
}
export function bindCaptureControls(root,request){
 const label=root.querySelector('[data-capture-status]'),enable=root.querySelector('[data-capture-enable]'),disable=root.querySelector('[data-capture-disable]'),refresh=root.querySelector('[data-capture-refresh]');
 let busy=false;
 const check=async()=>{const s=await request('/api/outlook/ingestion/status');label.textContent=captureSummary(s);enable.hidden=s.enabled===true;enable.disabled=false;disable.hidden=s.enabled!==true;return s;};
 const run=async action=>{if(busy)return;busy=true;[enable,disable,refresh].forEach(b=>b.disabled=true);label.textContent=action==='enable'?'Enabling capture…':action==='disable'?'Pausing capture…':'Checking capture…';try{if(action)await request('/api/outlook/ingestion/'+action);await check();}catch(e){label.textContent='Capture status not confirmed: '+e.message+'. Refresh status before retrying.';}finally{busy=false;[enable,disable,refresh].forEach(b=>b.disabled=false);}};
 enable.addEventListener('click',()=>run('enable'));
 disable.addEventListener('click',()=>run('disable'));
 refresh.addEventListener('click',()=>run(''));
 void run('');
}
