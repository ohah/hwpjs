import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { runCLI } from '../src/main.mjs';
import { createFiles } from '../src/files.mjs';
const metadata = (text) =>
  Object.fromEntries(
    text
      .trimEnd()
      .split('\n')
      .map((line) => {
        const at = line.indexOf(': ');
        return [line.slice(0, at), line.slice(at + 2)];
      }),
  );
const hash = (b) => createHash('sha256').update(b).digest('hex');
async function setup(t, format = 'hwp5') {
  const dir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'hwpjs-cli-host-main-')));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(join(dir, 'input.any'), 'original');
  await fs.writeFile(join(dir, 'native.wasm'), Uint8Array.of(0, 97, 115, 109));
  const calls = [],
    out = [],
    err = [];
  const engine = {
    async read(value) {
      calls.push({ kind: 'read', ...value });
      return {
        format,
        model: { version: 1, format, sourceSha256: hash(value.bytes), token: 'opaque-model' },
      };
    },
    async edit(value) {
      calls.push({ kind: 'edit', ...value });
      return { format, bytes: Uint8Array.of(1, 2, 3), changed: true, layoutRequiresReflow: false };
    },
  };
  const files = createFiles({ cwd: () => dir });
  const deps = {
    engine,
    renderDocument: (model, options) => `${model.token} ${options.format}`,
    files,
    io: { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) } },
    mainModuleURL: pathToFileURL(join(dir, 'bin.mjs')),
  };
  const edit = (...more) => [
    'edit',
    'input.any',
    '--target=s7:p4294967295',
    '--replace=old',
    '--with=new',
    '--expect-sha256=' + hash('original'),
    '--output=' + join(dir, format === 'hwp5' ? 'out.hwp' : 'out.hwpx'),
    '--wasm=native.wasm',
    ...more,
  ];
  return { dir, calls, out, err, engine, files, deps, edit };
}

test('help and malformed arguments never preprocess input/WASM or call engine', async () => {
  const noTouch = new Proxy(
      {},
      {
        get() {
          throw Error('MustNotTouch');
        },
      },
    ),
    out = [],
    err = [];
  const deps = {
    engine: noTouch,
    files: noTouch,
    io: { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) } },
  };
  assert.equal(await runCLI(['--help'], deps), 0);
  assert.match(out.join(''), /Read defaults to text/);
  assert.equal(await runCLI(['edit', 'x', '--force'], deps), 2);
  assert.match(err.join(''), /UnknownOption/);
});
test('text/markdown read render body-only with source SHA exactly once and no engine FS path', async (t) => {
  for (const format of [undefined, 'markdown']) {
    const f = await setup(t);
    let rendered;
    f.deps.renderDocument = (model, options) => {
      rendered = { model, options };
      return 'BODY';
    };
    const argv = [
      'read',
      'input.any',
      '--wasm=native.wasm',
      ...(format ? ['--format=' + format] : []),
    ];
    assert.equal(await runCLI(argv, f.deps), 0);
    assert.equal(f.out.join(''), `format: hwp5\ndocumentSHA256: ${hash('original')}\nBODY\n`);
    assert.equal((f.out.join('').match(/documentSHA256:/g) || []).length, 1);
    assert.equal(rendered.options.format, format ?? 'text');
    assert.equal(rendered.model.token, 'opaque-model');
    assert.ok(f.calls[0].bytes instanceof Uint8Array && f.calls[0].wasm instanceof Uint8Array);
    assert.equal(Object.hasOwn(f.calls[0], 'wasmPath'), false);
    assert.equal(await fs.readFile(join(f.dir, 'input.any'), 'utf8'), 'original');
  }
});
test('edit SHA mismatch refuses before engine or even WASM reading', async (t) => {
  const f = await setup(t),
    read = [];
  f.deps.files = {
    ...f.files,
    readInputSnapshot: async (...args) => {
      read.push(args[0]);
      return f.files.readInputSnapshot(...args);
    },
  };
  const argv = f
    .edit()
    .map((a) => (a.startsWith('--expect-sha256=') ? '--expect-sha256=' + '0'.repeat(64) : a));
  assert.equal(await runCLI(argv, f.deps), 1);
  assert.match(f.err.join(''), /SourceSHA256Mismatch/);
  assert.deepEqual(read, ['input.any']);
  assert.equal(f.calls.length, 0);
  await assert.rejects(fs.lstat(join(f.dir, 'out.hwp')), { code: 'ENOENT' });
});
test('existing/source/hardlink output collisions refuse before engine', async (t) => {
  for (const kind of ['existing', 'source', 'hardlink']) {
    const f = await setup(t),
      out = kind === 'source' ? join(f.dir, 'input.any') : join(f.dir, 'out.hwp');
    if (kind === 'existing') await fs.writeFile(out, 'other');
    if (kind === 'hardlink') await fs.link(join(f.dir, 'input.any'), out);
    const argv = f.edit().map((a) => (a.startsWith('--output=') ? '--output=' + out : a));
    assert.equal(await runCLI(argv, f.deps), 1);
    assert.equal(f.calls.length, 0);
    assert.equal(await fs.readFile(join(f.dir, 'input.any'), 'utf8'), 'original');
    if (kind === 'existing') assert.equal(await fs.readFile(out, 'utf8'), 'other');
  }
});
test('edit passes exact native numbers/text/empty replacement and explicit H5 policy then publishes', async (t) => {
  const f = await setup(t),
    argv = f.edit('--allow-stale-layout').map((a) => (a === '--with=new' ? '--with=' : a));
  assert.equal(await runCLI(argv, f.deps), 0);
  const call = f.calls[0];
  assert.deepEqual(call.target, { section: 7, paragraph: 4294967295 });
  assert.equal(call.with, '');
  assert.equal(call.replace, 'old');
  assert.equal(call.allowStaleLayout, true);
  const result = metadata(f.out.join(''));
  assert.equal(result.format, 'hwp5');
  assert.equal(result.changed, 'true');
  assert.equal(result.sha256, hash(Uint8Array.of(1, 2, 3)));
  assert.deepEqual([...(await fs.readFile(result.output))], [1, 2, 3]);
  assert.equal(await fs.readFile(join(f.dir, 'input.any'), 'utf8'), 'original');
});
test('actual detected HX format wins over input suffix and p0 reaches engine unchanged', async (t) => {
  const f = await setup(t, 'hwpx'),
    argv = f.edit().map((a) => (a === '--target=s7:p4294967295' ? '--target=s7:p0' : a));
  assert.equal(await runCLI(argv, f.deps), 0);
  assert.deepEqual(f.calls[0].target, { section: 7, paragraph: 0 });
  assert.equal(f.calls[0].allowStaleLayout, false);
  assert.equal(metadata(f.out.join('')).format, 'hwpx');
});
test('actual format mismatch after engine leaves output absent rather than converting formats', async (t) => {
  const f = await setup(t),
    argv = f
      .edit()
      .map((a) => (a.startsWith('--output=') ? '--output=' + join(f.dir, 'out.hwpx') : a));
  assert.equal(await runCLI(argv, f.deps), 1);
  assert.equal(f.calls.length, 1);
  assert.match(f.err.join(''), /OutputFormatMismatch/);
  await assert.rejects(fs.lstat(join(f.dir, 'out.hwpx')), { code: 'ENOENT' });
});
test('engine match/inventory/save refusals leave original and outputs untouched', async (t) => {
  for (const reason of [
    'MatchNotFound',
    'AmbiguousMatch',
    'InvalidCellDisplayOwner',
    'LayoutReflowRequired',
  ]) {
    const f = await setup(t);
    f.engine.edit = async () => {
      throw Error(reason);
    };
    assert.equal(await runCLI(f.edit(), f.deps), 1);
    assert.match(f.err.join(''), new RegExp(reason));
    await assert.rejects(fs.lstat(join(f.dir, 'out.hwp')), { code: 'ENOENT' });
    assert.equal(await fs.readFile(join(f.dir, 'input.any'), 'utf8'), 'original');
  }
});
test('source execution without adjacent WASM asks explicitly and has no ignored fallback', async (t) => {
  const f = await setup(t);
  const argv = f.edit().filter((a) => !a.startsWith('--wasm='));
  assert.equal(await runCLI(argv, f.deps), 1);
  assert.match(f.err.join(''), /ExplicitWasmRequired/);
  assert.equal(f.calls.length, 0);
});
test('renderer failure emits no partial read header or body', async (t) => {
  const f = await setup(t);
  f.deps.renderDocument = () => {
    throw Error('RendererFailed');
  };
  assert.equal(await runCLI(['read', 'input.any', '--wasm=native.wasm'], f.deps), 1);
  assert.deepEqual(f.out, []);
});
test('a published result remains explicit if stdout reporting fails after commit', async (t) => {
  const f = await setup(t);
  f.deps.io.stdout.write = () => {
    throw Error('BrokenPipe');
  };
  assert.equal(await runCLI(f.edit(), f.deps), 1);
  const err = metadata(f.err.join(''));
  assert.equal(err.published, 'true');
  assert.equal(err.output, join(f.dir, 'out.hwp'));
  assert.deepEqual([...(await fs.readFile(err.output))], [1, 2, 3]);
});
test('main import has no argv autorun and bin help works without engine or Native', () => {
  const url = new URL('../src/main.mjs', import.meta.url).href;
  const text = execFileSync(
    process.execPath,
    [
      '--max-old-space-size=64',
      '--input-type=module',
      '-e',
      `process.argv=['node','main.mjs','edit','nonexistent'];await import(${JSON.stringify(url)});console.log('pure');`,
    ],
    { encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(text.trim(), 'pure');
  const help = execFileSync(
    process.execPath,
    [
      '--max-old-space-size=64',
      fileURLToPath(new URL('../src/bin.mjs', import.meta.url)),
      '--help',
    ],
    { encoding: 'utf8', timeout: 5000 },
  );
  assert.match(help, /hwpjs read INPUT/);
});

test('main reads document64MiB and WASM32MiB explicitly before passing bytes to engine', async (t) => {
  const f = await setup(t),
    reads = [];
  f.deps.files = {
    ...f.files,
    async readInputSnapshot(path, options) {
      reads.push({ path, maxBytes: options.maxBytes });
      return f.files.readInputSnapshot(path, options);
    },
  };
  assert.equal(await runCLI(['read', 'input.any', '--wasm=native.wasm'], f.deps), 0);
  assert.equal(reads[0].maxBytes, 64 * 1024 * 1024);
  assert.equal(reads[1].maxBytes, 32 * 1024 * 1024);
});

test('an explicit known-no-op output preserves the original bytes and reports changedfalse', async (t) => {
  const f = await setup(t);
  f.engine.edit = async (value) => ({
    format: 'hwp5',
    bytes: value.bytes,
    changed: false,
    layoutRequiresReflow: false,
  });
  assert.equal(await runCLI(f.edit(), f.deps), 0);
  const result = metadata(f.out.join(''));
  assert.equal(result.changed, 'false');
  assert.equal(result.sha256, hash('original'));
  assert.equal(await fs.readFile(result.output, 'utf8'), 'original');
});

test('WASM limit failure still refuses before engine without reducing document64MiB allowance', async (t) => {
  const f = await setup(t),
    wasm = join(f.dir, 'native.wasm');
  await fs.truncate(wasm, 32 * 1024 * 1024 + 1);
  assert.equal(await runCLI(['read', 'input.any', '--wasm=native.wasm'], f.deps), 1);
  assert.match(f.err.join(''), /FileTooLarge/);
  assert.equal(f.calls.length, 0);
});

test('default Node stdout callback failure becomes a diagnostic exit instead of uncaught pipe error', () => {
  const url = new URL('../src/main.mjs', import.meta.url).href;
  const code = `const {runCLI}=await import(${JSON.stringify(url)});process.stdout.write=(_text,callback)=>{const error=Object.assign(Error('PipeClosed'),{code:'EPIPE'});queueMicrotask(()=>{callback(error);process.stdout.emit('error',error);});return false;};process.exitCode=await runCLI(['--help']);`;
  const result = spawnSync(
    process.execPath,
    ['--max-old-space-size=64', '--input-type=module', '-e', code],
    { encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /error: EPIPE/);
  assert.doesNotMatch(result.stderr, /Unhandled|triggerUncaughtException/);
});

test('read rejects mismatched SHA, format and model version before renderer or stdout', async (t) => {
  for (const change of [
    { sourceSha256: '0'.repeat(64) },
    { format: 'hwpx' },
    { version: 2 },
    { version: undefined },
  ]) {
    const f = await setup(t);
    f.engine.read = async () => ({
      format: 'hwp5',
      model: { version: 1, format: 'hwp5', sourceSha256: hash('original'), ...change },
    });
    f.deps.renderDocument = () => {
      throw Error('MustNotRender');
    };
    assert.equal(await runCLI(['read', 'input.any', '--wasm=native.wasm'], f.deps), 1);
    assert.deepEqual(f.out, []);
    assert.match(f.err.join(''), /error: InvalidEngineModel\npublished: false/);
  }
});

test('scalar output paths and error messages escape C0 instead of injecting metadata lines', async (t) => {
  const f = await setup(t),
    path = join(f.dir, 'out\nwarning: injected\t.hwp');
  assert.equal(
    await runCLI(
      f.edit().map((value) => (value.startsWith('--output=') ? '--output=' + path : value)),
      f.deps,
    ),
    0,
  );
  assert.match(f.out.join(''), /out\\u000awarning: injected\\u0009.hwp/);
  assert.equal(
    f.out
      .join('')
      .split('\n')
      .filter((line) => line.startsWith('warning:')).length,
    0,
  );
  assert.deepEqual([...(await fs.readFile(path))], [1, 2, 3]);
  const e = await setup(t);
  e.engine.edit = async () => {
    throw Error('Bad\noutput: injected\u001b');
  };
  assert.equal(await runCLI(e.edit(), e.deps), 1);
  assert.match(e.err.join(''), /error: Bad\\u000aoutput: injected\\u001b/);
});

test('default Writable callback is awaited even when write returns false', () => {
  const url = new URL('../src/main.mjs', import.meta.url).href;
  const code = `const {runCLI}=await import(${JSON.stringify(url)});let flushed=false;process.stdout.write=(_text,callback)=>{setTimeout(()=>{flushed=true;callback();},20);return false;};const status=await runCLI(['--help']);process.stderr.write(flushed&&status===0?'flushed':'premature');`;
  const result = spawnSync(
    process.execPath,
    ['--max-old-space-size=64', '--input-type=module', '-e', code],
    { encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stderr, 'flushed');
});

test('default Writable callback EPIPE then error event retains published status', () => {
  const url = new URL('../src/main.mjs', import.meta.url).href;
  const code = `const {runCLI}=await import(${JSON.stringify(url)});process.stdout.write=(_text,callback)=>{const error=Object.assign(Error('PipeClosed'),{code:'EPIPE'});queueMicrotask(()=>{callback(error);process.stdout.emit('error',error);});return false;};const sha='a'.repeat(64);process.exitCode=await runCLI(['edit','input','--target=s0:p0','--replace=a','--with=b','--expect-sha256='+sha,'--output=out.hwp'],{files:{readInputSnapshot:async()=>({bytes:new Uint8Array([1]),sha256:sha}),assertNewOutput:async()=>({}),resolveWasmPath:()=>'/wasm',assertOutputFormat:()=>{},publishNewOutput:async()=>({path:'/out.hwp',sha256:sha,warnings:[]})},engine:{edit:async()=>({format:'hwp5',bytes:new Uint8Array([2]),changed:true,layoutRequiresReflow:false})}});`;
  const result = spawnSync(
    process.execPath,
    ['--max-old-space-size=64', '--input-type=module', '-e', code],
    { encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /error: EPIPE\npublished: true\noutput: \/out.hwp/);
  assert.doesNotMatch(result.stderr, /Unhandled|triggerUncaughtException/);
});
