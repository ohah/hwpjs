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
import { documentTools } from '../src/mcp/tools.ts';
import { runMcpServer, parseMcpArguments } from '../src/mcp/server.ts';
import { parseArguments } from '../src/arguments.ts';

const entry = fileURLToPath(new URL('../src/mcp-bin.ts', import.meta.url));
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
  const read = await tools[0].invoke({
    inputPath: '--input.hwp',
    format: 'markdown',
    view: 'structure',
  });
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
  assert.equal(seen[0].options.view, 'structure');
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
    'apply_document_changes',
    'convert_document',
    'create_document',
    'delete_document_table',
    'edit_document',
    'export_document_html',
    'extract_document_image',
    'get_document_info',
    'get_document_object',
    'get_document_paragraph',
    'insert_document_image',
    'list_document_images',
    'ocr_document',
    'read_document',
    'read_documents',
    'replace_document_image',
  ]);
  const result = await client.callTool({
    name: 'read_document',
    arguments: { inputPath: 'a.hwp', view: 'structure' },
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

test('strict MCP entry arguments preserve the explicit WASM option without side effects', () => {
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
      assert.equal(listed.tools.length, 16);
      const observed = await client.callTool({
        name: 'read_document',
        arguments: { inputPath: input, view: 'structure' },
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
          fileURLToPath(new URL('../src/bin.ts', import.meta.url)),
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
        arguments: { inputPath: output, view: 'structure' },
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

test('read_documents 어댑터는 명시 배열을 리터럴로 전달하고 내부 JSON을 노출하지 않는다', async () => {
  const seen = [];
  const tool = documentTools({
    wasmPath: '--wasm처럼보이는경로',
    executeCLI: async (argv, { io }) => {
      seen.push(parseArguments(argv));
      await io.stdout.write('파일별 읽기 보고서\n');
      return 1;
    },
  }).find((item) => item.name === 'read_documents');
  const result = await tool.invoke({
    inputPaths: ['--문서.hwp', 'b.hwpx'],
    format: 'markdown',
    concurrency: 2,
    maxOutputBytes: 8000,
  });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent, undefined);
  assert.equal(textOf(result), '파일별 읽기 보고서\n');
  assert.deepEqual(seen[0].inputPaths, ['--문서.hwp', 'b.hwpx']);
  assert.equal(seen[0].wasm, '--wasm처럼보이는경로');
  assert.equal(seen[0].concurrency, 2);
  assert.equal(seen[0].view, 'content');
});
test('공식 SDK의 read_documents 스키마는 잘못된 배치와 추가 필드를 호스트 전에 거부한다', async (t) => {
  const calls = [];
  const { client, errors } = await wire(t, {
    executeCLI: async (argv, { io }) => {
      calls.push(parseArguments(argv));
      await io.stdout.write('batchStatus: partial\nerror: ReadFailed\n');
      return 1;
    },
  });
  for (const args of [
    { inputPaths: [] },
    { inputPaths: ['a', 'a'] },
    { inputPaths: Array(129).fill('a') },
    { inputPaths: ['a'], concurrency: 3 },
    { inputPaths: ['a'], concurrency: 1.5 },
    { inputPaths: ['a'], format: 'html' },
    { inputPaths: ['a'], format: 'json' },
    { inputPaths: ['a'], maxOutputBytes: 16777217 },
    { inputPaths: ['a'], outputPath: 'out' },
    { inputPaths: ['a'], recursive: true },
    { inputPaths: ['줄\n바꿈'] },
    { inputPaths: ['\ud800'] },
    { inputPaths: ['-'] },
  ]) {
    const result = await client.callTool({ name: 'read_documents', arguments: args });
    assert.equal(result.isError, true);
  }
  assert.equal(calls.length, 0);
  const result = await client.callTool({
    name: 'read_documents',
    arguments: { inputPaths: ['a', 'b'] },
  });
  assert.equal(result.isError, true);
  assert.match(textOf(result), /partial/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].concurrency, 1);
  assert.equal(calls[0].maxOutputBytes, 4194304);
  assert.equal(result.structuredContent, undefined);
  assert.deepEqual(errors, []);
});

test(
  '공식 MCP read_documents로 실제 Noori 두 포맷을 읽고 부분 실패를 숨기지 않는다',
  { skip: process.env.HWPJS_READ_MANY_NATIVE !== '1', timeout: 30000 },
  async (t) => {
    const h5 = await actualPaths('hwp5');
    const hx = await actualPaths('hwpx');
    const { createFiles } = await import('../src/files.ts');
    const files = createFiles();
    const reads = [];
    const readOnly = {
      ...files,
      readInputSnapshot: async (...args) => {
        reads.push(args[0]);
        return files.readInputSnapshot(...args);
      },
    };
    for (const name of ['publishNewOutput', 'assertNewOutput', 'createImageDirectory'])
      readOnly[name] = () => {
        throw Error('읽기 도구의 쓰기 호출 금지');
      };
    const { client, errors } = await wire(t, {
      wasmPath: h5.wasm,
      cliDependencies: { files: readOnly },
    });
    for (const format of ['text', 'markdown']) {
      reads.length = 0;
      const result = await client.callTool({
        name: 'read_documents',
        arguments: { inputPaths: [h5.input, hx.input], format, concurrency: 2, view: 'structure' },
      });
      assert.notEqual(result.isError, true);
      const text = textOf(result);
      assert.match(text, /batchStatus: success/);
      assert.match(text, /보도일시/);
      assert.match(text, new RegExp('documentSHA256: ' + nativePins.hwp5));
      assert.match(text, new RegExp('documentSHA256: ' + nativePins.hwpx));
      assert.equal(reads.filter((path) => path === h5.wasm).length, 1);
      assert.equal(result.structuredContent, undefined);
    }
    const result = await client.callTool({
      name: 'read_documents',
      arguments: { inputPaths: [h5.input, hx.input + '.missing', hx.input], view: 'structure' },
    });
    assert.equal(result.isError, true);
    assert.match(textOf(result), /batchStatus: partial/);
    assert.match(textOf(result), /failed: 1/);
    assert.match(textOf(result), /ReadFailed/);
    assert.match(textOf(result), /보도일시/);
    assert.equal(hash(await readFile(h5.input)), nativePins.hwp5);
    assert.equal(hash(await readFile(hx.input)), nativePins.hwpx);
    assert.equal(hash(await readFile(h5.wasm)), nativePins.wasm);
    assert.deepEqual(errors, []);
  },
);

test(
  '실제 MCP 소스 프로세스의 read_documents는 Noori 두 포맷과 부분 실패를 텍스트로 전송한다',
  { skip: process.env.HWPJS_READ_MANY_NATIVE !== '1', timeout: 30000 },
  async (t) => {
    const h5 = await actualPaths('hwp5'),
      hx = await actualPaths('hwpx');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [...childArgs(), '--wasm', h5.wasm],
      stderr: 'pipe',
      maxBufferSize: 64 * 1024 * 1024,
    });
    let stderr = '';
    transport.stderr.on('data', (bytes) => {
      stderr += bytes.toString();
    });
    const client = new Client({ name: 'hwpjs-batch-source-test', version: '1.0.0' });
    const errors = [];
    client.onerror = (error) => errors.push(error);
    t.after(async () => {
      await client.close();
    });
    await client.connect(transport);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === 'read_documents'));
    const result = await client.callTool({
      name: 'read_documents',
      arguments: {
        inputPaths: [h5.input, hx.input],
        format: 'markdown',
        concurrency: 2,
        view: 'structure',
      },
    });
    assert.notEqual(result.isError, true);
    assert.equal(result.structuredContent, undefined);
    assert.match(textOf(result), /^# 여러 문서 읽기/);
    assert.match(textOf(result), /보도일시/);
    assert.match(textOf(result), new RegExp('documentSHA256: ' + nativePins.hwp5));
    assert.match(textOf(result), new RegExp('documentSHA256: ' + nativePins.hwpx));
    const partial = await client.callTool({
      name: 'read_documents',
      arguments: { inputPaths: [h5.input, hx.input + '.missing', hx.input], view: 'structure' },
    });
    assert.equal(partial.isError, true);
    assert.match(textOf(partial), /batchStatus: partial/);
    assert.match(textOf(partial), /ReadFailed/);
    assert.equal(hash(await readFile(h5.input)), nativePins.hwp5);
    assert.equal(hash(await readFile(hx.input)), nativePins.hwpx);
    assert.equal(stderr, '');
    assert.deepEqual(errors, []);
  },
);

test('공식 MCP의 기본 내용과 structure 옵션은 같은 공통 호스트를 사용하고 빈 성공도 보존한다', async (t) => {
  const sha = 'a'.repeat(64),
    seen = [];
  const { client, errors } = await wire(t, {
    cliDependencies: {
      files: {
        resolveWasmPath: () => '/wasm',
        readInputSnapshot: async (path) => {
          if (path === 'missing') throw Error('파일 누락');
          return { bytes: Uint8Array.of(1), sha256: sha };
        },
      },
      engine: {
        read: async () => ({
          format: 'hwp5',
          model: { version: 1, format: 'hwp5', sourceSha256: sha },
        }),
      },
      renderDocument: (_model, options) => {
        seen.push(options);
        return options.view === 'structure' ? '문단 s0:p1\n' : '';
      },
    },
  });
  const content = await client.callTool({ name: 'read_document', arguments: { inputPath: 'a' } });
  assert.notEqual(content.isError, true);
  assert.equal(textOf(content), '');
  assert.equal(content.structuredContent, undefined);
  const structure = await client.callTool({
    name: 'read_document',
    arguments: { inputPath: 'a', view: 'structure', format: 'markdown' },
  });
  assert.match(textOf(structure), new RegExp('documentSHA256: ' + sha));
  assert.match(textOf(structure), /문단 s0:p1/);
  const partial = await client.callTool({
    name: 'read_documents',
    arguments: { inputPaths: ['missing', 'a'], format: 'markdown' },
  });
  assert.equal(partial.isError, true);
  assert.match(textOf(partial), /읽기 실패:.*파일 누락/);
  assert.match(textOf(partial), /성공 1개, 실패 1개/);
  assert.doesNotMatch(textOf(partial), /(?:batchStatus|readStatus|documentSHA256):/);
  const structuredBatch = await client.callTool({
    name: 'read_documents',
    arguments: { inputPaths: ['a', 'b'], view: 'structure' },
  });
  assert.notEqual(structuredBatch.isError, true);
  assert.match(textOf(structuredBatch), /batchStatus: success/);
  assert.equal((textOf(structuredBatch).match(/documentSHA256:/g) ?? []).length, 2);
  assert.deepEqual(seen, [
    { format: 'text', view: 'content' },
    { format: 'markdown', view: 'structure' },
    { format: 'markdown', view: 'content' },
    { format: 'text', view: 'structure' },
    { format: 'text', view: 'structure' },
  ]);
  assert.deepEqual(errors, []);
});

test('두 MCP 읽기 도구는 잘못된 view를 호스트 호출 전에 거부한다', async (t) => {
  let calls = 0;
  const { client } = await wire(t, {
    executeCLI: async () => {
      calls++;
      return 0;
    },
  });
  for (const view of ['json', '', 'CONTENT', null, 0]) {
    for (const [name, args] of [
      ['read_document', { inputPath: 'a' }],
      ['read_documents', { inputPaths: ['a'] }],
    ]) {
      const result = await client.callTool({ name, arguments: { ...args, view } });
      assert.equal(result.isError, true);
    }
  }
  assert.equal(calls, 0);
});

test('추가 MCP 도구는 스키마 기본값과 리터럴을 같은 CLI 호스트에 전달한다', async (t) => {
  const calls = [];
  const { client, errors } = await wire(t, {
    executeCLI: async (argv, dependencies) => {
      calls.push({ argv, creationText: dependencies.creationText });
      await dependencies.io.stdout.write('관측 본문\n');
      return 0;
    },
  });
  const sha = 'a'.repeat(64);
  const imageReference = `hwpjs-object:${sha}/hwp5/s0/image/13`;
  const cases = [
    [
      'get_document_paragraph',
      { inputPath: '--input.hwp', target: 's0:p1' },
      ['paragraph', '--target=s0:p1', '--format=text', '--', '--input.hwp'],
    ],
    [
      'apply_document_changes',
      { inputPath: 'a.hwp', outputPath: '--out.hwp', expectedSha256: sha, operations: [] },
      ['apply', '--operations=[]', '--output=--out.hwp', `--expect-sha256=${sha}`, '--', 'a.hwp'],
    ],
    [
      'create_document',
      { outputPath: 'new.hwpx', format: 'hwpx', text: '--내용=한글\nEnglish' },
      ['create', '--format=hwpx', '--output=new.hwpx'],
    ],
    [
      'convert_document',
      { inputPath: 'a.hwp', outputPath: 'new.hwpx', to: 'hwpx' },
      ['convert', '--to=hwpx', '--output=new.hwpx', '--loss-policy=reject', '--', 'a.hwp'],
    ],
    [
      'ocr_document',
      { inputPath: 'a.hwp', provider: 'vision' },
      ['ocr', '--provider=vision', '--languages=kor+eng', '--format=text', '--', 'a.hwp'],
    ],
    [
      'replace_document_image',
      {
        inputPath: '--a.hwp',
        outputPath: 'new.hwp',
        reference: imageReference,
        imagePath: '--image.png',
      },
      [
        'replace-image',
        `--ref=${imageReference}`,
        '--image=--image.png',
        '--output=new.hwp',
        '--',
        '--a.hwp',
      ],
    ],
  ];
  for (const [name, arguments_, expected] of cases) {
    const response = await client.callTool({ name, arguments: arguments_ });
    assert.equal(response.isError, undefined);
    assert.equal(textOf(response), '관측 본문\n');
    assert.deepEqual(calls.at(-1).argv, expected);
  }
  assert.equal(calls[2].creationText, '--내용=한글\nEnglish');
  assert.deepEqual(errors, []);
});

test('추가 MCP 스키마의 잘못된 작업·공급자·형식은 CLI 호출 전에 거부된다', async (t) => {
  let calls = 0;
  const { client, errors } = await wire(t, {
    executeCLI: async () => {
      calls++;
      return 0;
    },
  });
  const cases = [
    ['get_document_paragraph', { inputPath: 'a', target: '' }],
    [
      'apply_document_changes',
      {
        inputPath: 'a',
        outputPath: 'b',
        expectedSha256: 'a'.repeat(64),
        operations: [{ kind: '가짜작업', coordinates: 'current-transaction' }],
      },
    ],
    ['create_document', { outputPath: 'b', format: 'html' }],
    ['convert_document', { inputPath: 'a', outputPath: 'b', to: 'hwpx', lossPolicy: 'silent' }],
    ['ocr_document', { inputPath: 'a', provider: 'cloud' }],
  ];
  for (const [name, arguments_] of cases) {
    assert.equal((await client.callTool({ name, arguments: arguments_ })).isError, true);
  }
  assert.equal(calls, 0);
  assert.deepEqual(errors, []);
});

test('MCP는 일반 throw 객체의 message와 nullish·원시값 오류 표시를 보존한다', async () => {
  for (const [error, expected] of [
    [{ message: '일반 오류' }, '일반 오류'],
    [new Error('Error 오류'), 'Error 오류'],
    [{ message: '' }, ''],
    [{ message: 0 }, '0'],
    [{ message: null }, '[object Object]'],
    ['문자열 오류', '문자열 오류'],
    [null, 'null'],
    [undefined, 'undefined'],
  ]) {
    const tool = documentTools({
      executeCLI: async () => {
        throw error;
      },
    })[0];
    const response = await tool.invoke({ inputPath: 'a.hwp' });
    assert.equal(response.isError, true);
    assert.equal(textOf(response), 'CLI failed: ' + expected);
  }
});
