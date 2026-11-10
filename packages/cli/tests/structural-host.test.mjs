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
import { parseArguments } from '../src/arguments.ts';
import { runCLI } from '../src/main.ts';
import { createFiles } from '../src/files.ts';
import { buildObjectReference } from '../src/object-reference.ts';
import { documentTools } from '../src/mcp/tools.ts';
import { runMcpServer } from '../src/mcp/server.ts';

// 컨테이너 시그니처와 DI를 사용하는 호스트 검사입니다. 실제 Native 유효성 검사가 아닙니다.
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const documentBytes = (format, marker = 1) =>
  Uint8Array.from([
    ...(format === 'hwp5' ? [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] : [0x50, 0x4b, 3, 4]),
    marker,
  ]);
const source = documentBytes('hwp5');
const sourceSha = hash(source);
const image = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const reference = (extra = {}) =>
  buildObjectReference({
    sourceSha256: sourceSha,
    format: 'hwp5',
    section: 0,
    kind: 'table',
    node: 7,
    ...extra,
  });
const del = (...extra) => [
  'delete-table',
  'input.hwp',
  '--ref=' + reference(),
  '--output=output.hwp',
  '--allow-stale-layout',
  ...extra,
];
const ins = (...extra) => [
  'insert-image',
  'input.hwp',
  '--target=s0:p3',
  '--unit=0',
  '--expect-text=',
  '--expect-sha256=' + sourceSha,
  '--image=image.png',
  '--width=7200',
  '--height=3600',
  '--output=output.hwp',
  '--allow-stale-layout',
  ...extra,
];
const html = (...extra) => ['export-html', 'input.hwp', '--output=output.html', ...extra];
const replaceOption = (argv, option, value) =>
  argv.map((arg) => (arg.startsWith('--' + option + '=') ? '--' + option + '=' + value : arg));
const saved = () => ({
  format: 'hwp5',
  sourceSha256: sourceSha,
  bytes: documentBytes('hwp5', 2),
  layoutRequiresReflow: true,
  previewStale: true,
});
const exported = () => ({
  format: 'hwp5',
  sourceSha256: sourceSha,
  html: '<!doctype html><p>한글</p>',
  semanticOnly: true,
  warnings: ['미지원 개체는 참조로 남음'],
});

async function setup(t) {
  const directory = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'hwpjs-structural-host-')));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(join(directory, 'input.hwp'), source);
  await fs.writeFile(join(directory, 'image.png'), image);
  await fs.writeFile(join(directory, 'native.wasm'), 'DI 전용');
  const stdout = [],
    stderr = [],
    calls = [],
    reads = [];
  const files = createFiles({ cwd: () => directory });
  const dependencies = {
    files: {
      ...files,
      async readInputSnapshot(path, options) {
        reads.push(path);
        return files.readInputSnapshot(path, options);
      },
    },
    io: {
      stdout: { write: (text) => stdout.push(text) },
      stderr: { write: (text) => stderr.push(text) },
    },
    deleteDocumentTable: async (options) => {
      calls.push(options);
      return saved();
    },
    insertDocumentImage: async (options) => {
      calls.push(options);
      return { ...saved(), imageSha256: hash(image) };
    },
    exportDocumentHTML: async (options) => {
      calls.push(options);
      return exported();
    },
  };
  return {
    directory,
    dependencies,
    stdout,
    stderr,
    calls,
    reads,
    invoke: (argv) => runCLI([...argv, '--wasm=native.wasm'], dependencies),
    absent: (path = 'output.hwp') =>
      assert.rejects(fs.lstat(join(directory, path)), { code: 'ENOENT' }),
    unchanged: async () =>
      assert.deepEqual(new Uint8Array(await fs.readFile(join(directory, 'input.hwp'))), source),
  };
}

test('새 세 명령은 옵션과 단위·빈 원문을 정확히 해석한다', () => {
  assert.equal(parseArguments(del()).reference, reference());
  const inserted = parseArguments(ins());
  assert.deepEqual(inserted.target, { section: 0, paragraph: 3 });
  assert.equal(inserted.expectedText, '');
  assert.equal(inserted.width, 7200);
  assert.equal(inserted.height, 3600);
  assert.equal(inserted.unit, 0);
  assert.equal(inserted.expectSha256, sourceSha);
  assert.equal(parseArguments(html()).embedImages, 'supported');
  assert.equal(parseArguments(html('--embed-images=none')).embedImages, 'none');
});

test('그림 크기는 양의 INT32이고 삽입 unit은 U32 어휘를 유지한다', () => {
  for (const option of ['width', 'height']) {
    assert.equal(parseArguments(replaceOption(ins(), option, '2147483647'))[option], 2147483647);
    assert.throws(() => parseArguments(replaceOption(ins(), option, '2147483648')));
  }
  assert.equal(parseArguments(replaceOption(ins(), 'unit', '4294967295')).unit, 4294967295);
  const schema = documentTools().find((tool) => tool.name === 'insert_document_image').config
    .inputSchema;
  const valid = {
    inputPath: 'input.hwp',
    outputPath: 'output.hwp',
    target: 's0:p3',
    unit: 4294967295,
    expectedText: '',
    expectedSha256: sourceSha,
    imagePath: 'image.png',
    width: 2147483647,
    height: 1,
  };
  assert.equal(schema.safeParse(valid).success, true);
  assert.equal(schema.safeParse({ ...valid, width: 2147483648 }).success, false);
  assert.equal(schema.safeParse({ ...valid, height: 2147483648 }).success, false);
});

test('필수 옵션 누락·중복·명령 간 옵션 혼용은 거부한다', () => {
  for (const [argv, required] of [
    [del(), ['ref', 'output']],
    [
      ins(),
      ['target', 'unit', 'expect-text', 'expect-sha256', 'image', 'width', 'height', 'output'],
    ],
    [html(), ['output']],
  ]) {
    for (const option of required)
      assert.throws(
        () => parseArguments(argv.filter((arg) => !arg.startsWith('--' + option + '='))),
        option,
      );
  }
  for (const argv of [
    del('--ref=' + reference()),
    del('--embed-images=none'),
    ins('--ref=' + reference()),
    html('--allow-stale-layout'),
    html('--embed-images=all'),
    [...html(), 'second.hwp'],
  ])
    assert.throws(() => parseArguments(argv));
});

test('이미지 좌표·크기·원문·참조의 잘못된 어휘를 거부한다', () => {
  for (const option of ['unit', 'width', 'height'])
    for (const value of ['-1', '-0', '01', '1e3', 'NaN', '4294967296'])
      assert.throws(() => parseArguments(replaceOption(ins(), option, value)));
  for (const option of ['width', 'height'])
    assert.throws(() => parseArguments(replaceOption(ins(), option, '0')));
  for (const value of ['s00:p3', 's0:p-1', 's0:p3\n'])
    assert.throws(() => parseArguments(replaceOption(ins(), 'target', value)));
  assert.throws(() => parseArguments(replaceOption(ins(), 'expect-sha256', 'not-a-sha')));
  assert.throws(() => parseArguments(replaceOption(del(), 'ref', reference({ kind: 'image' }))));
  assert.throws(() => parseArguments(replaceOption(del(), 'ref', 'https://example.invalid/table')));
});

for (const [name, args] of [
  ['delete-table', del],
  ['insert-image', ins],
]) {
  test(name + '의 배치 동의는 파일 읽기보다 먼저 필요하다', async (t) => {
    const f = await setup(t);
    assert.equal(await f.invoke(args().filter((arg) => arg !== '--allow-stale-layout')), 1);
    assert.match(f.stderr.join(''), /LayoutRequiresReflow/);
    assert.deepEqual(f.reads, []);
    assert.deepEqual(f.calls, []);
    await f.absent();
    await f.unchanged();
  });
}

test('오래된 표 참조·형식 불일치와 이미지 원본 SHA는 서비스 전에 거부한다', async (t) => {
  for (const argv of [
    replaceOption(del(), 'ref', reference({ sourceSha256: '0'.repeat(64) })),
    replaceOption(del(), 'ref', reference({ format: 'hwpx' })),
    replaceOption(ins(), 'expect-sha256', '0'.repeat(64)),
  ]) {
    const f = await setup(t);
    assert.equal(await f.invoke(argv), 1);
    assert.match(
      f.stderr.join(''),
      /StaleObjectReference|ObjectReferenceFormatMismatch|SourceSHA256Mismatch/,
    );
    assert.equal(f.calls.length, 0);
    await f.absent();
    await f.unchanged();
  }
});

test('삭제·삽입은 소유 바이트와 정확한 조건만 서비스로 전달하고 새 파일을 저장한다', async (t) => {
  for (const argv of [del(), ins()]) {
    const f = await setup(t);
    assert.equal(await f.invoke(argv), 0);
    const options = f.calls[0];
    assert.deepEqual(options.bytes, source);
    assert.ok(options.wasm instanceof Uint8Array);
    assert.equal(
      Object.hasOwn(options, 'allowStaleLayout'),
      false,
      '동의는 호스트 경계에서만 처리',
    );
    if (argv[0] === 'delete-table') assert.equal(options.reference, reference());
    else {
      assert.equal(options.expectedSha256, sourceSha);
      assert.deepEqual(options.target, { section: 0, paragraph: 3 });
      assert.equal(options.unit, 0);
      assert.equal(options.expectedText, '');
      assert.deepEqual(options.imageBytes, image);
      assert.equal(options.width, 7200);
      assert.equal(options.height, 3600);
      assert.match(f.stdout.join(''), new RegExp('imageSHA256: ' + hash(image)));
    }
    assert.deepEqual(
      new Uint8Array(await fs.readFile(join(f.directory, 'output.hwp'))),
      documentBytes('hwp5', 2),
    );
    assert.match(f.stdout.join(''), /layoutRequiresReflow: true/);
    assert.match(f.stdout.join(''), /previewStale: true/);
    await f.unchanged();
  }
});

test('이미지 파일을 읽지 못하면 삽입 서비스를 호출하거나 출력하지 않는다', async (t) => {
  const f = await setup(t);
  assert.equal(await f.invoke(replaceOption(ins(), 'image', 'missing.png')), 1);
  assert.equal(f.calls.length, 0);
  await f.absent();
  await f.unchanged();
});

for (const [name, args, output] of [
  ['삭제', del, 'output.hwp'],
  ['삽입', ins, 'output.hwp'],
  ['HTML', html, 'output.html'],
]) {
  test(name + '은 기존 출력·원본 경로·최종 심볼릭 링크를 보존한다', async (t) => {
    for (const kind of ['existing', 'source', 'symlink']) {
      const f = await setup(t);
      let destination = output;
      if (kind === 'existing') await fs.writeFile(join(f.directory, output), '선행 결과');
      else if (kind === 'source') destination = 'input.hwp';
      else await fs.symlink('input.hwp', join(f.directory, output));
      assert.equal(await f.invoke(replaceOption(args(), 'output', destination)), 1);
      assert.equal(f.calls.length, 0);
      if (kind === 'existing')
        assert.equal(await fs.readFile(join(f.directory, output), 'utf8'), '선행 결과');
      if (kind === 'symlink')
        assert.equal(await fs.readlink(join(f.directory, output)), 'input.hwp');
      await f.unchanged();
    }
  });
  test(name + '은 게시 후 출력 스트림 실패를 published true로 보고한다', async (t) => {
    const f = await setup(t);
    f.dependencies.io.stdout.write = () => {
      throw new Error('PipeClosed');
    };
    assert.equal(await f.invoke(args()), 1);
    assert.match(f.stderr.join(''), /PipeClosed/);
    assert.match(f.stderr.join(''), /published: true/);
    assert.doesNotMatch(f.stderr.join(''), /published: false/);
    assert.ok((await fs.stat(join(f.directory, output))).size > 0);
    await f.unchanged();
  });
}

test('확장자와 실제 결과 컨테이너가 다르면 게시하지 않는다', async (t) => {
  const f = await setup(t);
  assert.equal(await f.invoke(replaceOption(del(), 'output', 'wrong.hwpx')), 1);
  assert.equal(f.calls.length, 0);
  f.dependencies.deleteDocumentTable = async () => ({ ...saved(), bytes: documentBytes('hwpx') });
  assert.equal(await f.invoke(del()), 1);
  assert.match(f.stderr.join(''), /FileTransformFormatMismatch/);
  await f.absent();
});

test('변형 결과의 형식·SHA·배치·미리보기·바이트 오염은 무게시다', async (t) => {
  for (const patch of [
    { format: 'hwpx' },
    { sourceSha256: '0'.repeat(64) },
    { layoutRequiresReflow: false },
    { previewStale: false },
    { bytes: [] },
    { bytes: new Uint8Array() },
    { bytes: new Uint8Array(new SharedArrayBuffer(8)) },
  ]) {
    const f = await setup(t);
    f.dependencies.deleteDocumentTable = async () => ({ ...saved(), ...patch });
    assert.equal(await f.invoke(del()), 1);
    assert.match(f.stderr.join(''), /InvalidFileTransformResult/);
    await f.absent();
  }
  const f = await setup(t);
  f.dependencies.insertDocumentImage = async () => ({ ...saved(), imageSha256: '0'.repeat(64) });
  assert.equal(await f.invoke(ins()), 1);
  await f.absent();
});

test('Uint8Array 하위 클래스 iterator·species를 실행하지 않고 실제 바이트만 저장한다', async (t) => {
  const f = await setup(t);
  class HostileBytes extends Uint8Array {
    [Symbol.iterator]() {
      throw new Error('사용자 iterator 실행 금지');
    }
    static get [Symbol.species]() {
      throw new Error('사용자 species 실행 금지');
    }
  }
  f.dependencies.deleteDocumentTable = async () => ({
    ...saved(),
    bytes: new HostileBytes(documentBytes('hwp5', 9).buffer),
  });
  assert.equal(await f.invoke(del()), 0);
  assert.deepEqual(
    new Uint8Array(await fs.readFile(join(f.directory, 'output.hwp'))),
    documentBytes('hwp5', 9),
  );
});

test('HTML은 UTF-8 새 파일과 의미 전용 경고를 게시하며 embed 정책을 전달한다', async (t) => {
  const f = await setup(t);
  assert.equal(await f.invoke(html('--embed-images=none')), 0);
  assert.equal(f.calls[0].embedImages, 'none');
  assert.deepEqual(f.calls[0].bytes, source);
  assert.equal(await fs.readFile(join(f.directory, 'output.html'), 'utf8'), exported().html);
  assert.match(f.stdout.join(''), /semanticOnly: true/);
  assert.match(f.stdout.join(''), /미지원 개체는 참조로 남음/);
  await f.unchanged();
});

test('HTML 결과의 동등성 과장·SHA·형식·문자열·경고 오염을 게시 전에 거부한다', async (t) => {
  for (const patch of [
    { semanticOnly: false },
    { sourceSha256: '0'.repeat(64) },
    { format: 'hwpx' },
    { html: '' },
    { html: '\ud800' },
    { warnings: [7] },
    { warnings: ['\ud800'] },
  ]) {
    const f = await setup(t);
    f.dependencies.exportDocumentHTML = async () => ({ ...exported(), ...patch });
    assert.equal(await f.invoke(html()), 1);
    assert.match(f.stderr.join(''), /InvalidHTMLConversionResult/);
    await f.absent('output.html');
  }
});

test('HTML 경고 getter는 한 번 캡처한 값으로만 진단을 만든다', async (t) => {
  const f = await setup(t);
  let reads = 0;
  const warnings = [];
  Object.defineProperty(warnings, 0, {
    get() {
      reads++;
      return reads === 1 ? '처음 경고' : '오염된 재조회';
    },
  });
  f.dependencies.exportDocumentHTML = async () => ({ ...exported(), warnings });
  assert.equal(await f.invoke(html()), 0);
  assert.equal(reads, 1);
  assert.match(f.stdout.join(''), /처음 경고/);
  assert.doesNotMatch(f.stdout.join(''), /오염된 재조회/);
});

test('HTML 출력은 심볼릭 링크 부모와 확장자 혼용을 서비스 전에 거부한다', async (t) => {
  const f = await setup(t);
  await fs.mkdir(join(f.directory, 'real'));
  await fs.symlink('real', join(f.directory, 'linked'));
  for (const output of ['linked/result.html', 'bad.hwpx']) {
    assert.equal(await f.invoke(replaceOption(html(), 'output', output)), 1);
    assert.equal(f.calls.length, 0);
  }
  await f.absent('real/result.html');
});

test('게시 직전 생성된 경쟁 파일을 덮어쓰지 않는다', async (t) => {
  const f = await setup(t);
  const files = createFiles({
    cwd: () => f.directory,
    fs: {
      ...fs,
      async link(from, to) {
        await fs.writeFile(to, '경쟁 결과', { flag: 'wx' });
        return fs.link(from, to);
      },
    },
  });
  f.dependencies.files = files;
  assert.equal(await f.invoke(html()), 1);
  assert.equal(await fs.readFile(join(f.directory, 'output.html'), 'utf8'), '경쟁 결과');
  assert.match(f.stderr.join(''), /published: false/);
  await f.unchanged();
});

const toolInput = {
  delete_document_table: {
    inputPath: '--input.hwp',
    outputPath: '--output.hwp',
    reference: reference(),
    allowStaleLayout: true,
  },
  insert_document_image: {
    inputPath: '--input.hwp',
    outputPath: '--output.hwp',
    target: 's0:p3',
    unit: 0,
    expectedText: '--output=문자열',
    expectedSha256: sourceSha,
    imagePath: '--image.png',
    width: 7200,
    height: 3600,
    allowStaleLayout: true,
  },
  export_document_html: {
    inputPath: '--input.hwp',
    outputPath: '--output.html',
    embedImages: 'none',
  },
};
const textOf = (result) =>
  result.content
    .map((block) => {
      assert.equal(block.type, 'text');
      return block.text;
    })
    .join('');

test('MCP 세 도구의 엄격 스키마는 누락·추가 키·형식 혼용을 거부한다', () => {
  const tools = documentTools({ executeCLI: async () => 0 });
  assert.equal(tools.length, 17);
  for (const [name, input] of Object.entries(toolInput)) {
    const tool = tools.find((value) => value.name === name);
    assert.ok(tool, name);
    const schema = tool.config.inputSchema;
    assert.equal(schema.safeParse(input).success, true);
    assert.equal(schema.safeParse({ ...input, invented: true }).success, false);
    assert.equal(schema.safeParse({ ...input, inputPath: 7 }).success, false);
    for (const required of name === 'insert_document_image'
      ? [
          'inputPath',
          'outputPath',
          'target',
          'unit',
          'expectedText',
          'expectedSha256',
          'imagePath',
          'width',
          'height',
        ]
      : name === 'delete_document_table'
        ? ['inputPath', 'outputPath', 'reference']
        : ['inputPath', 'outputPath']) {
      const invalid = { ...input };
      delete invalid[required];
      assert.equal(schema.safeParse(invalid).success, false, required);
    }
  }
});

test('공식 MCP 전송으로 세 도구를 호출하고 CLI 파서까지 같은 조건을 전달한다', async (t) => {
  const input = new PassThrough(),
    output = new PassThrough();
  const [clientTransport, peer] = InMemoryTransport.createLinkedPair();
  const reader = createInterface({ input: output, crlfDelay: Infinity });
  const lines = [],
    errors = [],
    calls = [];
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
  const server = runMcpServer({
    transport: new StdioServerTransport(input, output),
    wasmPath: '--native.wasm',
    onerror: (error) => errors.push(error),
    executeCLI: async (argv, { io }) => {
      calls.push(parseArguments(argv));
      await io.stdout.write('확인됨\n');
      return 0;
    },
  });
  const client = new Client({ name: 'structural-host-test', version: '1.0.0' });
  t.after(async () => {
    await client.close();
    await server.close();
    reader.close();
    input.destroy();
    output.destroy();
  });
  await client.connect(clientTransport);
  const listedTools = (await client.listTools()).tools;
  assert.equal(listedTools.length, 20);
  for (const name of ['open_document_session', 'read_document_session', 'close_document_session'])
    assert(
      listedTools.some((tool) => tool.name === name),
      name,
    );
  for (const [name, args] of Object.entries(toolInput)) {
    assert.equal(textOf(await client.callTool({ name, arguments: args })), '확인됨\n');
    const before = calls.length;
    assert.equal(
      (await client.callTool({ name, arguments: { ...args, extra: true } })).isError,
      true,
    );
    assert.equal(calls.length, before);
  }
  assert.deepEqual(
    calls.map((value) => value.command),
    ['delete-table', 'insert-image', 'export-html'],
  );
  for (const value of calls) {
    assert.equal(value.input, '--input.hwp');
    assert.equal(value.wasm, '--native.wasm');
  }
  assert.equal(calls[0].reference, reference());
  assert.equal(calls[0].allowStaleLayout, true);
  assert.equal(calls[1].expectedText, '--output=문자열');
  assert.equal(calls[1].imagePath, '--image.png');
  assert.equal(calls[1].expectSha256, sourceSha);
  assert.equal(calls[2].embedImages, 'none');
  assert.ok(lines.length > 0);
  for (const line of lines) assert.equal(JSON.parse(line).jsonrpc, '2.0');
  assert.deepEqual(errors, []);
});
