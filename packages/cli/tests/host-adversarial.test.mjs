import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseArguments } from '../src/arguments.mjs';
import { createFiles } from '../src/files.mjs';
import { runCLI } from '../src/main.mjs';
const evidence = resolve('zig-out/verification/cli-ai-adversarial-r1/.tmp');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const argv = (target = 's0:p3', hash = 'a'.repeat(64)) => [
  'edit',
  'in.hwp',
  '--target=' + target,
  '--replace=a',
  '--with=b',
  '--expect-sha256=' + hash,
  '--output=out.hwp',
];
async function fixture(t, overrides = {}) {
  await fs.mkdir(evidence, { recursive: true });
  const dir = await fs.mkdtemp(join(evidence, 'case-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(join(dir, 'in.hwp'), 'source');
  const files = createFiles({ cwd: () => dir, ...overrides });
  const input = await files.readInputSnapshot('in.hwp');
  return { dir, files, input };
}
async function token(f, files = f.files) {
  const value = await files.assertNewOutput({ input: f.input, outputPath: join(f.dir, 'out.hwp') });
  files.assertOutputFormat(value, 'hwp5');
  return value;
}
test('round1 canonical native ID rejects terminal line separators', () => {
  for (const suffix of ['\n', '\r', '\u2028', '\u2029'])
    assert.throws(() => parseArguments(argv('s0:p3' + suffix)), /InvalidTarget/);
});
test('round1 SHA rejects terminal line separators before preprocessing', () => {
  for (const suffix of ['\n', '\r', '\u2028', '\u2029'])
    assert.throws(
      () => parseArguments(argv('s0:p3', 'a'.repeat(64) + suffix)),
      /InvalidExpectedSHA256/,
    );
});
test('round1 output symlink introduced at link commit preserves source and foreign link', async (t) => {
  const f = await fixture(t);
  const files = createFiles({
    fs: {
      ...fs,
      async link(from, to) {
        await fs.symlink(f.input.path, to);
        return fs.link(from, to);
      },
    },
  });
  const target = await token(f, files);
  await assert.rejects(files.publishNewOutput({ target, bytes: Uint8Array.of(7) }), {
    code: 'EEXIST',
  });
  assert.ok((await fs.lstat(target.path)).isSymbolicLink());
  assert.equal(await fs.readFile(f.input.path, 'utf8'), 'source');
  assert.equal((await fs.readdir(f.dir)).filter((n) => n.startsWith('.hwpjs-')).length, 0);
});
test('round1 input symlink retarget after open keeps FD snapshot and never writes either source', async (t) => {
  const f = await fixture(t);
  const other = join(f.dir, 'other.hwp'),
    alias = join(f.dir, 'alias.hwp');
  await fs.writeFile(other, 'other');
  await fs.symlink(f.input.path, alias);
  const files = createFiles({
    fs: {
      ...fs,
      async open(path, ...args) {
        const handle = await fs.open(path, ...args);
        if (path === alias) {
          await fs.unlink(alias);
          await fs.symlink(other, alias);
        }
        return handle;
      },
    },
  });
  const read = await files.readInputSnapshot(alias);
  assert.equal(new TextDecoder().decode(read.bytes), 'source');
  assert.equal(read.sha256, sha('source'));
  assert.equal(await fs.readFile(alias, 'utf8'), 'other');
  assert.equal(await fs.readFile(f.input.path, 'utf8'), 'source');
});
test('round1 cross-instance target cannot publish and byte subviews exclude backing neighbors', async (t) => {
  const f = await fixture(t),
    target = await token(f),
    other = createFiles();
  await assert.rejects(
    other.publishNewOutput({ target, bytes: Uint8Array.of(1) }),
    /InvalidOutputTarget/,
  );
  const bytes = Uint8Array.of(99, 1, 2, 88);
  const result = await f.files.publishNewOutput({ target, bytes: bytes.subarray(1, 3) });
  assert.deepEqual([...(await fs.readFile(result.path))], [1, 2]);
  assert.equal(result.sha256, sha(Uint8Array.of(1, 2)));
});
async function host(t, format = 'hwp5') {
  const f = await fixture(t);
  await fs.writeFile(join(f.dir, 'hwpjs.wasm'), 'adjacent');
  const out = [],
    err = [],
    calls = [];
  const options = {
    files: f.files,
    mainModuleURL: pathToFileURL(join(f.dir, 'bin.mjs')),
    io: { stdout: { write: (v) => out.push(v) }, stderr: { write: (v) => err.push(v) } },
    engine: {
      read: async (request) => {
        calls.push(request);
        return { format, model: { version: 1, format, sourceSha256: sha(request.bytes) } };
      },
      edit: async (request) => {
        calls.push(request);
        return { format, bytes: Uint8Array.of(1, 2), changed: true, layoutRequiresReflow: false };
      },
    },
    renderDocument: () => 'body',
  };
  const editArgs = [
    'edit',
    f.input.path,
    '--target=s0:p3',
    '--replace=a',
    '--with=b',
    '--expect-sha256=' + f.input.sha256,
    '--output=' + join(f.dir, format === 'hwpx' ? 'out.hwpx' : 'out.hwp'),
  ];
  return { ...f, out, err, calls, options, editArgs };
}
test('round2 mismatched actual format never publishes even after in-memory engine success', async (t) => {
  for (const format of ['hwpx', null, 'hwp3']) {
    const f = await host(t);
    f.options.engine.edit = async () => ({
      format,
      bytes: Uint8Array.of(1),
      changed: true,
      layoutRequiresReflow: false,
    });
    assert.equal(await runCLI(f.editArgs, f.options), 1);
    assert.deepEqual(f.out, []);
    assert.match(f.err.join(''), /published: false/);
    await assert.rejects(fs.lstat(join(f.dir, 'out.hwp')), { code: 'ENOENT' });
    assert.equal((await fs.readdir(f.dir)).filter((n) => n.startsWith('.hwpjs-')).length, 0);
  }
});
test('round2 misleading input .hwp extension does not override actual HX output format', async (t) => {
  const f = await host(t, 'hwpx');
  assert.equal(await runCLI(f.editArgs, f.options), 0);
  assert.match(f.out.join(''), /format: hwpx/);
  assert.deepEqual([...(await fs.readFile(join(f.dir, 'out.hwpx')))], [1, 2]);
  assert.equal(await fs.readFile(f.input.path, 'utf8'), 'source');
});
test('round2 missing adjacent WASM refuses despite a valid CWD decoy and help stays FS-free', async (t) => {
  const f = await host(t),
    entry = join(f.dir, 'package', 'dist');
  await fs.mkdir(entry, { recursive: true });
  f.options.mainModuleURL = pathToFileURL(join(entry, 'cli.mjs'));
  assert.equal(await runCLI(['read', f.input.path], f.options), 1);
  assert.equal(f.calls.length, 0);
  assert.match(f.err.join(''), /ExplicitWasmRequired/);
  const touched = [];
  f.options.files = new Proxy(
    {},
    {
      get: (_, name) => {
        touched.push(name);
        throw Error('NoFilesystem');
      },
    },
  );
  assert.equal(await runCLI(['--help'], f.options), 0);
  assert.deepEqual(touched, []);
});
test('round2 encoded spaces and hash in entry URL resolve adjacent WASM; relative explicit uses CWD', async (t) => {
  const f = await host(t),
    entry = join(f.dir, 'space #literal');
  await fs.mkdir(entry);
  await fs.writeFile(join(entry, 'hwpjs.wasm'), 'special');
  f.options.mainModuleURL = pathToFileURL(join(entry, 'cli.mjs'));
  assert.equal(await runCLI(['read', f.input.path], f.options), 0);
  assert.equal(new TextDecoder().decode(f.calls[0].wasm), 'special');
  assert.equal(await runCLI(['read', f.input.path, '--wasm=hwpjs.wasm'], f.options), 0);
  assert.equal(new TextDecoder().decode(f.calls[1].wasm), 'adjacent');
});
test('round2 invalid engine output views never stage or publish output', async (t) => {
  for (const bytes of [
    new Uint8Array(),
    new DataView(new ArrayBuffer(2)),
    new Uint8Array(new SharedArrayBuffer(2)),
  ]) {
    const f = await host(t);
    f.options.engine.edit = async () => ({
      format: 'hwp5',
      bytes,
      changed: true,
      layoutRequiresReflow: false,
    });
    assert.equal(await runCLI(f.editArgs, f.options), 1);
    assert.match(f.err.join(''), /InvalidOutputBytes/);
    await assert.rejects(fs.lstat(join(f.dir, 'out.hwp')), { code: 'ENOENT' });
    assert.equal((await fs.readdir(f.dir)).filter((n) => n.startsWith('.hwpjs-')).length, 0);
  }
});
test('round2 committed output retains SHA when an async stdout partially writes then rejects', async (t) => {
  const f = await host(t);
  f.options.io.stdout.write = async (text) => {
    f.out.push(text.slice(0, 7));
    await Promise.resolve();
    throw Object.assign(Error('broken'), { code: 'EPIPE' });
  };
  assert.equal(await runCLI(f.editArgs, f.options), 1);
  assert.match(f.err.join(''), /error: EPIPE\npublished: true/);
  assert.match(f.err.join(''), new RegExp('sha256: ' + sha(Uint8Array.of(1, 2))));
  assert.deepEqual([...(await fs.readFile(join(f.dir, 'out.hwp')))], [1, 2]);
  assert.equal(await fs.readFile(f.input.path, 'utf8'), 'source');
});
test('round3 actual Node Writable callback EPIPE is consumed and a broken stderr is bounded', () => {
  const url = new URL('../src/main.mjs', import.meta.url).href;
  for (const brokenStderr of [false, true]) {
    const code = `import {Writable} from 'node:stream';const {runCLI}=await import(${JSON.stringify(url)});const failing=()=>new Writable({write(_c,_e,cb){setImmediate(()=>cb(Object.assign(Error('pipe'),{code:'EPIPE'})));}});Object.defineProperty(process,'stdout',{value:failing()});${brokenStderr ? "Object.defineProperty(process,'stderr',{value:failing()});" : ''}process.exitCode=await runCLI(['--help']);`;
    const result = spawnSync(
      process.execPath,
      ['--max-old-space-size=64', '--input-type=module', '-e', code],
      { encoding: 'utf8', timeout: 4000 },
    );
    assert.equal(result.status, 1);
    assert.equal(result.signal, null);
    assert.equal(result.error, undefined);
    if (!brokenStderr) assert.match(result.stderr, /error: EPIPE\npublished: false/);
    else assert.equal(result.stderr, '');
    assert.doesNotMatch(result.stderr, /Unhandled|triggerUncaughtException/);
  }
});
test('round3 actual Node Writable backpressure waits for delayed successful flush', () => {
  const url = new URL('../src/main.mjs', import.meta.url).href;
  const code = `import{Writable}from'node:stream';const {runCLI}=await import(${JSON.stringify(url)});let completed=false;Object.defineProperty(process,'stdout',{value:new Writable({highWaterMark:1,write(_c,_e,cb){setTimeout(()=>{completed=true;cb();},15);}})});const result=await runCLI(['--help']);process.stderr.write(completed&&result===0?'flushed':'premature');`;
  const result = spawnSync(
    process.execPath,
    ['--max-old-space-size=64', '--input-type=module', '-e', code],
    { encoding: 'utf8', timeout: 4000 },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stderr, 'flushed');
});
test('round3 read fstat failure closes the opened FD exactly once', async (t) => {
  const f = await fixture(t);
  let closes = 0;
  const files = createFiles({
    fs: {
      ...fs,
      async open(...args) {
        const handle = await fs.open(...args);
        return {
          stat: async () => {
            throw Object.assign(Error('bad stat'), { code: 'EIO' });
          },
          close: async () => {
            closes++;
            await handle.close();
          },
        };
      },
    },
  });
  await assert.rejects(files.readInputSnapshot(f.input.path), { code: 'EIO' });
  assert.equal(closes, 1);
  assert.equal(await fs.readFile(f.input.path, 'utf8'), 'source');
});
test('round3 exhausted temporary collisions preserve every foreign entry and output remains absent', async (t) => {
  const f = await fixture(t);
  let attempts = 0;
  const nonce = 'a'.repeat(24),
    foreign = join(f.dir, '.hwpjs-' + nonce + '.tmp');
  await fs.writeFile(foreign, 'foreign');
  const files = createFiles({
      random: () => {
        attempts++;
        return nonce;
      },
    }),
    target = await token(f, files);
  await assert.rejects(
    files.publishNewOutput({ target, bytes: Uint8Array.of(3) }),
    /TemporaryFileCollision/,
  );
  assert.equal(attempts, 8);
  assert.equal(await fs.readFile(foreign, 'utf8'), 'foreign');
  await assert.rejects(fs.lstat(target.path), { code: 'ENOENT' });
});
test('round3 concurrent reuse publishes exactly once without a second temporary', async (t) => {
  const f = await fixture(t),
    target = await token(f),
    bytes = Uint8Array.of(3);
  const results = await Promise.allSettled([
    f.files.publishNewOutput({ target, bytes }),
    f.files.publishNewOutput({ target, bytes }),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.match(results[1].reason.message, /InvalidOutputTarget/);
  assert.deepEqual([...(await fs.readFile(target.path))], [3]);
  assert.equal((await fs.readdir(f.dir)).filter((n) => n.startsWith('.hwpjs-')).length, 0);
});
test('round3 postcommit directory close warning cannot inject false published metadata', async (t) => {
  const f = await host(t);
  f.options.files = createFiles({
    cwd: () => f.dir,
    fs: {
      ...fs,
      async open(path, flags, ...rest) {
        const handle = await fs.open(path, flags, ...rest);
        if (path !== f.dir || flags !== 'r') return handle;
        return {
          sync: () => handle.sync(),
          close: async () => {
            await handle.close();
            throw Object.assign(Error('close'), { code: 'EIO\npublished: false' });
          },
        };
      },
    },
  });
  assert.equal(await runCLI(f.editArgs, f.options), 0);
  assert.deepEqual(f.err, []);
  assert.match(f.out.join(''), /warning: phase=close-directory code=EIO\\u000apublished: false/);
  assert.equal(f.out.join('').split('\n').includes('published: false'), false);
  assert.deepEqual([...(await fs.readFile(join(f.dir, 'out.hwp')))], [1, 2]);
  assert.equal(await fs.readFile(f.input.path, 'utf8'), 'source');
});
