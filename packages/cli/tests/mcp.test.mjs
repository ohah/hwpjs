import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { readFile, mkdtemp, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { documentTools } from '../src/mcp/tools.mjs';
import { runMcpServer, parseMcpArguments } from '../src/mcp/server.mjs';
import { parseArguments } from '../src/arguments.mjs';

const entry = fileURLToPath(new URL('../src/mcp-bin.mjs', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const textOf = (result) =>
  result.content
    .map((block) => {
      assert.equal(block.type, 'text');
      return block.text;
    })
    .join('');
const childArgs = () => [
  '--max-old-space-size=512',
  ...(process.env.HWPJS_MCP_TEST_IMPORT ? ['--import', process.env.HWPJS_MCP_TEST_IMPORT] : []),
  entry,
];

// Official SDK client/transport over actual stdio codecs. The transparent bridge
// records raw output lines independently; it implements no protocol handlers.
async function wire(t, options = {}) {
  const input = new PassThrough(),
    output = new PassThrough();
  const [clientTransport, peer] = InMemoryTransport.createLinkedPair();
  const lines = [],
    errors = [];
  const reader = createInterface({ input: output, crlfDelay: Infinity });
  reader.on('line', (line) => {
    lines.push(line);
    try {
      peer.send(JSON.parse(line)).catch((error) => errors.push(error));
    } catch (error) {
      errors.push(error);
    }
  });
  peer.onmessage = (message) => {
    input.write(JSON.stringify(message) + '\n');
  };
  const handle = runMcpServer({
    ...options,
    transport: new StdioServerTransport(input, output),
    onerror: (error) => errors.push(error),
  });
  const client = new Client({ name: 'hwpjs-mcp-wire-test', version: '1.0.0' });
  t.after(async () => {
    await client.close();
    await handle.close();
    reader.close();
    input.destroy();
    output.destroy();
  });
  await client.connect(clientTransport);
  return { client, lines, errors };
}

test('MCP argv adapter reuses CLI parser and cannot turn literal/path values into flags', async () => {
  const seen = [];
  const tools = documentTools({
    wasmPath: '--runtime.wasm',
    mainModuleURL: 'file:///isolated/mcp.mjs',
    executeCLI: async (argv, dependencies) => {
      seen.push({ options: parseArguments(argv), url: dependencies.mainModuleURL });
      await dependencies.io.stdout.write('source text\n');
      return 0;
    },
  });
  const read = await tools[0].invoke({ inputPath: '--input.hwp', format: 'markdown' });
  assert.equal(textOf(read), 'source text\n');
  assert.equal(read.structuredContent, undefined);
  const edited = await tools[1].invoke({
    inputPath: '--input.hwp',
    outputPath: '--out.hwp',
    target: 's0:p2',
    expectedSha256: 'a'.repeat(64),
    findText: '--with=evil',
    replacement: '',
    allowStaleLayout: true,
  });
  assert.equal(textOf(edited), 'source text\n');
  assert.equal(seen[0].options.input, '--input.hwp');
  assert.equal(seen[0].options.wasm, '--runtime.wasm');
  assert.equal(seen[1].options.replace, '--with=evil');
  assert.equal(seen[1].options.with, '');
  assert.equal(seen[1].options.output, '--out.hwp');
  assert.equal(seen[1].options.allowStaleLayout, true);
  assert.equal(seen[1].url, 'file:///isolated/mcp.mjs');
});

test('MCP captures asynchronous CLI diagnostics and exceptions as tool errors, not protocol output', async () => {
  const tool = documentTools({
    executeCLI: async (_argv, { io }) => {
      await io.stderr.write('error: SourceSHA256Mismatch\npublished: false\n');
      return 1;
    },
  })[0];
  const failed = await tool.invoke({ inputPath: 'missing.hwp' });
  assert.equal(failed.isError, true);
  assert.match(textOf(failed), /SourceSHA256Mismatch/);
  const thrown = documentTools({
    executeCLI: async () => {
      throw Error('UnexpectedHostFailure');
    },
  })[0];
  assert.equal((await thrown.invoke({ inputPath: 'x' })).isError, true);
});

test('official SDK initializes, lists exact tools, validates arguments and emits only JSON lines', async (t) => {
  const calls = [];
  const { client, lines, errors } = await wire(t, {
    executeCLI: async (argv, { io }) => {
      calls.push(argv);
      await io.stdout.write(
        'format: hwp5\ndocumentSHA256: ' + 'a'.repeat(64) + '\nParagraph s0:p2: visible\n',
      );
      return 0;
    },
  });
  assert.equal(client.getServerVersion().name, 'hwpjs');
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [
    'edit_document',
    'extract_document_image',
    'get_document_info',
    'list_document_images',
    'read_document',
  ]);
  const result = await client.callTool({
    name: 'read_document',
    arguments: { inputPath: 'a.hwp' },
  });
  assert.match(textOf(result), /documentSHA256:/);
  assert.equal(calls.length, 1);
  for (const arguments_ of [{ inputPath: 7 }, { inputPath: 'a.hwp', unexpected: true }]) {
    const invalid = await client.callTool({ name: 'read_document', arguments: arguments_ });
    assert.equal(invalid.isError, true);
  }
  assert.equal(calls.length, 1, 'schema rejects before invoking the host');
  await assert.rejects(client.callTool({ name: 'not_a_tool', arguments: {} }));
  assert.ok(lines.length >= 5);
  for (const line of lines) assert.equal(JSON.parse(line).jsonrpc, '2.0');
  assert.deepEqual(errors, []);
});

test('strict MCP entry arguments accept only the explicit WASM option without side effects', () => {
  assert.deepEqual(parseMcpArguments([]), {});
  assert.deepEqual(parseMcpArguments(['--wasm', '/x.wasm']), { wasmPath: '/x.wasm' });
  for (const args of [
    ['--http'],
    ['--wasm'],
    ['--wasm', 'x', '--wasm', 'y'],
    ['x'],
    ['--wasm', '\0'],
  ])
    assert.throws(() => parseMcpArguments(args), /Usage:/);
  const result = spawnSync(process.execPath, [...childArgs(), '--http'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Usage:/);
});

const nativePins = {
  wasm: '82031994b4b7f066c28c725495954eebc67bb25570869c06528ea328e0155ccc',
  hwp5: 'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f',
  hwpx: '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab',
};
async function actualPaths(format) {
  const wasm = process.env.HWPJS_TEST_WASM;
  assert.ok(wasm && wasm.startsWith('/') && !/hwpers|title-column-roundtrip/i.test(wasm));
  assert.equal(process.env.HWPJS_TEST_WASM_SHA256, nativePins.wasm);
  assert.equal(hash(await readFile(wasm)), nativePins.wasm);
  const input = process.env[format === 'hwp5' ? 'HWPJS_TEST_NOORI' : 'HWPJS_TEST_NOORI_HWPX'];
  const name = format === 'hwp5' ? 'noori.hwp' : 'noori.hwpx';
  assert.ok(
    ['apps/docs/docs/public/editor/fixtures', 'legacy/rust/crates/hwp-core/tests/fixtures']
      .map((dir) => resolve(dir, name))
      .includes(input),
  );
  assert.equal(hash(await readFile(input)), nativePins[format]);
  return { wasm, input };
}

for (const format of ['hwp5', 'hwpx'])
  test(
    `official SDK stdio subprocess + actual Native820 ${format}: read/edit/SHA/no-overwrite/readback`,
    { skip: process.env.HWPJS_MCP_NATIVE !== '1', timeout: 25_000 },
    async (t) => {
      const { wasm, input } = await actualPaths(format);
      const directory = process.env.HWPJS_MCP_EVIDENCE_DIR ?? tmpdir();
      await mkdir(directory, { recursive: true });
      const outputs = await mkdtemp(join(directory, `mcp-${format}-`));
      const output = join(outputs, format === 'hwp5' ? 'edited.hwp' : 'edited.hwpx');
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [...childArgs(), '--wasm', wasm],
        stderr: 'pipe',
        maxBufferSize: 64 * 1024 * 1024,
      });
      let stderr = '';
      transport.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      const client = new Client({ name: 'hwpjs-real-mcp-test', version: '1.0.0' });
      const errors = [];
      client.onerror = (error) => errors.push(error);
      t.after(async () => {
        await client.close();
      });
      await client.connect(transport);
      const listed = await client.listTools();
      assert.equal(listed.tools.length, 5);
      const observed = await client.callTool({
        name: 'read_document',
        arguments: { inputPath: input },
      });
      assert.notEqual(observed.isError, true);
      const text = textOf(observed);
      const sha = /^documentSHA256: ([a-f0-9]{64})$/m.exec(text)?.[1];
      assert.equal(sha, nativePins[format]);
      const info = await client.callTool({
        name: 'get_document_info',
        arguments: { inputPath: input },
      });
      assert.notEqual(info.isError, true);
      assert.match(textOf(info), /security.encryption.status: unknown/);
      assert.match(textOf(info), /sourceByteLength: [1-9]/);
      const listedImages = await client.callTool({
        name: 'list_document_images',
        arguments: { inputPath: input },
      });
      assert.notEqual(listedImages.isError, true);
      const imageText = textOf(listedImages);
      const ids = [...imageText.matchAll(/^images\.\d+\.id: (.+)$/gm)].map((match) => match[1]);
      assert.equal(ids.length, 4);
      assert.equal(ids[0], format === 'hwp5' ? 'hwp5:s0:i13' : 'hwpx:s0:i31');
      assert.match(imageText, /coverage.masterPagesIncluded: false/);
      assert.match(imageText, /scopeDiagnostic: .*unreferenced resources/);
      const imageOutput = join(outputs, 'one-image.jpg');
      const extractArgs = {
        inputPath: input,
        outputPath: imageOutput,
        id: ids[0],
        expectedSha256: sha,
      };
      const extracted = await client.callTool({
        name: 'extract_document_image',
        arguments: extractArgs,
      });
      assert.notEqual(extracted.isError, true);
      assert.match(textOf(extracted), /completeWithinListedScope: true/);
      const expectedPayloads = [
        '96e049cdb4702de8fc82dbaa20f5b6cdc4f92b52eaf53c538c9e0d9ba15a12c6',
        '70d2d3db0976c1a4c66916c7b11f295d724f69fa7792d13393a9b2e622d496a8',
        'fe5b8d0ca38a9136634b5d727b032bcb40a3553883bb6c6cf4e5101a5591b1f7',
        'f73541dc5a169e5c996af14315b5634a9e9fe510b8f825db46b689c52c2722fa',
      ]; // Fixed direct-Native payload oracle, not a decoded-pixel validity claim.
      assert.equal(hash(await readFile(imageOutput)), expectedPayloads[0]);
      assert.equal(
        (await client.callTool({ name: 'extract_document_image', arguments: extractArgs })).isError,
        true,
      );
      assert.equal(
        (
          await client.callTool({
            name: 'extract_document_image',
            arguments: {
              ...extractArgs,
              outputPath: join(outputs, 'stale.jpg'),
              expectedSha256: '0'.repeat(64),
            },
          })
        ).isError,
        true,
      );
      const cliDirectory = join(outputs, 'all-images');
      const cli = spawnSync(
        process.execPath,
        [
          '--max-old-space-size=512',
          ...(process.env.HWPJS_MCP_TEST_IMPORT
            ? ['--import', process.env.HWPJS_MCP_TEST_IMPORT]
            : []),
          fileURLToPath(new URL('../src/bin.mjs', import.meta.url)),
          'extract-images',
          input,
          '--output=' + cliDirectory,
          '--wasm=' + wasm,
        ],
        { encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
      );
      assert.equal(cli.status, 0, cli.stderr);
      assert.match(cli.stdout, /completeWithinListedScope: true/);
      assert.match(cli.stdout, /scopeDiagnostic: .*unreferenced resources/);
      for (const [index, expected] of expectedPayloads.entries())
        assert.equal(
          hash(
            await readFile(
              join(
                cliDirectory,
                `image-${String(index + 1).padStart(4, '0')}${index < 2 ? '.jpg' : '.bmp'}`,
              ),
            ),
          ),
          expected,
        );
      assert.equal(hash(await readFile(input)), nativePins[format]);
      const target = format === 'hwp5' ? 's0:p2' : 's0:p3';
      assert.match(text, new RegExp(`Paragraph ${target} .*보도일시`));
      const request = {
        inputPath: input,
        outputPath: output,
        target,
        expectedSha256: sha,
        findText: '보도일시',
        replacement: 'MCP🙂',
        allowStaleLayout: true,
      };
      const stale = await client.callTool({
        name: 'edit_document',
        arguments: { ...request, expectedSha256: '0'.repeat(64) },
      });
      assert.equal(stale.isError, true);
      assert.match(textOf(stale), /SourceSHA256Mismatch/);
      const saved = await client.callTool({ name: 'edit_document', arguments: request });
      assert.notEqual(saved.isError, true);
      assert.match(textOf(saved), /changed: true/);
      const before = await readFile(output);
      const overwrite = await client.callTool({ name: 'edit_document', arguments: request });
      assert.equal(overwrite.isError, true);
      assert.match(textOf(overwrite), /OutputExists/);
      assert.deepEqual(await readFile(output), before);
      const collision = await client.callTool({
        name: 'edit_document',
        arguments: { ...request, outputPath: input },
      });
      assert.equal(collision.isError, true);
      assert.match(textOf(collision), /SourceOutputCollision/);
      const reopened = await client.callTool({
        name: 'read_document',
        arguments: { inputPath: output },
      });
      assert.notEqual(reopened.isError, true);
      assert.match(textOf(reopened), /MCP🙂/);
      assert.match(textOf(reopened), new RegExp('documentSHA256: ' + hash(before)));
      assert.equal(hash(await readFile(input)), nativePins[format], 'original input never changed');
      const concurrent = await Promise.all(
        [0, 1].map(() =>
          client.callTool({ name: 'read_document', arguments: { inputPath: input } }),
        ),
      );
      assert.ok(concurrent.every((result) => !result.isError));
      assert.deepEqual(errors, [], 'SDK observed no malformed stdout protocol');
      assert.equal(stderr, '', 'CLI content/diagnostics never leak onto process streams');
      t.diagnostic(
        JSON.stringify({
          format,
          nativeSha256: nativePins.wasm,
          sourceSha256: sha,
          outputSha256: hash(before),
          output,
        }),
      );
    },
  );

test('MCP metadata/image adapters reuse CLI guards and distinguish file from CLI directory output', async () => {
  const seen = [];
  const tools = documentTools({
    executeCLI: async (argv, deps) => {
      seen.push({ options: parseArguments(argv), mode: deps.imageOutputMode });
      await deps.io.stdout.write('ok\n');
      return 0;
    },
  });
  const get = (name) => tools.find((tool) => tool.name === name);
  assert.equal(textOf(await get('get_document_info').invoke({ inputPath: '--input' })), 'ok\n');
  await get('list_document_images').invoke({ inputPath: 'a', expectedSha256: 'a'.repeat(64) });
  await get('extract_document_image').invoke({
    inputPath: 'a',
    outputPath: '--out.bin',
    id: 'hwpx:s0:i3',
    expectedSha256: 'a'.repeat(64),
  });
  assert.equal(seen[0].options.command, 'info');
  assert.equal(seen[1].options.command, 'images');
  assert.equal(seen[2].options.command, 'extract-images');
  assert.equal(seen[2].options.output, '--out.bin');
  assert.equal(seen[2].mode, 'file');
  assert.equal(seen[2].options.id, 'hwpx:s0:i3');
});
test('official MCP SDK validates image SHA/ID/output before host and returns partial failures as tool errors', async (t) => {
  const calls = [];
  const { client, lines, errors } = await wire(t, {
    executeCLI: async (argv, { io, imageOutputMode }) => {
      calls.push({ argv, imageOutputMode });
      await io.stderr.write('error: IncompleteImageExtraction\npublished: true\n');
      return 1;
    },
  });
  for (const args of [
    { inputPath: 'x', outputPath: 'y', id: 'hwpx:s0:i1' },
    { inputPath: 'x', outputPath: 'y', id: 'hwpx:s0:i1', expectedSha256: 'bad' },
    {
      inputPath: 'x',
      outputPath: 'y',
      id: 'hwpx:s0:i1',
      expectedSha256: 'a'.repeat(64),
      extra: true,
    },
  ]) {
    assert.equal(
      (await client.callTool({ name: 'extract_document_image', arguments: args })).isError,
      true,
    );
  }
  assert.equal(calls.length, 0);
  const result = await client.callTool({
    name: 'extract_document_image',
    arguments: {
      inputPath: 'x',
      outputPath: 'y.bin',
      id: 'hwpx:s0:i1',
      expectedSha256: 'a'.repeat(64),
    },
  });
  assert.equal(result.isError, true);
  assert.match(textOf(result), /published: true/);
  assert.equal(calls[0].imageOutputMode, 'file');
  for (const raw of lines) assert.equal(JSON.parse(raw).jsonrpc, '2.0');
  assert.deepEqual(errors, []);
});
