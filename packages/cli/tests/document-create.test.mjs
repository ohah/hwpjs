import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createDocument } from '../src/document-create.ts';
import { createNewDocumentBytes } from '../../../js/new-document.mjs';
import { openDocument } from '../src/engine.ts';

const h5 = Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const hx = Uint8Array.of(80, 75, 3, 4);
function mock(format, { saveError, closeError, wrongCount = false, output } = {}) {
  const calls = [];
  let first = '',
    rest = '',
    split = false,
    closed = 0;
  const prefix = 'Native접두부';
  const sdk = {
    paragraphTextSnapshot: () =>
      (first === '' ? [''] : first.split('\n')).map((text, index) => ({
        paragraph: 71 + index,
        text,
        nested: false,
      })),
    paragraphFlow: () => [
      { paragraph: 0, host: 'body', top_level: true },
      ...(split ? [{ paragraph: 1, host: 'body', generated: true }] : []),
    ],
    paragraphCount: () => (wrongCount ? 99 : split ? 1 + rest.split('\n').length : 1),
    text: () => prefix + first + '\r',
    splice(args) {
      calls.push(['splice', args]);
      first = args.text;
    },
    splitParagraph(args) {
      calls.push(['split', args]);
      split = true;
    },
    replaceParagraphRanges(args) {
      calls.push(['replace', args]);
      if (format === 'hwpx') first = args.text;
      else rest = args.text;
    },
  };
  const deps = {
    createNewDocumentBytes: async (bytes, requested) => {
      calls.push(['create', bytes, requested]);
      return format === 'hwp5' ? h5 : hx;
    },
    openDocument: async () => ({
      format,
      sectionCount: 1,
      sdk,
      save(args) {
        calls.push(['save', args]);
        if (saveError) throw saveError;
        return (
          output ??
          (format === 'hwp5' ? { bytes: h5, layoutRequiresReflow: first !== '' || split } : hx)
        );
      },
      close() {
        closed++;
        if (closeError) throw closeError;
      },
    }),
  };
  return {
    deps,
    calls,
    prefix,
    get closed() {
      return closed;
    },
  };
}

for (const format of ['hwp5', 'hwpx']) {
  test(`생성 ${format}: 공통 blank 생성과 관측 Native 좌표·단일 배치를 사용한다`, async () => {
    const h = mock(format);
    const result = await createDocument(
      { format, text: '첫🙂\r\n\r끝\n', wasm: hx, allowStaleLayout: true },
      h.deps,
    );
    assert.equal(result.paragraphCount, 4);
    assert.equal(h.closed, 1);
    assert.equal(h.calls.filter((x) => x[0] === 'create').length, 1);
    if (format === 'hwpx') {
      const [call] = h.calls.filter((x) => x[0] === 'replace');
      assert.equal(call[1].ranges[0].paragraph, 71);
      assert.equal(call[1].text, '첫🙂\n\n끝\n');
      assert.equal(h.calls.filter((x) => ['splice', 'split'].includes(x[0])).length, 0);
    } else {
      assert.equal(h.calls.find((x) => x[0] === 'splice')[1].startUnit, h.prefix.length);
      assert.equal(
        h.calls.find((x) => x[0] === 'split')[1].atUnit,
        h.prefix.length + '첫🙂'.length,
      );
      assert.equal(h.calls.find((x) => x[0] === 'replace')[1].text, '\n끝\n');
      assert.equal(h.calls.filter((x) => ['splice', 'split', 'replace'].includes(x[0])).length, 3);
    }
  });
  test(`생성 ${format}: 빈 문자열은 내용 편집을 하지 않고 결과 버퍼를 소유한다`, async () => {
    const h = mock(format);
    const result = await createDocument({ format, wasm: hx }, h.deps);
    assert.equal(result.paragraphCount, 1);
    assert.equal(result.layoutRequiresReflow, false);
    assert.equal(h.calls.filter((x) => ['splice', 'split', 'replace'].includes(x[0])).length, 0);
    assert.notEqual(result.bytes, format === 'hwp5' ? h5 : hx);
    assert.equal(h.closed, 1);
  });
}

test('생성 입력 오류·제어문자·문단/UTF8 예산은 Native 생성 전에 거부한다', async () => {
  const h = mock('hwpx');
  for (const text of [
    '\ud800',
    '\u0000',
    '\t',
    '\u0085',
    '\u2028',
    '\n'.repeat(4096),
    '한'.repeat(1_400_000),
  ])
    await assert.rejects(createDocument({ format: 'hwpx', text, wasm: hx }, h.deps));
  for (const options of [
    { format: 'pdf', wasm: hx },
    { format: 'hwpx', wasm: new Uint8Array() },
    { format: 'hwpx', wasm: hx, allowStaleLayout: 1 },
  ])
    await assert.rejects(createDocument(options, h.deps));
  assert.equal(h.calls.length, 0);
});

test('생성은 첫 await 전에 WASM view를 복사한다', async () => {
  const h = mock('hwpx'),
    input = Uint8Array.of(1, 2),
    base = h.deps.createNewDocumentBytes;
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  h.deps.createNewDocumentBytes = async (...args) => {
    await wait;
    assert.deepEqual(args[0], Uint8Array.of(1, 2));
    return base(...args);
  };
  const pending = createDocument({ format: 'hwpx', wasm: input }, h.deps);
  input.fill(9);
  release();
  await pending;
});

test('H5 재조판 명시 동의 없이는 성공 플래그를 반환하지 않는다', async () => {
  const h = mock('hwp5');
  await assert.rejects(
    createDocument({ format: 'hwp5', text: '내용', wasm: hx }, h.deps),
    /LayoutReflowRequired/,
  );
  assert.equal(h.closed, 1);
});

test('생성 저장·종료 동시 실패는 원인 둘을 보존한다', async () => {
  const primary = Error('저장 실패'),
    cleanup = Error('종료 실패'),
    h = mock('hwpx', { saveError: primary, closeError: cleanup });
  await assert.rejects(
    createDocument({ format: 'hwpx', wasm: hx }, h.deps),
    (e) => e instanceof AggregateError && e.cause === primary && e.errors[1] === cleanup,
  );
  assert.equal(h.closed, 1);
});

test('생성 종료 실패·잘못된 Native 문단 수·다른 출력 형식을 성공으로 숨기지 않는다', async () => {
  const h = mock('hwpx', { closeError: Error('close') });
  await assert.rejects(
    createDocument({ format: 'hwpx', wasm: hx }, h.deps),
    /DocumentCreationCloseFailed/,
  );
  const bad = mock('hwp5', { wrongCount: true });
  await assert.rejects(
    createDocument({ format: 'hwp5', wasm: hx }, bad.deps),
    /InvalidBlankDocument/,
  );
  assert.equal(bad.closed, 1);
  const output = mock('hwpx', { output: h5 });
  await assert.rejects(
    createDocument({ format: 'hwpx', wasm: hx }, output.deps),
    /InvalidCreatedDocumentOutput/,
  );
  assert.equal(output.closed, 1);
});

const native = process.env.HWPJS_CREATE_CONVERT_NATIVE === '1';
for (const format of ['hwp5', 'hwpx'])
  test(
    `실제 Native820 생성 ${format}: blank·빈줄·Unicode·저장·재열기`,
    { skip: !native },
    async () => {
      const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
      assert.equal(
        createHash('sha256').update(wasm).digest('hex'),
        '82031994b4b7f066c28c725495954eebc67bb25570869c06528ea328e0155ccc',
      );
      const blank = await createNewDocumentBytes(wasm, format);
      const text = '첫🙂\n\n둘é\n';
      const result = await createDocument({ format, text, wasm, allowStaleLayout: true });
      assert.equal(result.paragraphCount, 4);
      assert.equal(result.layoutRequiresReflow, format === 'hwp5');
      const doc = await openDocument({ bytes: result.bytes, wasm }),
        base = await openDocument({ bytes: blank, wasm });
      try {
        const lines =
          format === 'hwpx'
            ? doc.sdk.paragraphTextSnapshot(0).map((x) => x.text)
            : doc.sdk.paragraphFlow(0).map((row, i) => {
                const raw = doc.sdk.text(0, row.paragraph);
                return raw.slice(i === 0 ? base.sdk.text(0, 0).length - 1 : 0, -1);
              });
        assert.deepEqual(lines, text.split('\n'));
      } finally {
        doc.close();
        base.close();
      }
      if (format === 'hwp5')
        await assert.rejects(createDocument({ format, text, wasm }), /LayoutReflowRequired/);
      const extension = format === 'hwp5' ? 'hwp' : 'hwpx';
      writeFileSync(join(process.env.HWPJS_CREATE_EVIDENCE, 'blank.' + extension), blank, {
        flag: 'wx',
      });
      writeFileSync(join(process.env.HWPJS_CREATE_EVIDENCE, 'create.' + extension), result.bytes, {
        flag: 'wx',
      });
    },
  );
