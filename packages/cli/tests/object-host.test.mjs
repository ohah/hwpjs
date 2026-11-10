import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { parseArguments } from '../src/arguments.ts';
import { runCLI } from '../src/main.ts';
import { createFiles } from '../src/files.ts';
import { documentTools } from '../src/mcp/tools.ts';
import { runMcpServer } from '../src/mcp/server.ts';
import { buildObjectReference } from '../src/object-reference.ts';

// 가짜 문서·WASM 바이트와 DI만 사용합니다. 실제 Native·설치 패키지 검증이 아닙니다.
const original = Buffer.from('개체 호스트 읽기 전용 스냅샷');
const wasmBytes = Uint8Array.of(0, 97, 115, 109);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceSha256 = sha256(original);
const ref = (kind = 'image', extra = {}) =>
  buildObjectReference({
    sourceSha256,
    format: 'hwp5',
    section: 0,
    kind,
    node: 77,
    ...extra,
  });
const textOf = (result) =>
  result.content
    .map((block) => {
      assert.equal(block.type, 'text');
      return block.text;
    })
    .join('');

async function setup(
  t,
  { format = 'hwp5', status = 'available', text = '관측한 실제 내용\n' } = {},
) {
  const dir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'hwpjs-object-host-')));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(join(dir, 'input.any'), original);
  await fs.writeFile(join(dir, 'native.wasm'), wasmBytes);
  const out = [],
    err = [],
    reads = [],
    inspections = [],
    imageReads = [];
  const counts = { opened: 0, documentClosed: 0, imagesCreated: 0, imagesClosed: 0 };
  const files = createFiles({ cwd: () => dir });
  const deps = {
    files: {
      ...files,
      async readInputSnapshot(path, options) {
        reads.push(path);
        return files.readInputSnapshot(path, options);
      },
    },
    io: {
      stdout: { write: (value) => out.push(value) },
      stderr: { write: (value) => err.push(value) },
    },
    mainModuleURL: pathToFileURL(join(dir, 'entry.mjs')),
    inspectDocumentObject: async (input) => {
      inspections.push(input);
      return {
        schemaVersion: 1,
        sourceSha256,
        format,
        reference: input.reference,
        kind: 'image',
        status,
        text,
      };
    },
    engine: {
      read() {
        throw new Error('기존 읽기 엔진을 호출하면 안 됩니다');
      },
      edit() {
        throw new Error('편집 엔진을 호출하면 안 됩니다');
      },
      async openDocument(input) {
        counts.opened++;
        assert.equal(input.expectedSha256, sourceSha256);
        assert.ok(input.bytes instanceof Uint8Array);
        assert.deepEqual([...input.bytes], [...original]);
        assert.deepEqual([...input.wasm], [...wasmBytes]);
        return {
          format,
          sourceSha256,
          sectionCount: 1,
          sdk: { borrowed: true },
          close() {
            counts.documentClosed++;
          },
        };
      },
    },
    createDocumentImages(input) {
      counts.imagesCreated++;
      assert.equal(input.sourceSha256, sourceSha256);
      assert.equal(input.sdk.borrowed, true);
      const id = format + ':s0:i77';
      return {
        list: () => ({
          version: 1,
          format,
          sourceSha256,
          images: [{ id, status: 'unread', byteLength: null, mime: null, extension: null }],
          coverage: { scope: 'section-picture-sites', inventoryComplete: true },
        }),
        read(actualId, options) {
          imageReads.push(actualId);
          assert.equal(actualId, id);
          assert.equal(options.sourceSha256, sourceSha256);
          return {
            id,
            sourceSha256,
            status: 'ready',
            extension: '.bin',
            mime: 'application/octet-stream',
            recognized: false,
            bytes: Uint8Array.of(9, 8, 7),
          };
        },
        close() {
          counts.imagesClosed++;
        },
      };
    },
  };
  const object = (...more) => [
    'object',
    'input.any',
    '--ref=' + ref(),
    '--wasm=native.wasm',
    ...more,
  ];
  const extract = (...more) => [
    'extract-images',
    'input.any',
    '--ref=' + ref(),
    '--wasm=native.wasm',
    '--output=images',
    ...more,
  ];
  return { dir, deps, out, err, reads, inspections, imageReads, counts, object, extract };
}

async function wire(t, options) {
  const input = new PassThrough(),
    output = new PassThrough();
  const [transport, peer] = InMemoryTransport.createLinkedPair();
  const lines = [],
    errors = [];
  const reader = createInterface({ input: output, crlfDelay: Infinity });
  reader.on('line', (line) => {
    lines.push(line);
    try {
      peer.send(JSON.parse(line)).catch((cause) => errors.push(cause));
    } catch (cause) {
      errors.push(cause);
    }
  });
  peer.onmessage = (message) => input.write(JSON.stringify(message) + '\n');
  const handle = runMcpServer({
    ...options,
    transport: new StdioServerTransport(input, output),
    onerror: (cause) => errors.push(cause),
  });
  const client = new Client({ name: 'object-host-independent-test', version: '1.0.0' });
  t.after(async () => {
    await client.close();
    await handle.close();
    reader.close();
    input.destroy();
    output.destroy();
  });
  await client.connect(transport);
  return { client, lines, errors };
}

test('개체 CLI는 ref만으로 스냅샷을 선택하고 표시 형식과 실제 추출 ID를 구분한다', () => {
  for (const format of ['text', 'markdown']) {
    const options = parseArguments(['object', 'input.any', '--ref', ref(), '--format', format]);
    assert.equal(options.reference, ref());
    assert.equal(options.expectSha256, sourceSha256);
    assert.equal(options.format, format);
  }
  assert.equal(parseArguments(['object', 'input.any', '--ref=' + ref()]).format, 'text');
  const extract = parseArguments([
    'extract-images',
    'input.any',
    '--ref=' + ref(),
    '--output=images',
  ]);
  assert.equal(extract.id, 'hwp5:s0:i77');
  assert.equal(extract.reference, ref());
  assert.equal(extract.expectSha256, sourceSha256);
  const legacy = parseArguments([
    'extract-images',
    'input.any',
    '--id=hwp5:s0:i77',
    '--expect-sha256=' + sourceSha256,
    '--output=images',
  ]);
  assert.equal(legacy.reference, undefined);
  assert.equal(legacy.id, extract.id);
});

test('CLI는 ref와 legacy 혼용·없는 참조·다른 kind 추출을 파일 접근 전에 거부한다', async () => {
  const invalid = [
    ['object', 'input.any'],
    ['object', 'input.any', '--ref=https://fake/image'],
    ['object', 'input.any', '--ref=' + ref(), '--format=html'],
    ['object', 'input.any', '--ref=' + ref(), '--expect-sha256=' + sourceSha256],
    [
      'extract-images',
      'input.any',
      '--output=images',
      '--ref=' + ref(),
      '--expect-sha256=' + sourceSha256,
    ],
    [
      'extract-images',
      'input.any',
      '--output=images',
      '--ref=' + ref(),
      '--id=hwp5:s0:i77',
      '--expect-sha256=' + sourceSha256,
    ],
    ...['table', 'chart', 'equation', 'drawing', 'ole', 'unknown'].map((kind) => [
      'extract-images',
      'input.any',
      '--output=images',
      '--ref=' + ref(kind),
    ]),
  ];
  let touches = 0;
  const noTouch = new Proxy(
    {},
    {
      get() {
        touches++;
        throw new Error('파일·엔진 접근 금지');
      },
    },
  );
  for (const argv of invalid) {
    assert.throws(() => parseArguments(argv));
    const errors = [];
    assert.equal(
      await runCLI(argv, {
        files: noTouch,
        engine: noTouch,
        io: {
          stdout: {
            write() {
              throw new Error('성공 출력 금지');
            },
          },
          stderr: { write: (text) => errors.push(text) },
        },
      }),
      2,
    );
    assert.ok(errors.length);
  }
  assert.equal(touches, 0);
});

test('개체 CLI는 실제 스냅샷·WASM을 inspector DI로 넘기고 available/unavailable 본문을 그대로 출력한다', async (t) => {
  for (const status of ['available', 'unavailable']) {
    for (const format of ['text', 'markdown']) {
      const text = status + ': 원문 Paragraph s0:p0 Table documentSHA256:\n';
      const f = await setup(t, { status, text });
      assert.equal(await runCLI(f.object('--format=' + format), f.deps), 0);
      assert.equal(f.out.join(''), text);
      assert.deepEqual(f.err, []);
      assert.equal(f.inspections.length, 1);
      const input = f.inspections[0];
      assert.deepEqual(Object.keys(input).sort(), ['bytes', 'format', 'reference', 'wasm']);
      assert.ok(input.bytes instanceof Uint8Array);
      assert.deepEqual([...input.bytes], [...original]);
      assert.deepEqual([...input.wasm], [...wasmBytes]);
      assert.equal(input.reference, ref());
      assert.equal(input.format, format);
      assert.deepEqual(f.reads, ['input.any', join(f.dir, 'native.wasm')]);
      assert.equal(f.counts.opened, 0);
      assert.deepEqual(await fs.readFile(join(f.dir, 'input.any')), original);
      assert.deepEqual((await fs.readdir(f.dir)).sort(), ['input.any', 'native.wasm']);
    }
  }
});

test('오래된 문서 SHA 참조는 object와 extract 모두 WASM 로드·inspector·Native 전 거부한다', async (t) => {
  for (const command of ['object', 'extract-images']) {
    const f = await setup(t);
    const argv = command === 'object' ? f.object() : f.extract();
    const stale = argv.map((value) =>
      value.startsWith('--ref=')
        ? '--ref=' + ref('image', { sourceSha256: '0'.repeat(64) })
        : value,
    );
    assert.equal(await runCLI(stale, f.deps), 1);
    assert.match(f.err.join(''), /SourceSHA256Mismatch/);
    assert.deepEqual(f.reads, ['input.any']);
    assert.equal(f.inspections.length, 0);
    assert.equal(f.counts.opened, 0);
    assert.equal(f.counts.imagesCreated, 0);
    await assert.rejects(fs.lstat(join(f.dir, 'images')), { code: 'ENOENT' });
  }
});

test('inspector의 format·SHA·reference·kind·상태·본문 계약 위반은 성공 출력으로 노출하지 않는다', async (t) => {
  const patches = [
    null,
    { schemaVersion: 2 },
    { sourceSha256: '0'.repeat(64) },
    { format: 'hwpx' },
    { reference: ref('image', { node: 78 }) },
    { kind: 'table' },
    { status: 'failed' },
    { text: null },
    { text: 'x'.repeat(4 * 1024 * 1024 + 1) },
    { text: '\ud800' },
    { text: '\udfff' },
    { text: '정상\ud800문자' },
  ];
  const f = await setup(t);
  for (const patch of patches) {
    f.out.length = 0;
    f.err.length = 0;
    f.deps.inspectDocumentObject = async () =>
      patch === null
        ? null
        : {
            schemaVersion: 1,
            sourceSha256,
            format: 'hwp5',
            reference: ref(),
            kind: 'image',
            status: 'available',
            text: '노출하면 안 되는 성공 본문',
            ...patch,
          };
    assert.equal(await runCLI(f.object(), f.deps), 1);
    assert.match(f.err.join(''), /InvalidObjectInspection/);
    assert.deepEqual(f.out, []);
  }
});

test('inspector 반환 배열은 성공 필드를 붙여도 object 결과로 받아들이지 않는다', async (t) => {
  const f = await setup(t);
  f.deps.inspectDocumentObject = async () =>
    Object.assign([], {
      schemaVersion: 1,
      sourceSha256,
      format: 'hwp5',
      reference: ref(),
      kind: 'image',
      status: 'available',
      text: '배열의 가짜 성공 본문',
    });
  assert.equal(await runCLI(f.object(), f.deps), 1);
  assert.match(f.err.join(''), /InvalidObjectInspection/);
  assert.deepEqual(f.out, []);
});

test('inspector text getter의 세 번째 값으로 출력 예산을 우회할 수 없고 필드는 한 번만 읽는다', async (t) => {
  const f = await setup(t);
  const fields = {
    schemaVersion: 1,
    sourceSha256,
    format: 'hwp5',
    reference: ref(),
    kind: 'image',
    status: 'available',
    text: '정상🙂 본문\n',
  };
  const reads = new Map();
  f.deps.inspectDocumentObject = async () => {
    const result = {};
    for (const [key, value] of Object.entries(fields))
      Object.defineProperty(result, key, {
        get() {
          const count = (reads.get(key) ?? 0) + 1;
          reads.set(key, count);
          return key === 'text' && count >= 3 ? 'x'.repeat(4 * 1024 * 1024 + 1) : value;
        },
      });
    return result;
  };
  assert.equal(await runCLI(f.object(), f.deps), 0);
  assert.equal(f.out.join(''), fields.text);
  assert.deepEqual(
    [...reads],
    Object.keys(fields).map((key) => [key, 1]),
  );
});

test('inspector 본문 예산 경계의 올바른 UTF-16과 빈 unavailable 응답을 절단 없이 허용한다', async (t) => {
  for (const text of ['', '🙂'.repeat(2 * 1024 * 1024)]) {
    const f = await setup(t, { status: 'unavailable', text });
    assert.equal(await runCLI(f.object(), f.deps), 0);
    assert.equal(f.out.join(''), text);
    assert.deepEqual(f.err, []);
  }
});

test('이미지 참조의 실제 포맷 불일치는 open 후 collector 생성·출력 전 거부하고 수명을 닫는다', async (t) => {
  const f = await setup(t, { format: 'hwpx' });
  assert.equal(await runCLI(f.extract(), f.deps), 1);
  assert.match(f.err.join(''), /ObjectReferenceFormatMismatch/);
  assert.equal(f.counts.opened, 1);
  assert.equal(f.counts.documentClosed, 1);
  assert.equal(f.counts.imagesCreated, 0);
  assert.deepEqual(f.imageReads, []);
  await assert.rejects(fs.lstat(join(f.dir, 'images')), { code: 'ENOENT' });
});

test('CLI ref 추출은 공개 순번이 아닌 canonical ID 하나만 읽고 새 폴더에 게시한다', async (t) => {
  const f = await setup(t);
  assert.equal(await runCLI(f.extract(), f.deps), 0);
  assert.deepEqual(f.imageReads, ['hwp5:s0:i77']);
  assert.deepEqual(await fs.readdir(join(f.dir, 'images')), ['image-0001.bin']);
  assert.deepEqual([...(await fs.readFile(join(f.dir, 'images/image-0001.bin')))], [9, 8, 7]);
  assert.equal(f.counts.documentClosed, 1);
  assert.equal(f.counts.imagesClosed, 1);
  assert.deepEqual(await fs.readFile(join(f.dir, 'input.any')), original);
});

test('MCP 새 도구는 맨 끝에 등록되고 schema가 ref/legacy 혼용과 잘못된 참조를 거부한다', () => {
  const tools = documentTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      'read_document',
      'edit_document',
      'get_document_info',
      'list_document_images',
      'extract_document_image',
      'read_documents',
      'get_document_object',
      'edit_document_table_grid',
      'delete_document_table',
      'insert_document_image',
      'export_document_html',
      'replace_document_image',
      'get_document_paragraph',
      'apply_document_changes',
      'create_document',
      'convert_document',
      'ocr_document',
    ],
  );
  const object = tools.find((tool) => tool.name === 'get_document_object');
  assert.equal(object.config.annotations.readOnlyHint, true);
  assert.equal(
    object.config.inputSchema.parse({ inputPath: 'x', reference: ref() }).format,
    'text',
  );
  for (const value of [
    { inputPath: 'x' },
    { inputPath: 'x', reference: 'https://fake' },
    { inputPath: 'x', reference: ref(), format: 'html' },
    { inputPath: 'x', reference: ref(), extra: true },
  ])
    assert.equal(object.config.inputSchema.safeParse(value).success, false);
  const extract = tools.find((tool) => tool.name === 'extract_document_image').config.inputSchema;
  const base = { inputPath: 'x', outputPath: 'y' };
  assert.equal(extract.safeParse({ ...base, reference: ref() }).success, true);
  assert.equal(
    extract.safeParse({ ...base, id: 'hwp5:s0:i77', expectedSha256: sourceSha256 }).success,
    true,
  );
  for (const extra of [
    {},
    { id: 'hwp5:s0:i77' },
    { expectedSha256: sourceSha256 },
    { reference: ref(), id: 'hwp5:s0:i77' },
    { reference: ref(), expectedSha256: sourceSha256 },
    { reference: ref(), id: 'hwp5:s0:i77', expectedSha256: sourceSha256 },
  ])
    assert.equal(extract.safeParse({ ...base, ...extra }).success, false);
});

test('실제 MCP adapter→CLI→inspector DI는 본문만 반환하고 로컬 경로를 옵션으로 해석하지 않는다', async (t) => {
  const f = await setup(t, { status: 'unavailable', text: '상세 조회 미지원: 관측 사유\n' });
  const tools = documentTools({ wasmPath: 'native.wasm', cliDependencies: f.deps });
  const object = tools.find((tool) => tool.name === 'get_document_object');
  const result = await object.invoke({
    inputPath: 'input.any',
    reference: ref(),
    format: 'markdown',
  });
  assert.notEqual(result.isError, true);
  assert.equal(textOf(result), '상세 조회 미지원: 관측 사유\n');
  assert.equal(result.structuredContent, undefined);
  assert.equal(f.inspections[0].format, 'markdown');
  assert.equal(f.inspections[0].reference, ref());
  const seen = [];
  const adapter = documentTools({
    executeCLI: async (argv, { io }) => {
      seen.push(parseArguments(argv));
      await io.stdout.write('정확한 본문');
      return 0;
    },
  }).find((tool) => tool.name === 'get_document_object');
  assert.equal(
    textOf(await adapter.invoke({ inputPath: '--input.any', reference: ref() })),
    '정확한 본문',
  );
  assert.equal(seen[0].input, '--input.any');
  assert.equal(seen[0].format, 'text');
});

test('공식 MCP 전송은 schema 오류를 host 전 차단하고 object·ref 추출을 실제 DI 경로로 실행한다', async (t) => {
  const f = await setup(t);
  const { client, lines, errors } = await wire(t, {
    wasmPath: 'native.wasm',
    cliDependencies: f.deps,
  });
  const result = await client.callTool({
    name: 'get_document_object',
    arguments: { inputPath: 'input.any', reference: ref() },
  });
  assert.notEqual(result.isError, true);
  assert.equal(textOf(result), '관측한 실제 내용\n');
  assert.equal(f.inspections.length, 1);
  for (const args of [
    { inputPath: 'input.any', reference: ref(), id: 'hwp5:s0:i77', outputPath: 'x.bin' },
    { inputPath: 'input.any', reference: ref(), expectedSha256: sourceSha256, outputPath: 'x.bin' },
  ])
    assert.equal(
      (await client.callTool({ name: 'extract_document_image', arguments: args })).isError,
      true,
    );
  assert.equal(f.counts.opened, 0);
  const wrongKind = await client.callTool({
    name: 'extract_document_image',
    arguments: {
      inputPath: 'input.any',
      outputPath: 'x.bin',
      reference: ref('table'),
    },
  });
  assert.equal(wrongKind.isError, true);
  assert.match(textOf(wrongKind), /ExpectedImageReference/);
  assert.equal(f.counts.opened, 0);
  const extracted = await client.callTool({
    name: 'extract_document_image',
    arguments: {
      inputPath: 'input.any',
      outputPath: 'x.bin',
      reference: ref(),
    },
  });
  assert.notEqual(extracted.isError, true);
  assert.deepEqual(f.imageReads, ['hwp5:s0:i77']);
  assert.deepEqual([...(await fs.readFile(join(f.dir, 'x.bin')))], [9, 8, 7]);
  assert.equal(f.counts.documentClosed, 1);
  assert.equal(f.counts.imagesClosed, 1);
  for (const line of lines) assert.equal(JSON.parse(line).jsonrpc, '2.0');
  assert.deepEqual(errors, []);
  assert.deepEqual(await fs.readFile(join(f.dir, 'input.any')), original);
});

test('공식 MCP 전송에서도 오래된 SHA와 실제 포맷 불일치는 실패로 표시하고 출력을 만들지 않는다', async (t) => {
  const f = await setup(t, { format: 'hwpx' });
  const { client, errors } = await wire(t, { wasmPath: 'native.wasm', cliDependencies: f.deps });
  const stale = ref('image', { sourceSha256: '0'.repeat(64) });
  for (const name of ['get_document_object', 'extract_document_image']) {
    const args = {
      inputPath: 'input.any',
      reference: stale,
      ...(name === 'extract_document_image' ? { outputPath: 'stale.bin' } : {}),
    };
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true);
    assert.match(textOf(result), /SourceSHA256Mismatch/);
  }
  assert.deepEqual(f.reads, ['input.any', 'input.any']);
  assert.equal(f.inspections.length, 0);
  assert.equal(f.counts.opened, 0);
  const mismatch = await client.callTool({
    name: 'extract_document_image',
    arguments: {
      inputPath: 'input.any',
      reference: ref(),
      outputPath: 'wrong-format.bin',
    },
  });
  assert.equal(mismatch.isError, true);
  assert.match(textOf(mismatch), /ObjectReferenceFormatMismatch/);
  assert.equal(f.counts.opened, 1);
  assert.equal(f.counts.documentClosed, 1);
  assert.equal(f.counts.imagesCreated, 0);
  assert.deepEqual(f.imageReads, []);
  assert.deepEqual(errors, []);
  assert.deepEqual((await fs.readdir(f.dir)).sort(), ['input.any', 'native.wasm']);
});
