import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { exportDocumentHTML as exportCLI } from '../src/export-html.ts';
import { exportDocumentHTML, toHtml as sharedToHtml } from '../../document/src/export-html.ts';
import { toHtml } from '../../core/src/conversion.ts';
import { copyDocumentBytes } from '../../document/src/bytes.ts';
import { openReadOnlyDocument } from '../../document/src/read-document.ts';
import { buildObjectReference } from '../../document/src/object-reference.ts';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const area = () => ({
  declarations: 'known',
  definitions: [],
  inheritance: { state: 'not-applicable' },
});
function setup({ format = 'hwpx', nodes = [], unsupported = false, payloadLength = 9 } = {}) {
  const bytes =
    format === 'hwp5'
      ? new Uint8Array([208, 207, 17, 224, 161, 177, 26, 225])
      : new Uint8Array([80, 75, 3, 4]);
  const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
  const state = {
    closed: [],
    opened: [],
    reads: [],
    images: 0,
    model: null,
    beforeModel: null,
    closeErrors: {},
    onOpen: null,
  };
  const rows = nodes.map((node, index) => ({
    id: `${format}:s0:i${node}`,
    resourceKey: format === 'hwp5' ? `docinfo:${index + 1}` : `source:0:${node}`,
    source: {
      section: 0,
      pictureNode: node,
      ...(format === 'hwp5'
        ? { resourceOrdinal: index + 1, recordNode: node + 1, ownerNode: node - 1 }
        : {}),
    },
  }));
  const deps = {
    async openDocument(input) {
      state.opened.push(input);
      state.onOpen?.(input);
      return {
        format,
        sourceSha256: input.sourceSha256,
        sectionCount: 1,
        sdk: {},
        close() {
          state.closed.push('document');
          if (state.closeErrors.document) throw state.closeErrors.document;
        },
      };
    },
    async readDocumentModel({ sourceSha256 }) {
      const model = {
        version: 1,
        format,
        sourceSha256,
        sections: [
          {
            id: 's:0',
            source: { section: 0 },
            header: area(),
            footer: area(),
            body: [
              {
                id: 'p:0',
                type: 'paragraph',
                displayText: '<원문> & 🙂',
                source: { section: 0, paragraph: format === 'hwp5' ? 0 : 1 },
                editability: 'unknown',
              },
              ...nodes.map((node) => ({
                id: `i:${node}`,
                type: 'image',
                reference: buildObjectReference({
                  sourceSha256,
                  format,
                  kind: 'image',
                  section: 0,
                  node,
                }),
                sourceInfo: { section: 0, pictureNode: node },
                altState: 'not-exposed',
                alt: null,
              })),
            ],
          },
        ],
        unplaced: [],
        warnings: [],
        coverage: { inventoryComplete: true },
      };
      state.beforeModel?.(model);
      state.model = model;
      return model;
    },
    createDocumentImages() {
      state.images++;
      return {
        list: () => ({ version: 1, format, sourceSha256: state.model.sourceSha256, images: rows }),
        read(id) {
          state.reads.push(id);
          const row = rows.find((row) => row.id === id);
          const bytes = new Uint8Array(payloadLength).fill(Number(id.split(':i')[1]));
          bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
          return {
            ...row,
            sourceSha256: state.model.sourceSha256,
            bytes,
            recognized: !unsupported,
            mime: unsupported ? null : 'image/png',
          };
        },
        close() {
          state.closed.push('images');
          if (state.closeErrors.images) throw state.closeErrors.images;
        },
      };
    },
  };
  return { input: { bytes, wasm, fragment: true }, state, rows, deps };
}

test('공개 Core와 CLI는 같은 공통 함수이고 WASM 미제공 시 파일·fetch 없이 명시 실패한다', async () => {
  assert.equal(toHtml, sharedToHtml);
  assert.equal(exportCLI, exportDocumentHTML);
  let called = 0;
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    called++;
    throw Error('UnexpectedFetch');
  };
  try {
    await assert.rejects(toHtml(new Uint8Array([80, 75, 3, 4])), /ExplicitWasmRequired/);
    assert.equal(called, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test('양 형식 DI 관측으로 실제 renderer와 문자열 경고 계약을 실행한다', async () => {
  for (const format of ['hwp5', 'hwpx']) {
    const f = setup({ format });
    f.state.beforeModel = (model) =>
      model.warnings.push({
        code: 'Observed<&>',
        message: '미관측\u001b',
        source: { section: 0, node: 10 },
      });
    const result = await exportDocumentHTML(f.input, f.deps);
    assert.equal(result.format, format);
    assert.equal(result.sourceSha256, hash(f.input.bytes));
    assert.equal(result.semanticOnly, true);
    assert.ok(result.html.includes('&lt;원문&gt; &amp; 🙂'));
    assert.ok(result.html.includes('Observed&lt;&amp;&gt;'));
    assert.equal(typeof result.warnings[0], 'string');
    assert.ok(result.warnings[0].includes('[Observed<&>]'));
    assert.ok(result.warnings[0].includes('section=0, node=10'));
    assert.ok(result.warnings[0].includes('\\u001b'));
    assert.deepEqual(f.state.closed, ['document']);
  }
});
test('지원 이미지 DI 바이트는 실제 base64로 만들고 개별 자원과 닫기 순서를 보존한다', async () => {
  const f = setup({ nodes: [10, 11], payloadLength: 8191 });
  const result = await exportDocumentHTML(f.input, f.deps);
  for (const node of [10, 11]) {
    const bytes = new Uint8Array(8191).fill(node);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(
      result.html.includes('data:image/png;base64,' + Buffer.from(bytes).toString('base64')),
    );
  }
  assert.deepEqual(f.state.reads, ['hwpx:s0:i10', 'hwpx:s0:i11']);
  assert.deepEqual(f.state.closed, ['images', 'document']);
});
test('embedImages none은 바이트 수집기를 호출하지 않고 논리 참조만 남긴다', async () => {
  const f = setup({ nodes: [10] });
  const result = await exportDocumentHTML({ ...f.input, embedImages: 'none' }, f.deps);
  assert.equal(f.state.images, 0);
  assert.equal(result.html.includes('<img'), false);
  assert.ok(result.html.includes('data-ref="hwpjs-object:'));
  assert.deepEqual(result.warnings, []);
});
test('지원되지 않은 이미지와 Native 바이트 부재는 visible placeholder와 경고를 남긴다', async () => {
  const f = setup({ nodes: [10], unsupported: true });
  const result = await exportDocumentHTML(f.input, f.deps);
  assert.equal(result.html.includes('<img'), false);
  assert.ok(result.html.includes('이미지 바이트가 포함되지 않았습니다.'));
  assert.ok(result.warnings.some((s) => s.includes('HtmlImageFormatUnsupported')));
  const g = setup({ nodes: [10] });
  g.deps.createDocumentImages = () => {
    throw Error('NativeImageUnavailable');
  };
  const missing = await exportDocumentHTML(g.input, g.deps);
  assert.ok(missing.warnings.some((s) => s.includes('HtmlImageInventoryUnavailable')));
  assert.deepEqual(g.state.closed, ['document']);
});
test('resourceKey 누락·중복ID·주소 불일치는 잘못된 바이트 캐시 성공으로 바꾸지 않는다', async () => {
  for (const kind of ['missing', 'id', 'source', 'key']) {
    const f = setup({ nodes: [10, 11] });
    if (kind === 'missing') delete f.rows[1].resourceKey;
    if (kind === 'id') f.rows[1].id = f.rows[0].id;
    if (kind === 'source') f.rows[1].source.pictureNode = 99;
    if (kind === 'key') f.rows[1].resourceKey = f.rows[0].resourceKey;
    await assert.rejects(exportDocumentHTML(f.input, f.deps), /InvalidHtmlImageInventory/);
    assert.deepEqual(f.state.closed, ['images', 'document']);
    assert.deepEqual(f.state.reads, []);
  }
});
test('이미지 읽기 결과의 원문 SHA가 다르면 정상 HTML로 게시하지 않는다', async () => {
  const f = setup({ nodes: [10] });
  const create = f.deps.createDocumentImages;
  f.deps.createDocumentImages = () => {
    const images = create();
    const read = images.read;
    images.read = (id) => ({ ...read(id), sourceSha256: 'b'.repeat(64) });
    return images;
  };
  await assert.rejects(exportDocumentHTML(f.input, f.deps), /HtmlImageSourceMismatch/);
  assert.deepEqual(f.state.closed, ['images', 'document']);
});
test('호출자와 빌린 입력의 변경은 await 전 소유한 source SHA·WASM을 오염시키지 않는다', async () => {
  const f = setup();
  const before = Uint8Array.from(f.input.bytes),
    binary = Uint8Array.from(f.input.wasm);
  const promise = exportDocumentHTML(f.input, f.deps);
  f.input.bytes.fill(99);
  f.input.wasm.fill(99);
  const result = await promise;
  assert.equal(result.sourceSha256, hash(before));
  assert.deepEqual(f.state.opened[0].bytes, before);
  assert.deepEqual(f.state.opened[0].wasm, binary);
  const g = setup();
  const original = Uint8Array.from(g.input.bytes);
  g.state.onOpen = (value) => {
    value.bytes.fill(88);
    value.wasm.fill(88);
  };
  const owned = await exportDocumentHTML(g.input, g.deps);
  assert.deepEqual(g.input.bytes, original);
  assert.equal(owned.sourceSha256, hash(original));
});
test('typed array·realm·SAB·detached 경계는 기존 파일 변환 복사 SSOT를 따른다', () => {
  class Hostile extends Uint8Array {
    get byteLength() {
      throw Error('getter');
    }
    [Symbol.iterator]() {
      throw Error('iterator');
    }
    slice() {
      throw Error('slice');
    }
  }
  assert.deepEqual(
    copyDocumentBytes(new Hostile([1, 2, 3]), 8, 'Document'),
    new Uint8Array([1, 2, 3]),
  );
  const realm = runInNewContext('new Uint8Array([4,5]).buffer');
  assert.deepEqual(copyDocumentBytes(realm, 8, 'Document'), new Uint8Array([4, 5]));
  assert.throws(() => copyDocumentBytes(new Uint8Array(new SharedArrayBuffer(4)), 8, 'Document'));
  const detached = new ArrayBuffer(4);
  structuredClone(detached, { transfer: [detached] });
  assert.throws(() => copyDocumentBytes(detached, 8, 'Document'));
});
test('readonly admission은 초기 SHA와 own field를 검증하고 배포 문서는 명시 거부한다', async () => {
  const f = setup();
  const input = { bytes: f.input.bytes, wasm: f.input.wasm, sourceSha256: hash(f.input.bytes) };
  let opened = 0;
  const deps = {
    async openHwpx() {
      opened++;
      return { sectionCount: 1, sdk: {}, close() {} };
    },
  };
  await assert.rejects(
    openReadOnlyDocument({ ...input, sourceSha256: 'invalid' }, deps),
    /SourceSha256/,
  );
  assert.equal(opened, 0);
  let hooks = 0;
  const accessor = { ...input };
  Object.defineProperty(accessor, 'bytes', {
    get() {
      hooks++;
      return input.bytes;
    },
  });
  await assert.rejects(openReadOnlyDocument(accessor, deps), /ReadOnlyInput/);
  assert.equal(hooks, 0);
  const h5 = setup({ format: 'hwp5' });
  const primary = new Error('UnsupportedDistribution');
  await assert.rejects(
    openReadOnlyDocument(
      { bytes: h5.input.bytes, wasm: h5.input.wasm, sourceSha256: hash(h5.input.bytes) },
      {
        async openHwp5() {
          throw primary;
        },
      },
    ),
    (e) => e.message === 'UnsupportedDistributionDocument' && e.cause === primary,
  );
});
test('입장 실패와 렌더 실패에서도 닫기 오류가 원래 오류를 숨기지 않는다', async () => {
  let close = 0;
  const f = setup();
  await assert.rejects(
    openReadOnlyDocument(
      { ...f.input, sourceSha256: hash(f.input.bytes) },
      {
        async openHwpx() {
          return {
            sdk: {},
            sectionCount: 0,
            close() {
              close++;
            },
          };
        },
      },
    ),
    /ReadOnlyDocument/,
  );
  assert.equal(close, 1);
  const g = setup({ nodes: [10] });
  const primary = new Error('RenderFailed'),
    imageClose = new Error('ImageClose'),
    docClose = new Error('DocumentClose');
  g.deps.renderDocumentHTML = () => {
    throw primary;
  };
  g.state.closeErrors = { images: imageClose, document: docClose };
  await assert.rejects(
    exportDocumentHTML(g.input, g.deps),
    (e) =>
      e instanceof AggregateError &&
      e.errors[0] === primary &&
      e.errors[1] === imageClose &&
      e.errors[2] === docClose,
  );
  assert.deepEqual(g.state.closed, ['images', 'document']);
});
test('Native 구역 경계는 body·unplaced·warning·참조·상속에도 적용한다', async () => {
  for (const where of ['body', 'unplaced', 'warning', 'reference', 'inheritance']) {
    const f = setup({ nodes: where === 'reference' ? [10] : [] });
    f.state.beforeModel = (model) => {
      if (where === 'body') model.sections[0].body[0].source.section = 1;
      if (where === 'warning')
        model.warnings.push({ code: 'Bad', message: '범위 밖', source: { section: 1 } });
      if (where === 'inheritance')
        model.sections[0].header.inheritance = { state: 'observed', fromSection: 1 };
      if (where === 'unplaced')
        model.unplaced.push({
          block: {
            id: 'u:0',
            type: 'paragraph',
            displayText: '밖',
            source: { section: 1, paragraph: 1 },
            editability: 'unknown',
          },
          diagnostic: { code: 'Unplaced', message: '위치' },
        });
      if (where === 'reference') {
        const image = model.sections[0].body[1];
        image.sourceInfo.section = 1;
        image.reference = buildObjectReference({
          sourceSha256: model.sourceSha256,
          format: model.format,
          section: 1,
          kind: 'image',
          node: 10,
        });
      }
    };
    await assert.rejects(exportDocumentHTML(f.input, f.deps), /HtmlModelSourceMismatch/);
    assert.deepEqual(f.state.closed, ['document']);
  }
});
test('경고는 무음 절단 대신 코드·메시지 예산을 초과하면 닫고 실패한다', async () => {
  const f = setup();
  f.state.beforeModel = (m) => m.warnings.push({ code: 'x'.repeat(2049), message: '긴 코드' });
  await assert.rejects(exportDocumentHTML(f.input, f.deps), /HtmlWarningLimitExceeded/);
  assert.deepEqual(f.state.closed, ['document']);
});
