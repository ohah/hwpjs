// Run with Bun only after the publisher has finished the candidate bundles.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {closeOwnedBrowser} from './browser/session-close.mjs';
import {inspect,paragraphRecords,verifyRaw} from '../tests/hwp5/style-preservation/text-record-oracle.mjs';
const run=promisify(execFile), hash=b=>createHash('sha256').update(b).digest('hex');
assert(globalThis.Bun,'RunWithBun');
const options={};
for(const arg of process.argv.slice(2)) {
 if(arg==='--expect-vulnerable'){options.vulnerable=true;continue;}
 const m=/^--(candidate|wasm)=(\/.*)$/.exec(arg);assert(m,'ExpectedAbsoluteCandidateOrWasm');assert(!options[m[1]],'DuplicateArgument');options[m[1]]=m[2];
}
const published=options.candidate&&options.wasm?{}:JSON.parse(await readFile('zig-out/verification/noori-current/hwp5-reference-publication-paths.json'));
const paths={candidate:options.candidate??published.candidate,artifact:options.wasm??published.artifact};
const output=resolve('zig-out/verification/hwp5-worker-reference-scope',new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(output,{recursive:true});
const assets=new Map(),artifacts=[];
for(const [url,path] of [['/index.js',join(paths.candidate,'bundle/index.js')],['/runtime.js',join(paths.candidate,'bundle/runtime.js')],['/worker.js',join(paths.candidate,'bundle/worker.js')],['/hwpjs.wasm',paths.artifact]]) {
 const bytes=await readFile(path);assets.set(url,bytes);artifacts.push({url,path,sha256:hash(bytes),bytes:bytes.length});
}
assert.equal(artifacts.at(-1).sha256,'03d1efd8b0a15c87621c9563b3bff4285534442bf5085813d94fdbc1f9c0315b','Fixed03d1ArtifactRequired');
assert.match(assets.get('/runtime.js').toString(),/new Worker[\s\S]*?type: ["']module["']/);
const fixture=resolve('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp'),original=await readFile(fixture);
const rawText=paragraphRecords(inspect(original).sections[0].bytes,1).direct.find(r=>r.tag===67).payload.toString('utf16le');
const html=`<!doctype html><meta charset="utf-8"><title>Two Worker reference ownership audit</title>
<h1>Public SDK module Worker ownership test host</h1><input id="file" type="file">
<button id="baseline">Save independent baselines</button><button id="own">Query own references</button>
<button id="foreign-query">Query B with A reference</button><button id="foreign-splice">Splice B with A reference</button>
<button id="after">Save after requests</button><button id="own-splice">Splice own reference</button><button id="stale-query">Query stale own reference</button><button id="dispose">Dispose</button><pre id="state"></pre>
<script type="module">
import {createEditor} from '/index.js';
import {createWorkerRuntimeFactory} from '/runtime.js';
const audit=window.audit={requests:[],replies:[],actions:[],errors:[],notices:[],loads:0,states:[],workers:[]};
const ids=new WeakMap(),post=Worker.prototype.postMessage;
Worker.prototype.postMessage=function(envelope,...rest){
 if(!ids.has(this)){const id=audit.workers.length;ids.set(this,id);audit.workers.push(id);this.addEventListener('message',e=>audit.replies.push({worker:id,envelope:structuredClone(e.data)}));}
 const message={...envelope.message};if(message.wasmModule instanceof WebAssembly.Module)message.wasmModule='compiled-module';
 audit.requests.push({worker:ids.get(this),envelope:{...envelope,message}});
 return post.call(this,envelope,...rest);
};
const make=()=>createEditor({editorId:'shared',runtimeFactory:createWorkerRuntimeFactory({workerURL:new URL('/worker.js',location.href),wasmURL:new URL('/hwpjs.wasm',location.href)}),onError:e=>audit.notices.push({message:String(e),...e})});
const a=make(),b=make();
const states=()=>[a,b].map(e=>{const s=e.getEditorState();return {editorId:s.editorId,documentId:s.documentId,generation:s.generation,operationRevision:s.operationRevision,viewRevision:s.viewRevision,nativeHistoryRevision:s.nativeHistoryRevision,status:s.status,token:s.token,content:s.content};});
function render(){audit.states=states();document.querySelector('#state').textContent=JSON.stringify(audit.states,null,2);}
const row=e=>e.getEditorState().content.paragraphs.find(p=>p.section===0&&p.paragraph===1);
async function query(e,reference,requestId){try{return {reply:await e.requestExperimental({kind:'query-current-text',reference,requestId},{mutation:false,token:e.getEditorState().token})};}catch(e){return {error:String(e)};}}
function action(id,fn){document.querySelector('#'+id).onclick=async e=>{try{if(!e.isTrusted)throw Error('UntrustedAction');const result=await fn();render();audit.actions.push({id,trusted:e.isTrusted,result});}catch(e){audit.errors.push(String(e));}};}
document.querySelector('#file').onchange=async e=>{try{if(!e.isTrusted)throw Error('UntrustedUpload');const bytes=new Uint8Array(await e.target.files[0].arrayBuffer());await a.load(bytes.slice(),{format:'hwp5'});await b.load(bytes.slice(),{format:'hwp5'});audit.upload={trusted:e.isTrusted,bytes:bytes.length};render();audit.loads++;}catch(e){audit.errors.push(String(e));}};
const save=async()=>Promise.all([a,b].map(async e=>{const s=await e.save({allowStaleLayout:true});return {bytes:Array.from(s.bytes),nativeHistoryRevision:s.nativeHistoryRevision};}));
action('baseline',save);
action('own',async()=>({rows:[row(a),row(b)],queries:[await query(a,row(a).currentReference,11),await query(b,row(b).currentReference,12)]}));
action('foreign-query',()=>query(b,row(a).currentReference,21));
action('foreign-splice',()=>b.requestExperimental({kind:'splice-current',reference:row(a).currentReference,requestId:22,startUnit:0,endUnit:0,text:'FOREIGN'},{mutation:true,token:b.getEditorState().token}));
let priorOwnReference;action('own-splice',()=>{priorOwnReference=row(b).currentReference;return b.requestExperimental({kind:'splice-current',reference:priorOwnReference,requestId:23,startUnit:0,endUnit:0,text:'OWN'},{mutation:true,token:b.getEditorState().token});});action('stale-query',()=>query(b,priorOwnReference,24));
action('after',save);action('dispose',()=>Promise.all([a.dispose(),b.dispose()]));
window.ready=true;
</script>`;
await writeFile(join(output,'host.html'),html);
const session=`reference-scope-${process.pid}-${Date.now()}`,transcript=[],http=[];
async function command(...args){const {stdout}=await run('agent-browser',['--session',session,'--json',...args],{timeout:40000,maxBuffer:24000000,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:'15000'}});const r=JSON.parse(stdout);transcript.push({args,result:r});assert.equal(r.success,true,JSON.stringify(r));return r.data;}
const observe=async expression=>(await command('eval',expression)).result;
let server,failure,observations,cleanup={},result={expectVulnerable:!!options.vulnerable};
try {
 assert.equal((await command('session','info')).active,false);
 server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const path=new URL(req.url).pathname;http.push(path);if(path==='/')return new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});const bytes=assets.get(path);return bytes?new Response(bytes,{headers:{'content-type':path.endsWith('.wasm')?'application/wasm':'text/javascript'}}):new Response('Not found',{status:404});}});
 await command('open',`http://127.0.0.1:${server.port}`);await command('wait','--fn','window.ready===true');
 result.userAgent=await observe('navigator.userAgent');assert.match(result.userAgent,/Chrome\//);
 await command('upload','#file',fixture);await command('wait','--fn','window.audit.loads===1||window.audit.errors.length>0');assert.deepEqual(await observe('window.audit.errors'),[]);
 async function click(id){const n=await observe('window.audit.actions.length');await command('click','#'+id);await command('wait','--fn',`window.audit.actions.length>${n}||window.audit.errors.length>0`);assert.deepEqual(await observe('window.audit.errors'),[],'MainFixNeeded: public experimental API must support current-reference kinds');const a=await observe('window.audit.actions.at(-1)');assert.equal(a.id,id);assert.equal(a.trusted,true);return a.result;}
 const baseline=await click('baseline');
 for(const saved of baseline)assert.deepEqual(Buffer.from(saved.bytes),original,'IndependentBaselineMustEqualUploadedOriginal');
 const own=await click('own'),[ra,rb]=own.rows.map(r=>r.currentReference);
 assert(ra&&rb,'MainFixNeeded: public paragraph 1 currentReference missing');
 assert.equal(ra.epoch,'2');assert.equal(rb.epoch,'2');
 const withoutScope=({scope,...rest})=>rest;assert.deepEqual(withoutScope(ra),withoutScope(rb),'NativeIdentityMustCollide');
 assert.equal(typeof ra.scope,'string');assert.equal(typeof rb.scope,'string');assert(ra.scope.length&&rb.scope.length);
 if(options.vulnerable)assert.equal(ra.scope,rb.scope);else{assert.match(ra.scope,/^worker:\d+:1$/);assert.match(rb.scope,/^worker:\d+:1$/);assert.notEqual(ra.scope,rb.scope);}
 for(let i=0;i<2;i++){assert.equal(own.queries[i].reply?.text,rawText);assert.equal(own.queries[i].reply?.requestId,11+i);}
 const before=await observe('window.audit.states');assert.equal(before[0].editorId,'shared');assert.equal(before[1].editorId,'shared');assert.notEqual(before[0].documentId,before[1].documentId);
 const foreignQuery=await click('foreign-query');
 if(options.vulnerable){assert.equal(foreignQuery.reply?.text,rawText);assert.equal(foreignQuery.reply?.requestId,21);}else assert.match(foreignQuery.error,/InvalidCurrentReferenceScope/);
 const foreignSplice=await click('foreign-splice');
 assert.equal(foreignSplice.status,options.vulnerable?'committed-with-snapshot':'rejected-unapplied');
 const afterStates=await observe('window.audit.states');
 if(!options.vulnerable)for(let i=0;i<2;i++){assert.equal(afterStates[i].nativeHistoryRevision,before[i].nativeHistoryRevision);assert.deepEqual(afterStates[i].content,before[i].content);assert.deepEqual(afterStates[i].token,before[i].token);}
 const after=await click('after');
 for(let i=0;i<2;i++){const bytes=Buffer.from(after[i].bytes);await writeFile(join(output,`after-${i}.hwp`),bytes);await writeFile(join(output,`baseline-${i}.hwp`),Buffer.from(baseline[i].bytes));if(i===1&&options.vulnerable){assert.notDeepEqual(bytes,original);assert.equal(afterStates[1].content.paragraphs.find(p=>p.section===0&&p.paragraph===1).text,'FOREIGN'+own.rows[1].text);}else assert.deepEqual(bytes,original,'SaveBytesChanged');}
 if(!options.vulnerable){
   const applied=await click('own-splice');assert.equal(applied.status,'committed-with-snapshot');assert.equal(applied.error,undefined);
   const ownStates=await observe('window.audit.states');assert.equal(ownStates[1].nativeHistoryRevision,1);
   assert.equal(ownStates[1].content.paragraphs.find(p=>p.section===0&&p.paragraph===1).text,'OWN'+own.rows[1].text);
   const stale=await click('stale-query');assert.match(stale.error,/StaleCurrentReference/);
   const ownSaved=await click('after');assert.deepEqual(Buffer.from(ownSaved[0].bytes),original);
   verifyRaw(original,Buffer.from(ownSaved[1].bytes),0,1,0,0,'OWN');
   result.ownMutationIndependentOracle=true;result.staleEpochRejected=true;
 }
 observations=await observe('window.audit');
 assert.equal(observations.workers.length,2);
 const init=observations.requests.filter(r=>r.envelope.message.kind==='initialize-runtime');assert.equal(init.length,2);assert.notEqual(init[0].worker,init[1].worker);
 if(options.vulnerable)for(const r of init)assert.equal(r.envelope.message.referenceScope,undefined);else {assert.notEqual(init[0].envelope.message.referenceScope,init[1].envelope.message.referenceScope);for(let i=0;i<2;i++)assert.equal([ra,rb][i].scope,init[i].envelope.message.referenceScope+':1');}
 for(const [requestId,kind] of [[11,'query-current-text'],[12,'query-current-text'],[21,'query-current-text'],[22,'splice-current']]){
 const reqs=observations.requests.filter(r=>r.envelope.message.requestId===requestId&&r.envelope.message.kind===kind);assert.equal(reqs.length,1);const req=reqs[0];
 assert.deepEqual(req.envelope.message.reference,requestId===12?rb:ra);
 const reply=observations.replies.find(r=>r.worker===req.worker&&r.envelope.id===req.envelope.id)?.envelope.reply;
 assert(reply,'NativeWireReplyMissing');assert.equal(reply.kind,kind);assert.equal(reply.requestId,requestId);
 if(requestId>=21&&!options.vulnerable){assert.equal(reply.error,'InvalidCurrentReferenceScope');assert.equal(reply.applied,false);assert.equal(reply.historyRevision,before[1].nativeHistoryRevision);}
 }
 result={...result,pass:true,references:[ra,rb],own,foreignQuery,foreignSplice,baselineHashes:baseline.map(s=>hash(Buffer.from(s.bytes))),afterHashes:after.map(s=>hash(Buffer.from(s.bytes)))};
 await command('screenshot',join(output,'audit.png'));await click('dispose');
} catch(e){failure=e.stack;try{observations=await observe('window.audit');}catch{}}
finally {
 try{await closeOwnedBrowser(command,{attempts:30});cleanup.browserInactive=(await command('session','info')).active===false;}catch(e){cleanup.browserError=String(e);}
 if(server){const origin=`http://127.0.0.1:${server.port}`;await server.stop(true);cleanup.origin=origin;try{await fetch(origin);cleanup.serverUnreachable=false;}catch{cleanup.serverUnreachable=true;}}
 await writeFile(join(output,'observer.json'),JSON.stringify(observations??null,null,2));
 await writeFile(join(output,'transcript.json'),JSON.stringify(transcript,null,2));
 await writeFile(join(output,'result.json'),JSON.stringify({paths,artifacts,fixture,fixtureSha256:hash(original),session,http,result,cleanup,failure,scope:'Minimal trusted-button/file-upload host; public SDK; two actual Chrome module Workers. Observers forward original requests unchanged. No product Canvas or IME claim; port 8082 untouched.'},null,2));
 console.log(JSON.stringify({output,result:{pass:result.pass,expectVulnerable:result.expectVulnerable},cleanup,failure}));
}
if(failure||!cleanup.browserInactive||!cleanup.serverUnreachable)process.exitCode=1;
