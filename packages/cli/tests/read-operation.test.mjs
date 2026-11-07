import test from 'node:test';
import assert from 'node:assert/strict';
import { readDocumentOperation, renderBatchReadReport } from '../src/read-operation.mjs';
import { readDocuments } from '../src/batch-read.mjs';
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
        calls.push(['render', options.format]);
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
    const report = renderBatchReadReport(batch, { format, maxOutputBytes: 4194304 });
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
    const report = renderBatchReadReport(batch, { format, maxOutputBytes: 20000 });
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
