import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access, realpath, lstat } from 'node:fs/promises';
import { join, resolve, dirname, basename, relative, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { openDocument } from '../src/engine.ts';
import { readFormInventory } from '../src/document-forms.ts';
import { applyDocumentOperations } from '../src/document-operations.ts';
import { withoutFormWriterExports } from './helpers/form-old-abi.mjs';
// Explicit opt-in entry. Fixtures are repository-owned; no external fixture base.
function absoluteEnv(name) {
  const value = process.env[name];
  assert(
    value && isAbsolute(value) && resolve(value) === value,
    `${name}: ExplicitAbsolutePathRequired`,
  );
  assert(
    !/(?:^|[\\/])legacy(?:[\\/]|$)|hwpers|title-column-roundtrip/i.test(value),
    'ProtectedInputPath',
  );
  return value;
}
const out = absoluteEnv('HWPJS_FORM_EVIDENCE');
const wasmPath = absoluteEnv('HWPJS_TEST_WASM');
const cliEntry = absoluteEnv('HWPJS_FORM_CLI_ENTRY');
const mcpEntry = absoluteEnv('HWPJS_FORM_MCP_ENTRY');
const pin = process.env.HWPJS_TEST_WASM_SHA256;
assert.match(pin ?? '', /^[a-f0-9]{64}$/, 'ExplicitNativeSha256Required');
assert.equal(basename(cliEntry), 'cli.mjs', 'CanonicalCliEntryRequired');
assert.equal(basename(mcpEntry), 'mcp.mjs', 'CanonicalMcpEntryRequired');
assert.equal(dirname(cliEntry), dirname(mcpEntry), 'SameCanonicalPackageRequired');
const wasm = await readFile(wasmPath);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(wasm), pin, 'NativePinMismatch');
const packageWasmPath = join(dirname(cliEntry), 'hwpjs.wasm');
assert.equal(sha(await readFile(packageWasmPath)), pin, 'CanonicalPackageNativeMismatch');
await access(cliEntry);
await access(mcpEntry);
const fixtureRoot = resolve(import.meta.dirname, 'fixtures/form-text-eol');
assert((await lstat(fixtureRoot)).isDirectory(), 'OwnedFixtureDirectoryRequired');
const manifestPath = join(fixtureRoot, 'manifest.json');
assert((await lstat(manifestPath)).isFile(), 'OwnedFixtureManifestRequired');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert.equal(manifest.schemaVersion, 1);
assert.deepEqual(
  manifest.files.map(({ format, file }) => [format, file]),
  [
    ['hwp5', 'controlled-crlf.hwp'],
    ['hwpx', 'controlled-crlf.hwpx'],
  ],
);
const fixtures = new Map();
const protectedPins = new Map([
  [manifestPath, sha(await readFile(manifestPath))],
  [wasmPath, pin],
  [packageWasmPath, pin],
  [cliEntry, sha(await readFile(cliEntry))],
  [mcpEntry, sha(await readFile(mcpEntry))],
]);
for (const row of manifest.files) {
  assert.match(row.sha256, /^[a-f0-9]{64}$/);
  assert.equal(row.expectedText, 'A\r\nB\r\nC');
  const path = join(fixtureRoot, row.file);
  assert((await lstat(path)).isFile(), 'OwnedFixtureFileRequired');
  const bytes = await readFile(path);
  assert.equal(bytes.length, row.bytes);
  assert.equal(sha(bytes), row.sha256, 'FixturePinMismatch');
  fixtures.set(row.format, { ...row, path, bytes });
  protectedPins.set(path, row.sha256);
}
function inside(directory, path) {
  const part = relative(directory, path);
  return part === '' || (part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part));
}
const realOut = join(await realpath(dirname(out)), basename(out));
const realFixtures = await realpath(fixtureRoot);
assert(
  !inside(realFixtures, realOut) && !inside(realOut, realFixtures),
  'EvidenceFixtureCollision',
);
for (const path of protectedPins.keys()) {
  assert(!inside(realOut, await realpath(path)), 'EvidenceInputCollision');
}
await mkdir(out); // EEXIST refuses previous evidence; never overwrite it.
const old = withoutFormWriterExports(wasm);
const oldPath = join(out, 'old.wasm');
await writeFile(oldPath, old);
const log = [];
const missing = async (path) => assert.rejects(access(path), { code: 'ENOENT' });
after(async () => {
  for (const [path, pin] of protectedPins) {
    assert.equal(sha(await readFile(path)), pin, 'ProtectedInputChanged:' + path);
  }
  await writeFile(
    join(out, 'INPUT-PROTECTION.json'),
    JSON.stringify(
      {
        nativeSha256: pin,
        fixtureFiles: manifest.files,
        allInputPinsUnchanged: true,
        cliEntrySha256: protectedPins.get(cliEntry),
        mcpEntrySha256: protectedPins.get(mcpEntry),
      },
      null,
      2,
    ) + '\n',
  );
});
function currentTextForm(document) {
  const forms = readFormInventory(document).forms;
  assert.equal(forms.length, 6);
  const matches = forms.filter((f) => f.current.name.value === 'F4');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].ownership, 'located');
  return matches[0];
}
async function oracle(format, inputPath, path, text) {
  const plan = join(out, path.split('/').at(-1) + '.json');
  await writeFile(
    plan,
    JSON.stringify({ format, before: inputPath, after: path, texts: { F4: text } }),
  );
  for (const flags of [[], ['-O']]) {
    const r = spawnSync(
      'python3',
      ['-B', ...flags, resolve(import.meta.dirname, 'helpers/form-state-oracle.py'), plan],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr);
  }
  const bad = plan + '.wrong';
  await writeFile(
    bad,
    JSON.stringify({
      format,
      before: inputPath,
      after: path,
      texts: { F4: text.replaceAll('\r', '') },
    }),
  );
  for (const flags of [[], ['-O']]) {
    const r = spawnSync(
      'python3',
      ['-B', ...flags, resolve(import.meta.dirname, 'helpers/form-state-oracle.py'), bad],
      { encoding: 'utf8' },
    );
    assert.notEqual(r.status, 0);
  }
  log.push({ oracle: path, normalAndOptimized: true, counterexample: true });
}
for (const format of ['hwp5', 'hwpx'])
  test(`actual canonical package ${format}: CRLF/LF values, source precondition, late/old no output and old/budget zero-write admission`, async () => {
    const ext = format === 'hwp5' ? 'hwp' : 'hwpx',
      inputPath = fixtures.get(format).path,
      bytes = fixtures.get(format).bytes,
      d = await openDocument({ bytes, wasm });
    let f;
    try {
      f = currentTextForm(d);
    } finally {
      d.close();
    }
    assert.equal(f.current.text.value, fixtures.get(format).expectedText);
    const texts = ['CLI\r\nline😀\r\nlast', 'MCP\nline😀\r\nlast'];
    const op = (text) => ({
      kind: 'form-text',
      coordinates: 'current-transaction',
      reference: f.reference,
      expectedText: f.current.text.value,
      text,
    });
    const late = {
      kind: 'paragraph-alignment',
      coordinates: 'current-transaction',
      section: 0,
      paragraph: 999999,
      alignment: 'CENTER',
    };
    function cli(path, operations, engine = wasmPath, sourcePath = inputPath) {
      const r = spawnSync(
        process.execPath,
        [
          cliEntry,
          'apply',
          sourcePath,
          '--expect-sha256',
          sha(bytes),
          '--operations',
          JSON.stringify(operations),
          '--output',
          path,
          '--allow-stale-layout',
          '--wasm',
          engine,
        ],
        { encoding: 'utf8', timeout: 30000 },
      );
      log.push({ format, kind: 'cli', status: r.status, stdout: r.stdout, stderr: r.stderr });
      return r;
    }
    // Exercise input/output admission using a disposable evidence copy, not the fixture.
    const guardInput = join(out, format + '-input-guard.' + ext);
    await writeFile(guardInput, bytes);
    const guard = cli(guardInput, [op(texts[0])], wasmPath, guardInput);
    assert.equal(guard.status, 1, guard.stderr);
    assert.equal(guard.stdout, '');
    assert.match(guard.stderr, /SourceOutputCollision/);
    assert.equal(sha(await readFile(guardInput)), sha(bytes));
    const path = join(out, format + '-cli.' + ext);
    const result = cli(path, [op(texts[0])]);
    assert.equal(result.status, 0, result.stderr);
    await oracle(format, inputPath, path, texts[0]);
    for (const [name, operations, engine] of [
      ['late', [op(texts[0]), late], wasmPath],
      ['old', [op(texts[0])], oldPath],
      ['budget', [op('x'.repeat(65536))], wasmPath],
      [
        'stale',
        [{ ...op(texts[0]), expectedText: f.current.text.value.replaceAll('\r', '') }],
        wasmPath,
      ],
    ]) {
      const path = join(out, format + '-' + name + '-absent.' + ext),
        r = cli(path, operations, engine);
      assert.notEqual(r.status, 0);
      assert.equal(r.stdout, '');
      await missing(path);
    }
    for (const [name, operations, engine] of [
      ['late', [op(texts[0]), late], wasm],
      ['old', [op(texts[0])], old],
      ['budget', [op('x'.repeat(65536))], wasm],
    ]) {
      const calls = [];
      let closed = 0;
      await assert.rejects(
        applyDocumentOperations(
          { bytes, wasm: engine, expectedSha256: sha(bytes), operations, allowStaleLayout: true },
          {
            openDocument: async (input) => {
              const d = await openDocument(input);
              return {
                ...d,
                sdk: new Proxy(d.sdk, {
                  get(t, k) {
                    const v = Reflect.get(t, k);
                    return typeof v === 'function'
                      ? (...args) => {
                          if (['setFormText', 'enableHistoryV2'].includes(k)) calls.push(k);
                          return Reflect.apply(v, t, args);
                        }
                      : v;
                  },
                }),
                save() {
                  calls.push('save');
                  return d.save({ allowStaleLayout: true });
                },
                close() {
                  closed++;
                  d.close();
                },
              };
            },
          },
        ),
      );
      assert.deepEqual(calls, name === 'late' ? ['enableHistoryV2', 'setFormText'] : [], name);
      if (name !== 'budget') assert.equal(closed, 1);
      log.push({ format, name, calls, closed });
    }
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [mcpEntry, '--wasm', wasmPath],
      stderr: 'pipe',
    });
    transport.stderr?.on('data', () => {});
    const client = new Client({ name: 'forms-r5', version: '1.0.0' });
    try {
      await client.connect(transport);
      const call = (path, operations) =>
        client.callTool({
          name: 'apply_document_changes',
          arguments: {
            inputPath,
            outputPath: path,
            expectedSha256: sha(bytes),
            allowStaleLayout: true,
            operations,
          },
        });
      const guard = await client.callTool({
        name: 'apply_document_changes',
        arguments: {
          inputPath: guardInput,
          outputPath: guardInput,
          expectedSha256: sha(bytes),
          allowStaleLayout: true,
          operations: [op(texts[1])],
        },
      });
      assert(guard.isError);
      assert.match(JSON.stringify(guard), /SourceOutputCollision/);
      assert.equal(sha(await readFile(guardInput)), sha(bytes));
      log.push({ format, inputCollisionCliAndMcpRefused: true, guardCopyUnchanged: true });
      const path = join(out, format + '-mcp.' + ext),
        r = await call(path, [op(texts[1])]);
      assert(!r.isError, JSON.stringify(r));
      await oracle(format, inputPath, path, texts[1]);
      for (const [name, operations] of [
        ['late', [op(texts[1]), late]],
        ['budget', [op('x'.repeat(65536))]],
        ['stale', [{ ...op(texts[1]), expectedText: f.current.text.value.replaceAll('\r', '') }]],
      ]) {
        const path = join(out, format + '-mcp-' + name + '-absent.' + ext),
          r = await call(path, operations);
        assert(r.isError);
        await missing(path);
      }
    } finally {
      try {
        await client.close();
      } finally {
        await transport.close();
        log.push({ format, mcpClosed: true });
      }
    }
    for (const [kind, text] of [
      ['cli', texts[0]],
      ['mcp', texts[1]],
    ]) {
      const saved = await readFile(join(out, format + '-' + kind + '.' + ext)),
        d = await openDocument({ bytes: saved, wasm });
      try {
        assert.equal(currentTextForm(d).current.text.value, text);
      } finally {
        d.close();
      }
    }
    await writeFile(join(out, 'RESULT.json'), JSON.stringify(log, null, 2) + '\n');
  });
