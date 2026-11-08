import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ocrDocument, OcrError } from '../src/document-ocr.ts';
import { buildObjectReference } from '../src/object-reference.ts';

const bytes = Uint8Array.of(1, 2, 3),
  wasm = Uint8Array.of(0, 97, 115, 109);
const sha = createHash('sha256').update(bytes).digest('hex');
const image = () => Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 0);
const reference = (kind = 'image', node = 1, extra = {}) =>
  buildObjectReference({
    sourceSha256: sha,
    format: 'hwp5',
    section: 0,
    kind,
    node,
    ...extra,
  });
function fixture({
  count = 2,
  format = 'hwp5',
  prepare,
  read,
  recognize,
  imageClose,
  documentClose,
} = {}) {
  const counts = {
    opened: 0,
    prepared: 0,
    imagesClosed: 0,
    documentClosed: 0,
    payloads: [],
    ocr: 0,
  };
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `${format}:s0:i${i + 1}`,
    source: { section: 0, pictureNode: i + 1 },
  }));
  const deps = {
    createProvider: async () => ({
      async prepare(options) {
        counts.prepared++;
        assert.deepEqual(options.languages, ['kor', 'eng']);
        if (prepare) await prepare();
      },
      async recognize(input) {
        counts.ocr++;
        return recognize ? recognize(input, counts.ocr) : { text: '한글 English\n두 번째 줄' };
      },
    }),
    async openDocument(input) {
      counts.opened++;
      assert.deepEqual(input.bytes, bytes);
      assert.deepEqual(input.wasm, wasm);
      assert.equal(input.expectedSha256, sha);
      return {
        format,
        sourceSha256: sha,
        sectionCount: 1,
        sdk: {},
        async close() {
          counts.documentClosed++;
          if (documentClose) await documentClose();
        },
      };
    },
    createDocumentImages: async () => ({
      list: () => ({ version: 1, format, sourceSha256: sha, images: rows }),
      async read(id, options) {
        counts.payloads.push(id);
        assert.equal(options.sourceSha256, sha);
        return read ? read(id) : { id, sourceSha256: sha, status: 'ready', bytes: image() };
      },
      async close() {
        counts.imagesClosed++;
        if (imageClose) await imageClose();
      },
    }),
  };
  const run = (options = {}) => ocrDocument({ bytes, wasm, ...options }, deps);
  return { counts, rows, deps, run };
}

test('문서 OCR는 기존 이미지 collector의 전체 구역 재고를 읽고 실제 줄과 언어를 보존한다', async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.languages, ['kor', 'eng']);
  assert.equal(result.provider, 'tesseract');
  assert.deepEqual(
    result.images.map((row) => row.status),
    ['recognized', 'recognized'],
  );
  assert.ok(result.text.includes('한글 English\n두 번째 줄'));
  assert.deepEqual(f.counts.payloads, ['hwp5:s0:i1', 'hwp5:s0:i2']);
  assert.equal(f.counts.imagesClosed, 1);
  assert.equal(f.counts.documentClosed, 1);
});

test('명시 reference만 읽고 stale·다른 kind·실제 format 불일치에서 payload를 읽지 않는다', async () => {
  const f = fixture();
  assert.equal((await f.run({ reference: reference('image', 2) })).images.length, 1);
  assert.deepEqual(f.counts.payloads, ['hwp5:s0:i2']);
  for (const ref of [reference('table'), reference('image', 1, { sourceSha256: '0'.repeat(64) })]) {
    const invalid = fixture();
    await assert.rejects(invalid.run({ reference: ref }));
    assert.equal(invalid.counts.opened, 0);
    assert.equal(invalid.counts.prepared, 0);
  }
  const mismatch = fixture({ format: 'hwpx' });
  await assert.rejects(mismatch.run({ reference: reference() }), /ObjectReferenceFormatMismatch/);
  assert.deepEqual(mismatch.counts.payloads, []);
  assert.equal(mismatch.counts.documentClosed, 1);
});

test('공급자 부재는 문서 열기 전 실패하며 빈 OCR와 빈 이미지 재고는 관측값이다', async () => {
  const missing = fixture({
    prepare: () => {
      throw new OcrError('ProviderUnavailable');
    },
  });
  await assert.rejects(missing.run(), { code: 'ProviderUnavailable' });
  assert.equal(missing.counts.opened, 0);
  const empty = fixture({ recognize: () => ({ text: '' }) });
  const result = await empty.run();
  assert.equal(result.status, 'complete');
  assert.ok(result.images.every((row) => row.status === 'no-text'));
  assert.match(result.text, /공급자가 인식한 텍스트 없음/);
  const noImages = fixture({ count: 0 });
  assert.match((await noImages.run()).text, /대상 구역 이미지 없음/);
  assert.equal(noImages.counts.ocr, 0);
});

test('개별 이미지 실패 후 다른 이미지를 계속 처리하고 partial 또는 failed를 명시한다', async () => {
  const f = fixture({
    recognize: (_input, count) => {
      if (count === 1) throw new OcrError('ProviderFailed');
      return { text: '두 번째 성공' };
    },
  });
  const result = await f.run();
  assert.equal(result.status, 'partial');
  assert.deepEqual(
    result.images.map((row) => row.status),
    ['failed', 'recognized'],
  );
  assert.ok(result.text.includes('두 번째 성공'));
  const all = fixture({
    recognize: () => {
      throw new OcrError('ProviderFailed');
    },
  });
  assert.equal((await all.run()).status, 'failed');
});

test('중복 ID·없는 reference는 OCR query 없이 collector와 문서를 닫는다', async () => {
  const duplicate = fixture();
  duplicate.rows[1] = duplicate.rows[0];
  await assert.rejects(duplicate.run(), /InvalidOcrImageInventory/);
  assert.equal(duplicate.counts.ocr, 0);
  assert.equal(duplicate.counts.imagesClosed, 1);
  assert.equal(duplicate.counts.documentClosed, 1);
  const absent = fixture();
  await assert.rejects(
    absent.run({ reference: reference('image', 99) }),
    /ObjectReferenceNotFound/,
  );
  assert.deepEqual(absent.counts.payloads, []);
});

test('명시 Vision은 허용하되 executable 재정의·무단 언어 fallback은 허용하지 않는다', async () => {
  const f = fixture();
  assert.equal((await f.run({ provider: 'vision' })).provider, 'vision');
  await assert.rejects(
    f.run({ provider: 'vision', executable: '/custom' }),
    /VisionExecutableOverrideNotAllowed/,
  );
});

test('이미지와 문서의 비동기 종료 오류를 모두 보존하며 실패를 성공으로 반환하지 않는다', async () => {
  const imageError = new Error('이미지 종료 오류'),
    documentError = new Error('문서 종료 오류');
  const f = fixture({
    imageClose: async () => {
      throw imageError;
    },
    documentClose: async () => {
      throw documentError;
    },
  });
  await assert.rejects(f.run(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [imageError, documentError]);
    return true;
  });
  assert.equal(f.counts.imagesClosed, 1);
  assert.equal(f.counts.documentClosed, 1);
});
