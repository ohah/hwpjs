import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exportDocumentHTML, HTML_EXPORT_LIMITS } from '../../packages/document/src/export-html.ts';
import { openReadOnlyDocument } from '../../packages/document/src/read-document.ts';
import { renderDocumentHTML } from '../../packages/document/src/render-html.ts';
import { buildObjectReference } from '../../packages/document/src/object-reference.ts';

const source = () => new Uint8Array([80, 75, 3, 4]);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const sourceSha256 = sha(source());
const reference = (node) =>
  buildObjectReference({ sourceSha256, format: 'hwpx', section: 0, kind: 'image', node });
const area = () => ({
  declarations: 'known',
  definitions: [],
  inheritance: { state: 'not-applicable' },
});
const image = (node) => ({
  id: `image-${node}`,
  type: 'image',
  reference: reference(node),
  sourceInfo: { section: 0, pictureNode: node },
  altState: 'provided',
  alt: '<원본>',
});
const model = (body) => ({
  version: 1,
  format: 'hwpx',
  sourceSha256,
  sections: [{ id: 's0', source: { section: 0 }, header: area(), body, footer: area() }],
  unplaced: [],
  warnings: [],
  coverage: { inventoryComplete: true },
});
const png = (node, length = 9) => {
  const value = new Uint8Array(length).fill(node);
  value.set([137, 80, 78, 71, 13, 10, 26, 10]);
  return value;
};
function fixture({ nodes = [], alias = false, imageLength = 9 } = {}) {
  const state = { read: [], closed: [], opened: [] };
  const view = model(nodes.map(image));
  const rows = nodes.map((node) => ({
    id: `hwpx:s0:i${node}`,
    source: { section: 0, pictureNode: node },
    resourceKey: alias ? 'source:0:10' : `source:0:${node}`,
  }));
  const input = { bytes: source(), wasm: new Uint8Array([1, 2]), fragment: true };
  const deps = {
    async openDocument(value) {
      state.opened.push(value);
      return {
        format: 'hwpx',
        sourceSha256,
        sectionCount: 1,
        sdk: {},
        close() {
          state.closed.push('document');
        },
      };
    },
    async readDocumentModel() {
      return view;
    },
    createDocumentImages() {
      return {
        list: () => ({ version: 1, format: 'hwpx', sourceSha256, images: rows }),
        read(id) {
          state.read.push(id);
          const node = Number(id.split(':i')[1]);
          return {
            ...rows.find((row) => row.id === id),
            sourceSha256,
            recognized: true,
            mime: 'image/png',
            bytes: png(node, imageLength),
          };
        },
        close() {
          state.closed.push('images');
        },
      };
    },
  };
  return { state, view, input, deps };
}

test('HTML exporter는 첫 await 전에 호출자 원문과 WASM을 분리한다', async () => {
  const f = fixture();
  const pending = exportDocumentHTML(f.input, f.deps);
  f.input.bytes.fill(99);
  f.input.wasm.fill(99);
  const result = await pending;
  assert.equal(result.sourceSha256, sourceSha256);
  assert.deepEqual(f.state.opened[0].bytes, source());
  assert.deepEqual(f.state.opened[0].wasm, new Uint8Array([1, 2]));
  assert.deepEqual(f.state.closed, ['document']);
});

test('읽기 admission은 비동기 중 입력 bytes·WASM·SHA 변경을 승계하지 않는다', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const input = { bytes: source(), wasm: new Uint8Array([1, 2]), sourceSha256 };
  let supplied;
  const pending = openReadOnlyDocument(input, {
    async openHwpx(wasm, bytes) {
      supplied = { wasm, bytes };
      await gate;
      return { sectionCount: 1, sdk: {}, close() {} };
    },
  });
  input.bytes.fill(99);
  input.wasm.fill(99);
  input.sourceSha256 = 'b'.repeat(64);
  release();
  let document;
  try {
    document = await pending;
    assert.equal(document.sourceSha256, sourceSha256);
    assert.deepEqual(supplied.bytes, source());
    assert.deepEqual(supplied.wasm, new Uint8Array([1, 2]));
  } finally {
    await document?.close();
  }
});

test('서로 다른 HWPX 이미지에 거짓 resourceKey alias로 같은 바이트를 붙이지 않는다', async () => {
  const f = fixture({ nodes: [10, 11], alias: true });
  let result;
  try {
    result = await exportDocumentHTML(f.input, f.deps);
  } catch {
    assert.deepEqual(f.state.closed, ['images', 'document']);
    return;
  }
  // 거부하거나 각 실제 바이트를 읽어야 하며, 두 번째 이미지를 첫 이미지로 위장하지 않습니다.
  assert.deepEqual(f.state.read, ['hwpx:s0:i10', 'hwpx:s0:i11']);
  assert(result.html.includes(Buffer.from(png(11)).toString('base64')));
});

test('현재 Native 문서의 구역 수 밖 모델을 정상 HTML로 반환하지 않는다', async () => {
  const f = fixture();
  f.view.sections[0].source.section = 1;
  await assert.rejects(exportDocumentHTML(f.input, f.deps));
  assert.deepEqual(f.state.closed, ['document']);
});

test('정상 이미지 base64의 8190바이트 경계·서로 다른 byte membership를 보존한다', async () => {
  const f = fixture({ nodes: [10, 11], imageLength: 8191 });
  const result = await exportDocumentHTML(f.input, f.deps);
  for (const node of [10, 11])
    assert(
      result.html.includes(
        'data:image/png;base64,' + Buffer.from(png(node, 8191)).toString('base64'),
      ),
    );
  assert.deepEqual(f.state.read, ['hwpx:s0:i10', 'hwpx:s0:i11']);
  assert.deepEqual(f.state.closed, ['images', 'document']);
  assert(result.html.includes('&lt;원본&gt;'));
});

test('UTF8 바이트 출력 예산은 UTF16 문자 수와 별도로 지키고 실패 뒤 문서를 닫는다', async () => {
  const f = fixture();
  f.deps.renderDocumentHTML = () => '가'.repeat(Math.ceil(HTML_EXPORT_LIMITS.outputBytes / 3));
  await assert.rejects(exportDocumentHTML(f.input, f.deps), /HtmlOutputByteLimitExceeded/);
  assert.deepEqual(f.state.closed, ['document']);
});

test('HTML renderer는 미관측 reference의 data URI를 거부하고 원문 HTML을 escape한다', () => {
  const view = model([
    {
      id: 'p0',
      type: 'paragraph',
      displayText: '<script>원문</script>',
      source: { section: 0, paragraph: 1 },
      editability: 'unknown',
    },
  ]);
  assert.throws(
    () =>
      renderDocumentHTML(view, {
        imageData: new Map([[reference(99), 'data:image/png;base64,iVBORw0KGgo=']]),
      }),
    /InvalidHtmlImageReference/,
  );
  assert.match(renderDocumentHTML(view), /&lt;script&gt;원문&lt;\/script&gt;/);
});
