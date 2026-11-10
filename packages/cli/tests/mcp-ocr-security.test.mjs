import assert from 'node:assert/strict';
import test from 'node:test';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { documentTools } from '../src/mcp/tools.ts';
import { createMcpServer, parseMcpArguments } from '../src/mcp/server.ts';
import { parseArguments } from '../src/arguments.ts';

const toolNames = [
  'apply_document_changes',
  'convert_document',
  'create_document',
  'delete_document_table',
  'edit_document',
  'edit_document_table_grid',
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
];
const ocr = (options) => documentTools(options).find((tool) => tool.name === 'ocr_document');
const textOf = (result) => result.content.map((block) => block.text).join('');

function noFiles() {
  let accesses = 0;
  return {
    files: new Proxy(
      {},
      {
        get() {
          accesses++;
          throw Error('UnexpectedFileAccess');
        },
      },
    ),
    assertUnused: () => assert.equal(accesses, 0),
  };
}

async function connect(t, options) {
  const server = createMcpServer(options);
  const client = new Client({ name: 'ocr-security-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

test('official MCP OCR schema removes executable and rejects it before CLI or files', async (t) => {
  const guard = noFiles();
  let calls = 0;
  const client = await connect(t, {
    ocrExecutable: '/trusted/tesseract',
    cliDependencies: { files: guard.files },
    executeCLI: async () => {
      calls++;
      return 0;
    },
  });
  const listed = (await client.listTools()).tools;
  assert.deepEqual(
    listed.map((tool) => tool.name).sort(),
    [
      ...toolNames,
      'open_document_session',
      'read_document_session',
      'close_document_session',
    ].sort(),
  );
  const schema = listed.find((tool) => tool.name === 'ocr_document');
  assert.equal(schema.inputSchema.additionalProperties, false);
  assert.equal(Object.hasOwn(schema.inputSchema.properties, 'executable'), false);
  assert.deepEqual(schema.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  });
  for (const provider of ['tesseract', 'vision']) {
    for (const executable of ['/client/evil', '', null, 3]) {
      const result = await client.callTool({
        name: 'ocr_document',
        arguments: { inputPath: 'unread.hwp', provider, executable },
      });
      assert.equal(result.isError, true);
    }
  }
  assert.equal(calls, 0);
  guard.assertUnused();
});

test('direct OCR invocation rejects legacy executable and unexpected fields before CLI/files', async () => {
  const guard = noFiles();
  let calls = 0;
  const tool = ocr({
    ocrExecutable: '/trusted/tesseract',
    cliDependencies: { files: guard.files },
    executeCLI: async () => {
      calls++;
      return 0;
    },
  });
  for (const provider of ['tesseract', 'vision']) {
    for (const extra of [
      { executable: '/client/evil' },
      { executable: undefined },
      { executable: null },
      { unexpected: true },
    ]) {
      const result = await tool.invoke({ inputPath: 'unread.hwp', provider, ...extra });
      assert.equal(result.isError, true);
      assert.match(textOf(result), /InvalidMcpOcrInput/);
    }
  }
  assert.equal(calls, 0);
  guard.assertUnused();
});

test('trusted executable is forwarded exactly for Tesseract only on repeated MCP calls', async (t) => {
  const executable = '/operator tools/한글/tesseract --literal';
  const calls = [];
  const client = await connect(t, {
    ...parseMcpArguments(['--wasm', '/engine.wasm', '--ocr-executable', executable]),
    executeCLI: async (argv, { io }) => {
      calls.push(argv);
      await io.stdout.write('ok');
      return 0;
    },
  });
  for (let index = 0; index < 3; index++) {
    for (const provider of [undefined, 'tesseract', 'vision']) {
      const result = await client.callTool({
        name: 'ocr_document',
        arguments: { inputPath: '--input.hwp', ...(provider ? { provider } : {}) },
      });
      assert.notEqual(result.isError, true);
      const argv = calls.at(-1);
      assert.deepEqual(argv, [
        'ocr',
        `--provider=${provider ?? 'tesseract'}`,
        '--languages=kor+eng',
        '--format=text',
        ...(provider === 'vision' ? [] : [`--executable=${executable}`]),
        '--wasm=/engine.wasm',
        '--',
        '--input.hwp',
      ]);
      assert.equal(parseArguments(argv).executable, provider === 'vision' ? undefined : executable);
    }
  }
  assert.deepEqual(
    (await client.listTools()).tools.map((tool) => tool.name).sort(),
    [
      ...toolNames,
      'open_document_session',
      'read_document_session',
      'close_document_session',
    ].sort(),
  );
  assert.equal(calls.length, 9);
});

test('default MCP OCR leaves binary selection to host while CLI keeps operator executable option', async () => {
  const calls = [];
  const tool = ocr({
    executeCLI: async (argv) => {
      calls.push(argv);
      return 0;
    },
  });
  for (let index = 0; index < 3; index++) {
    assert.notEqual((await tool.invoke({ inputPath: 'a.hwp' })).isError, true);
    assert.deepEqual(calls.at(-1), [
      'ocr',
      '--provider=tesseract',
      '--languages=kor+eng',
      '--format=text',
      '--',
      'a.hwp',
    ]);
    const parsed = parseArguments([
      'ocr',
      '--provider=tesseract',
      '--executable=/operator/custom OCR',
      '--',
      'a.hwp',
    ]);
    assert.equal(parsed.executable, '/operator/custom OCR');
  }
  assert.equal(documentTools().length, 17);
  assert(documentTools().some((tool) => tool.name === 'edit_document_table_grid'));
});

test('server startup validates trusted executable and rejects malformed/duplicate/missing/unknown options', () => {
  assert.deepEqual(parseMcpArguments([]), {});
  assert.deepEqual(parseMcpArguments(['--wasm', '/old.wasm']), { wasmPath: '/old.wasm' });
  assert.deepEqual(parseMcpArguments(['--ocr-executable', 'tesseract', '--wasm', '/a.wasm']), {
    wasmPath: '/a.wasm',
    ocrExecutable: 'tesseract',
  });
  for (const value of ['', '  ', '\0', 'bad\0path', '\ud800', null, 42, {}]) {
    assert.throws(() => documentTools({ ocrExecutable: value }), /InvalidMcpOcrExecutable/);
    assert.throws(() => createMcpServer({ ocrExecutable: value }), /InvalidMcpOcrExecutable/);
    assert.throws(
      () => parseMcpArguments(['--ocr-executable', value]),
      /Usage:|InvalidMcpOcrExecutable/,
    );
  }
  for (const args of [
    ['--ocr-executable'],
    ['--ocr-executable', '--wasm'],
    ['--ocr-executable', '--unknown'],
    ['--unknown', 'value'],
    ['--executable', '/caller'],
    ['--ocr-executable', 'a', '--ocr-executable', 'b'],
    ['--wasm', 'a', '--wasm', 'b'],
    ['--wasm', 'a', '--ocr-executable'],
    ['--ocr-executable', 'a', '--unknown', 'b'],
    ['--wasm', '\0'],
    ['--wasm', '\ud800'],
  ])
    assert.throws(() => parseMcpArguments(args), /Usage:/);
});
