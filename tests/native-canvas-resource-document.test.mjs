import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeResourceDocument } from '../packages/react-native/src/canvas/resource-document.mjs';
import { createPictureResources } from '../web/preview/picture-resources.mjs';
const content = (documentId = 'A', generation = 1, operationRevision = 0) => ({
  format: 'hwp5',
  nativeRevision: operationRevision,
  canvasObservationToken: { editorId: 'editor', documentId, generation, operationRevision },
});
test('편집/undo/redo revision은 실제 문서 identity를 바꾸지 않는다', () =>
  assert.equal(
    nativeResourceDocument(content('A', 1, 0)),
    nativeResourceDocument(content('A', 1, 300)),
  ));
test('문서 A/B/A와 generation 및 포맷은 분리한다', () => {
  const a = content();
  assert.notEqual(nativeResourceDocument(a), nativeResourceDocument(content('B')));
  assert.notEqual(nativeResourceDocument(a), nativeResourceDocument(content('A', 2)));
  assert.notEqual(nativeResourceDocument(a), nativeResourceDocument({ ...a, format: 'hwpx' }));
});
test('원본 문서 binding 누락은 추정하지 않는다', () =>
  assert.throws(
    () => nativeResourceDocument({ format: 'hwp5' }),
    /NativeCanvasDocumentIdentityRequired/,
  ));
test('실제 resource manager는 같은 bytes 재사용과 교체/문서변경 해제를 구분한다', async () => {
  let value = 1,
    decodes = 0,
    closes = 0;
  const resources = createPictureResources({
    read: async () => new Uint8Array([value]),
    decode: async () => ({
      width: 1,
      height: 1,
      close() {
        closes++;
      },
      id: ++decodes,
    }),
  });
  await resources.load(0, 1);
  resources.refresh();
  await resources.load(0, 1);
  assert.equal(decodes, 1);
  value = 2;
  resources.refresh();
  await resources.load(0, 1);
  assert.equal(decodes, 2);
  assert.equal(closes, 1);
  resources.clear();
  await resources.load(0, 1);
  assert.equal(decodes, 3);
  resources.close();
  assert.equal(closes, 3);
});
test('늦은 문서 A decode는 문서 B frame에 들어가지 않고 해제한다', async () => {
  let release;
  let closes = 0;
  const resources = createPictureResources({
    read: async () => new Uint8Array([1]),
    decode: () =>
      new Promise(
        (r) =>
          (release = () =>
            r({
              width: 1,
              height: 1,
              close() {
                closes++;
              },
            })),
      ),
  });
  const old = resources.load(0, 1);
  await new Promise((r) => setImmediate(r));
  resources.clear();
  release();
  await old;
  assert.equal(closes, 1);
  assert.equal(resources.stats().entries, 0);
  resources.close();
});
test('250ms를 넘는 정상 decode도 budget 예약을 유지하고 결국 완료한다', async () => {
  let closes = 0;
  const resources = createPictureResources({
    read: async () => new Uint8Array([1]),
    decode: async () => {
      await new Promise((r) => setTimeout(r, 300));
      return {
        width: 1,
        height: 1,
        close() {
          closes++;
        },
      };
    },
    maxConcurrent: 1,
    maxTotalBytes: 1,
    maxEncodedBytes: 1,
    maxPixels: 1,
    maxTotalPixels: 1,
  });
  const job = resources.load(0, 1);
  await new Promise((r) => setTimeout(r, 270));
  assert.equal(resources.encodedStats().bytes, 1);
  assert.equal(resources.get(0, 1).error, null);
  await job;
  assert(resources.get(0, 1).bitmap);
  resources.close();
  assert.equal(closes, 1);
  assert.equal(resources.encodedStats().bytes, 0);
});
test('실제 decoder 거부는 오류로 남는다', async () => {
  const resources = createPictureResources({
    read: async () => new Uint8Array([1]),
    decode: async () => {
      throw Error('ImageDecodeRejected');
    },
  });
  await resources.load(0, 1);
  assert.equal(resources.get(0, 1).error, 'ImageDecodeRejected');
  resources.close();
});
test('같은 bytes라도 decode 효과 identity가 바뀌면 교체한다', async () => {
  let effect = 'A',
    decodes = 0,
    closes = 0;
  const resources = createPictureResources({
    read: async () => new Uint8Array([1]),
    decodeIdentity: () => effect,
    decode: async () => ({
      width: 1,
      height: 1,
      close() {
        closes++;
      },
      serial: ++decodes,
    }),
  });
  await resources.load(0, 1);
  effect = 'B';
  resources.refresh();
  await resources.load(0, 1);
  assert.equal(decodes, 2);
  assert.equal(closes, 1);
  resources.close();
  assert.equal(closes, 2);
});
test('동일 문서 동일 source ID: 새 decode 먼저·옛 decode 나중에도 새 bitmap 유지', async () => {
  let value = 1;
  const finish = [];
  const closed = [];
  const resources = createPictureResources({
    read: async () => new Uint8Array([value]),
    decode: () => new Promise((r) => finish.push(r)),
  });
  const older = resources.load(0, 1);
  await new Promise((r) => setImmediate(r));
  value = 2;
  resources.refresh();
  const newer = resources.load(0, 1);
  await new Promise((r) => setImmediate(r));
  finish[1]({
    id: 'new',
    width: 1,
    height: 1,
    close() {
      closed.push('new');
    },
  });
  await newer;
  finish[0]({
    id: 'old',
    width: 1,
    height: 1,
    close() {
      closed.push('old');
    },
  });
  await older;
  assert.equal(resources.get(0, 1).bitmap.id, 'new');
  assert.deepEqual(closed, ['old']);
  resources.close();
  assert.deepEqual(closed, ['old', 'new']);
});
