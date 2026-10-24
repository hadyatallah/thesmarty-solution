import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import {default as cronHandler} from '../api/tss-irc-daily.js';

const html=readFileSync(new URL('../research-center/index.html', import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]+?)<\/script>\s*<\/body>/)?.[1];
assert.ok(script,'Research Center inline JavaScript must exist');
const TAB_NAMES=['Buyer Enquiries','Referral Organisations','Opportunities','Evidence','Outreach Queue','Suppressions','Runs','Settings','Activity Log'];
const COLS={
 'Buyer Enquiries':['buyerId','createdAt','firstName','lastName','email','originCountry','destination','propertyType','budgetBand','purchaseHorizon','sourceType','sourceURL','sourceObservedAt','requestEvidence','contactPermission','contactPermissionAt','sharePermission','status','owner','lastContactAt','notes'],
 'Referral Organisations':['referralId','organisationName','legalName','country','website','publicEmail','organisationType','canonicalCompanyId','sourceURL','sourceObservedAt','verification','channelAssessment','contactBasis','contactPermissionEvidence','engagementStatus','lastContactAt','notes'],
 'Opportunities':['opportunityId','createdAt','opportunityType'],
 'Evidence':['evidenceId','subjectType','subjectId'],
 'Outreach Queue':['queueId','leadType','leadId','recipientEmail'],
 'Suppressions':['emailLower','suppressedAt','reason'],
 'Runs':['runId','startedAt','finishedAt'],
 'Settings':['key','value','purpose'],
 'Activity Log':['activityId','timestamp','entityType','entityId','event','result','source','messageId','actor','notes']
};
class FakeClassList {
 constructor(){this.values=new Set()}
 add(x){this.values.add(x)}
 remove(x){this.values.delete(x)}
 toggle(x,on){if(on??!this.values.has(x))this.add(x);else this.remove(x)}
 contains(x){return this.values.has(x)}
}
class FakeNode {
 constructor(){this._text='';this.innerHTML='';this.style={};this.hidden=false;this.disabled=false;this.classList=new FakeClassList();this.onclick=null;this.onsubmit=null;this.dataset={};}
 get textContent(){return this._text}
 set textContent(v){this._text=String(v)}
}
class FakeFormData {
 constructor(node){this.map=new Map(Object.entries(node.fields||{}))}
 get(k){return this.map.get(k)||null}
 has(k){return this.map.has(k)}
 entries(){return this.map.entries()}
 [Symbol.iterator](){return this.map[Symbol.iterator]()}
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

function createHarness({email='thesmartysolution@gmail.com',buyerRows=[],suppressed=[]}={}){
 const nodes=new Map(), get=id=>{if(!nodes.has(id))nodes.set(id,new FakeNode());return nodes.get(id)};
 const navs=['dashboard','buyers','referrals','opportunities','outreach','evidence','scheduler'].map(v=>{
   const node=new FakeNode();node.dataset.v=v;return node;
 });
 const data=Object.fromEntries(TAB_NAMES.map(n=>[n,[COLS[n].slice()]]));
 data['Buyer Enquiries'].push(...buyerRows);
 data['Suppressions'].push(...suppressed);
 data.Settings.push(['daily_scheduler_enabled','TRUE',''],['auto_send_enabled','FALSE',''],['daily_send_cap','10','']);
 const requests={userinfo:0,sheetsRead:0,writes:[],urls:[]};
 const fakeFetch=async (uri,options={})=>{
  const url=String(uri);requests.urls.push(url);
  if(url.includes('/oauth2/v3/userinfo')){
    requests.userinfo++;return {ok:true,status:200,json:async()=>({email,email_verified:true})};
  }
  if(url.includes('/values:batchGet')){
    requests.sheetsRead++;
    return {ok:true,status:200,json:async()=>({valueRanges:TAB_NAMES.map(name=>({values:data[name]}))})};
  }
  if(url.includes(':append')){
    const decoded=decodeURIComponent(url.split('/values/')[1].split(':append')[0]);
    const name=TAB_NAMES.find(n=>decoded.includes(n));
    assert.ok(name,'Only known sheet append destinations allowed');
    const payload=JSON.parse(options.body||'{}');
    assert.ok(Array.isArray(payload.values)&&payload.values.length===1);
    data[name].push(payload.values[0]);requests.writes.push({name,values:payload.values[0]});
    return {ok:true,status:200,json:async()=>({updates:{updatedRows:1}})};
  }
  if(url.includes('/values/'))return {ok:true,status:200,json:async()=>({updatedCells:1})};
  throw Error('Unexpected request '+url);
 };
 const initTokenClient=({callback})=>({requestAccessToken:()=>callback({access_token:'SYNTHETIC_QA_TOKEN'})});
 const g={accounts:{oauth2:{initTokenClient}}};
 const doc={getElementById:get,querySelectorAll:selector=>selector==='.nav button'?navs:[]};
 const sandbox={window:{google:g},google:g,document:doc,FormData:FakeFormData,fetch:fakeFetch,URL,URLSearchParams,crypto:{randomUUID},console,setTimeout,clearTimeout,confirm:()=>true};
 new Script(script).runInContext(createContext(sandbox));
 return {get,navs,requests,data,async login(){get('auth').onclick();await tick();await tick();},async goto(v){navs.find(n=>n.dataset.v===v)?.onclick?.();await tick();},async submit(fields){get('form').fields=fields;const handler=get('form').onsubmit;assert.equal(typeof handler,'function');await handler({preventDefault(){},currentTarget:get('form')});await tick();}};
}
const buyerForm=(email='new.buyer@example.com')=>({
 firstName:'Example',lastName:'Buyer',email,originCountry:'United Kingdom',destination:'Cyprus',
 sourceURL:'https://example.com/consent/strict-example',contactPermission:'REQUESTED',confirmed:'on'
});

test('owner-only login keeps private records inaccessible before authentication',async()=>{
 const h=createHarness();
 assert.equal(h.requests.sheetsRead,0);
 assert.match(h.get('content').innerHTML,/private access/i);
 await h.login();
 assert.equal(h.requests.sheetsRead,1,JSON.stringify({requests:h.requests,notice:h.get("notice").textContent,identity:h.get("identity").textContent}));
 assert.equal(h.get('identity').textContent,'thesmartysolution@gmail.com');
 assert.equal(h.get('refresh').disabled,false);
});

test('wrong signed-in Google user causes denial without a private read',async()=>{
 const h=createHarness({email:'another@example.com'});
 await h.login();
 assert.equal(h.requests.sheetsRead,0);
 assert.equal(h.get('identity').textContent,'Signed out');
 assert.match(h.get('notice').textContent,/not authorised/i);
});

test('verified first party buyer request stores record but does not send or share',async()=>{
 const h=createHarness();await h.login();await h.goto('buyers');
 assert.equal(typeof h.get('addBuyer').onclick,'function',JSON.stringify({notice:h.get("notice").textContent,requests:h.requests}));
 h.get('addBuyer').onclick();
 await h.submit(buyerForm());
 assert.equal(h.requests.writes.length,1);
 const {name,values}=h.requests.writes[0];assert.equal(name,'Buyer Enquiries');
 assert.match(values[0],/^IRC-BUY-/);
 assert.equal(values[4],'new.buyer@example.com');
 assert.equal(values[14],'REQUESTED');
 assert.equal(values[16],'NO');
 assert.equal(values[17],'NEW');
 assert.equal(h.data['Outreach Queue'].length,1,'No outgoing queue item was created');
 assert.equal(h.requests.urls.some(url=>/hubspot|sendmail|graph\.microsoft\.com/i.test(url)),false);
});

test('duplicate buyer and suppressed buyer cannot be added twice',async()=>{
 const existing=COLS['Buyer Enquiries'].map((name)=>{
 if(name==='buyerId')return 'IRC-BUY-OLD';
 if(name==='email')return 'buyer@example.com';return '';
 });
 const h=createHarness({buyerRows:[existing],suppressed:[['blocked@example.com','2026-10-13','optout']]});
 await h.login();await h.goto('buyers');
 h.get('addBuyer').onclick();await h.submit(buyerForm('buyer@example.com'));
 assert.equal(h.requests.writes.length,0);
 h.get('addBuyer').onclick();await h.submit(buyerForm('blocked@example.com'));
 assert.equal(h.requests.writes.length,0);
 assert.match(h.get('notice').textContent,/suppressed/i);
});

test('requests to untrusted sheets or HubSpot cannot occur before successful identity check',async()=>{
 const h=createHarness({email:'unauthorized@example.com'});await h.login();
 assert.equal(h.requests.urls.some(u=>u.includes('sheets.googleapis.com')),false);
 assert.equal(h.requests.urls.some(u=>u.includes('hubapi.com')),false);
});

function response(){
 return {statusCode:200,headers:{},body:'',status(c){this.statusCode=c;return this;},setHeader(k,v){this.headers[k]=v;return this;},end(x){this.body=x;return this;}};
}
test('configured scheduler with no persisted run is shown as unverified, not active',async()=>{
 const h=createHarness();await h.login();await h.goto('scheduler');
 assert.match(h.get('content').innerHTML,/Configured \/ not verified|Not observed today/);
 assert.match(h.get('content').innerHTML,/no cron-labelled run yet/i);
 assert.match(h.get('content').innerHTML,/Off/);
});

test('daily cron rejects unauthorised callers before touching sources',async()=>{
 const r=response();
 await cronHandler({method:'GET',headers:{}},r);
 assert.equal(r.statusCode,401);
 assert.equal(JSON.parse(r.body).error,'unauthorised');
});
test('daily endpoint rejects unsupported methods',async()=>{
 const r=response();
 await cronHandler({method:'DELETE',headers:{}},r);
 assert.equal(r.statusCode,405);
});


test('saved commercial handoff is displayed without sends or CRM writes',async()=>{
 const h=createHarness();
 h.data['Activity Log'].push(['IRC-ACT-TEST','2026-10-24T08:00:00Z','Referral','IRC-ORG-TEST','Research commercial handoff','','','','',JSON.stringify({kind:'research-commercial-handoff/v1',recordId:'IRC-ORG-TEST',action:'VERIFY_COMMERCIAL_FIT',instruction:'Review <script>unsafe</script> evidence'})]);
 await h.login();
 assert.match(h.get('content').innerHTML,/IRC-ORG-TEST/);
 assert.match(h.get('content').innerHTML,/VERIFY_COMMERCIAL_FIT/);
 assert.match(h.get('content').innerHTML,/&lt;script&gt;unsafe&lt;\/script&gt;/);
 assert.equal(h.requests.writes.length,0);
 assert.equal(h.requests.urls.some(url=>/hubapi|graph\.microsoft/i.test(url)),false);
});
