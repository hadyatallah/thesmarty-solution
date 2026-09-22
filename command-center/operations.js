import {day,validDate} from './crm.js';
export const serviceNames=['Website enquiries','CRM transfers','Outlook ingestion','Jobs','Backups','Website','Analytics','Deployment','Social'];
export function health(evidence,now=new Date()) {
 if(!evidence)return {status:'unknown',reason:'No business-event evidence',checkedAt:now.toISOString()};
 if(evidence.errorCode || evidence.status==='Failed')return {...evidence,status:'failed',checkedAt:now.toISOString()};
 if(Number(evidence.backlog)>0)return {...evidence,status:'warning',reason:'Pending business events',checkedAt:now.toISOString()};
 if(!validDate(evidence.lastBusinessSuccess))return {...evidence,status:'unknown',reason:'Scheduler or availability signal alone does not prove business success',checkedAt:now.toISOString()};
 if(!Number.isFinite(evidence.maxAgeMs))return {...evidence,status:'unverified',reason:'Business event recorded; freshness rule is not configured',checkedAt:now.toISOString()};
 const age=now-Date.parse(evidence.lastBusinessSuccess);
 if(age<0)return {...evidence,status:'warning',reason:'Future-dated event requires review',checkedAt:now.toISOString()};
 return {...evidence,status:age>evidence.maxAgeMs?'warning':'healthy',reason:age>evidence.maxAgeMs?'Last business success is stale':'Business-event evidence within configured window',checkedAt:now.toISOString()};
}
export function enquiryStatus(row){
 if(!row?.enquiryId)return {status:'unknown',reason:'No persisted receipt'};
 if(row.crmSyncStatus==='Synced' && row.linkedRecordIds?.length)return {status:'completed',reference:row.enquiryId};
 if(/fail|review/i.test(row.crmSyncStatus||''))return {status:'failed',reference:row.enquiryId};
 return {status:'pending',reference:row.enquiryId,reason:'Enquiry persisted; CRM transfer not proven'};
}
export function contentDraft(date=new Date()) {
 const topics=['Follow-up','Customer management','Practical AI','Business development','Communication','SME operations'];
 const d=day(date),weekday=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Nicosia',weekday:'short'}).format(date);
 if(weekday==='Sun')return {date:d,state:'Draft',items:[],reason:'Sunday has no planned posting'};
 const topic=topics[['Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(weekday)]||topics[0];
 return {date:d,state:'Draft',topic,items:[
  {format:'Feed',width:1080,height:1350,headline:'Keep the next action clear',caption:'A useful customer record should tell you what happens next. Give each active conversation a next action and a follow-up date. The Smarty Solution helps businesses make customer work easier to manage.',hashtags:['#TheSmartySolution','#CustomerManagement','#BusinessDevelopment'],visualBrief:'Realistic professional desk and planning scene. TSS approved logo unchanged, navy and teal. No location claim.'},
  {format:'Story',width:1080,height:1920,headline:'Who needs a follow-up today?',caption:'Review active conversations. Set the next action.',visualBrief:'Different professional business image. Approved TSS logo unchanged.'},
  {format:'Reel',width:1080,height:1920,headline:'From enquiry to next action',script:['An enquiry arrives.','Capture the details.','Assign the next action.','Follow up.'],visualBrief:'Three short business workflow scenes. Generated people must not be described as TSS staff or customers.'}
 ],limitations:['Concepts only. Final image/video assets, logo inspection, factual review and exact-package approval are still required. No item is scheduled or published.']};
}
export function reviewContent(item) {
 const errors=[];
 if(!['Feed','Story','Reel'].includes(item.format))errors.push('Unsupported format');
 const height=item.format==='Feed'?1350:1920;
 if(item.width!==1080||item.height!==height)errors.push('Incorrect dimensions');
 if((item.hashtags||[]).length>5)errors.push('More than five hashtags');
 if(item.landmark && !item.landmarkEvidence)errors.push('Unverified landmark');
 if((item.claims||[]).some(c=>!c.source||!c.checkedAt))errors.push('Unsupported factual claim');
 if(item.positioning==='real_estate_agency'||/we (?:are|at TSS are) (?:a |an )?real estate (?:agency|company)/i.test(item.caption||''))errors.push('Wrong TSS positioning');
 if(!item.assetHash||!item.assetReference||item.finalAssetReviewed!==true)errors.push('Final asset needs review');
 if(item.logoReviewed!==true)errors.push('Approved logo needs verification');
 return {ready:!errors.length,errors};
}
export function publicationState(item,providerEvidence) {
 if(item.state==='Cancelled')return 'Cancelled';
 if(providerEvidence?.publishedId)return 'Published';
 if(providerEvidence?.scheduledId && providerEvidence?.scheduledAt)return 'Scheduled';
 if(providerEvidence?.definiteFailure)return 'Failed';
 if(providerEvidence?.uncertain)return 'In Review';
 return ['Draft','In Review','Approved'].includes(item.state)?item.state:'In Review';
}
export class OperationsAgent {
 constructor({evidence={},crm=null}={}){this.evidence=evidence;this.crm=crm;}
 summary(now=new Date()) {
  const services=serviceNames.map(name=>({name,...health(this.evidence[name],now)}));
  const log=this.crm?.rows('Automation Log')||[];
  return {services,loggedIssues:log.filter(x=>!/^yes$/i.test(x.resolved||'')&&/warning|fail|error/i.test([x.status,x.severity].join(' '))).map(x=>({at:x.timestamp,component:x.component,status:x.status,action:x.action})),limitations:['Missing provider evidence is unknown, not healthy. Logged issues are retained reports, not fresh incident confirmation.']};
 }
 content(now){return contentDraft(now);}
}
