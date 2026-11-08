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
test('structure 읽기는 기존 포맷과 원문 SHA를 한 번만 포함한다', async (t) => {
  for (const format of [undefined, 'markdown']) {
    const f = await setup(t);
    let rendered;
    f.deps.renderDocument = (model, options) => {
      rendered = { model, options };
      return 'BODY';
    };
    const argv = [
      'read',
      '--view=structure',
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

async function imageHost(t, { failure, inventoryFailure, closeFailure, images = 2 } = {}) {
  const f = await setup(t);
  const counts = { opened: 0, documentClosed: 0, imagesClosed: 0, reads: [] };
  const rows = Array.from({ length: images }, (_, i) => ({
    id: `hwp5:s0:i${i + 1}`,
    status: 'unread',
    mime: null,
    extension: null,
    byteLength: null,
  }));
  f.engine.openDocument = async (options) => {
    counts.opened++;
    assert.equal(options.expectedSha256, hash('original'));
    return {
      format: 'hwp5',
      sourceSha256: hash('original'),
      sectionCount: 1,
      sdk: { borrowed: true },
      close() {
        counts.documentClosed++;
      },
    };
  };
  f.deps.createDocumentImages = ({ sdk }) => {
    assert.equal(sdk.borrowed, true);
    if (inventoryFailure) throw Error('ImageInventoryUnavailable');
    return {
      list: () => ({
        version: 1,
        format: 'hwp5',
        sourceSha256: hash('original'),
        images: rows.map((r) => ({ ...r })),
        coverage: {
          scope: 'section-picture-sites',
          masterPagesIncluded: false,
          imageBrushesIncluded: false,
        },
      }),
      read(id, { sourceSha256 }) {
        assert.equal(sourceSha256, hash('original'));
        counts.reads.push(id);
        const row = rows.find((r) => r.id === id);
        if (id === failure) {
          Object.assign(row, { status: 'unsupported', reason: 'ExternalImageLink' });
          throw Error('ExternalImageLink');
        }
        Object.assign(row, {
          status: 'ready',
          mime: 'application/octet-stream',
          extension: '.bin',
          recognized: false,
          byteLength: 3,
        });
        return { ...row, sourceSha256, bytes: Uint8Array.of(9, 8, 7) };
      },
      close() {
        counts.imagesClosed++;
        if (closeFailure) throw Error('ImageCloseFailed');
      },
    };
  };
  return { ...f, counts };
}
test('info preserves unknown observations and source hash without loading editing engine', async (t) => {
  const f = await setup(t);
  f.deps.engine = new Proxy(
    {},
    {
      get() {
        throw Error('MustNotLoadEngine');
      },
    },
  );
  f.deps.inspectDocument = async ({ bytes }) => ({
    schemaVersion: 1,
    format: 'hwp5',
    sourceSha256: hash(bytes),
    sourceByteLength: bytes.length,
    sectionCount: 1,
    security: { encryption: { status: 'unknown', value: null, reason: 'Unobserved' } },
  });
  assert.equal(await runCLI(['info', 'input.any', '--wasm=native.wasm'], f.deps), 0);
  assert.match(
    f.out.join(''),
    /security.encryption.status: unknown\nsecurity.encryption.value: unknown/,
  );
  assert.doesNotMatch(f.out.join(''), /encryption.*false/);
});
test('images lists failed/unsupported and raw unknown metadata with scoped coverage and closes borrowed lifetime', async (t) => {
  const f = await imageHost(t, { failure: 'hwp5:s0:i2' });
  assert.equal(await runCLI(['images', 'input.any', '--wasm=native.wasm'], f.deps), 0);
  assert.match(f.out.join(''), /images.0.recognized: false/);
  assert.match(f.out.join(''), /images.1.status: unsupported/);
  assert.match(f.out.join(''), /coverage.masterPagesIncluded: false/);
  assert.match(f.out.join(''), /scopeDiagnostic: .*unreferenced resources/);
  assert.equal(f.counts.documentClosed, 1);
  assert.equal(f.counts.imagesClosed, 1);
});
test('all extraction uses one snapshot, safe generated names, preserves raw bytes and refuses retry', async (t) => {
  const f = await imageHost(t);
  const args = ['extract-images', 'input.any', '--output=images', '--wasm=native.wasm'];
  assert.equal(await runCLI(args, f.deps), 0);
  assert.equal(f.counts.opened, 1);
  assert.deepEqual(await fs.readdir(join(f.dir, 'images')), ['image-0001.bin', 'image-0002.bin']);
  assert.deepEqual([...(await fs.readFile(join(f.dir, 'images', 'image-0001.bin')))], [9, 8, 7]);
  assert.match(f.out.join(''), /completeWithinListedScope: true/);
  assert.equal(await runCLI(args, f.deps), 1);
  assert.match(f.err.join(''), /OutputExists/);
  assert.equal(await fs.readFile(join(f.dir, 'input.any'), 'utf8'), 'original');
});
test('partial extraction fails honestly and retains first publication on later source/read/output failures', async (t) => {
  const f = await imageHost(t, { failure: 'hwp5:s0:i2' });
  assert.equal(
    await runCLI(['extract-images', 'input.any', '--output=partial', '--wasm=native.wasm'], f.deps),
    1,
  );
  assert.match(f.out.join(''), /completeWithinListedScope: false/);
  assert.match(f.err.join(''), /IncompleteImageExtraction\npublished: true/);
  assert.match(f.err.join(''), /publishedImages.0.path: .*image-0001.bin/);
  assert.deepEqual(await fs.readdir(join(f.dir, 'partial')), ['image-0001.bin']);
  assert.equal(f.counts.imagesClosed, 1);
  assert.equal(f.counts.documentClosed, 1);
});
test('ID snapshot mismatch rejects before WASM/native; unknown ID and inventory failure create no output', async (t) => {
  const f = await imageHost(t);
  assert.equal(
    await runCLI(
      [
        'extract-images',
        'input.any',
        '--output=bad',
        '--id=hwp5:s0:i1',
        '--expect-sha256=' + '0'.repeat(64),
        '--wasm=absent',
      ],
      f.deps,
    ),
    1,
  );
  assert.equal(f.counts.opened, 0);
  assert.equal(
    await runCLI(
      [
        'extract-images',
        'input.any',
        '--output=bad',
        '--id=hwp5:s0:i999',
        '--expect-sha256=' + hash('original'),
        '--wasm=native.wasm',
      ],
      f.deps,
    ),
    1,
  );
  await assert.rejects(fs.lstat(join(f.dir, 'bad')), { code: 'ENOENT' });
  const unavailable = await imageHost(t, { inventoryFailure: true });
  assert.equal(
    await runCLI(
      ['extract-images', 'input.any', '--output=bad', '--wasm=native.wasm'],
      unavailable.deps,
    ),
    1,
  );
  assert.equal(unavailable.counts.documentClosed, 1);
  await assert.rejects(fs.lstat(join(unavailable.dir, 'bad')), { code: 'ENOENT' });
});
test('MCP single-file internal host mode requires ID and guards output extension, no overwrite', async (t) => {
  const f = await imageHost(t);
  f.deps.imageOutputMode = 'file';
  const args = [
    'extract-images',
    'input.any',
    '--output=single.bin',
    '--id=hwp5:s0:i1',
    '--expect-sha256=' + hash('original'),
    '--wasm=native.wasm',
  ];
  assert.equal(await runCLI(args, f.deps), 0);
  assert.deepEqual([...(await fs.readFile(join(f.dir, 'single.bin')))], [9, 8, 7]);
  assert.equal(await runCLI(args, f.deps), 1);
  assert.match(f.err.join(''), /OutputExists/);
  assert.equal(
    await runCLI(
      args.map((s) => (s === '--output=single.bin' ? '--output=wrong.png' : s)),
      f.deps,
    ),
    1,
  );
  assert.match(f.out.join('') + f.err.join(''), /OutputImageExtensionMismatch/);
  await assert.rejects(fs.lstat(join(f.dir, 'wrong.png')), { code: 'ENOENT' });
});
test('post-publication stream/close failures retain publication and always close document', async (t) => {
  for (const closeFailure of [false, true]) {
    const f = await imageHost(t, { closeFailure, images: 1 });
    if (!closeFailure)
      f.deps.io.stdout.write = () => {
        throw Error('BrokenStdout');
      };
    assert.equal(
      await runCLI(['extract-images', 'input.any', '--output=done', '--wasm=native.wasm'], f.deps),
      1,
    );
    assert.match(f.err.join(''), /published: true/);
    assert.equal(f.counts.documentClosed, 1);
    assert.equal(f.counts.imagesClosed, 1);
  }
});

function receiptBudgetHost({
  count = 4096,
  path = '/' + Array(5).fill('a'.repeat(180)).join('/'),
  warning,
} = {}) {
  const source = 'a'.repeat(64),
    rows = Array.from({ length: count }, (_, i) => ({ id: `hwpx:s0:i${i}` }));
  const calls = { published: 0, closed: 0, reads: 0, out: [], err: [] };
  const deps = {
    files: {
      async readInputSnapshot() {
        return { bytes: Uint8Array.of(1), sha256: source };
      },
      resolveWasmPath() {
        return 'wasm';
      },
      async createImageDirectory() {
        return { path };
      },
      async assertNewOutput({ outputPath }) {
        return { path: outputPath };
      },
      assertImageFormat() {},
      async publishNewOutput({ target }) {
        calls.published++;
        return {
          published: true,
          path: target.path,
          sha256: source,
          bytes: 1,
          warnings: warning ? [{ phase: 'injected', code: warning }] : [],
        };
      },
    },
    engine: {
      async openDocument() {
        return {
          format: 'hwpx',
          sourceSha256: source,
          sectionCount: 1,
          sdk: {},
          close() {
            calls.closed++;
          },
        };
      },
    },
    createDocumentImages() {
      return {
        list() {
          return {
            version: 1,
            format: 'hwpx',
            sourceSha256: source,
            images: rows,
            coverage: { references: count, inventoryComplete: true },
          };
        },
        read(id) {
          calls.reads++;
          return {
            id,
            sourceSha256: source,
            status: 'ready',
            bytes: Uint8Array.of(1),
            extension: '.bin',
          };
        },
        close() {
          calls.closed++;
        },
      };
    },
    io: {
      stdout: {
        write(text) {
          calls.out.push(text);
        },
      },
      stderr: {
        write(text) {
          calls.err.push(text);
        },
      },
    },
  };
  return {
    calls,
    deps,
    run: () => runCLI(['extract-images', 'source', '--output=out', '--wasm=wasm'], deps),
  };
}
test('4096 valid refs with NAME_MAX/PATH_MAX compliant long paths reject receipt budget BEFORE publication', async () => {
  const f = receiptBudgetHost();
  assert.equal(await f.run(), 1);
  assert.equal(f.calls.published, 0);
  assert.equal(f.calls.reads, 0);
  assert.equal(f.calls.closed, 2);
  assert.match(f.calls.err.join(''), /ImageReceiptBudgetExceeded/);
  assert.match(f.calls.err.join(''), /published: false/);
  assert.match(f.calls.err.join(''), /publishedImageCount: 0/);
});
test('4096 short-path receipts stay admitted with one read/publication per reference', async () => {
  const f = receiptBudgetHost({ path: '/short' });
  assert.equal(await f.run(), 0);
  assert.equal(f.calls.published, 4096);
  assert.equal(f.calls.reads, 4096);
  assert.equal(f.calls.closed, 2);
  assert.match(f.calls.out.join(''), /completeWithinListedScope: true/);
});
test('unexpected postpublication receipt overflow returns bounded truthful location/count and primary error', async () => {
  const f = receiptBudgetHost({
    count: 1,
    path: '/saved-images',
    warning: 'w'.repeat(4 * 1024 * 1024),
  });
  assert.equal(await f.run(), 1);
  assert.equal(f.calls.published, 1);
  assert.equal(f.calls.closed, 2);
  const diagnostic = f.calls.err.join('');
  assert.match(diagnostic, /error: ObservationOutputLimit/);
  assert.match(diagnostic, /published: true/);
  assert.match(diagnostic, /publishedImageCount: 1/);
  assert.match(diagnostic, /outputDirectory: \/saved-images/);
  assert.match(diagnostic, /receiptDetailsOmitted: 1/);
  assert.ok(diagnostic.length < 65536);
});
test('secondary stderr failures never escape or mask the attempted primary write failure diagnostic', async () => {
  for (const alwaysReject of [false, true]) {
    const f = receiptBudgetHost({ count: 1, path: '/saved-images' });
    f.deps.io.stdout.write = () => {
      throw Error('PrimaryStdoutFault');
    };
    let attempts = 0;
    f.deps.io.stderr.write = (text) => {
      f.calls.err.push(text);
      if (++attempts === 1 || alwaysReject) throw Error('SecondaryStderrFault');
    };
    assert.equal(await f.run(), 1);
    assert.equal(f.calls.closed, 2);
    assert.equal(f.calls.published, 1);
    assert.equal(attempts, 2);
    assert.match(f.calls.err[0], /error: PrimaryStdoutFault/);
    assert.match(f.calls.err[1], /error: PrimaryStdoutFault/);
    assert.match(f.calls.err[1], /diagnosticFailure: SecondaryStderrFault/);
    assert.match(f.calls.err[1], /publishedImageCount: 1/);
  }
});

test('read-many는 동일 읽기·표시 경로를 쓰고 WASM은 동시 배치에서도 한 번만 읽는다', async (t) => {
  const f = await setup(t);
  await fs.writeFile(join(f.dir, 'second.any'), 'second');
  const paths = [];
  const original = f.files.readInputSnapshot;
  f.deps.files = {
    ...f.files,
    readInputSnapshot: async (...args) => {
      paths.push(args[0]);
      return original(...args);
    },
  };
  assert.equal(
    await runCLI(
      [
        'read-many',
        '--view=structure',
        'input.any',
        'second.any',
        '--wasm=native.wasm',
        '--concurrency=2',
        '--format=markdown',
      ],
      f.deps,
    ),
    0,
  );
  assert.equal(paths.filter((p) => p === join(f.dir, 'native.wasm')).length, 1);
  assert.equal(f.calls.filter((row) => row.kind === 'read').length, 2);
  assert.match(f.out.join(''), /^# 여러 문서 읽기/);
  assert.equal((f.out.join('').match(/documentSHA256:/g) || []).length, 2);
  assert.ok(f.out.join('').indexOf('input.any') < f.out.join('').indexOf('second.any'));
  assert.match(f.out.join(''), /opaque-model markdown/);
  assert.equal(await fs.readFile(join(f.dir, 'input.any'), 'utf8'), 'original');
  assert.equal(await fs.readFile(join(f.dir, 'second.any'), 'utf8'), 'second');
});
test('read-many는 누락·폴더 뒤에도 성공을 보존하며 쓰기 작업을 호출하지 않는다', async (t) => {
  const f = await setup(t);
  await fs.mkdir(join(f.dir, 'folder'));
  const argv = [
    'read-many',
    '--view=structure',
    'missing',
    'folder',
    'input.any',
    '--wasm=native.wasm',
  ];
  f.deps.files = { ...f.files };
  for (const name of ['assertNewOutput', 'publishNewOutput', 'createImageDirectory'])
    f.deps.files[name] = () => {
      throw Error('쓰기 경로 호출 금지');
    };
  assert.equal(await runCLI(argv, f.deps), 1);
  const text = f.out.join('');
  assert.match(text, /batchStatus: partial/);
  assert.match(text, /failed: 2/);
  assert.match(text, /InputNotRegularFile/);
  assert.match(text, /documentSHA256:/);
  assert.equal(f.calls.length, 1);
  assert.equal(await fs.readFile(join(f.dir, 'input.any'), 'utf8'), 'original');
});
test('read-many 예산 오류는 다른 파일을 계속 읽고 스트림 오류는 재시도 없이 요약한다', async (t) => {
  const f = await setup(t);
  await fs.writeFile(join(f.dir, 'second.any'), 'second');
  f.deps.renderDocument = (model) =>
    model.sourceSha256 === hash('original') ? 'x'.repeat(10000) : '정상';
  assert.equal(
    await runCLI(
      [
        'read-many',
        '--view=structure',
        'input.any',
        'second.any',
        '--wasm=native.wasm',
        '--max-output-bytes=12000',
      ],
      f.deps,
    ),
    1,
  );
  assert.match(f.out.join(''), /OutputBudgetExceeded/);
  assert.match(f.out.join(''), /정상/);
  f.out.length = 0;
  f.err.length = 0;
  let writes = 0;
  f.deps.io.stdout.write = () => {
    writes++;
    throw Error('전달 실패');
  };
  assert.equal(
    await runCLI(['read-many', '--view=structure', 'input.any', '--wasm=native.wasm'], f.deps),
    1,
  );
  assert.equal(writes, 1);
  assert.match(f.err.join(''), /batchReadSucceeded: 1/);
  assert.match(f.err.join(''), /batchDelivery: failed-or-partial/);
});

test(
  '실제 Noori 두 포맷의 CLI read-many는 원본·기존 결과를 보존하고 WASM을 한 번 읽는다',
  { skip: process.env.HWPJS_READ_MANY_NATIVE !== '1', timeout: 30000 },
  async (t) => {
    const required = (key) => {
      const path = process.env[key];
      assert.ok(path && path.startsWith('/') && !/hwpers|title-column-roundtrip/i.test(path));
      return path;
    };
    const wasm = required('HWPJS_TEST_WASM'),
      h5 = required('HWPJS_TEST_NOORI'),
      hx = required('HWPJS_TEST_NOORI_HWPX');
    const pins = [
      '82031994b4b7f066c28c725495954eebc67bb25570869c06528ea328e0155ccc',
      'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f',
      '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab',
    ];
    assert.equal(process.env.HWPJS_TEST_WASM_SHA256, pins[0]);
    const paths = [wasm, h5, hx];
    for (let index = 0; index < paths.length; index++)
      assert.equal(hash(await fs.readFile(paths[index])), pins[index]);
    const dir = await fs.mkdtemp(join(tmpdir(), 'hwpjs-read-many-native-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    const existing = join(dir, 'existing.hwpx');
    await fs.writeFile(existing, '기존 결과 보존');
    const files = createFiles();
    const reads = [];
    const out = [],
      err = [];
    const deps = {
      files: {
        ...files,
        readInputSnapshot: async (...args) => {
          reads.push(args[0]);
          return files.readInputSnapshot(...args);
        },
      },
      io: {
        stdout: { write: (text) => out.push(text) },
        stderr: { write: (text) => err.push(text) },
      },
    };
    for (const name of ['publishNewOutput', 'assertNewOutput', 'createImageDirectory'])
      deps.files[name] = () => {
        throw Error('읽기에서 쓰기 호출 금지');
      };
    for (const format of ['text', 'markdown']) {
      out.length = 0;
      reads.length = 0;
      assert.equal(
        await runCLI(
          [
            'read-many',
            '--view=structure',
            h5,
            hx,
            '--wasm=' + wasm,
            '--format=' + format,
            '--concurrency=2',
          ],
          deps,
        ),
        0,
      );
      const text = out.join('');
      assert.match(text, /batchStatus: success/);
      assert.match(text, /보도일시/);
      assert.equal((text.match(/documentSHA256:/g) || []).length, 2);
      assert.equal(reads.filter((path) => path === wasm).length, 1);
      assert.ok(Buffer.byteLength(text) <= 4194304);
      if (format === 'markdown') assert.match(text, /^# 여러 문서 읽기/);
    }
    out.length = 0;
    reads.length = 0;
    assert.equal(
      await runCLI(
        ['read-many', '--view=structure', h5, join(dir, 'missing.hwp'), dir, hx, '--wasm=' + wasm],
        deps,
      ),
      1,
    );
    assert.match(out.join(''), /batchStatus: partial/);
    assert.match(out.join(''), /failed: 2/);
    assert.match(out.join(''), /InputNotRegularFile/);
    assert.equal(reads.filter((path) => path === wasm).length, 1);
    for (let index = 0; index < paths.length; index++)
      assert.equal(hash(await fs.readFile(paths[index])), pins[index]);
    assert.equal(await fs.readFile(existing, 'utf8'), '기존 결과 보존');
    assert.deepEqual(err, []);
  },
);

test('배치의 엔진 스탬프 오류는 해당 파일만 실패시키고 다음 파일은 같은 경로로 읽는다', async (t) => {
  const f = await setup(t);
  await fs.writeFile(join(f.dir, 'second.any'), 'second');
  const read = f.engine.read;
  f.deps.engine = {
    ...f.engine,
    read: async (args) => {
      const result = await read(args);
      if (hash(args.bytes) === hash('original')) result.model.sourceSha256 = '0'.repeat(64);
      return result;
    },
  };
  assert.equal(
    await runCLI(
      ['read-many', '--view=structure', 'input.any', 'second.any', '--wasm=native.wasm'],
      f.deps,
    ),
    1,
  );
  assert.match(f.out.join(''), /InvalidEngineModel/);
  assert.match(f.out.join(''), /batchStatus: partial/);
  assert.equal((f.out.join('').match(/documentSHA256:/g) || []).length, 1);
  assert.match(f.out.join(''), new RegExp('documentSHA256: ' + hash('second')));
});
test('배치 WASM 읽기 거부도 한 번만 시도하고 모든 파일 실패를 가시화한다', async (t) => {
  const f = await setup(t);
  await fs.writeFile(join(f.dir, 'second.any'), 'second');
  const read = f.files.readInputSnapshot;
  let wasmReads = 0;
  f.deps.files = {
    ...f.files,
    readInputSnapshot: async (path, options) => {
      if (path === join(f.dir, 'native.wasm')) {
        wasmReads++;
        assert.equal(options.maxBytes, 32 * 1024 * 1024);
        throw Error('WASM 접근 실패');
      }
      return read(path, options);
    },
  };
  assert.equal(
    await runCLI(
      [
        'read-many',
        '--view=structure',
        'input.any',
        'second.any',
        '--wasm=native.wasm',
        '--concurrency=2',
      ],
      f.deps,
    ),
    1,
  );
  assert.equal(wasmReads, 1);
  assert.equal(f.calls.length, 0);
  assert.match(f.out.join(''), /batchStatus: failure/);
  assert.match(f.out.join(''), /failed: 2/);
});

test('Markdown 파일별 헤더도 출력 예산 안에 예약하며 작은 예산은 입력 읽기 전에 거부한다', async (t) => {
  const f = await setup(t);
  const paths = Array.from({ length: 10 }, (_, index) => '입력' + index);
  for (const path of paths) await fs.writeFile(join(f.dir, path), path);
  f.deps.renderDocument = () => '본문'.repeat(400);
  assert.equal(
    await runCLI(
      [
        'read-many',
        '--view=structure',
        ...paths,
        '--format=markdown',
        '--max-output-bytes=50000',
        '--wasm=native.wasm',
      ],
      f.deps,
    ),
    0,
  );
  assert.ok(Buffer.byteLength(f.out.join('')) <= 50000);
  assert.equal((f.out.join('').match(/documentSHA256:/g) || []).length, 10);
  let reads = 0;
  f.out.length = 0;
  f.err.length = 0;
  f.deps.files = {
    ...f.files,
    readInputSnapshot: () => {
      reads++;
      throw Error('읽으면 안 됩니다.');
    },
  };
  assert.equal(
    await runCLI(['read-many', '--view=structure', 'input.any', '--max-output-bytes=1'], f.deps),
    1,
  );
  assert.equal(reads, 0);
  assert.match(f.err.join(''), /OutputBudgetTooSmall/);
});

test('기본 content 읽기는 text와 Markdown 본문 및 빈 본문을 그대로 stdout에 반환한다', async (t) => {
  for (const format of ['text', 'markdown']) {
    for (const body of ['문서 본문', '']) {
      const f = await setup(t);
      f.deps.renderDocument = (_model, options) => {
        assert.deepEqual(options, { format, view: 'content' });
        return body;
      };
      assert.equal(
        await runCLI(['read', 'input.any', '--wasm=native.wasm', '--format=' + format], f.deps),
        0,
      );
      assert.equal(f.out.join(''), body);
      assert.equal(f.err.join(''), '');
      assert.equal(await fs.readFile(join(f.dir, 'input.any'), 'utf8'), 'original');
    }
  }
});

test('기본 배치 내용은 파일 출처와 정상 본문 및 읽기 실패를 보존하며 종료1을 유지한다', async (t) => {
  const f = await setup(t);
  const observed = [];
  f.deps.renderDocument = (_model, options) => {
    observed.push(options);
    return '정상 본문';
  };
  assert.equal(
    await runCLI(['read-many', 'missing', 'input.any', '--wasm=native.wasm'], f.deps),
    1,
  );
  const report = f.out.join('');
  assert.match(report, /missing/);
  assert.match(report, /input\.any/);
  assert.match(report, /정상 본문/);
  assert.match(report, /읽기 실패:/);
  assert.match(report, /성공 1개, 실패 1개/);
  assert.doesNotMatch(
    report,
    /(?:batchStatus|readStatus|outputStatus|deliveryStatus|documentSHA256|inputPath):/,
  );
  assert.ok(report.indexOf('missing') < report.indexOf('정상 본문'));
  assert.deepEqual(observed, [{ format: 'text', view: 'content' }]);
  assert.equal(f.err.join(''), '');
});

test('기본 배치 내용의 예산 거부도 성공한 다음 문서를 보존한다', async (t) => {
  const f = await setup(t);
  await fs.writeFile(join(f.dir, 'second.any'), 'second');
  f.deps.renderDocument = (model) =>
    model.sourceSha256 === hash('original') ? 'x'.repeat(10000) : '다음 본문';
  assert.equal(
    await runCLI(
      ['read-many', 'input.any', 'second.any', '--wasm=native.wasm', '--max-output-bytes=12000'],
      f.deps,
    ),
    1,
  );
  assert.match(f.out.join(''), /읽기 실패:.*출력 예산/);
  assert.match(f.out.join(''), /다음 본문/);
  assert.ok(Buffer.byteLength(f.out.join('')) <= 12000);
});
