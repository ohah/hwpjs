import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  readDocumentOperation,
  renderBatchReadReport,
  renderReadResponse,
} from '../src/read-operation.ts';
import { readDocuments } from '../src/batch-read.ts';
const sha = 'a'.repeat(64);
const snapshot = { bytes: Uint8Array.of(1), sha256: sha };
function setup(overrides = {}) {
  const calls = [];
  return {
    calls,
    dependencies: {
      files: {
        readInputSnapshot: async (path) => {
          calls.push(['snapshot', path]);
          return snapshot;
        },
      },
      engine: {
        read: async ({ bytes, wasm }) => {
          calls.push(['engine', bytes, wasm]);
          return { format: 'hwp5', model: { version: 1, format: 'hwp5', sourceSha256: sha } };
        },
      },
      renderDocument: async (model, options) => {
        calls.push(['render', options.format, options.view]);
        return '본문';
      },
      loadWasm: async () => {
        calls.push(['wasm']);
        return Uint8Array.of(0);
      },
      ...overrides,
    },
  };
}
test('단일·배치 공통 읽기는 스냅샷·기존 엔진·기존 표시 함수를 순서대로 호출한다', async () => {
  const f = setup();
  const value = await readDocumentOperation(
    { inputPath: '경로', format: 'markdown' },
    f.dependencies,
  );
  assert.deepEqual(
    f.calls.map((row) => row[0]),
    ['snapshot', 'wasm', 'engine', 'render'],
  );
  assert.deepEqual(value, { format: 'hwp5', sourceSha256: sha, text: '본문' });
  assert.equal(f.calls[3][1], 'markdown');
});
test('이미 획득한 단일 읽기 스냅샷과 WASM은 다시 읽지 않는다', async () => {
  const f = setup();
  await readDocumentOperation({ inputSnapshot: snapshot, wasm: Uint8Array.of(0) }, f.dependencies);
  assert.deepEqual(
    f.calls.map((row) => row[0]),
    ['engine', 'render'],
  );
});
test('모델의 버전·포맷·SHA 불일치는 표시 전에 거부하고 잘못된 본문도 거부한다', async () => {
  for (const model of [
    { version: 2, format: 'hwp5', sourceSha256: sha },
    { version: 1, format: 'hwpx', sourceSha256: sha },
    { version: 1, format: 'hwp5', sourceSha256: 'b'.repeat(64) },
  ]) {
    const f = setup({ engine: { read: async () => ({ format: 'hwp5', model }) } });
    await assert.rejects(
      readDocumentOperation({ inputPath: '경로' }, f.dependencies),
      /InvalidEngineModel/,
    );
    assert.equal(
      f.calls.some((row) => row[0] === 'render'),
      false,
    );
  }
  const f = setup({ renderDocument: () => '\ud800' });
  await assert.rejects(
    readDocumentOperation({ inputPath: '경로' }, f.dependencies),
    /InvalidRenderedDocument/,
  );
});
test('배치 보고서는 문서 JSON 대신 텍스트와 Markdown을 출력하고 부분 실패를 표시한다', async () => {
  const batch = await readDocuments({
    inputPaths: ['성공`[]', '실패'],
    readOne: ({ index }) => {
      if (index) throw Error('오류\n위조: 값');
      return { format: 'hwpx', sourceSha256: sha, text: '읽은 본문' };
    },
  });
  for (const format of ['text', 'markdown']) {
    const report = renderBatchReadReport(batch, {
      format,
      view: 'structure',
      maxOutputBytes: 4194304,
    });
    assert.match(report, /batchStatus: partial/);
    assert.match(report, /documentSHA256:/);
    assert.match(report, /읽은 본문/);
    assert.match(report, /error: ReadFailed/);
    assert.match(report, /오류\\u000a위조:/);
    assert.ok(!report.trimStart().startsWith('{'));
    assert.ok(Buffer.byteLength(report) <= 4194304);
    if (format === 'markdown') assert.match(report, /^# 여러 문서 읽기/);
  }
});
test('긴 경로·제어 문자 오류·본문 조합에서도 최종 텍스트 예산을 지킨다', async () => {
  for (const format of ['text', 'markdown']) {
    const batch = await readDocuments({
      inputPaths: ['`[]\\'.repeat(700), '다음'],
      maxOutputBytes: 20000,
      readOne: ({ index }) => {
        if (index) throw Error('\0'.repeat(300));
        return { format: 'hwp5', sourceSha256: sha, text: '본문🙂\n'.repeat(1000) };
      },
    });
    const report = renderBatchReadReport(batch, {
      format,
      view: 'structure',
      maxOutputBytes: 20000,
    });
    assert.ok(Buffer.byteLength(report) <= 20000);
    assert.match(report, /failed: 1/);
  }
});

test('스냅샷 SHA는 문자열이어야 하며 암묵적 변환 객체를 엔진 전에 거부한다', async () => {
  const f = setup();
  await assert.rejects(
    readDocumentOperation(
      {
        inputSnapshot: { bytes: Uint8Array.of(1), sha256: { toString: () => sha } },
        wasm: Uint8Array.of(0),
      },
      f.dependencies,
    ),
    /InvalidInputSnapshot/,
  );
  assert.deepEqual(f.calls, []);
});

test('기본 content와 명시 structure를 같은 renderer에 전달하고 반환문은 그대로 유지한다', async () => {
  for (const format of ['text', 'markdown']) {
    for (const view of [undefined, 'content', 'structure']) {
      const f = setup({
        renderDocument: (model, options) => {
          assert.deepEqual(options, { format, view: view ?? 'content' });
          return '';
        },
      });
      const result = await readDocumentOperation(
        { inputPath: '경로', format, ...(view === undefined ? {} : { view }) },
        f.dependencies,
      );
      assert.equal(result.text, '');
      assert.equal(result.sourceSha256, sha);
    }
  }
  const f = setup();
  await assert.rejects(
    readDocumentOperation({ inputPath: '경로', view: 'json' }, f.dependencies),
    /InvalidReadView/,
  );
  assert.deepEqual(f.calls, []);
});

test('기본 배치 보고서는 파일과 본문 및 한국어 실패를 유지하고 구조 메타데이터를 덧붙이지 않는다', async () => {
  const batch = await readDocuments({
    inputPaths: ['성공`[]', '실패', '빈 문서'],
    readOne: ({ index }) => {
      if (index === 1) throw Error('실패 원인\n새 줄');
      return { format: 'hwp5', sourceSha256: sha, text: index === 2 ? '' : '첫 본문' };
    },
  });
  for (const format of ['text', 'markdown']) {
    const report = renderBatchReadReport(batch, { format, maxOutputBytes: 4194304 });
    assert.match(report, /첫 본문/);
    assert.match(report, /빈 문서/);
    assert.match(report, /읽기 실패: 문서 읽기 작업에 실패했습니다/);
    assert.ok(
      report.includes(format === 'markdown' ? '실패 원인\\\\u000a새 줄' : '실패 원인\\u000a새 줄'),
    );
    assert.match(report, /성공 2개, 실패 1개/);
    assert.doesNotMatch(
      report,
      /(?:batchStatus|readStatus|outputStatus|deliveryStatus|documentSHA256|inputPath|error):/,
    );
    assert.ok(report.indexOf('첫 본문') < report.indexOf('읽기 실패:'));
    assert.ok(report.indexOf('읽기 실패:') < report.indexOf('빈 문서'));
  }
});

test('두 view 모두 최종 보고서 바이트 상한을 지키며 본문 절단으로 통과시키지 않는다', async () => {
  const batch = await readDocuments({
    inputPaths: ['문서'],
    readOne: () => ({ format: 'hwpx', sourceSha256: sha, text: '한글🙂'.repeat(30) }),
  });
  for (const view of ['content', 'structure']) {
    for (const format of ['text', 'markdown']) {
      const report = renderBatchReadReport(batch, { view, format, maxOutputBytes: 10000 });
      const exact = Buffer.byteLength(report);
      assert.equal(renderBatchReadReport(batch, { view, format, maxOutputBytes: exact }), report);
      assert.throws(
        () => renderBatchReadReport(batch, { view, format, maxOutputBytes: exact - 1 }),
        /ReadManyReportBudgetExceeded/,
      );
    }
  }
  assert.throws(
    () => renderBatchReadReport(batch, { view: 'json', maxOutputBytes: 10000 }),
    /InvalidReadView/,
  );
});

test('단일 응답 공유 함수는 content 원문자열과 기존 structure prefix 및 개행을 보존한다', () => {
  for (const format of ['hwp5', 'hwpx']) {
    for (const text of ['', '본문', '본문\n', '# 제목\n\n| 셀 |\n']) {
      const result = { format, sourceSha256: sha, text };
      assert.equal(renderReadResponse(result), text);
      assert.equal(renderReadResponse(result, { view: 'content' }), text);
      assert.equal(
        renderReadResponse(result, { view: 'structure' }),
        `format: ${format}\ndocumentSHA256: ${sha}\n${text}${text.endsWith('\n') ? '' : '\n'}`,
      );
    }
  }
});

test('단일 응답 공유 함수는 content에서도 잘못된 포맷과 SHA 및 문자열을 거부한다', () => {
  const valid = { format: 'hwp5', sourceSha256: sha, text: '내용' };
  for (const value of [null, [], '내용'])
    assert.throws(() => renderReadResponse(value), /InvalidReadResult/);
  for (const format of ['', 'text', 'HWP5', 'hwp5\n위조: 값'])
    assert.throws(() => renderReadResponse({ ...valid, format }), /InvalidEngineFormat/);
  for (const sourceSha256 of [
    undefined,
    'a'.repeat(63),
    'A'.repeat(64),
    sha + '\n',
    { toString: () => sha },
  ])
    assert.throws(() => renderReadResponse({ ...valid, sourceSha256 }), /InvalidReadSourceSHA256/);
  for (const text of [undefined, null, 1, '\ud800', { toString: () => '내용' }])
    assert.throws(
      () => renderReadResponse({ ...valid, text, rawText: '대체 금지' }),
      /InvalidRenderedDocument/,
    );
  for (const view of ['', 'json', 'CONTENT', null, { toString: () => 'content' }])
    assert.throws(() => renderReadResponse(valid, { view }), /InvalidReadView/);
});

test('단일 응답 공유 함수는 getter 값을 한 번 포착해 검증 뒤 prefix 바꿔치기를 막는다', () => {
  const reads = { format: 0, sourceSha256: 0, text: 0 };
  const result = Object.fromEntries(Object.keys(reads).map((key) => [key, undefined]));
  for (const [key, value] of Object.entries({ format: 'hwp5', sourceSha256: sha, text: '내용' }))
    Object.defineProperty(result, key, {
      get() {
        reads[key]++;
        return reads[key] === 1 ? value : '위조\n값';
      },
    });
  assert.equal(
    renderReadResponse(result, { view: 'structure' }),
    `format: hwp5\ndocumentSHA256: ${sha}\n내용\n`,
  );
  assert.deepEqual(reads, { format: 1, sourceSha256: 1, text: 1 });
});

test('단일 응답 공유 함수는 Node 모듈 및 전역 없이도 같은 문자열을 반환한다', () => {
  const url = new URL('../src/read-operation.ts', import.meta.url).href;
  const program = `import assert from 'node:assert/strict'; import {registerHooks} from 'node:module';
    registerHooks({resolve(name,context,next){if(name.startsWith('node:')||(!name.startsWith('.')&&!name.startsWith('file:')))throw Error('Node 의존성 금지');return next(name,context)}});
    globalThis.Buffer=undefined;globalThis.process=undefined;globalThis.require=undefined;globalThis.module=undefined;
    const {renderReadResponse}=await import(${JSON.stringify(url)});
    const value={format:'hwpx',sourceSha256:'a'.repeat(64),text:'내용'};
    assert.equal(renderReadResponse(value),'내용');
    assert.equal(renderReadResponse(value,{view:'structure'}),'format: hwpx\\ndocumentSHA256: '+'a'.repeat(64)+'\\n내용\\n');`;
  const child = spawnSync(
    process.execPath,
    ['--max-old-space-size=256', '--input-type=module', '-e', program],
    {
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    },
  );
  assert.equal(child.status, 0, child.stderr);
});

test('배치 content 파일명은 HTML 시작과 엔티티 및 C1과 bidi 문자를 안전하게 표시한다', async () => {
  const batch = await readDocuments({
    inputPaths: [
      '<img src=x onerror=demo>.hwp',
      '&lt;img&gt;.hwp',
      '&#60;img&#62;.hwp',
      '\u0085\u009f\u202e\u2066\u2028\u2029보호🙂.hwp',
    ],
    readOne: () => ({ format: 'hwp5', sourceSha256: sha, text: '본문' }),
  });
  for (const format of ['text', 'markdown']) {
    const report = renderBatchReadReport(batch, { format, maxOutputBytes: 4194304 });
    assert.doesNotMatch(report, /[\u0085\u009f\u202e\u2066\u2028\u2029]/u);
    assert.match(report, /보호🙂/);
    assert.ok(report.includes('\\u0085'));
    if (format === 'markdown') {
      assert.ok(report.includes('## 1. \\<img src=x onerror=demo\\>.hwp'));
      assert.ok(report.includes('## 2. &amp;lt;img&amp;gt;.hwp'));
      assert.ok(report.includes('## 3. &amp;#60;img&amp;#62;.hwp'));
      assert.ok(!report.includes('## 1. <img'));
    }
  }
});

test('배치 content 오류 메시지와 상세도 파일명과 같은 표시 escape를 사용한다', async () => {
  const batch = await readDocuments({
    inputPaths: ['실패'],
    readOne: () => {
      throw Error('<img src=x>&lt;\u0085\u202e🙂');
    },
  });
  batch.results[0].errors[0].message = '<b>알림</b>&lt;\u2066';
  const report = renderBatchReadReport(batch, { format: 'markdown', maxOutputBytes: 4194304 });
  assert.ok(report.includes('읽기 실패: \\<b\\>알림\\</b\\>&amp;lt;'));
  assert.ok(report.includes('\\<img src=x\\>&amp;lt;'));
  assert.doesNotMatch(report, /[\u0085\u202e\u2066]/u);
  assert.ok(!report.includes('읽기 실패: <b>'));
  assert.match(report, /실패 1개/);
});

test('구조 배치 메타데이터도 C1과 bidi를 표시 escape하며 본문은 바꾸지 않는다', async () => {
  const batch = await readDocuments({
    inputPaths: ['\u0085\u202e파일.hwp', '실패'],
    readOne: ({ index }) => {
      if (index) throw Error('원인\u009f\u2066');
      return { format: 'hwp5', sourceSha256: sha, text: '정상 본문' };
    },
  });
  batch.results[1].errors[0].message = '실패\u2028\u2029';
  for (const format of ['text', 'markdown']) {
    const report = renderBatchReadReport(batch, {
      format,
      view: 'structure',
      maxOutputBytes: 4194304,
    });
    assert.doesNotMatch(report, /[\u0085\u009f\u202e\u2066\u2028\u2029]/u);
    assert.ok(report.includes('inputPath: \\u0085\\u202e파일.hwp'));
    assert.ok(report.includes('message: 실패\\u2028\\u2029'));
    assert.ok(report.includes('detail: 원인\\u009f\\u2066'));
    assert.match(report, /정상 본문/);
    assert.match(report, /documentSHA256:/);
    assert.match(report, /batchStatus: partial/);
  }
});
