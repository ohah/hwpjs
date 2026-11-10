import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { parseArguments, USAGE } from '../src/arguments.ts';
import { runCLI } from '../src/main.ts';
import { createFiles } from '../src/files.ts';
import { buildObjectReference } from '../src/object-reference.ts';
import { documentTools } from '../src/mcp/tools.ts';
import { runMcpServer } from '../src/mcp/server.ts';

// Signature-only containers and injected service: this is host evidence, not Native validation.
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = (format, marker = 1) =>
  Uint8Array.from([
    ...(format === 'hwp5' ? [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] : [0x50, 0x4b, 3, 4]),
    marker,
  ]);
const ref = (format = 'hwp5', extra = {}) =>
  buildObjectReference({
    sourceSha256: hash(bytes(format)),
    format,
    section: 0,
    kind: 'table',
    node: 7,
    ...extra,
  });
const args = (format = 'hwp5', patch = {}) => {
  const options = {
    ref: ref(format),
    action: 'insert-row',
    index: '2',
    rows: '2',
    columns: '3',
    output: 'output.' + (format === 'hwp5' ? 'hwp' : 'hwpx'),
    ...patch,
  };
  return [
    'edit-table-grid',
    ...Object.entries(options)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `--${k}=${v}`),
    '--allow-stale-layout',
    '--',
    'input.' + (format === 'hwp5' ? 'hwp' : 'hwpx'),
  ];
};
const saved = (format) => ({
  format,
  sourceSha256: hash(bytes(format)),
  bytes: bytes(format, 2),
  layoutRequiresReflow: true,
  previewStale: true,
});
async function setup(t, format = 'hwp5') {
  const directory = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'hwpjs-grid-host-')));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const extension = format === 'hwp5' ? 'hwp' : 'hwpx';
  await fs.writeFile(join(directory, 'input.' + extension), bytes(format));
  await fs.writeFile(join(directory, 'native.wasm'), 'mock only');
  const calls = [],
    reads = [],
    stdout = [],
    stderr = [];
  const files = createFiles({ cwd: () => directory });
  const dependencies = {
    files: {
      ...files,
      async readInputSnapshot(path, options) {
        reads.push(path);
        return files.readInputSnapshot(path, options);
      },
    },
    io: { stdout: { write: (s) => stdout.push(s) }, stderr: { write: (s) => stderr.push(s) } },
    editDocumentTableGrid: async (input) => {
      calls.push(input);
      return saved(format);
    },
  };
  return {
    directory,
    calls,
    reads,
    stdout,
    stderr,
    dependencies,
    invoke: (argv = args(format)) =>
      runCLI([argv[0], '--wasm=native.wasm', ...argv.slice(1)], dependencies),
    absent: (path = 'output.' + extension) =>
      assert.rejects(fs.lstat(join(directory, path)), { code: 'ENOENT' }),
    unchanged: async () =>
      assert.deepEqual(
        new Uint8Array(await fs.readFile(join(directory, 'input.' + extension))),
        bytes(format),
      ),
  };
}

test('grid CLI parses exact payload, optional layout, help, and all actions', () => {
  assert.match(USAGE, /edit-table-grid INPUT/);
  for (const action of ['insert-row', 'delete-row', 'insert-column', 'delete-column']) {
    const input = parseArguments(args('hwp5', { action, index: '1', layout: 'observed8' }));
    assert.deepEqual(input, {
      command: 'edit-table-grid',
      input: 'input.hwp',
      reference: ref(),
      action,
      index: 1,
      expectedRows: 2,
      expectedColumns: 3,
      output: 'output.hwp',
      allowStaleLayout: true,
      layout: 'observed8',
    });
  }
  assert.equal(Object.hasOwn(parseArguments(args()), 'layout'), false);
  assert.equal(
    parseArguments(args('hwp5', { rows: '4294967295', action: 'insert-column', index: '3' }))
      .expectedRows,
    4294967295,
  );
});

test('grid parser rejects missing, duplicate, unknown flags, malformed integers and bounds', () => {
  for (const key of ['ref', 'action', 'index', 'rows', 'columns', 'output'])
    assert.throws(() => parseArguments(args('hwp5', { [key]: undefined })), key);
  for (const flag of [
    '--typo=1',
    '--expect-sha256=' + 'a'.repeat(64),
    '--rows=2',
    '--allow-stale-layout=false',
  ])
    assert.throws(() => parseArguments([args()[0], flag, ...args().slice(1)]));
  for (const key of ['index', 'rows', 'columns'])
    for (const value of [
      '-1',
      '-0',
      '01',
      '1e2',
      '1.5',
      'NaN',
      'Infinity',
      '4294967296',
      '2\n',
      ' 2',
    ])
      assert.throws(() => parseArguments(args('hwp5', { [key]: value })), key + ':' + value);
  for (const patch of [
    { rows: '0' },
    { columns: '0' },
    { index: '3' },
    { action: 'delete-row', index: '2' },
    { action: 'delete-column', index: '3' },
    { action: 'delete-row', rows: '1', index: '0' },
    { action: 'delete-column', columns: '1', index: '0' },
    { rows: '4294967295' },
    { action: 'merge' },
    { layout: 'auto' },
    { ref: ref('hwp5', { kind: 'image' }) },
  ])
    assert.throws(() => parseArguments(args('hwp5', patch)));
});

for (const format of ['hwp5', 'hwpx']) {
  test(format + ': consent is required before any file read', async (t) => {
    const f = await setup(t, format);
    assert.equal(await f.invoke(args(format).filter((a) => a !== '--allow-stale-layout')), 1);
    assert.match(f.stderr.join(''), /LayoutRequiresReflow/);
    assert.deepEqual(f.reads, []);
    assert.deepEqual(f.calls, []);
    await f.absent();
    await f.unchanged();
  });
  test(format + ': exact payload and new-file receipt for all four actions', async (t) => {
    for (const action of ['insert-row', 'delete-row', 'insert-column', 'delete-column']) {
      const f = await setup(t, format);
      assert.equal(await f.invoke(args(format, { action, index: '1', layout: 'spec6' })), 0);
      assert.deepEqual(f.calls, [
        {
          bytes: bytes(format),
          wasm: new TextEncoder().encode('mock only'),
          reference: ref(format),
          action,
          index: 1,
          expectedRows: 2,
          expectedColumns: 3,
          layout: 'spec6',
        },
      ]);
      assert.match(f.stdout.join(''), new RegExp('sha256: ' + hash(bytes(format, 2))));
      assert.match(f.stdout.join(''), new RegExp('sourceSHA256: ' + hash(bytes(format))));
      assert.match(f.stdout.join(''), /layoutRequiresReflow: true\npreviewStale: true/);
      await f.unchanged();
    }
  });
}

test('grid source SHA, reference format, and HWPX observed8 fail before service and WASM', async (t) => {
  for (const [format, patch] of [
    ['hwp5', { ref: ref('hwp5', { sourceSha256: '0'.repeat(64) }) }],
    ['hwp5', { ref: ref('hwpx') }],
    ['hwpx', { layout: 'observed8' }],
  ]) {
    const f = await setup(t, format);
    assert.equal(await f.invoke(args(format, patch)), 1);
    assert.equal(f.calls.length, 0);
    assert.equal(f.reads.length, 1);
    await f.absent();
    await f.unchanged();
  }
});

test('grid rejects contaminated service fields, shared bytes, and container mismatch before publication', async (t) => {
  for (const patch of [
    null,
    { format: 'hwpx' },
    { sourceSha256: '0'.repeat(64) },
    { layoutRequiresReflow: false },
    { previewStale: false },
    { bytes: [] },
    { bytes: new Uint8Array() },
    { bytes: new Uint8Array(new SharedArrayBuffer(8)) },
    { bytes: bytes('hwpx') },
  ]) {
    const f = await setup(t);
    f.dependencies.editDocumentTableGrid = async () =>
      patch === null ? null : { ...saved('hwp5'), ...patch };
    assert.equal(await f.invoke(), 1);
    assert.match(f.stderr.join(''), /InvalidFileTransformResult|FileTransformFormatMismatch/);
    assert.match(f.stderr.join(''), /published: false/);
    await f.absent();
    await f.unchanged();
  }
});

test('grid preserves source, existing destination, symlinks and wrong extension', async (t) => {
  for (const kind of ['source', 'existing', 'symlink', 'extension']) {
    const f = await setup(t);
    let output = 'output.hwp';
    if (kind === 'source') output = 'input.hwp';
    if (kind === 'existing') await fs.writeFile(join(f.directory, output), 'existing');
    if (kind === 'symlink') await fs.symlink('input.hwp', join(f.directory, output));
    if (kind === 'extension') output = 'output.hwpx';
    assert.equal(await f.invoke(args('hwp5', { output })), 1);
    assert.equal(f.calls.length, 0);
    if (kind === 'existing')
      assert.equal(await fs.readFile(join(f.directory, output), 'utf8'), 'existing');
    if (kind === 'symlink') assert.equal(await fs.readlink(join(f.directory, output)), 'input.hwp');
    await f.unchanged();
  }
});

test('grid service rejection and publication race never overwrite another file', async (t) => {
  const f = await setup(t);
  f.dependencies.editDocumentTableGrid = async () => {
    throw new Error('TableGridMismatch');
  };
  assert.equal(await f.invoke(), 1);
  await f.absent();
  f.dependencies.editDocumentTableGrid = async () => {
    await fs.writeFile(join(f.directory, 'output.hwp'), 'race', { flag: 'wx' });
    return saved('hwp5');
  };
  assert.equal(await f.invoke(), 1);
  assert.equal(await fs.readFile(join(f.directory, 'output.hwp'), 'utf8'), 'race');
  assert.match(f.stderr.join(''), /published: false/);
  await f.unchanged();
});

test('grid records publication receipt before stdout failure', async (t) => {
  const f = await setup(t);
  f.dependencies.io.stdout.write = () => {
    throw new Error('PipeClosed');
  };
  assert.equal(await f.invoke(), 1);
  assert.match(f.stderr.join(''), /PipeClosed/);
  assert.match(f.stderr.join(''), /published: true/);
  assert.match(f.stderr.join(''), new RegExp('sha256: ' + hash(bytes('hwp5', 2))));
  assert.deepEqual(
    new Uint8Array(await fs.readFile(join(f.directory, 'output.hwp'))),
    bytes('hwp5', 2),
  );
  await f.unchanged();
});

const request = {
  inputPath: 'input.hwp',
  outputPath: 'output.hwp',
  reference: ref(),
  action: 'insert-row',
  index: 2,
  expectedRows: 2,
  expectedColumns: 3,
  allowStaleLayout: true,
};
const textOf = (result) =>
  result.content
    .map((b) => {
      assert.equal(b.type, 'text');
      return b.text;
    })
    .join('');
test('grid MCP schema is strict and mirrors integer/action boundaries', () => {
  const tools = documentTools();
  assert.equal(tools.length, 17);
  const schema = tools.find((t) => t.name === 'edit_document_table_grid').config.inputSchema;
  assert.equal(schema.parse(request).allowStaleLayout, true);
  const omitted = { ...request };
  delete omitted.allowStaleLayout;
  assert.equal(schema.parse(omitted).allowStaleLayout, false);
  for (const key of [
    'inputPath',
    'outputPath',
    'reference',
    'action',
    'index',
    'expectedRows',
    'expectedColumns',
  ]) {
    const missing = { ...request };
    delete missing[key];
    assert.equal(schema.safeParse(missing).success, false, key);
  }
  for (const patch of [
    { extra: true },
    { action: 'merge' },
    { index: -1 },
    { index: 1.1 },
    { index: 3 },
    { expectedRows: 0 },
    { expectedColumns: 4294967296 },
    { expectedRows: 4294967295 },
    { action: 'delete-row', index: 2 },
    { action: 'delete-row', expectedRows: 1, index: 0 },
    { layout: 'auto' },
    { reference: ref('hwp5', { kind: 'image' }) },
  ])
    assert.equal(schema.safeParse({ ...request, ...patch }).success, false, JSON.stringify(patch));
});

test('official MCP stdio codecs reach the shared CLI host and mock service in both formats', async (t) => {
  for (const format of ['hwp5', 'hwpx']) {
    const f = await setup(t, format);
    const input = new PassThrough(),
      output = new PassThrough();
    const [clientTransport, peer] = InMemoryTransport.createLinkedPair();
    const reader = createInterface({ input: output, crlfDelay: Infinity });
    const lines = [],
      errors = [];
    reader.on('line', (line) => {
      lines.push(line);
      try {
        peer.send(JSON.parse(line)).catch((e) => errors.push(e));
      } catch (e) {
        errors.push(e);
      }
    });
    peer.onmessage = (message) => input.write(JSON.stringify(message) + '\n');
    const server = runMcpServer({
      transport: new StdioServerTransport(input, output),
      wasmPath: 'native.wasm',
      cliDependencies: f.dependencies,
      onerror: (e) => errors.push(e),
    });
    const client = new Client({ name: 'grid-file-host-test', version: '1.0.0' });
    t.after(async () => {
      await client.close();
      await server.close();
      reader.close();
      input.destroy();
      output.destroy();
    });
    await client.connect(clientTransport);
    const listed = (await client.listTools()).tools;
    assert.equal(listed.length, 20);
    assert.equal(new Set(listed.map((t) => t.name)).size, 20);
    assert.equal(listed.filter((t) => t.name.endsWith('_document_session')).length, 3);
    const tool = listed.find((t) => t.name === 'edit_document_table_grid');
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.annotations.readOnlyHint, false);
    const ext = format === 'hwp5' ? 'hwp' : 'hwpx';
    const base = {
      ...request,
      inputPath: 'input.' + ext,
      outputPath: 'output.' + ext,
      reference: ref(format),
      layout: 'spec6',
    };
    const call = (arguments_) =>
      client.callTool({ name: 'edit_document_table_grid', arguments: arguments_ });
    assert.equal((await call({ ...base, invented: true })).isError, true);
    assert.equal((await call({ ...base, allowStaleLayout: false })).isError, true);
    assert.deepEqual(f.reads, []);
    assert.deepEqual(f.calls, []);
    assert.equal(
      (await call({ ...base, reference: ref(format, { sourceSha256: '0'.repeat(64) }) })).isError,
      true,
    );
    assert.deepEqual(f.calls, []);
    for (const [i, action] of [
      'insert-row',
      'delete-row',
      'insert-column',
      'delete-column',
    ].entries()) {
      const result = await call({ ...base, action, index: 1, outputPath: `output-${i}.${ext}` });
      assert.equal(result.isError, undefined, textOf(result));
      assert.match(textOf(result), /previewStale: true/);
      assert.equal(f.calls.at(-1).action, action);
      assert.deepEqual(
        Object.keys(f.calls.at(-1)).sort(),
        [
          'bytes',
          'wasm',
          'reference',
          'action',
          'index',
          'expectedRows',
          'expectedColumns',
          'layout',
        ].sort(),
      );
    }
    assert.equal((await call({ ...base, outputPath: 'output-0.' + ext })).isError, true);
    assert.equal(f.calls.length, 4);
    await f.unchanged();
    assert.deepEqual(errors, []);
    for (const line of lines) assert.equal(JSON.parse(line).jsonrpc, '2.0');
  }
});

test('MCP argv quoting preserves dash-prefixed paths and omission of optional layout', async () => {
  const seen = [];
  const tool = documentTools({
    wasmPath: '--native.wasm',
    executeCLI: async (argv) => {
      seen.push(parseArguments(argv));
      return 0;
    },
  }).find((t) => t.name === 'edit_document_table_grid');
  await tool.invoke({ ...request, inputPath: '--input.hwp', outputPath: '--output.hwp' });
  assert.equal(seen[0].input, '--input.hwp');
  assert.equal(seen[0].output, '--output.hwp');
  assert.equal(seen[0].wasm, '--native.wasm');
  assert.equal(Object.hasOwn(seen[0], 'layout'), false);
});
