import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArguments } from '../src/arguments.ts';
import { runCLI } from '../src/main.ts';
import { createFiles } from '../src/files.ts';
import { buildObjectReference } from '../src/object-reference.ts';
import { extendedDocumentTools } from '../src/mcp/extended-tools.ts';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const source = Buffer.from('source');
const image = Buffer.from('replacement');
const reference = (extra = {}) =>
  buildObjectReference({
    sourceSha256: sha(source),
    format: 'hwp5',
    section: 0,
    kind: 'image',
    node: 13,
    ...extra,
  });
const argv = (extra = []) => [
  'replace-image',
  'input.hwp',
  '--ref=' + reference(),
  '--image=image.png',
  '--output=new.hwp',
  '--wasm=native.wasm',
  ...extra,
];
async function setup(t) {
  const directory = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'hwpjs-replace-image-')));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(join(directory, 'input.hwp'), source);
  await fs.writeFile(join(directory, 'image.png'), image);
  await fs.writeFile(join(directory, 'native.wasm'), 'wasm');
  const out = [],
    err = [],
    calls = [];
  const files = createFiles({ cwd: () => directory });
  const dependencies = {
    files,
    io: {
      stdout: { write: (text) => out.push(text) },
      stderr: { write: (text) => err.push(text) },
    },
    replaceDocumentImage: async (input) => {
      calls.push(input);
      return {
        format: 'hwp5',
        sourceSha256: sha(source),
        imageSha256: sha(image),
        bytes: Uint8Array.of(3, 4),
        previewStale: true,
      };
    },
  };
  return {
    directory,
    out,
    err,
    calls,
    dependencies,
    invoke: (args = argv()) => runCLI(args, dependencies),
  };
}

test('이미지 교체는 이미지 참조와 파일을 필수로 받고 별도 SHA 옵션을 허용하지 않는다', () => {
  const value = parseArguments(argv());
  assert.equal(value.command, 'replace-image');
  assert.equal(value.reference, reference());
  assert.equal(value.imagePath, 'image.png');
  assert.ok(!Object.hasOwn(value, 'expectSha256'));
  for (const key of ['--ref=', '--image=', '--output='])
    assert.throws(() => parseArguments(argv().filter((v) => !v.startsWith(key))));
  for (const extra of ['--expect-sha256=' + sha(source), '--allow-stale-layout', '--format=png'])
    assert.throws(() => parseArguments(argv([extra])));
  for (const ref of [
    reference({ kind: 'table' }),
    'https://example.invalid/image',
    'hwpjs-object:bad',
  ])
    assert.throws(() =>
      parseArguments(argv().map((v) => (v.startsWith('--ref=') ? '--ref=' + ref : v))),
    );
});

test('호스트는 원본과 이미지 스냅샷을 공통 서비스로 보내고 새 파일 및 정확한 해시를 출력한다', async (t) => {
  const f = await setup(t);
  assert.equal(await f.invoke(), 0);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(Buffer.from(f.calls[0].bytes), source);
  assert.deepEqual(Buffer.from(f.calls[0].imageBytes), image);
  assert.equal(f.calls[0].reference, reference());
  assert.equal(Buffer.from(f.calls[0].wasm).toString(), 'wasm');
  const saved = await fs.readFile(join(f.directory, 'new.hwp'));
  assert.deepEqual(saved, Buffer.from([3, 4]));
  assert.deepEqual(await fs.readFile(join(f.directory, 'input.hwp')), source);
  assert.deepEqual(await fs.readFile(join(f.directory, 'image.png')), image);
  const text = f.out.join('');
  assert.match(text, new RegExp('sourceSHA256: ' + sha(source)));
  assert.match(text, new RegExp('imageSHA256: ' + sha(image)));
  assert.match(text, new RegExp('sha256: ' + sha(saved)));
  assert.match(text, /previewStale: true/);
});

test('오래된 참조와 8MiB 초과 이미지는 WASM을 읽기 전에 거부한다', async (t) => {
  for (const kind of ['stale', 'oversize']) {
    const f = await setup(t);
    await fs.rm(join(f.directory, 'native.wasm'));
    if (kind === 'stale') await fs.writeFile(join(f.directory, 'input.hwp'), 'changed');
    else {
      const file = await fs.open(join(f.directory, 'image.png'), 'w');
      await file.truncate(8 * 1024 * 1024 + 1);
      await file.close();
    }
    assert.equal(await f.invoke(), 1);
    assert.equal(f.calls.length, 0);
    assert.doesNotMatch(f.err.join(''), /native\.wasm/);
    await assert.rejects(fs.access(join(f.directory, 'new.hwp')));
  }
});

test('64MiB 초과 문서와 기존 출력 및 원본 별칭은 서비스 호출 전에 거부한다', async (t) => {
  for (const kind of ['oversize', 'exists', 'source', 'image']) {
    const f = await setup(t);
    let args = argv();
    if (kind === 'oversize') {
      const file = await fs.open(join(f.directory, 'input.hwp'), 'w');
      await file.truncate(64 * 1024 * 1024 + 1);
      await file.close();
    }
    if (kind === 'exists') await fs.writeFile(join(f.directory, 'new.hwp'), 'keep');
    if (kind === 'source')
      args = args.map((v) => (v.startsWith('--output=') ? '--output=input.hwp' : v));
    if (kind === 'image')
      args = args.map((v) => (v.startsWith('--output=') ? '--output=image.png' : v));
    assert.equal(await f.invoke(args), 1);
    assert.equal(f.calls.length, 0);
    if (kind === 'exists')
      assert.equal(await fs.readFile(join(f.directory, 'new.hwp'), 'utf8'), 'keep');
  }
});

test('서비스 실패와 결과의 형식 및 해시 또는 stale 표시 오류는 파일을 게시하지 않는다', async (t) => {
  const malformed = [
    { format: 'hwpx' },
    { sourceSha256: '0'.repeat(64) },
    { imageSha256: '0'.repeat(64) },
    { previewStale: false },
    { previewStale: undefined },
    { bytes: new Uint8Array() },
    { bytes: new Uint8Array(64 * 1024 * 1024 + 1) },
  ];
  for (const change of [null, ...malformed]) {
    const f = await setup(t);
    f.dependencies.replaceDocumentImage = async () => {
      if (change === null) throw Error('Native 교체 거부');
      return {
        format: 'hwp5',
        sourceSha256: sha(source),
        imageSha256: sha(image),
        bytes: Uint8Array.of(9),
        previewStale: true,
        ...change,
      };
    };
    assert.equal(await f.invoke(), 1);
    await assert.rejects(fs.access(join(f.directory, 'new.hwp')));
    assert.deepEqual(await fs.readFile(join(f.directory, 'input.hwp')), source);
    assert.match(f.err.join(''), /published: false/);
  }
});

test('출력 확장자가 참조 형식과 다르면 WASM 로드 전에 거부한다', async (t) => {
  const f = await setup(t);
  await fs.rm(join(f.directory, 'native.wasm'));
  assert.equal(
    await f.invoke(argv().map((v) => (v.startsWith('--output=') ? '--output=new.hwpx' : v))),
    1,
  );
  assert.equal(f.calls.length, 0);
  assert.doesNotMatch(f.err.join(''), /native\.wasm/);
});

test('서비스 실행 중 생긴 출력 파일도 덮어쓰지 않는다', async (t) => {
  const f = await setup(t);
  f.dependencies.replaceDocumentImage = async () => {
    await fs.writeFile(join(f.directory, 'new.hwp'), '동시에 생성된 출력');
    return {
      format: 'hwp5',
      sourceSha256: sha(source),
      imageSha256: sha(image),
      bytes: Uint8Array.of(7),
      previewStale: true,
    };
  };
  assert.equal(await f.invoke(), 1);
  assert.equal(await fs.readFile(join(f.directory, 'new.hwp'), 'utf8'), '동시에 생성된 출력');
  assert.match(f.err.join(''), /published: false/);
});

test('MCP 이미지 교체는 네 필드의 엄격한 스키마와 argv 전달만 사용한다', async () => {
  const calls = [];
  const tool = extendedDocumentTools({
    wasm: ['--wasm=/native.wasm'],
    invoke: async (args) => {
      calls.push(args);
      return { content: [{ type: 'text', text: 'ok' }] };
    },
  }).find((t) => t.name === 'replace_document_image');
  assert.ok(tool);
  const input = {
    inputPath: '--input.hwp',
    outputPath: 'out.hwp',
    reference: reference(),
    imagePath: '--replacement.png',
  };
  assert.equal(tool.config.inputSchema.safeParse(input).success, true);
  for (const bad of [
    { ...input, expectedSha256: sha(source) },
    { ...input, reference: reference({ kind: 'chart' }) },
    { ...input, reference: 'https://invalid' },
    { ...input, imagePath: '' },
  ])
    assert.equal(tool.config.inputSchema.safeParse(bad).success, false);
  await tool.invoke(input);
  assert.deepEqual(calls, [
    [
      'replace-image',
      '--ref=' + reference(),
      '--image=--replacement.png',
      '--output=out.hwp',
      '--wasm=/native.wasm',
      '--',
      '--input.hwp',
    ],
  ]);
  assert.equal(tool.config.annotations.readOnlyHint, false);
  assert.equal(tool.config.annotations.destructiveHint, false);
});
