import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { convertDocument, DocumentConversionError } from '../src/document-convert.ts';
import { createDocument } from '../src/document-create.ts';
import { openDocument } from '../src/engine.ts';
const h5 = Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1),
  hx = Uint8Array.of(80, 75, 3, 4),
  hash = 'a'.repeat(64);
const paragraph = (text) => ({ type: 'paragraph', displayText: text });
function setup({
  body = [paragraph('첫🙂'), paragraph(''), paragraph('끝é')],
  unplaced = [],
  coverage = {},
  closeError,
  collectError,
} = {}) {
  const calls = [];
  let closed = 0;
  const model = {
    version: 1,
    format: 'hwp5',
    sourceSha256: hash,
    sections: [{ body }],
    unplaced,
    warnings: [],
    coverage: {
      unreadableSections: 0,
      paragraphTotal: 3,
      observedParagraphs: 3,
      inventoryComplete: true,
      objectsKnown: true,
      ...coverage,
    },
  };
  const document = {
    format: 'hwp5',
    sourceSha256: hash,
    sectionCount: 1,
    sdk: {},
    close() {
      calls.push('close');
      closed++;
      if (closeError) throw closeError;
    },
  };
  const deps = {
    openDocument: async (args) => {
      calls.push(['open', args]);
      return document;
    },
    readDocumentModel: async () => {
      calls.push('collect');
      if (collectError) throw collectError;
      return model;
    },
    createDocument: async (args) => {
      calls.push(['create', args]);
      return {
        schemaVersion: 1,
        format: args.format,
        bytes: args.format === 'hwpx' ? hx : h5,
        layoutRequiresReflow: false,
        paragraphCount: args.text.split('\n').length,
      };
    },
  };
  return {
    deps,
    model,
    document,
    calls,
    get closed() {
      return closed;
    },
  };
}

test('기본 reject는 전체 의미 변환 불가와 손실 영역을 보고하고 바이트를 만들지 않는다', async () => {
  const h = setup();
  await assert.rejects(
    convertDocument({ bytes: h5, wasm: hx, to: 'hwpx' }, h.deps),
    (e) =>
      e instanceof DocumentConversionError &&
      e.code === 'UnsupportedDocumentConversion' &&
      e.report.lossless === false &&
      e.report.notPreserved.length === 5,
  );
  assert.equal(h.closed, 1);
  assert.equal(h.calls.filter((x) => Array.isArray(x) && x[0] === 'create').length, 0);
  assert.equal(h.calls.includes('collect'), false);
});

test('명시 text-only는 본문·빈 문단·Unicode만 공통 생성기로 전달한다', async () => {
  const h = setup();
  const result = await convertDocument(
    { bytes: h5, wasm: hx, to: 'hwpx', lossPolicy: 'text-only' },
    h.deps,
  );
  const create = h.calls.find((x) => Array.isArray(x) && x[0] === 'create')[1];
  assert.equal(create.text, '첫🙂\n\n끝é');
  assert.equal(create.allowStaleLayout, false);
  assert.equal(result.lossless, false);
  assert.equal(result.report.emptyParagraphs, 1);
  assert.equal(result.sourceSha256, hash);
  assert.ok(
    h.calls.indexOf('close') < h.calls.findIndex((x) => Array.isArray(x) && x[0] === 'create'),
  );
});

test('표 본문은 관측된 셀 순서로 평탄화하고 개체·서식 손실은 명시한다', async () => {
  const table = {
    type: 'table',
    cells: [
      { contentState: 'observed', blocks: [paragraph('셀1')] },
      { contentState: 'observed', blocks: [paragraph('')] },
    ],
  };
  const h = setup({
    body: [paragraph('본문'), table, { type: 'image' }, { type: 'unknown', kind: 'chart' }],
  });
  const result = await convertDocument(
    { bytes: h5, wasm: hx, to: 'hwpx', lossPolicy: 'text-only' },
    h.deps,
  );
  assert.equal(result.report.flattenedTables, 1);
  assert.equal(result.report.droppedObjectCount, 2);
  assert.equal(h.calls.find((x) => Array.isArray(x) && x[0] === 'create')[1].text, '본문\n셀1\n');
});

test('미관측·미배치·누락 문단은 조용한 부분 변환이 아니라 실패한다', async () => {
  for (const options of [
    { body: [paragraph(null)] },
    { unplaced: [{ block: paragraph('빠짐') }] },
    { coverage: { unreadableSections: 1 } },
    { coverage: { observedParagraphs: 2 } },
    { body: [{ type: 'table', cells: [{ contentState: 'unknown', blocks: [] }] }] },
  ]) {
    const h = setup(options);
    await assert.rejects(
      convertDocument({ bytes: h5, wasm: hx, to: 'hwpx', lossPolicy: 'text-only' }, h.deps),
      /TextOnlySourceIncomplete/,
    );
    assert.equal(h.closed, 1);
    assert.equal(
      h.calls.some((x) => Array.isArray(x) && x[0] === 'create'),
      false,
    );
  }
});

test('중복·순환 모델과 잘못된 문서 binding은 거부한다', async () => {
  const p = paragraph('중복');
  const h = setup({ body: [p, p] });
  await assert.rejects(
    convertDocument({ bytes: h5, wasm: hx, to: 'hwpx', lossPolicy: 'text-only' }, h.deps),
    /InvalidConversionModel/,
  );
  assert.equal(h.closed, 1);
  const other = setup();
  other.model.sourceSha256 = 'b'.repeat(64);
  await assert.rejects(
    convertDocument({ bytes: h5, wasm: hx, to: 'hwpx', lossPolicy: 'text-only' }, other.deps),
    /InvalidConversionModel/,
  );
});

test('수집·종료 동시 실패와 getter 실패에서도 세션을 정리하고 원인을 보존한다', async () => {
  const primary = Error('수집'),
    cleanup = Error('종료'),
    h = setup({ collectError: primary, closeError: cleanup });
  await assert.rejects(
    convertDocument({ bytes: h5, wasm: hx, to: 'hwpx', lossPolicy: 'text-only' }, h.deps),
    (e) => e instanceof AggregateError && e.cause === primary && e.errors[1] === cleanup,
  );
  const getter = setup();
  Object.defineProperty(getter.document, 'sourceSha256', {
    get() {
      throw primary;
    },
  });
  await assert.rejects(
    convertDocument({ bytes: h5, wasm: hx, to: 'hwpx', lossPolicy: 'text-only' }, getter.deps),
    (e) => e === primary,
  );
  assert.equal(getter.closed, 1);
});

test('변환은 source metadata와 WASM을 await 전에 포착한다', async () => {
  const h = setup(),
    input = Uint8Array.of(1, 2),
    base = h.deps.readDocumentModel;
  h.deps.readDocumentModel = async (...args) => {
    input.fill(9);
    return base(...args);
  };
  h.document.close = () => {
    h.document.format = '오염';
    h.document.sourceSha256 = '오염';
  };
  const result = await convertDocument(
    { bytes: h5, wasm: input, to: 'hwpx', lossPolicy: 'text-only' },
    h.deps,
  );
  assert.equal(result.sourceFormat, 'hwp5');
  assert.equal(result.sourceSha256, hash);
  assert.deepEqual(
    h.calls.find((x) => Array.isArray(x) && x[0] === 'create')[1].wasm,
    Uint8Array.of(1, 2),
  );
});

test('잘못된 목적형식·정책·동일형식과 잘못된 생성 결과는 성공으로 반환하지 않는다', async () => {
  const h = setup();
  for (const options of [
    { to: 'pdf' },
    { to: 'hwpx', lossPolicy: 'lossless' },
    { to: 'hwpx', allowStaleLayout: 1 },
  ])
    await assert.rejects(convertDocument({ bytes: h5, wasm: hx, ...options }, h.deps));
  await assert.rejects(
    convertDocument({ bytes: h5, wasm: hx, to: 'hwp5', lossPolicy: 'text-only' }, h.deps),
    /SameDocumentFormat/,
  );
  const bad = setup();
  bad.deps.createDocument = async () => ({
    format: 'hwpx',
    bytes: h5,
    layoutRequiresReflow: false,
  });
  await assert.rejects(
    convertDocument({ bytes: h5, wasm: hx, to: 'hwpx', lossPolicy: 'text-only' }, bad.deps),
    (e) => e.code === 'InvalidConvertedDocumentOutput' && e.report.lossPolicy === 'text-only',
  );
});

test('생성 단계의 실패에도 변환 손실 보고와 원래 원인을 보존한다', async () => {
  const h = setup(),
    primary = Error('LayoutReflowRequired');
  h.deps.createDocument = async () => {
    throw primary;
  };
  await assert.rejects(
    convertDocument({ bytes: h5, wasm: hx, to: 'hwpx', lossPolicy: 'text-only' }, h.deps),
    (e) =>
      e.message === 'LayoutReflowRequired' && e.cause === primary && e.report.lossless === false,
  );
});

for (const from of ['hwp5', 'hwpx'])
  test(
    `실제 Native820 text-only ${from} 반대형식: 문단·빈줄·Unicode·저장·재열기`,
    { skip: process.env.HWPJS_CREATE_CONVERT_NATIVE !== '1' },
    async () => {
      const wasm = readFileSync(process.env.HWPJS_TEST_WASM),
        sha = (b) => createHash('sha256').update(b).digest('hex');
      assert.equal(sha(wasm), '82031994b4b7f066c28c725495954eebc67bb25570869c06528ea328e0155ccc');
      const text = '첫🙂\n\n둘é\n',
        to = from === 'hwp5' ? 'hwpx' : 'hwp5';
      const source = await createDocument({ format: from, text, wasm, allowStaleLayout: true }),
        before = sha(source.bytes);
      await assert.rejects(
        convertDocument({ bytes: source.bytes, wasm, to }),
        (e) => e.code === 'UnsupportedDocumentConversion' && e.report.lossless === false,
      );
      const result = await convertDocument({
        bytes: source.bytes,
        wasm,
        to,
        lossPolicy: 'text-only',
        allowStaleLayout: true,
        expectedSha256: before,
      });
      assert.equal(result.format, to);
      assert.equal(result.lossless, false);
      assert.equal(result.report.bodyParagraphs, 4);
      assert.equal(result.report.emptyParagraphs, 2);
      assert.equal(sha(source.bytes), before);
      const doc = await openDocument({ bytes: result.bytes, wasm }),
        blank = await createDocument({ format: to, wasm }),
        base = await openDocument({ bytes: blank.bytes, wasm });
      try {
        const lines =
          to === 'hwpx'
            ? doc.sdk.paragraphTextSnapshot(0).map((x) => x.text)
            : doc.sdk
                .paragraphFlow(0)
                .map((x, i) =>
                  doc.sdk
                    .text(0, x.paragraph)
                    .slice(i === 0 ? base.sdk.text(0, 0).length - 1 : 0, -1),
                );
        assert.deepEqual(lines, text.split('\n'));
      } finally {
        doc.close();
        base.close();
      }
      if (to === 'hwp5')
        await assert.rejects(
          convertDocument({ bytes: source.bytes, wasm, to, lossPolicy: 'text-only' }),
          /LayoutReflowRequired/,
        );
      const ext = (format) => (format === 'hwp5' ? 'hwp' : 'hwpx');
      writeFileSync(
        join(process.env.HWPJS_CREATE_EVIDENCE, 'source-' + from + '.' + ext(from)),
        source.bytes,
        { flag: 'wx' },
      );
      writeFileSync(
        join(process.env.HWPJS_CREATE_EVIDENCE, 'converted-' + from + '-to-' + to + '.' + ext(to)),
        result.bytes,
        { flag: 'wx' },
      );
    },
  );
