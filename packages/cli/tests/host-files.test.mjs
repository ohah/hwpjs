import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createFiles, MAX_DOCUMENT_BYTES, MAX_WASM_BYTES } from '../src/files.mjs';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const fail = () => {
  throw Object.assign(Error('injected'), { code: 'EIO' });
};
async function fixture(t) {
  const dir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'hwpjs-cli-host-files-')));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const input = join(dir, 'input.hwp');
  await fs.writeFile(input, 'original');
  const files = createFiles({ cwd: () => dir });
  return { dir, input, files, snapshot: await files.readInputSnapshot(input) };
}
async function target(files, snapshot, dir, name = 'new.hwp') {
  const value = await files.assertNewOutput({ input: snapshot, outputPath: join(dir, name) });
  files.assertOutputFormat(value, name.endsWith('.hwpx') ? 'hwpx' : 'hwp5');
  return value;
}
async function assertClean(dir, input, output) {
  assert.equal(await fs.readFile(input, 'utf8'), 'original');
  await assert.rejects(fs.lstat(output), { code: 'ENOENT' });
  assert.equal((await fs.readdir(dir)).filter((n) => n.startsWith('.hwpjs-')).length, 0);
}

test('read snapshots own bytes and SHA, preserve original, and reject nonregular/oversized files', async (t) => {
  const f = await fixture(t);
  assert.equal(f.snapshot.sha256, hash(Buffer.from('original')));
  f.snapshot.bytes.fill(0);
  assert.equal(await fs.readFile(f.input, 'utf8'), 'original');
  await assert.rejects(f.files.readInputSnapshot(f.input, { maxBytes: 2 }), /FileTooLarge/);
  await assert.rejects(f.files.readInputSnapshot(f.dir), /InputNotRegularFile/);
  const huge = join(f.dir, 'huge');
  await fs.writeFile(huge, '');
  await fs.truncate(huge, MAX_DOCUMENT_BYTES + 1);
  await assert.rejects(f.files.readInputSnapshot(huge), /FileTooLarge/);
});
test('relative explicit WASM resolves CWD; default resolves only next to explicit entry URL', async (t) => {
  const f = await fixture(t);
  assert.equal(f.files.resolveWasmPath('native.wasm'), join(f.dir, 'native.wasm'));
  assert.equal(
    f.files.resolveWasmPath(undefined, pathToFileURL(join(f.dir, 'entry', 'bin.mjs'))),
    join(f.dir, 'entry', 'hwpjs.wasm'),
  );
  assert.throws(() => f.files.resolveWasmPath(undefined), /ExplicitWasmRequired/);
});
test('existing output, same source, hardlink and dangling symlink are all refused', async (t) => {
  const f = await fixture(t),
    link = join(f.dir, 'alias.hwp'),
    dangling = join(f.dir, 'dangling.hwp'),
    existing = join(f.dir, 'existing.hwp');
  await fs.link(f.input, link);
  await fs.symlink(join(f.dir, 'absent'), dangling);
  await fs.writeFile(existing, 'other');
  for (const outputPath of [f.input, link, dangling, existing])
    await assert.rejects(
      f.files.assertNewOutput({ input: f.snapshot, outputPath }),
      /Collision|OutputExists/,
    );
  assert.equal(await fs.readFile(existing, 'utf8'), 'other');
  assert.equal(await fs.readlink(dangling), join(f.dir, 'absent'));
});
test('actual engine format controls output extension, independent of misleading input suffix', async (t) => {
  const f = await fixture(t),
    token = await f.files.assertNewOutput({
      input: f.snapshot,
      outputPath: join(f.dir, 'new.hwpx'),
    });
  assert.throws(() => f.files.assertOutputFormat(token, 'hwp5'), /OutputFormatMismatch/);
  assert.throws(() => f.files.assertOutputFormat(token, 'hwp3'), /InvalidEngineFormat/);
  await assert.rejects(
    f.files.assertNewOutput({ input: f.snapshot, outputPath: join(f.dir, 'new.txt') }),
    /InvalidOutputExtension/,
  );
});
test('atomic publication captures pending caller bytes, creates private file and consumes only its token', async (t) => {
  const f = await fixture(t),
    token = await target(f.files, f.snapshot, f.dir),
    bytes = Uint8Array.of(1, 2, 3);
  const pending = f.files.publishNewOutput({ target: token, bytes });
  bytes.fill(9);
  const result = await pending;
  assert.equal(result.published, true);
  assert.equal(result.sha256, hash(Uint8Array.of(1, 2, 3)));
  assert.deepEqual([...(await fs.readFile(result.path))], [1, 2, 3]);
  assert.equal((await fs.stat(result.path)).mode & 0o777, 0o600);
  assert.equal(await fs.readFile(f.input, 'utf8'), 'original');
  await assert.rejects(f.files.publishNewOutput({ target: token, bytes }), /InvalidOutputTarget/);
  await assert.rejects(
    f.files.publishNewOutput({ target: { path: result.path }, bytes }),
    /InvalidOutputTarget/,
  );
});
test('a competing destination appearing at link commit is never overwritten', async (t) => {
  const f = await fixture(t);
  const files = createFiles({
    fs: {
      ...fs,
      async link(a, b) {
        await fs.writeFile(b, 'racer', { flag: 'wx' });
        return fs.link(a, b);
      },
    },
  });
  const token = await target(files, f.snapshot, f.dir);
  await assert.rejects(files.publishNewOutput({ target: token, bytes: Uint8Array.of(1, 2) }), {
    code: 'EEXIST',
  });
  assert.equal(await fs.readFile(token.path, 'utf8'), 'racer');
  assert.equal(await fs.readFile(f.input, 'utf8'), 'original');
  assert.equal((await fs.readdir(f.dir)).filter((n) => n.startsWith('.hwpjs-')).length, 0);
});
for (const phase of ['write', 'sync', 'close', 'link'])
  test(`precommit ${phase} failure leaves no final or temporary output and preserves source`, async (t) => {
    const f = await fixture(t);
    let closeFault = true;
    const files = createFiles({
      fs: {
        ...fs,
        async open(path, flags, mode) {
          const h = await fs.open(path, flags, mode);
          if (flags !== 'wx') return h;
          return {
            writeFile: async (bytes) => {
              if (phase === 'write') {
                await h.write(bytes.subarray(0, 1));
                fail();
              }
              return h.writeFile(bytes);
            },
            sync: () => (phase === 'sync' ? fail() : h.sync()),
            close: () => {
              if (phase === 'close' && closeFault) {
                closeFault = false;
                fail();
              }
              return h.close();
            },
          };
        },
        link: phase === 'link' ? async () => fail() : fs.link,
      },
    });
    const token = await target(files, f.snapshot, f.dir);
    await assert.rejects(files.publishNewOutput({ target: token, bytes: Uint8Array.of(1, 2, 3) }), {
      code: 'EIO',
    });
    await assertClean(f.dir, f.input, token.path);
  });
test('temporary-name collision does not delete somebody else staging bytes', async (t) => {
  const f = await fixture(t),
    nonce = '0'.repeat(24),
    foreign = join(f.dir, '.hwpjs-' + nonce + '.tmp');
  await fs.writeFile(foreign, 'foreign');
  const files = createFiles({ random: () => nonce }),
    token = await target(files, f.snapshot, f.dir);
  await assert.rejects(
    files.publishNewOutput({ target: token, bytes: Uint8Array.of(1) }),
    /TemporaryFileCollision/,
  );
  assert.equal(await fs.readFile(foreign, 'utf8'), 'foreign');
  await assert.rejects(fs.lstat(token.path), { code: 'ENOENT' });
});
test('postcommit temp cleanup failure returns published plus warning, never rollback or false output0', async (t) => {
  const f = await fixture(t),
    files = createFiles({ fs: { ...fs, unlink: async () => fail() } }),
    token = await target(files, f.snapshot, f.dir);
  const result = await files.publishNewOutput({ target: token, bytes: Uint8Array.of(4, 5) });
  assert.equal(result.published, true);
  assert.ok(result.warnings.some((w) => w.phase === 'unlink-temporary' && w.code === 'EIO'));
  assert.deepEqual([...(await fs.readFile(token.path))], [4, 5]);
  assert.equal(await fs.readFile(f.input, 'utf8'), 'original');
});
test('postcommit directory sync failure reports durability warning with full output present', async (t) => {
  const f = await fixture(t),
    files = createFiles({
      fs: {
        ...fs,
        open: async (path, flags, mode) =>
          path === f.dir && flags === 'r' ? fail() : fs.open(path, flags, mode),
      },
    }),
    token = await target(files, f.snapshot, f.dir);
  const result = await files.publishNewOutput({ target: token, bytes: Uint8Array.of(6) });
  assert.equal(result.published, true);
  assert.ok(result.warnings.some((w) => w.phase === 'sync-directory'));
  assert.deepEqual([...(await fs.readFile(token.path))], [6]);
});
test('in-place input change during read is refused rather than publishing a mixed snapshot', async (t) => {
  const f = await fixture(t);
  let changed = false;
  const files = createFiles({
    fs: {
      ...fs,
      async open(path, flags) {
        const h = await fs.open(path, flags);
        return {
          stat: (...args) => h.stat(...args),
          close: () => h.close(),
          read: async (...args) => {
            if (!changed) {
              changed = true;
              await fs.writeFile(path, 'changed!');
            }
            return h.read(...args);
          },
        };
      },
    },
  });
  await assert.rejects(files.readInputSnapshot(f.input), /InputChangedDuringRead/);
});

test('document64MiB default accepts the Native boundary while explicit WASM32MiB refuses it', async (t) => {
  const f = await fixture(t),
    path = join(f.dir, 'large-document.hwp');
  assert.equal(MAX_DOCUMENT_BYTES, 64 * 1024 * 1024);
  assert.equal(MAX_WASM_BYTES, 32 * 1024 * 1024);
  await fs.writeFile(path, '');
  await fs.truncate(path, MAX_DOCUMENT_BYTES);
  await assert.rejects(
    f.files.readInputSnapshot(path, { maxBytes: MAX_WASM_BYTES }),
    /FileTooLarge/,
  );
  const snapshot = await f.files.readInputSnapshot(path);
  assert.equal(snapshot.bytes.length, MAX_DOCUMENT_BYTES);
  assert.equal(snapshot.bytes[0], 0);
  assert.equal(snapshot.bytes.at(-1), 0);
  const token = await target(f.files, f.snapshot, f.dir, 'large-output.hwp');
  const published = await f.files.publishNewOutput({ target: token, bytes: snapshot.bytes });
  assert.equal((await fs.stat(published.path)).size, MAX_DOCUMENT_BYTES);
  assert.equal(published.sha256, snapshot.sha256);
  const tooLarge = await target(f.files, f.snapshot, f.dir, 'too-large.hwp');
  await assert.rejects(
    f.files.publishNewOutput({ target: tooLarge, bytes: new Uint8Array(MAX_DOCUMENT_BYTES + 1) }),
    /InvalidOutputBytes/,
  );
  await assert.rejects(fs.lstat(tooLarge.path), { code: 'ENOENT' });
});

test('an output created after preflight but before staging is refused without touching it', async (t) => {
  const f = await fixture(t),
    token = await target(f.files, f.snapshot, f.dir);
  await fs.writeFile(token.path, 'other-writer', { flag: 'wx' });
  await assert.rejects(
    f.files.publishNewOutput({ target: token, bytes: Uint8Array.of(1) }),
    /OutputExists/,
  );
  assert.equal(await fs.readFile(token.path, 'utf8'), 'other-writer');
  assert.equal((await fs.readdir(f.dir)).filter((n) => n.startsWith('.hwpjs-')).length, 0);
});

test('unsupported atomic hardlink is refused without rename/copy fallback', async (t) => {
  const f = await fixture(t),
    files = createFiles({
      fs: {
        ...fs,
        link: async () => {
          throw Object.assign(Error('unsupported'), { code: 'ENOTSUP' });
        },
      },
    });
  const token = await target(files, f.snapshot, f.dir);
  await assert.rejects(files.publishNewOutput({ target: token, bytes: Uint8Array.of(1) }), {
    code: 'ENOTSUP',
  });
  await assertClean(f.dir, f.input, token.path);
});
