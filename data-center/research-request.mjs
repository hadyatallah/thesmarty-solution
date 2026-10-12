/*
 * TSS Data Center to ChatGPT: send the selected Company's NAME ONLY.
 * Company identity comes from the existing authenticated directory.
 * No new OAuth, API, backend, storage, research or write capability.
 */
import {text} from './model.mjs';

export function prepareCompanyNameForChatGPT(company){
 const name=text(company?.name),id=text(company?.id);
 if(!id||id.length>90||!name||name.length>250){
  return Object.freeze({status:'BLOCKED',companyName:'',errors:Object.freeze([
   'Select an existing Company with a valid name.'
  ]),writesPerformed:0});
 }
 return Object.freeze({
  status:'READY_TO_COPY',
  companyName:name,
  errors:Object.freeze([]),
  writesPerformed:0
 });
}
