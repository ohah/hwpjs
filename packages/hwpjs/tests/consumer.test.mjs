import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  readdirSync,
  realpathSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../.."),
  pkg = join(root, "packages/hwpjs"),
  out = join(root, "zig-out/verification/public-package-consumer");
mkdirSync(out, { recursive: true });
assert(process.env.HWPJS_TEST_WASM, "ExplicitCandidateRequired");
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const protectedPaths = [
    "package.json",
    "bun.lock",
    ...["core", "vanilla", "react", "svelte", "react-native"].map(
      (n) => "packages/" + n + "/package.json",
    ),
  ],
  before = Object.fromEntries(
    protectedPaths.map((p) => [p, existsSync(join(root, p)) ? sha(join(root, p)) : null]),
  );
const bun = execFileSync("mise", ["which", "bun"], { cwd: root, encoding: "utf8" }).trim();
const temp = mkdtempSync(join(tmpdir(), "hwpjs-public-consumer-")),
  core = join(temp, "core"),
  full = join(temp, "full"),
  archive = join(temp, "hwpjs.tgz");
mkdirSync(core);
mkdirSync(full);
const env = { ...process.env };
for (const key of ["NODE_PATH", "NODE_OPTIONS", "TS_NODE_PROJECT", "TS_NODE_COMPILER_OPTIONS"])
  delete env[key];
const results = [];
function run(name, bin, args, cwd) {
  const r = spawnSync(bin, args, { cwd, env, encoding: "utf8", timeout: 180000, maxBuffer: 16e6 });
  writeFileSync(join(out, name + ".log"), (r.stdout ?? "") + "\n" + (r.stderr ?? ""));
  results.push({ name, status: r.status, signal: r.signal });
  assert.equal(r.status, 0, name + ":" + r.stdout + r.stderr);
  return r.stdout;
}
let negativeDeclarationFixtureInjected = false;
if (process.env.HWPJS_DTS_NEGATIVE_FIXTURE === "1") {
  assert(
    realpathSync(root).startsWith(realpathSync(tmpdir()) + "/"),
    "NegativeFixtureRequiresIsolatedSourceTree",
  );
  const fixture = join(root, "packages/react-native/src/__tests__/nodefixture.d.ts");
  mkdirSync(dirname(fixture), { recursive: true });
  copyFileSync(join(pkg, "tests/fixtures/__tests__/nodefixture.d.ts"), fixture);
  negativeDeclarationFixtureInjected = true;
}
run(
  "source-build",
  bun,
  [join(root, "tools/build-public-package.mjs"), "--wasm=" + resolve(process.env.HWPJS_TEST_WASM)],
  root,
);
run("pack", bun, ["pm", "pack", "--ignore-scripts", "--filename", archive], pkg);
for (const [dir, peers] of [
  [core, false],
  [full, true],
]) {
  const deps = { "@ohah/hwpjs": "file:" + archive };
  if (peers)
    Object.assign(deps, {
      react: "19.3.1",
      "react-dom": "19.3.1",
      svelte: "5.57.2",
      typescript: "7.0.2",
      "@types/react": "19.3.0",
      "@types/react-dom": "19.3.0",
    });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "clean-consumer", private: true, type: "module", dependencies: deps }),
  );
  run(
    peers ? "install-peers" : "install-core",
    bun,
    ["install", "--ignore-scripts", "--linker", "hoisted"],
    dir,
  );
}
const script = (name, source, dir = core, args = []) => {
  writeFileSync(join(dir, name + ".mjs"), source);
  return run(name, process.execPath, [...args, name + ".mjs"], dir);
};
const fixtureRoot = join(root, "legacy/rust/documents/docs/public/demo");
for (const name of ["noori.hwp", "noori.hwpx"])
  copyFileSync(join(fixtureRoot, name), join(core, name));

test("01 packed surface is closed, with one canonical WASM and fresh types", () => {
  const names = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n");
  assert(names.every((n) => n.startsWith("package/") && !n.split("/").includes("..")));
  assert(
    !names.some(
      (n) =>
        /\/(?:node_modules|tests|__tests__)\//.test(n) ||
        n.endsWith(".map") ||
        (n.endsWith(".ts") && !n.endsWith(".d.ts")),
    ),
  );
  assert.equal(names.filter((n) => n.endsWith(".wasm")).length, 1);
  const inspectText = (directory) => {
    for (const e of readdirSync(directory, { withFileTypes: true })) {
      const p = join(directory, e.name);
      if (e.isDirectory()) inspectText(p);
      else if (/\.(?:js|ts|json|md)$/.test(p)) {
        const text = readFileSync(p, "utf8");
        assert(!text.includes("private.invalid/never-package"));
        assert(!text.includes("PrivateDeclarationExecuted"));
        assert(!text.includes("__HWPJS_PRIVATE_DTS_EXECUTED__"));
      }
    }
  };
  inspectText(join(core, "node_modules/@ohah/hwpjs"));
  const meta = JSON.parse(readFileSync(join(core, "node_modules/@ohah/hwpjs/package.json")));
  assert.deepEqual(
    Object.keys(meta.exports).sort(),
    [
      ".",
      "./runtime",
      "./vanilla",
      "./react",
      "./svelte",
      "./react-native",
      "./worker",
      "./wasm",
      "./package.json",
    ].sort(),
  );
  assert(meta.peerDependenciesMeta.react.optional && meta.peerDependenciesMeta.svelte.optional);
  assert.equal(meta.exports["."].browser, meta.exports["."].node);
  assert.equal(
    sha(join(core, "node_modules/@ohah/hwpjs/dist/hwpjs.wasm")),
    sha(resolve(process.env.HWPJS_TEST_WASM)),
  );
  const manifest = JSON.parse(readFileSync(join(pkg, "dist/build-manifest.json")));
  assert.equal(manifest.declarations, "fresh-source-emit");
  const workerText = readFileSync(join(core, "node_modules/@ohah/hwpjs/dist/worker.js"), "utf8");
  assert(
    !/\b(?:from\s*|import\s*\(\s*)["']\.\.?\//.test(workerText),
    "Worker asset must not depend on copied sibling chunks",
  );
});
test("02 core-only imports are DOM-free, peer-free and outside workspace", () =>
  script(
    "core-only",
    `import assert from 'node:assert/strict';import{lstatSync,realpathSync}from'node:fs';
for(const name of ['window','document','Worker','fetch'])Object.defineProperty(globalThis,name,{configurable:true,get(){throw Error('ImportSideEffect:'+name)}});
const c=await import('@ohah/hwpjs'),r=await import('@ohah/hwpjs/runtime');assert.equal(typeof r.createWorkerRuntimeFactory,'function');for(const name of ['react','svelte']){try{import.meta.resolve(name);assert.fail('UnexpectedPeer')}catch(e){assert.equal(e.code,'ERR_MODULE_NOT_FOUND');}}
const installed=realpathSync(new URL('./node_modules/@ohah/hwpjs',import.meta.url));assert(installed.startsWith(process.cwd()));assert(!lstatSync('./node_modules/@ohah/hwpjs').isSymbolicLink());const e=c.createEditor({runtimeFactory:()=>{throw Error('Unused')}});assert(e.getEditorState() instanceof c.EditorState);await e.dispose();assert.equal(e.getEditorState().status,'disposed');`,
  ));
test("03 actual worker_threads with explicit adapter and packed WASM handles native requests", () => {
  writeFileSync(
    join(core, "worker-host.mjs"),
    `import{parentPort,workerData}from'node:worker_threads';globalThis.postMessage=v=>parentPort.postMessage(v);await import(workerData.entry);parentPort.on('message',data=>globalThis.onmessage({data}));`,
  );
  script(
    "worker-native",
    `import assert from'node:assert/strict';import{Worker}from'node:worker_threads';import{readFileSync}from'node:fs';import{createEditor}from'@ohah/hwpjs';import{createWorkerRuntimeFactory}from'@ohah/hwpjs/runtime';
 const wasmModule=await WebAssembly.compile(readFileSync(new URL(import.meta.resolve('@ohah/hwpjs/wasm'))));let terminated=0;
 const workerFactory=entry=>{const worker=new Worker(new URL('./worker-host.mjs',import.meta.url),{workerData:{entry:String(entry)}}),listeners=new Map();return{postMessage:v=>worker.postMessage(v),terminate(){terminated++;void worker.terminate();},addEventListener(type,fn){const listener=type==='message'?data=>fn({data}):fn;listeners.set(type,listener);worker.on(type,listener);},removeEventListener(type,fn){worker.off(type,listeners.get(type));listeners.delete(type);}};};
 for(const format of ['hwp5','hwpx']){const editor=createEditor({runtimeFactory:createWorkerRuntimeFactory({wasmModule,workerURL:import.meta.resolve('@ohah/hwpjs/worker'),workerFactory})});try{await editor.load(new Uint8Array(readFileSync(format==='hwp5'?'noori.hwp':'noori.hwpx')),{format});assert.equal(editor.getEditorState().status,'ready');assert(editor.getEditorState().content.paragraphs.length>0);}finally{await editor.dispose();}}assert.equal(terminated,2);`,
  );
});
test("04 real Native both formats splice/history/save/reopen and failure boundary", () =>
  script(
    "native-edit",
    `import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createEditor,SPLICE_TEXT_COMMAND,EditorState}from'@ohah/hwpjs';import{createReaderRuntimeFactory}from'@ohah/hwpjs/runtime';const wasmModule=await WebAssembly.compile(readFileSync(new URL(import.meta.resolve('@ohah/hwpjs/wasm'))));
for(const format of ['hwp5','hwpx']){const e=createEditor({runtimeFactory:createReaderRuntimeFactory({wasmModule})});try{await e.load(new Uint8Array(readFileSync(format==='hwp5'?'noori.hwp':'noori.hwpx')),{format});const row=e.getEditorState().content.paragraphs.find(r=>r.editable&&r.selectionOwner&&r.text.length>1),original=row.text;const rowText=()=>e.getEditorState().content.paragraphs.find(r=>r.section===row.section&&r.paragraph===row.paragraph).text;const target=()=>({...e.getEditorState().token,format,coordinateSpace:'display',owner:row.selectionOwner,section:row.section,paragraph:row.paragraph,startUnit:0,endUnit:0,affinity:'forward'});const good=await e.dispatchCommand(SPLICE_TEXT_COMMAND,{target:target(),text:'PACK'});assert.equal(good.error,undefined);assert.equal(rowText(),'PACK'+original);assert(e.getEditorState() instanceof EditorState);assert.equal((await e.undo()).error,undefined);assert.equal(rowText(),original);assert.equal((await e.redo()).error,undefined);const before=e.getEditorState().operationRevision;const bad=await e.dispatchCommand(SPLICE_TEXT_COMMAND,{target:{...target(),owner:'invalid-owner'},text:'BAD'});assert(bad.error);assert.equal(e.getEditorState().operationRevision,before);const saved=await e.save({allowStaleLayout:true});await e.load(saved.bytes,{format});assert.equal(rowText(),'PACK'+original);}finally{await e.dispose();}}`,
  ));
test("05 RN provider and controller share the root EditorState constructor and editor identity sequence", () =>
  script(
    "identity",
    `import assert from'node:assert/strict';import{createEditor,EditorState}from'@ohah/hwpjs';import{createNativeProvider,createNativeEditorController}from'@ohah/hwpjs/react-native';const provider=createNativeProvider();const direct=createEditor({runtimeFactory:()=>{throw Error('Unused')}}),native=provider.createEditor(),controller=createNativeEditorController(provider);try{const states=[direct.getEditorState(),native.getEditorState(),controller.editor.getEditorState()];assert(states.every(s=>s instanceof EditorState));assert.equal(new Set(states.map(s=>s.editorId)).size,3);assert.equal(provider.availability.status,'unavailable');}finally{await direct.dispose();await native.dispose();await controller.dispose();}`,
  ));
test("06 real React and Svelte SSR import/render without browser globals", () =>
  script(
    "ssr",
    `import assert from'node:assert/strict';assert.equal(typeof window,'undefined');assert.equal(typeof document,'undefined');const core=await import('@ohah/hwpjs'),v=await import('@ohah/hwpjs/vanilla'),r=await import('@ohah/hwpjs/react'),s=await import('@ohah/hwpjs/svelte');assert.equal(typeof v.createCanvasSurface,'function');assert(import.meta.resolve('@ohah/hwpjs/svelte').endsWith('svelte.server.js'));const{createElement}=await import('react'),{renderToString}=await import('react-dom/server'),{render}=await import('svelte/server');const e=core.createEditor({runtimeFactory:()=>{throw Error('NoNativeOnSSR')}});function Probe(){const state=r.useEditorState(e);assert(state instanceof core.EditorState);assert.equal(state,e.getEditorState());return createElement(r.CanvasSurface,{editor:e});}try{assert(renderToString(createElement(Probe)).includes('data-hwpjs-react-surface'));assert(render(s.CanvasEditor,{props:{editor:e}}).body.includes('div'));}finally{await e.dispose();}`,
    full,
  ));
test("07 browser conditions select and import the actual client Svelte entry", () =>
  script(
    "browser-condition",
    `import assert from'node:assert/strict';assert(import.meta.resolve('@ohah/hwpjs/svelte').endsWith('/svelte.js'));const s=await import('@ohah/hwpjs/svelte');assert.equal(typeof s.CanvasEditor,'function');const c=await import('@ohah/hwpjs');const e=c.createEditor({runtimeFactory:()=>{throw Error('Unused')}});assert(e.getEditorState() instanceof c.EditorState);await e.dispose();`,
    full,
    ["--conditions=browser"],
  ));
test("08 packed declarations have positive assignability and real negative diagnostics", () => {
  writeFileSync(
    join(full, "positive.tsx"),
    `import{createEditor,SPLICE_TEXT_COMMAND,type HeadlessEditor}from'@ohah/hwpjs';import{createReaderRuntimeFactory}from'@ohah/hwpjs/runtime';import{createCanvasSurface}from'@ohah/hwpjs/vanilla';import{CanvasSurface}from'@ohah/hwpjs/react';import{CanvasEditor,type CanvasEditorProps}from'@ohah/hwpjs/svelte';import{createNativeProvider}from'@ohah/hwpjs/react-native';const e:HeadlessEditor=createNativeProvider().createEditor();const other=createEditor({runtimeFactory:createReaderRuntimeFactory()});createCanvasSurface({root:document.createElement('div'),editor:e});const view=<CanvasSurface editor={other}/>;const p:CanvasEditorProps={editor:e};void p;void view;void CanvasEditor;void SPLICE_TEXT_COMMAND;`,
  );
  const config = {
    compilerOptions: {
      target: "ES2023",
      module: "ESNext",
      moduleResolution: "Bundler",
      strict: true,
      skipLibCheck: false,
      jsx: "react-jsx",
      lib: ["ES2023", "DOM", "DOM.Iterable"],
      noEmit: true,
    },
    files: ["positive.tsx"],
  };
  writeFileSync(join(full, "tsconfig.json"), JSON.stringify(config));
  run("types-positive", join(full, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], full);
  writeFileSync(
    join(full, "negative.ts"),
    `import{createEditor,SPLICE_TEXT_COMMAND}from'@ohah/hwpjs';import{notAnExport}from'@ohah/hwpjs';const e=createEditor({});e.dispatchCommand(SPLICE_TEXT_COMMAND,{});`,
  );
  config.files = ["negative.ts"];
  writeFileSync(join(full, "tsconfig.json"), JSON.stringify(config));
  const r = spawnSync(join(full, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], {
    cwd: full,
    env,
    encoding: "utf8",
  });
  writeFileSync(join(out, "types-negative.log"), r.stdout + r.stderr);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /notAnExport/);
  assert.match(r.stdout, /runtimeFactory/);
  assert.match(r.stdout, /target|text/);
});
test("09 optional peers fail only on their entries and undeclared deep paths stay closed", () =>
  script(
    "optional-peers-negative",
    `import assert from'node:assert/strict';for(const spec of ['@ohah/hwpjs/react','@ohah/hwpjs/svelte']){await assert.rejects(import(spec),e=>e.code==='ERR_MODULE_NOT_FOUND');}for(const spec of ['@ohah/hwpjs/core','@ohah/hwpjs/dist/index.js']){assert.throws(()=>import.meta.resolve(spec),e=>e.code==='ERR_PACKAGE_PATH_NOT_EXPORTED');}const core=await import('@ohah/hwpjs');assert.equal(typeof core.createEditor,'function');`,
  ));

test.after(() => {
  const after = Object.fromEntries(
    protectedPaths.map((p) => [p, existsSync(join(root, p)) ? sha(join(root, p)) : null]),
  );
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  writeFileSync(
    join(out, "report.json"),
    JSON.stringify(
      {
        temporaryConsumer: temp,
        tarball: archive,
        tarballSha256: sha(archive),
        results,
        rootDepsAndInternalMetadataUnchanged: unchanged,
        scope:
          "9 independent consumer scenarios; real explicit WASM; no RN device E2E or browser GUI claim",
        negativeDeclarationFixtureInjected,
        noNodePath: !env.NODE_PATH,
        noRootSymlinks: true,
      },
      null,
      2,
    ),
  );
  assert(unchanged);
});
