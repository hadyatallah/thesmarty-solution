import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import * as T from '../command-center/taskdates.js';
import {CRMAdapter} from '../command-center/crm.js';
const now=new Date('2026-10-04T12:00:00Z');
const task=(id,status='Open',dueDate='2026-10-03')=>({id,name:'Synthetic '+id,status,dueDate});
for(const [value,want] of [
 ['2026-10-04','2026-10-04'],[' 2026-10-04 ','2026-10-04'],['2024-02-29','2024-02-29'],
 ['2026-10-03T21:30:00Z','2026-10-04'],['2026-10-04T00:30:00+03:00','2026-10-04'],['2026-01-01T22:30:00Z','2026-01-02'],
 ['2026-10-25T00:30:00Z','2026-10-25'],['2026-10-25T01:30:00Z','2026-10-25'],
 [46289,'2026-09-24'],[46289.75,'2026-09-24'],[1,'1899-12-31'],[2.5,'1900-01-01'],
 [new Date('2026-10-03T21:30:00Z'),'2026-10-04'],
 ...['','garbage','2026-02-30','2025-02-29','2026-13-01','2026-00-01','2026-10-00','2026-10-04bad','10/04/2026','46289','2026-10-04T01:00:00','2026-10-04T24:00:00Z','2026-10-04T10:99:00Z','2026-10-04T10:00:99Z','2026-02-30T10:00:00Z','2026-10-04T10:00:00+24:00',null,undefined,true,{},0,-1,Infinity,NaN,1791097407000,new Date('invalid')].map(v=>[v,null])
])test('strict calendar conversion '+String(value),()=>assert.equal(T.calendarDate(value),want));
test('calendar arithmetic never uses browser-local date',()=>{assert.equal(T.addCalendarDays('2026-10-24',3),'2026-10-27');assert.equal(T.addCalendarDays('2026-03-28',3),'2026-03-31');assert.equal(T.addCalendarDays('2026-12-31',1),'2027-01-01');assert.equal(T.calendarWeekday('2026-10-04'),0);});
for(const status of ['Done','Cancelled','Closed','Unknown','',null,'Open '])test('non-Open task is not active: '+status,()=>assert.equal(T.dueState('Tasks',task('x',status),now),'inactive'));
test('missing identity is never counted',()=>assert.equal(T.isOpenTask(task('')) ,false));
test('either status or stage closes a generic record',()=>assert.equal(T.isClosedRecord({status:'Active',stage:'Won'}),true));
test('today is not overdue; timestamp is normalized in Cyprus',()=>{assert.equal(T.dueState('Tasks',task('a','Open','2026-10-03T21:30:00Z'),now),'due_today');assert.equal(T.dueState('Tasks',task('b'),now),'overdue');});
test('blank and invalid dates are distinct without inventing either',()=>{assert.equal(T.dueState('Tasks',task('a','Open',''),now),'undated');assert.equal(T.dueState('Tasks',task('b','Open','2026-02-30'),now),'invalid');});
test('next three days excludes today and the fourth day',()=>{assert.equal(T.dueState('Tasks',task('a','Open','2026-10-07'),now),'due_soon');assert.equal(T.dueState('Tasks',task('b','Open','2026-10-08'),now),'future');});
test('same Open predicate and QA separation; repeated reads do not mutate records',()=>{
 const tasks=[task('a'),task('b','Open',46289),task('c','Open',''),task('d','Done'),task('e','Cancelled'),task('f','New'),{...task('q'),classification:'Internal QA'},task('i','Open','2026-02-30'),task('')];
 const before=JSON.stringify(tasks),r=T.taskSummary(tasks,[],now);
 assert.deepEqual([r.open,r.overdue,r.undated,r.invalidDate,r.unrecognizedStatus,r.qa.open,r.qa.overdue],[5,3,1,1,1,1,1]);
 assert.deepEqual(T.taskSummary(tasks,[],now),r);assert.equal(JSON.stringify(tasks),before);
});
test('QA identification is explicit and linked; ordinary names are not substring matches',()=>{
 assert.equal(T.isInternalQA(task('a'),[]),false);assert.equal(T.isInternalQA({id:'x',name:'Qatar Software'}),false);
 assert.equal(T.isInternalQA({id:'x',companyId:'c'},[{id:'c',classification:'Internal QA'}]),true);
 assert.equal(T.isInternalQA({id:'TAS-x',name:'TSS INTERNAL QA Gateway synthetic'}),true);
});
test('late records after gaps remain in read-side task counts',()=>{const a=Array(1001).fill(null);a[1000]=task('late');assert.equal(T.taskSummary(a,[],now).open,1);});
test('metadata cannot falsely claim completeness when loaded differs from total',()=>{assert.equal(T.recordCoverage({records:{Tasks:[task('a')]},coverage:{Tasks:{complete:true,total:2}}},'Tasks').complete,false);});
test('unknown, missing or duplicate identity coverage is not complete',()=>{for(const rows of [[],[task('a'),task('a')],[task('')]]){const s={records:{Tasks:rows},coverage:{Tasks:{complete:true,total:2}}};assert.equal(T.recordCoverage(s,'Tasks').complete,false);}assert.equal(T.recordCoverage({records:{Tasks:[]}},'Tasks').complete,false);});
test('available complete metadata and full unique population are accepted',()=>assert.equal(T.recordCoverage({records:{Tasks:[task('a')]},coverage:{Tasks:{complete:true,total:1}}},'Tasks').complete,true));
test('all-record attention differs deliberately from task-only metric',()=>{
 const snapshot={records:{Companies:[{id:'c',name:'Synthetic company',followUp:'2026-10-03'}],Tasks:[task('a'),task('b','Open',46289),task('u','Open',''),task('closed','Cancelled'),task('weird','New')],Tickets:[],Opportunities:[{id:'o',name:'Synthetic opportunity',stage:'Discovery',followUp:'2026-10-03',nextAction:'Review'}]}};
 const before=JSON.stringify(snapshot),r=new CRMAdapter(snapshot).attention(now);
 assert.equal(r.taskSummary.open,3);assert.equal(r.taskSummary.overdue,2);assert.equal(r.items.filter(x=>x.kind==='overdue').length,4);
 assert.ok(r.limitations.some(x=>x.includes('population may be partial')));assert.equal(JSON.stringify(snapshot),before);
});
test('generated browser bundle equals the shared module and has no I/O',()=>{
 execFileSync(process.execPath,['scripts/build-task-metrics.mjs','--check']);const code=fs.readFileSync('crm/task-metrics.js','utf8');
 const context=vm.createContext({Intl,Date});vm.runInContext(code,context);
 for(const v of [46289,'2026-10-03T21:30:00Z','2026-02-30',''])assert.equal(context.TSSTaskMetrics.calendarDate(v),T.calendarDate(v));
 assert.doesNotMatch(code,/fetch\(|localStorage|XMLHttpRequest|\.setValue/);
});
test('native packager keeps module dependency order without deployment',()=>{
 const target='/tmp/tss-dashboard-test-core.gs';execFileSync(process.execPath,['command-center/apps-script/build.mjs',target]);const code=fs.readFileSync(target,'utf8');new vm.Script(code);assert.ok(code.indexOf('const taskdates=')<code.indexOf('const crm='));fs.unlinkSync(target);
});
