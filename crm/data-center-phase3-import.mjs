// Phase 3 review overlay. Private manifest is selected locally in an authenticated CRM session.
// Browser-only: no network, storage, tracking, email, or HubSpot changes.
import {validatePhase3HoldManifest} from './data-center-phase3-holds.mjs';
import {rankResearchReview} from './data-center-research-engine.mjs';

export function installPhase3HoldImport({mount,companies,asOf,isCurrent,onApply}={}){
 if(!mount||!Array.isArray(companies)||typeof isCurrent!=='function'||typeof onApply!=='function')
   throw Error('PHASE3_IMPORT_CONTEXT_INVALID');
 const panel=document.createElement('section');
 panel.className='panel';
 const heading=document.createElement('h3');
 heading.textContent='Phase 3 known-exception review file';
 const explanation=document.createElement('p');
 explanation.className='muted';
 explanation.textContent='Choose the restricted Phase 3 JSON on your device or paste its JSON text below. The data is read only in browser memory and is not uploaded or saved. The imported list covers known open exceptions, not every unverified company.';
 const label=document.createElement('label');
 label.textContent='Select private review file';
 const input=document.createElement('input');
 input.type='file';
 input.accept='.json,application/json';
 input.setAttribute('aria-label','Select local Phase 3 known-exception file');
 const pasteLabel=document.createElement('label');
 pasteLabel.textContent='Paste private review JSON';
 const textarea=document.createElement('textarea');
 textarea.setAttribute('aria-label','Paste private Phase 3 known-exception JSON');
 textarea.setAttribute('autocomplete','off');
 textarea.setAttribute('autocapitalize','off');
 textarea.setAttribute('spellcheck','false');
 textarea.rows=5;
 textarea.placeholder='Paste the complete restricted JSON here, then choose Validate pasted JSON.';
 const pasteButton=document.createElement('button');
 pasteButton.type='button';
 pasteButton.textContent='Validate pasted JSON';
 const status=document.createElement('p');
 status.className='muted';
 status.setAttribute('role','status');
 status.textContent='Not loaded. Known Phase 3 identity holds are not yet joined.';
 label.append(input);
 pasteLabel.append(textarea);
 panel.append(heading,explanation,label,pasteLabel,pasteButton,status);
 mount.append(panel);
 function applySource(source,prefix){
   if(typeof source!=='string'||!source.trim())throw Error('MANIFEST_EMPTY');
   if(source.length>256000)throw Error('MANIFEST_TOO_LARGE');
   const reviewed=validatePhase3HoldManifest(source,companies,{asOf});
   const updated=rankResearchReview(companies,{asOf,reviewHoldIds:reviewed.holdIds});
   if(!isCurrent())return;
   onApply(updated,reviewed);
   status.textContent=reviewed.count+' known-open Company IDs added to the private research hold overlay from '+prefix+'. No Company identity cleared and no HubSpot promotion authorized. Not a complete hold inventory.';
 }
 input.addEventListener('change',async()=>{
   const file=input.files?.[0];
   if(!file)return;
   try{
     if(file.size>256000)throw Error('MANIFEST_TOO_LARGE');
     const source=await file.text();
     if(!isCurrent())return;
     applySource(source,'local file');
   }catch(e){
     if(isCurrent())status.textContent='File rejected: '+String(e?.message||'INVALID_HOLD_FILE')+'. No review changes applied.';
   }finally{input.value='';}
 });
 pasteButton.addEventListener('click',()=>{
   try{
     if(!isCurrent())return;
     applySource(textarea.value,'pasted JSON');
     textarea.value='';
   }catch(e){
     if(isCurrent())status.textContent='Pasted JSON rejected: '+String(e?.message||'INVALID_HOLD_JSON')+'. No review changes applied.';
   }
 });
 return {element:panel,input,textarea,pasteButton,status};
}
