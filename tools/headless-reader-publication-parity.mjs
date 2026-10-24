#!/usr/bin/env node
// nice -n 19 node tools/headless-reader-publication-parity.mjs --reference=/abs/head-copy --candidate=/abs/candidate-copy --wasm=/abs/hwpjs.wasm
// Optional --repo=/abs/fixture-repo --output=/abs/artifact-parent. Never reuses expected replies.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serialize, deserialize } from 'node:v8';
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { tmpdir, setPriority, getPriority } from 'node:os';
const here = fileURLToPath(import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function options(args) {
  const out = {};
  for (const arg of args) {
    const match = /^--([a-z]+)=(.+)$/.exec(arg);
    if (!match || !['reference','candidate','wasm','repo','output','capture','spec','result','projection'].includes(match[1]) || Object.hasOwn(out, match[1])) throw Error(`Invalid argument: ${arg}`);
    out[match[1]] = match[2];
  }
  return out;
}
function absolute(value, label) { assert(value && isAbsolute(value), `${label} must be absolute`); return realpathSync(value); }
function fingerprint(path) { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: sha(bytes) }; }
// Conservative complete literal ESM closure: computed imports and external packages are refused.
function closure(root, entry) {
  const files = new Map();
  function visit(path) {
    path = realpathSync(path);
    assert(!relative(root, path).startsWith('..'), `Source escapes copy: ${path}`);
    if (files.has(path)) return;
    const source = readFileSync(path, 'utf8');
    files.set(path, { ...fingerprint(path), relative: relative(root, path) });
    const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g)].map(m => m[1]);
    assert(!/\bimport\s*\(\s*[^\s"']/.test(source), `Computed import not fingerprintable: ${path}`);
    for (const specifier of imports) {
      if (specifier.startsWith('node:')) continue;
      assert(specifier.startsWith('.'), `External import not fingerprintable: ${specifier}`);
      visit(resolve(dirname(path), specifier));
    }
  }
  visit(entry);
  return [...files.values()].sort((a,b) => a.relative.localeCompare(b.relative));
}
function makeCases(repo) {
  const fixture = name => absolute(join(repo, 'legacy/rust/crates/hwp-core/tests/fixtures', name), 'fixture');
  const step = (message, error = null) => ({ message, error });
  const save = () => step({kind:'save', allowStaleLayout:true});
  return [
    ...['hwp5','hwpx'].map(format => ({ name:`charshape-${format}`, fixture:fixture(`charshape.${format === 'hwp5' ? 'hwp' : 'hwpx'}`), format, steps:[
      step({kind:'load'}), step({kind:'query-edit-window',offset:0,count:1}, 'EditorNotOpen'), step({kind:'enable'}), save(),
      step({kind:'splice',section:0,paragraph:1,startUnit:0,endUnit:0,text:'Parity한글😀'}), save(), step({kind:'undo'}), step({kind:'redo'}),
      step({kind:'set-edit-window',offset:1,count:1}), step({kind:'query-window',offset:1,count:1}), step({kind:'query-edit-window',offset:1,count:1}),
      step({kind:'set-edit-window',offset:-1,count:1}, 'InvalidParagraphWindow'), step({kind:'set-edit-window',offset:null,count:null}),
      step({kind:'parity-unknown-command'}, 'UnknownPreviewCommand'), save(),
    ]})),
    ...['hwp5','hwpx'].map(format => ({name:`password-${format}`, fixture:fixture(`password-12345.${format === 'hwp5' ? 'hwp' : 'hwpx'}`), format, steps:[
      step({kind:'load'}, format === 'hwpx' ? 'EncryptedDocument' : 'UnsupportedEncryption'),
      step({kind:'unlock',password:'wrong'}, 'WrongPasswordOrCorruptPayload'), step({kind:'unlock',password:'12345'}), step({kind:'enable'}),
      step({kind:'save',allowStaleLayout:true}, 'PasswordProtectionRemovalNotAcknowledged'), step({kind:'save',allowStaleLayout:true,allowUnprotectedOutput:true}),
    ]})),
    {name:'pua-normalization', fixture:absolute(join(repo,'reference/rhwp/samples/pua-test.hwp'),'PUA fixture'), format:'hwp5', steps:[step({kind:'load'}),step({kind:'enable',normalizeObservedCfb:true}),save()]},
  ];
}
async function capture(o) {
  const spec = deserialize(readFileSync(o.spec));
  const entry = join(spec.root,'web/preview',o.capture === 'reference' ? 'reader-worker.mjs' : 'reader-runtime.mjs');
  const before = closure(spec.root, entry), wasm = fingerprint(spec.wasm), fixture = fingerprint(spec.case.fixture);
  const wasmModule = await WebAssembly.compile(readFileSync(spec.wasm));
  let runtime, dispatch;
  if (o.capture === 'reference') {
    const replies = [];
    globalThis.self = {postMessage: value => replies.push(structuredClone(value))};
    globalThis.fetch = async () => { throw Error('UnexpectedFetch: explicit WASM required'); };
    await import(pathToFileURL(entry).href);
    assert.equal(typeof self.onmessage, 'function');
    dispatch = async message => { await self.onmessage({data:message}); assert.equal(replies.length,1,'one wire reply per request'); return replies.shift(); };
  } else {
    assert.equal(o.capture,'candidate');
    const {createReaderRuntime} = await import(pathToFileURL(entry).href);
    runtime = await createReaderRuntime({wasmModule,allowReload:true});
    dispatch = async message => structuredClone(await runtime.request(message));
  }
  const records = [];
  try {
    for (const [index, step] of spec.case.steps.entries()) {
      const message = {...structuredClone(step.message),origin:`parity:${spec.case.name}:${index}`};
      if (message.kind === 'load') Object.assign(message,{format:spec.case.format,bytes:new Uint8Array(readFileSync(spec.case.fixture)),wasmModule});
      const request = structuredClone(message); delete request.wasmModule;
      const reply = await dispatch(structuredClone(message));
      records.push({request,reply});
    }
  } finally { await runtime?.dispose(); }
  assert.deepStrictEqual(closure(spec.root,entry),before,'Source changed during capture');
  assert.deepStrictEqual(fingerprint(spec.wasm),wasm,'WASM changed during capture');
  assert.deepStrictEqual(fingerprint(spec.case.fixture),fixture,'Fixture changed during capture');
  writeFileSync(o.result,serialize({records,closure:before,wasm,fixture,node:process.version,priority:getPriority(),pid:process.pid}));
}
function runChild(mode,spec,result) {
  const child = spawnSync('nice',['-n','19',process.execPath,here,`--capture=${mode}`,`--spec=${spec}`,`--result=${result}`],{encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
  writeFileSync(`${result}.log`,`${child.stdout ?? ''}${child.stderr ?? ''}`);
  assert.equal(child.error,undefined,child.error?.message);
  assert.equal(child.status,0,`${mode} capture failed: ${child.stderr}`);
  return deserialize(readFileSync(result));
}
function declaredReferenceProjection(records,referenceRecords) {
  const copy=deserialize(serialize(records));let bindings=0,diagnostics=0,scope;
  for(const [index,record] of copy.entries()) {
    const content=record.reply.content,original=referenceRecords[index].reply.content;
    if(!content)continue;
    if(Object.hasOwn(content,'currentReferenceErrors')) {
      assert(!Object.hasOwn(original,'currentReferenceErrors'),'Reference already has added field');
      assert.deepStrictEqual(content.currentReferenceErrors,[],'Known fixture bindings must all resolve');
      delete content.currentReferenceErrors;diagnostics++;
    }
    for(const [rowIndex,row] of (content.paragraphs??[]).entries()) {
      if(!Object.hasOwn(row,'currentReference'))continue;
      assert(!Object.hasOwn(original.paragraphs[rowIndex],'currentReference'),'Reference already has binding');
      const ref=row.currentReference;
      assert.equal(Object.keys(ref).sort().join(), 'column,epoch,id,kind,row,scope,section');
      assert.equal(ref.kind,'original');assert.equal(ref.section,row.section);assert.equal(ref.row,0);assert.equal(ref.column,0);
      assert.match(ref.epoch,/^[1-9][0-9]*$/);assert(BigInt(ref.epoch)<=0xffffffffffffffffn);
      assert.match(ref.id,/^(0|[1-9][0-9]*)$/);assert(BigInt(ref.id)<=0xffffffffn);
      assert.match(ref.scope,/^[1-9][0-9]*$/);scope??=ref.scope;assert.equal(ref.scope,scope,'One in-process session scope per case');
      delete row.currentReference;bindings++;
    }
  }
  assert(bindings>0&&diagnostics>0,'Declared projection must actually be present');
  return {records:copy,bindings,diagnostics};
}
async function main(o) {
  setPriority(0,19);
  assert(o.projection===undefined||o.projection==='current-references','UnknownDeclaredProjection');
  const repo = absolute(o.repo ?? resolve(dirname(here),'..'),'repo');
  const reference = absolute(o.reference,'reference'), candidate = absolute(o.candidate,'candidate'), wasm = absolute(o.wasm,'wasm');
  assert.notEqual(reference,candidate,'Independent copies required');
  const output = o.output ? absolute(o.output,'output parent') : tmpdir();
  const artifact = mkdtempSync(join(output,'hwpjs-publication-parity-'));
  console.log(`artifact: ${artifact}`);
  const git = args => execFileSync('git',['-C',repo,...args]);
  const head = git(['rev-parse','HEAD']).toString().trim();
  const referenceClosure = closure(reference,join(reference,'web/preview/reader-worker.mjs'));
  for (const file of referenceClosure) assert.equal(file.sha256,sha(git(['show',`${head}:${file.relative}`])),`Reference is not exact HEAD: ${file.relative}`);
  const candidateClosure = closure(candidate,join(candidate,'web/preview/reader-runtime.mjs'));
  const cases = makeCases(repo);
  const manifest = {head,reference,candidate,wasm:fingerprint(wasm),referenceClosure,candidateClosure,cases,artifact,started:new Date().toISOString(),scopeNormalization:'none',declaredProjection:o.projection??null,limitations:['Headless Node wire parity only; no browser, rendering, native build or product deployment proof.','Literal ESM source closure is fingerprinted; computed/external imports are refused.','Fixed fixtures and command sequences do not cover every command or ABI availability combination.']};
  const manifestPath = join(artifact,'manifest.json');
  writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
  const references = [];
  // Finish and persist ALL fresh HEAD baselines before importing any candidate.
  for (const c of cases) {
    const spec = join(artifact,`${c.name}.reference.spec.v8`), result = join(artifact,`${c.name}.reference.v8`);
    writeFileSync(spec,serialize({root:reference,wasm,case:c}));
    const captured = runChild('reference',spec,result);
    assert.deepStrictEqual(captured.closure,referenceClosure,'Reference closure drift');
    references.push(captured);
    for (const [i,step] of c.steps.entries()) assert.equal(captured.records[i].reply.error ?? null,step.error,`Reference contract failed ${c.name}[${i}]`);
    if(c.name.startsWith('password')) assert.equal(captured.records[0].reply.passwordRequired,true);
  }
  manifest.referenceCompleted = new Date().toISOString();
  writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
  const results = [];
  for (const [index,c] of cases.entries()) {
    const spec = join(artifact,`${c.name}.candidate.spec.v8`), result = join(artifact,`${c.name}.candidate.v8`);
    writeFileSync(spec,serialize({root:candidate,wasm,case:c}));
    const captured = runChild('candidate',spec,result);
    assert.deepStrictEqual(captured.closure,candidateClosure,'Candidate closure drift');
    assert.equal(captured.wasm.sha256,references[index].wasm.sha256);
    assert.equal(captured.fixture.sha256,references[index].fixture.sha256);
    try {
      const projected=o.projection==='current-references'&&c.format==='hwp5'?declaredReferenceProjection(captured.records,references[index].records):undefined;
      assert.deepStrictEqual(projected?.records??captured.records,references[index].records);
      results.push({name:c.name,pass:true,replies:captured.records.length,...(projected?{declaredBindings:projected.bindings,declaredDiagnostics:projected.diagnostics}:{})});
    }
    catch(error) { writeFileSync(join(artifact,`${c.name}.diff.txt`),error.stack); results.push({name:c.name,pass:false}); }
  }
  assert.equal(git(['rev-parse','HEAD']).toString().trim(),head,'HEAD changed during audit');
  assert.deepStrictEqual(closure(reference,join(reference,'web/preview/reader-worker.mjs')),referenceClosure);
  assert.deepStrictEqual(closure(candidate,join(candidate,'web/preview/reader-runtime.mjs')),candidateClosure);
  const summary = {artifact,head,declaredProjection:o.projection??null,results,pass:results.every(r=>r.pass),limitations:manifest.limitations};
  writeFileSync(join(artifact,'summary.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary,null,2));
  if (!summary.pass) process.exitCode=1;
}
try { const o=options(process.argv.slice(2)); if(o.capture) await capture(o); else await main(o); }
catch(error) { console.error(error.stack); process.exitCode=1; }
