import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { inspect, verifyRaw } from '../tests/hwp5/style-preservation/text-record-oracle.mjs';
const run = promisify(execFile);
assert(globalThis.Bun, 'RunWithBun');
const options = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const match = /^--(candidate|wasm)=(.+)$/.exec(argument);
    assert(match, 'InvalidAuditArgument');
    return [match[1], resolve(match[2])];
  }),
);
const paths =
  options.candidate && options.wasm
    ? { candidate: options.candidate, artifact: options.wasm }
    : JSON.parse(
        await readFile('zig-out/verification/noori-current/reader-publication-paths.json'),
      );

const output = resolve(
  'zig-out/verification/headless-parser-worker',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
await mkdir(join(output, 'downloads'), { recursive: true });
const hash = (b) => createHash('sha256').update(b).digest('hex');
const assets = new Map();
const artifacts = [];
for (const [url, path] of [
  ['/index.js', join(paths.candidate, 'bundle/index.js')],
  ['/runtime.js', join(paths.candidate, 'bundle/runtime.js')],
  ['/worker.js', join(paths.candidate, 'bundle/worker.js')],
  ['/hwpjs.wasm', paths.artifact],
]) {
  const bytes = await readFile(path);
  assets.set(url, bytes);
  artifacts.push({ url, path, sha256: hash(bytes), bytes: bytes.length });
}
if (!options.wasm)
  assert.equal(
    artifacts.at(-1).sha256,
    '03d1efd8b0a15c87621c9563b3bff4285534442bf5085813d94fdbc1f9c0315b',
    'Explicit03d1CandidateRequired',
  );
assert.match(assets.get('/runtime.js').toString(), /new Worker[\s\S]*?type: "module"/);
const session = `parser-worker-${process.pid}-${Date.now()}`;
const transcript = [];
async function command(...args) {
  const { stdout } = await run(
    'agent-browser',
    ['--session', session, '--download-path', join(output, 'downloads'), '--json', ...args],
    {
      timeout: 40000,
      maxBuffer: 16000000,
      env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '15000' },
    },
  );
  const value = JSON.parse(stdout);
  transcript.push({ args, result: value });
  assert.equal(value.success, true, JSON.stringify(value));
  return value.data;
}
const evaluate = async (js) => (await command('eval', js)).result;
const html = `<!doctype html><meta charset="utf-8"><title>Public SDK parser Worker test host</title>
<h1>Test host: public SDK + module Worker/backend (no Canvas)</h1>
<input id="file" type="file"><button id="edit">Insert unique marker before paragraph 1</button><button id="undo">Undo</button><button id="redo">Redo</button><label><input id="consent" type="checkbox">Allow stale layout on save</label><button id="save">Download</button><button id="dispose">Dispose editor</button><pre id="state"></pre>
<script type="module">
import {createEditor,SPLICE_TEXT_COMMAND,UNDO_COMMAND,REDO_COMMAND} from '/index.js';
import {createWorkerRuntimeFactory} from '/runtime.js';
const audit=window.audit={requests:[],replies:[],actions:[],errors:[],loads:0,marker:'WorkerAudit'+crypto.randomUUID()+'😀<&'};
const seen=new WeakSet(),post=Worker.prototype.postMessage;
Worker.prototype.postMessage=function(envelope,...rest){
 if(!seen.has(this)){seen.add(this);this.addEventListener('message',e=>audit.replies.push(structuredClone(e.data)));}
 audit.requests.push({id:envelope.id,message:{...envelope.message,wasmModule:envelope.message.wasmModule instanceof WebAssembly.Module?'compiled-module':undefined}});
 return post.call(this,envelope,...rest);
};
const editor=createEditor({runtimeFactory:createWorkerRuntimeFactory({workerURL:new URL('/worker.js',location.href),wasmURL:new URL('/hwpjs.wasm',location.href)}),onError:e=>audit.errors.push(e)});
let format;
function render(){audit.state=editor.getEditorState();document.querySelector('#state').textContent=JSON.stringify(audit.state,null,2);}
function action(id,fn){document.querySelector('#'+id).onclick=async e=>{try{const result=await fn();audit.actions.push({id,trusted:e.isTrusted,result});render();}catch(e){audit.errors.push(String(e));render();}};}
document.querySelector('#file').onchange=async e=>{try{const file=e.target.files[0];format=file.name.endsWith('.hwpx')?'hwpx':'hwp5';await editor.load(new Uint8Array(await file.arrayBuffer()),{format});audit.loads++;document.querySelector('#consent').checked=false;render();}catch(e){audit.errors.push(String(e));}};
action('edit',()=>{const state=editor.getEditorState(),row=state.content.paragraphs.find(p=>p.section===0&&p.paragraph===1);return editor.dispatchCommand(SPLICE_TEXT_COMMAND,{target:{...state.token,format,coordinateSpace:'display',owner:row.selectionOwner,section:0,paragraph:1,startUnit:0,endUnit:0,affinity:'forward'},text:audit.marker});});
action('undo',()=>editor.dispatchCommand(UNDO_COMMAND,{token:editor.getEditorState().token}));
action('redo',()=>editor.dispatchCommand(REDO_COMMAND,{token:editor.getEditorState().token}));
action('save',async()=>{const saved=await editor.save({allowStaleLayout:document.querySelector('#consent').checked});const url=URL.createObjectURL(new Blob([saved.bytes]));const a=document.createElement('a');a.href=url;a.download='edited.'+(format==='hwpx'?'hwpx':'hwp');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return {...saved,bytes:undefined};});
action('dispose',()=>editor.dispose());
window.ready=true;
</script>`;
await writeFile(join(output, 'host.html'), html);
let server,
  cleanup = {},
  failure;
const cases = [],
  requests = [];
try {
  assert.equal((await command('session', 'info')).active, false);
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      requests.push({ path, time: Date.now() });
      if (path === '/')
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      const bytes = assets.get(path);
      return bytes
        ? new Response(bytes, {
            headers: {
              'content-type': path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
            },
          })
        : new Response('Not found', { status: 404 });
    },
  });
  const origin = `http://127.0.0.1:${server.port}`;
  for (const format of ['hwp5', 'hwpx']) {
    const extension = format === 'hwp5' ? 'hwp' : 'hwpx',
      fixture = resolve('legacy/rust/crates/hwp-core/tests/fixtures/charshape.' + extension),
      before = await readFile(fixture);
    const result = { format, fixture, fixtureSha256: hash(before), stages: [] };
    cases.push(result);
    await command('open', origin);
    await command('wait', '--fn', 'window.ready===true');
    await command('upload', '#file', fixture);
    await command('wait', '--fn', 'window.audit.loads===1');
    const row = () =>
      evaluate('window.audit.state.content.paragraphs.find(p=>p.section===0&&p.paragraph===1)');
    result.userAgent = await evaluate('navigator.userAgent');
    assert.match(result.userAgent, /Chrome\//);
    const original = await row();
    assert.equal(original.editable, true);
    result.original = original;
    result.marker = await evaluate('window.audit.marker');
    result.stages.push('load');
    async function click(id) {
      const count = await evaluate('window.audit.actions.length');
      await command('click', '#' + id);
      await command(
        'wait',
        '--fn',
        `window.audit.actions.length>${count}||window.audit.errors.length>0`,
      );
      assert.deepEqual(await evaluate('window.audit.errors'), []);
      const a = await evaluate('window.audit.actions.at(-1)');
      assert.equal(a.trusted, true);
      return a.result;
    }
    for (const [id, text, revision] of [
      ['edit', result.marker + original.text, 1],
      ['undo', original.text, 0],
      ['redo', result.marker + original.text, 1],
    ]) {
      const r = await click(id);
      assert.equal(r.status, 'committed-with-snapshot');
      assert.equal(r.changed, true);
      assert.equal((await row()).text, text);
      assert.equal(r.state.nativeHistoryRevision, revision);
      result.stages.push(id);
    }
    await command('click', '#consent');
    await click('save');
    const downloaded = join(output, 'downloads', 'edited.' + extension);
    for (let n = 0; n < 100; n++) {
      if ((await readdir(join(output, 'downloads'))).includes('edited.' + extension)) break;
      await Bun.sleep(100);
    }
    const saved = await readFile(downloaded);
    const wire = await evaluate(
      'Array.from(window.audit.replies.filter(r=>r.reply?.kind==="save"&&r.reply.bytes).at(-1).reply.bytes)',
    );
    assert.deepEqual(saved, Buffer.from(wire));
    result.saved = { path: downloaded, sha256: hash(saved), bytes: saved.length };
    result.stages.push('actual-download-wire-equality');
    if (format === 'hwp5') {
      verifyRaw(before, saved, 0, 1, 0, 0, result.marker);
      assert.deepEqual(inspect(saved).metadata, inspect(before).metadata);
      assert.throws(() => verifyRaw(before, saved, 0, 1, 0, 0, 'WRONG'));
      result.oracle = { wholeRecords: true, metadata: true, wrongMarkerRejected: true };
    } else {
      const request = {
        before: before.toString('base64'),
        after: saved.toString('base64'),
        part: 'Contents/section0.xml',
        index: 1,
        start: 0,
        end: 0,
        text: result.marker,
      };
      result.oracle = [];
      for (const flags of [[], ['-O']]) {
        const args = [...flags, 'tools/hwpx-plain-splice-oracle.py'];
        // execFile has no input option: write JSON to the child's stdin explicitly.
        async function oracle(payload) {
          return new Promise((res, rej) => {
            const child = execFile('python3', args, { timeout: 30000 }, (error, stdout, stderr) =>
              error ? rej(Object.assign(error, { stderr })) : res({ stdout, stderr }),
            );
            child.stdin.end(JSON.stringify(payload));
          });
        }
        const positive = await oracle(request);
        await assert.rejects(
          () => oracle({ ...request, text: 'WRONG' }),
          (e) => e.code === 1 && /Whole XML mismatch/.test(e.stderr),
        );
        result.oracle.push({ flags, positive, wrongMarkerRejected: true });
      }
    }
    result.stages.push('independent-oracle');
    const documentId = await evaluate('window.audit.state.documentId');
    await command('upload', '#file', downloaded);
    await command('wait', '--fn', 'window.audit.loads===2');
    assert.equal((await row()).text, result.marker + original.text);
    assert.equal(await evaluate('window.audit.state.nativeHistoryRevision'), 0);
    assert.notEqual(await evaluate('window.audit.state.documentId'), documentId);
    result.stages.push('reupload');
    await writeFile(
      join(output, format + '-observer.json'),
      JSON.stringify(await evaluate('window.audit'), null, 2),
    );
    await command('screenshot', join(output, format + '.png'));
    await click('dispose');
    result.pass = true;
  }
} catch (error) {
  failure = error.stack;
  try {
    await writeFile(
      join(output, 'failure-observer.json'),
      JSON.stringify(await evaluate('window.audit'), null, 2),
    );
  } catch {}
} finally {
  try {
    await command('close');
    for (let i = 0; i < 30; i++) {
      cleanup.browserInactive = (await command('session', 'info')).active === false;
      if (cleanup.browserInactive) break;
      await Bun.sleep(100);
    }
  } catch (e) {
    cleanup.browserError = String(e);
  }
  if (server) {
    const origin = `http://127.0.0.1:${server.port}`;
    await server.stop(true);
    cleanup.serverStopped = true;
    try {
      await fetch(origin);
      cleanup.serverUnreachable = false;
    } catch {
      cleanup.serverUnreachable = true;
    }
    cleanup.origin = origin;
  }
  await writeFile(join(output, 'transcript.json'), JSON.stringify(transcript, null, 2));
  await writeFile(
    join(output, 'result.json'),
    JSON.stringify(
      {
        paths,
        artifacts,
        requests,
        session,
        cases,
        cleanup,
        failure,
        scope:
          'Minimal test host + public SDK + actual Chrome module Worker/backend. No Canvas/product demo/physical IME proof; live 8082 untouched.',
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      output,
      cases: cases.map((c) => ({ format: c.format, pass: c.pass, stages: c.stages })),
      cleanup,
      failure,
    }),
  );
}
if (failure || !cleanup.browserInactive || !cleanup.serverUnreachable) process.exitCode = 1;
