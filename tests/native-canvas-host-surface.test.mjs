import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHostSurface } from '../packages/react-native/src/canvas/host-surface.mjs';
function host(protocol, version) {
  let reply;
  const calls = [];
  return {
    calls,
    resourceProtocol: protocol,
    setReplyHandler(fn) {
      reply = fn;
    },
    beginResources(...a) {
      calls.push(['begin', ...a]);
    },
    decodeImage(id) {
      queueMicrotask(() =>
        reply({ id, size: { width: 1, height: 1, ...(version === undefined ? {} : { version }) } }),
      );
    },
    releaseImage(...a) {
      calls.push(['release', ...a]);
    },
    dispose() {
      calls.push(['dispose']);
    },
  };
}
test('V2 문서 소유권과 release ticket 전달·close 한번', async () => {
  const h = host('hwpjs.native-image-resources/2', 9),
    s = createHostSurface(h);
  s.beginResources(300, 'docA');
  const b = await s.decodeImage(new Uint8Array([1]), { revision: 300 });
  b.close();
  b.close();
  assert.deepEqual(h.calls, [
    ['begin', 300, 'docA'],
    ['release', 'bitmap-1', 9],
  ]);
  s.dispose();
});
test('기존 host는 한 인자 계약을 보존한다', async () => {
  const h = host(undefined, undefined),
    s = createHostSurface(h);
  s.beginResources(2, 'docA');
  const b = await s.decodeImage(new Uint8Array([1]), { revision: 2 });
  b.close();
  assert.deepEqual(h.calls, [
    ['begin', 2],
    ['release', 'bitmap-1'],
  ]);
  s.dispose();
});
test('명시 V2인데 version이 잘못되면 추정하지 않는다', async () => {
  const h = host('hwpjs.native-image-resources/2', 0),
    s = createHostSurface(h);
  await assert.rejects(
    s.decodeImage(new Uint8Array([1]), { revision: 2 }),
    /InvalidNativeBitmapVersion/,
  );
  assert.deepEqual(h.calls, [['release', 'bitmap-1']]);
  s.dispose();
});
test('모르는 명시 protocol은 legacy로 추정하지 않는다', () =>
  assert.throws(
    () => createHostSurface(host('hwpjs.native-image-resources/3', 1)),
    /NativeImageResourceProtocolMismatch/,
  ));
test('수명 중 capability DTO를 바꿔도 release ticket 계약은 바뀌지 않는다', async () => {
  const h = host('hwpjs.native-image-resources/2', 9),
    s = createHostSurface(h);
  const b = await s.decodeImage(new Uint8Array([1]), { revision: 2 });
  h.resourceProtocol = undefined;
  b.close();
  assert.deepEqual(h.calls, [['release', 'bitmap-1', 9]]);
  s.dispose();
});
