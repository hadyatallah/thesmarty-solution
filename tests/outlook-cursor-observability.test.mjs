import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Run the actual broker source against a synthetic provider/auth adapter.
// Never contact Google, Microsoft or the live CRM in this test.
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const scratch=mkdtempSync(join(tmpdir(),'tss-outlook-cursor-observe-'));
for(const sub of ['server/outlook','api/outlook'])mkdirSync(join(scratch,sub),{recursive:true});
writeFileSync(join(scratch,'package.json'),JSON.stringify({type:'module'}));
copyFileSync(join(root,'server/outlook/sync.js'),join(scratch,'server/outlook/sync.js'));
copyFileSync(join(root,'server/outlook/_core.js'),join(scratch,'server/outlook/_core.js'));
writeFileSync(join(scratch,'api/outlook/_lib.js'),[
 "import crypto from 'node:crypto';",
 'export function baseHeaders(){}',
 "export function open(value){if(value!=='SYNTHETIC_BINDING')throw Error('OUTLOOK_SESSION_INVALID');return {purpose:'outlook-ingestion',v:2,refreshToken:'SYNTHETIC_REFRESH',mailbox:'info@thesmartysolution.com',serviceKeyHash:crypto.createHash('sha256').update('x'.repeat(43)).digest('hex'),connectedAt:'2026-10-05T00:00:00Z'};}",
 "export async function refreshToken(){return {access_token:'SYNTHETIC_ACCESS'};}",
 "export async function graphMe(){return {mail:'info@thesmartysolution.com'};}",
 'export function assertMailbox(v){return v.mail;}',
 "export function seal(){return 'SYNTHETIC_SEALED_OUTPUT';}"
].join('\n'));
after(()=>rmSync(scratch,{recursive:true,force:true}));
const {default:handler}=await import(pathToFileURL(join(scratch,'server/outlook/sync.js')).href);
function response(){return {statusCode:0,body:null,setHeader(){return this},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
async function run({folder='inbox',cursor='',graphStatus=200}={}){
 const previousFetch=globalThis.fetch,previousWarn=console.warn,logs=[];
 globalThis.fetch=async()=>({status:graphStatus,ok:graphStatus===200,json:async()=>({value:[],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/me/mailFolders/'+folder+'/messages/delta?$deltatoken=SYNTHETIC'})});
 console.warn=v=>logs.push(String(v));
 try{const result=response();await handler({method:'POST',body:{folder,cursor,binding:'SYNTHETIC_BINDING',serviceKey:'x'.repeat(43)}},result);return {result,logs};}
 finally{globalThis.fetch=previousFetch;console.warn=previousWarn;}
}
const cursor=(folder)=>'https://graph.microsoft.com/v1.0/me/mailFolders/'+folder+'/messages/delta?$deltatoken=SECRET_DO_NOT_LOG';
function logged(x){assert.equal(x.logs.length,1);return JSON.parse(x.logs[0])}
test('local cursor validation logs the actual inbox folder without secrets',async()=>{
 const out=await run({folder:'inbox',cursor:cursor('sentitems')});
 assert.equal(out.result.statusCode,409);
 assert.equal(out.result.body.cursorFailure,'LOCAL_VALIDATION');
 assert.deepEqual(logged(out),{component:'outlook-sync',event:'cursor-rejected',folder:'inbox',cause:'LOCAL_VALIDATION'});
 assert.ok(!out.logs[0].includes('SECRET_DO_NOT_LOG'));
});
test('Microsoft Graph 410 logs the actual sentitems folder without secrets',async()=>{
 const out=await run({folder:'sentitems',cursor:cursor('sentitems'),graphStatus:410});
 assert.equal(out.result.statusCode,409);
 assert.equal(out.result.body.cursorFailure,'GRAPH_HTTP_410');
 assert.deepEqual(logged(out),{component:'outlook-sync',event:'cursor-rejected',folder:'sentitems',cause:'GRAPH_HTTP_410'});
 assert.ok(!out.logs[0].includes('SECRET_DO_NOT_LOG'));
});
test('successful and throttled Graph calls do not emit cursor-rejection logs',async()=>{
 const ok=await run({folder:'inbox'}),throttle=await run({folder:'inbox',graphStatus:429});
 assert.equal(ok.result.statusCode,200);
 assert.equal(throttle.result.statusCode,429);
 assert.deepEqual(ok.logs,[]);
 assert.deepEqual(throttle.logs,[]);
});
test('invalid folder never enters the sanitized diagnostic log',async()=>{
 const out=await run({folder:'badfolder',cursor:'invalid'});
 assert.equal(out.result.statusCode,400);
 assert.deepEqual(out.logs,[]);
});