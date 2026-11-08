import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectDocumentParagraph } from '../src/document-paragraph.ts';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sparseRow = () => {
  const rows = [];
  rows.length = 1;
  return rows;
};
function setup(format = 'hwp5', raw = '보도일시\r') {
  const bytes =
    format === 'hwp5'
      ? Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)
      : Uint8Array.of(0x50, 0x4b, 3, 4);
  const wasm = Uint8Array.of(0, 97, 115, 109);
  const target = { section: 1, paragraph: format === 'hwp5' ? 0 : 101 };
  const calls = [];
  let opened = 0,
    closed = 0;
  const sdk = {
    paragraphCount: (section) => {
      calls.push(['paragraphCount', section]);
      return 2;
    },
    text: (...args) => {
      calls.push(['text', ...args]);
      return raw;
    },
    paragraphTextSnapshot: (section) => {
      calls.push(['paragraphTextSnapshot', section]);
      return [
        { paragraph: 100, text: '다른 문단', nested: false },
        { paragraph: 101, text: '보도일시', nested: true },
      ];
    },
    anchorText: (...args) => {
      calls.push(['anchorText', ...args]);
      return raw;
    },
    paragraphShapeId: (...args) => {
      calls.push(['paragraphShapeId', ...args]);
      return 0;
    },
    characterRanges: (...args) => {
      calls.push(['characterRanges', ...args]);
      return [{ start: 0, end: raw.length, charShapeId: 0 }];
    },
    currentTextPreview: () => {
      throw new Error('전문서 표시 조회 금지');
    },
    save: () => {
      throw new Error('저장 금지');
    },
  };
  const document = {
    format,
    sourceSha256: digest(bytes),
    sectionCount: 2,
    sdk,
    close: async () => {
      closed++;
    },
  };
  const dependencies = {
    openDocument: async (options) => {
      opened++;
      calls.push(['open', options]);
      return document;
    },
  };
  const options = { bytes, wasm, target, expectedSha256: digest(bytes) };
  return {
    sdk,
    document,
    dependencies,
    options,
    calls,
    inspect: (extra = {}) => inspectDocumentParagraph({ ...options, ...extra }, dependencies),
    opened: () => opened,
    closed: () => closed,
  };
}

function rawJson(text, format = 'text') {
  const lines = text.split('\n');
  const at = lines.indexOf('expectedText (JSON ASCII):');
  assert.ok(at >= 0);
  return lines[at + (format === 'markdown' ? 2 : 1)];
}

for (const actual of ['hwp5', 'hwpx']) {
  for (const outputFormat of ['text', 'markdown']) {
    test(`${actual}/${outputFormat}는 실제 주소와 원문 CR을 보존하고 한 문단의 메타데이터만 조회한다`, async () => {
      const state = setup(actual);
      const result = await state.inspect({ format: outputFormat });
      assert.deepEqual(Object.keys(result).sort(), [
        'format',
        'schemaVersion',
        'sourceSha256',
        'target',
        'text',
      ]);
      assert.equal(result.schemaVersion, 1);
      assert.equal(result.format, actual);
      assert.equal(result.sourceSha256, digest(state.options.bytes));
      assert.deepEqual(result.target, state.options.target);
      assert.match(result.text, /nativeTextUnits: 5\n/);
      assert.equal(JSON.parse(rawJson(result.text, outputFormat)), '보도일시\r');
      assert.ok(result.text.includes('paragraphShapeId: 0'));
      assert.ok(result.text.includes('"charShapeId":0'));
      assert.ok(result.text.includes(actual === 'hwp5' ? 'displayText: 미관측' : '보도일시'));
      const method = actual === 'hwp5' ? 'text' : 'anchorText';
      assert.deepEqual(
        state.calls.find((row) => row[0] === method),
        [method, 1, actual === 'hwp5' ? 0 : 101],
      );
      assert.equal(state.closed(), 1);
    });
  }
}

test('모든 비ASCII·C0·따옴표·역슬래시와 서로게이트는 ASCII JSON으로 손실 없이 왕복한다', async () => {
  const raw = 'A 한漢捥摣\r\n\t\0\u001b"\\😀\ud800\udfff\u0085\u202e';
  for (const format of ['text', 'markdown']) {
    const state = setup('hwp5', raw);
    const { text } = await state.inspect({ format });
    const value = rawJson(text, format);
    assert.equal(JSON.parse(value), raw);
    assert.equal(
      [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) < 127),
      true,
    );
    for (const escape of [
      '\\u000d',
      '\\u000a',
      '\\u0000',
      '\\u0022',
      '\\u005c',
      '\\ud83d',
      '\\ude00',
      '\\ud800',
    ])
      assert.ok(value.includes(escape), escape);
    assert.equal(text.includes('捥摣'), false);
    assert.equal(text.includes('\r'), false);
    assert.equal(state.closed(), 1);
  }
});

test('빈 원문과 미관측 메타데이터는 0이나 기본 스타일로 대체하지 않는다', async () => {
  const state = setup('hwp5', '');
  delete state.sdk.paragraphShapeId;
  delete state.sdk.characterRanges;
  const { text } = await state.inspect();
  assert.equal(JSON.parse(rawJson(text)), '');
  assert.match(text, /nativeTextUnits: 0/);
  assert.match(text, /paragraphShapeId: 미관측/);
  assert.match(text, /characterRanges: 미관측/);
});

test('잘못된 target·출력 형식·SHA·입력·제공자는 문서를 열기 전에 거부한다', async () => {
  for (const patch of [
    { target: null },
    { target: [] },
    { target: { section: -1, paragraph: 0 } },
    { target: { section: 0, paragraph: 2 ** 32 } },
    { target: { section: 0, paragraph: NaN } },
    { format: 'html' },
    { expectedSha256: 'x' },
    { bytes: new Uint8Array() },
    { bytes: new Uint8Array([1]) },
    { wasm: new Uint8Array() },
  ]) {
    const state = setup();
    await assert.rejects(state.inspect(patch));
    assert.equal(state.opened(), 0);
  }
  const state = setup();
  state.dependencies.openDocument = 1;
  await assert.rejects(state.inspect(), /InvalidDocumentOpener/);
  assert.equal(state.opened(), 0);
});

test('오래된 SHA는 실제 입력 해시와 대조해 opener 호출 없이 거부한다', async () => {
  const state = setup();
  await assert.rejects(state.inspect({ expectedSha256: '0'.repeat(64) }), /SourceSha256Mismatch/);
  assert.equal(state.opened(), 0);
});

test('문서의 실제 형식·SHA·구역 결속 불일치는 원문 조회 전에 거부하고 닫는다', async () => {
  for (const patch of [
    { format: 'hwpx' },
    { sourceSha256: '0'.repeat(64) },
    { sectionCount: 0 },
    { sectionCount: 4097 },
    { sectionCount: 1 },
  ]) {
    const state = setup();
    Object.assign(state.document, patch);
    await assert.rejects(state.inspect());
    assert.equal(
      state.calls.some(([method]) => method === 'text'),
      false,
    );
    assert.equal(state.closed(), 1);
  }
});

test('H5 문단 수 경계와 HX 문서 전체 Native ID는 행 수로 추측하지 않는다', async () => {
  const h5 = setup();
  await assert.rejects(h5.inspect({ target: { section: 1, paragraph: 2 } }), /ParagraphNotFound/);
  assert.equal(h5.closed(), 1);
  const hx = setup('hwpx');
  for (const paragraph of [0, 1, 2, 99, 102]) {
    await assert.rejects(hx.inspect({ target: { section: 1, paragraph } }), /ParagraphNotFound/);
  }
  assert.equal(
    hx.calls.some(([method]) => method === 'anchorText'),
    false,
  );
  assert.equal(hx.closed(), 5);
  assert.equal((await hx.inspect()).target.paragraph, 101);
});

test('HX 중복·희소·구역 혼합·비정상 inventory는 raw getter 전에 거부한다', async () => {
  for (const rows of [
    [
      { paragraph: 101, text: '' },
      { paragraph: 101, text: '' },
    ],
    sparseRow(),
    [{ paragraph: 101, section: 0, text: '' }],
    [{ paragraph: 0, text: '' }],
    [{ paragraph: 101, text: null }],
    {},
  ]) {
    const state = setup('hwpx');
    state.sdk.paragraphTextSnapshot = () => rows;
    await assert.rejects(state.inspect());
    assert.equal(
      state.calls.some(([method]) => method === 'anchorText'),
      false,
    );
    assert.equal(state.closed(), 1);
  }
});

test('입력·WASM·target·opener는 첫 비동기 대기 전에 캡처한다', async () => {
  const state = setup();
  const before = Uint8Array.from(state.options.bytes);
  const target = { ...state.options.target };
  const pending = state.inspect();
  state.options.bytes.fill(0);
  state.options.wasm.fill(9);
  state.options.target.paragraph = 99;
  state.dependencies.openDocument = () => {
    throw new Error('바뀐 opener 사용 금지');
  };
  const result = await pending;
  const options = state.calls.find(([name]) => name === 'open')[1];
  assert.deepEqual(options.bytes, before);
  assert.deepEqual(options.wasm, Uint8Array.of(0, 97, 115, 109));
  assert.deepEqual(result.target, target);
  assert.equal(result.sourceSha256, digest(before));
});

test('선택 문단 Native 조회 실패와 close 실패는 두 원인을 보존한다', async () => {
  const state = setup();
  const first = new Error('원문 실패'),
    second = new Error('종료 실패');
  state.sdk.text = () => {
    throw first;
  };
  state.document.close = async () => {
    throw second;
  };
  await assert.rejects(state.inspect(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [first, second]);
    assert.equal(error.cause, first);
    return true;
  });
});

test('Native의 undefined 예외도 close 실패와 결합하고 원문 성공 뒤 종료 실패는 성공으로 반환하지 않는다', async () => {
  const state = setup();
  const closeError = new Error('종료 실패');
  state.sdk.text = () => {
    throw undefined;
  };
  state.document.close = () => {
    throw closeError;
  };
  await assert.rejects(state.inspect(), (error) => {
    assert.deepEqual(error.errors, [undefined, closeError]);
    return true;
  });
  const success = setup();
  success.document.close = () => {
    throw closeError;
  };
  await assert.rejects(success.inspect(), (error) => {
    assert.equal(error.message, 'DocumentParagraphInspectionCloseFailed');
    assert.equal(error.cause, closeError);
    return true;
  });
});

test('선택 메타데이터의 실패·잘못된 범위는 미관측으로 남기며 원문은 보존한다', async () => {
  for (const ranges of [
    [{ start: 0, end: 99, charShapeId: 1 }],
    [{ start: 1, end: 2, charShapeId: 1 }],
    [{ start: 0, end: 2, charShapeId: undefined }],
    sparseRow(),
  ]) {
    const state = setup();
    state.sdk.paragraphShapeId = () => {
      throw new Error('미지원');
    };
    state.sdk.characterRanges = () => ranges;
    const { text } = await state.inspect();
    assert.match(text, /paragraphShapeId: 미관측/);
    assert.match(text, /characterRanges: 미관측/);
    assert.equal(JSON.parse(rawJson(text)), '보도일시\r');
  }
});

test('4MiB 원문·HX snapshot 누적 예산과 64KiB 표시 예산은 절단 대신 명시 실패한다', async () => {
  const oversized = setup('hwp5', 'x'.repeat(4 * 1024 * 1024 + 1));
  await assert.rejects(oversized.inspect(), /ParagraphTextLimitExceeded/);
  assert.equal(oversized.closed(), 1);
  const expanded = setup('hwp5', '한'.repeat(12000));
  await assert.rejects(expanded.inspect(), /ParagraphDetailLimitExceeded/);
  assert.equal(expanded.closed(), 1);
  const plain = setup('hwp5', 'x'.repeat(65535));
  await assert.rejects(plain.inspect(), /ParagraphDetailLimitExceeded/);
  const hx = setup('hwpx');
  hx.sdk.paragraphTextSnapshot = () => [
    { paragraph: 100, text: 'x'.repeat(3 * 1024 * 1024) },
    { paragraph: 101, text: 'x'.repeat(2 * 1024 * 1024) },
  ];
  await assert.rejects(hx.inspect(), /ParagraphTextLimitExceeded/);
  assert.equal(
    hx.calls.some(([name]) => name === 'anchorText'),
    false,
  );
  assert.equal(hx.closed(), 1);
});

test('선택 display의 제어문자와 Markdown은 공통 표시 변환을 거친다', async () => {
  const state = setup('hwpx');
  state.sdk.paragraphTextSnapshot = () => [{ paragraph: 101, text: '<script>\r\u202e' }];
  const { text } = await state.inspect({ format: 'markdown' });
  assert.ok(text.includes('displayText: \\<script\\>\\\\u000d\\\\u202e'));
  assert.ok(!text.includes('\u202e'));
});
