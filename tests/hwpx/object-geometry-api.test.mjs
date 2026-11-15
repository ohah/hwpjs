import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectGeometryApi } from '../../js/object-geometry-api.mjs';
import { objectGeometryMessage } from '../../js/object-geometry-edit.mjs';
const observation = () => ({
  format: 'hwpx',
  selector: { kind: 'chart', section: 0, node: 17 },
  owner: {
    ownerNode: 23,
    componentNode: 19,
    paragraph: 0,
    anchorUnit: 0,
    sourceSha256: Array(32).fill(1),
    link: 'chart:4:path1:x',
  },
  frame: {
    width: 30000,
    height: 20000,
    horizontalOffset: 0,
    verticalOffset: 0,
    treatAsCharacter: true,
  },
  editable: { size: true, position: true },
  reason: null,
  historyRevision: 2,
  binding: { session: 's1', serial: '7' },
});
function harness() {
  let source = observation(),
    payload,
    code = 1,
    freed = 0,
    cleanup = false;
  const writes = [];
  const wasm = {
    hwpx_edit_object_geometry() {
      return 1;
    },
    hwpx_edit_set_object_geometry() {
      writes.push(payload);
      return code;
    },
    hwpx_edit_output_ptr() {
      return 0;
    },
    hwpx_edit_output_len() {
      return new TextEncoder().encode(JSON.stringify(source)).length;
    },
    hwpx_edit_output_free() {
      freed++;
    },
  };
  const memory = {
    copy() {
      return new TextEncoder().encode(JSON.stringify(source));
    },
    error() {
      return Error('NativeGeometryRejected');
    },
    withBytes(bytes, callback) {
      payload = JSON.parse(new TextDecoder().decode(bytes));
      const result = callback(0, bytes.length);
      if (cleanup) throw Error('NativeCleanupFailed');
      return result;
    },
  };
  const api = createObjectGeometryApi({ wasm, memory, check() {} });
  return {
    api,
    writes,
    get source() {
      return source;
    },
    set source(value) {
      source = value;
    },
    set code(value) {
      code = value;
    },
    set cleanup(value) {
      cleanup = value;
    },
    get freed() {
      return freed;
    },
    create: () => createObjectGeometryApi({ wasm, memory, check() {} }),
  };
}
test('facade keeps actual Native owner evidence and strips only its private instance scope at write', () => {
  const h = harness(),
    before = h.api.objectGeometry(h.source.selector);
  assert.notEqual(before.binding.session, 's1');
  const out = h.api.setObjectGeometry(objectGeometryMessage(before, { width: 40000 }).request);
  assert.equal(out.application, 'applied');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].binding.session, 's1');
  assert.equal(h.writes[0].expected.width, 30000);
  assert.deepEqual(h.writes[0].patch, { width: 40000 });
  assert.equal(h.freed, 2);
});
test('different facade instance and reopened Native document cannot reuse old geometry observation', () => {
  const h = harness(),
    before = h.api.objectGeometry(h.source.selector),
    r = objectGeometryMessage(before, { width: 42 }).request;
  assert.equal(h.create().setObjectGeometry(r).application, 'unapplied');
  h.source = { ...h.source, binding: { session: 's2', serial: '7' } };
  assert.equal(h.api.setObjectGeometry(r).application, 'unapplied');
  assert.equal(h.writes.length, 0);
});
test('same frame after Native ABA revision/serial still rejects stale authority', () => {
  for (const update of [{ historyRevision: 4 }, { binding: { session: 's1', serial: '9' } }]) {
    const h = harness(),
      before = h.api.objectGeometry(h.source.selector);
    h.source = { ...h.source, ...update };
    assert.equal(
      h.api.setObjectGeometry(objectGeometryMessage(before, { width: 42 }).request).application,
      'unapplied',
    );
    assert.equal(h.writes.length, 0);
  }
});
test('owner/link/hash/current frame mismatch drops mutation before native writer', () => {
  for (const change of [
    (x) => x.owner.sourceSha256[0]++,
    (x) => (x.owner.link += 'x'),
    (x) => x.owner.anchorUnit++,
    (x) => x.frame.width++,
  ]) {
    const h = harness(),
      before = h.api.objectGeometry(h.source.selector);
    change(h.source);
    assert.equal(
      h.api.setObjectGeometry(objectGeometryMessage(before, { width: 42 }).request).application,
      'unapplied',
    );
    assert.equal(h.writes.length, 0);
  }
});
test('fresh size/position protection is independent and no preview can grant permission', () => {
  const h = harness(),
    before = h.api.objectGeometry(h.source.selector);
  h.source.editable.size = false;
  assert.equal(
    h.api.setObjectGeometry(objectGeometryMessage(before, { width: 42 }).request).application,
    'unapplied',
  );
  assert.equal(h.writes.length, 0);
  assert.equal(
    h.api.setObjectGeometry(objectGeometryMessage(before, { horizontalOffset: -5 }).request)
      .application,
    'applied',
  );
});
test('request getters are rejected before any fresh native observation is requested', () => {
  const h = harness(),
    before = h.api.objectGeometry(h.source.selector),
    r = { ...objectGeometryMessage(before, { width: 42 }).request };
  let calls = 0;
  Object.defineProperty(r, 'expected', {
    get() {
      calls++;
      return before.frame;
    },
  });
  assert.throws(() => h.api.setObjectGeometry(r));
  assert.equal(calls, 0);
  assert.equal(h.freed, 1);
});
test('primitive native rejection/noop/unknown and cleanup-after-commit retain exact completion', () => {
  for (const [code, application] of [
    [0, 'unapplied'],
    [2, 'unapplied'],
    [3, 'unknown'],
  ]) {
    const h = harness(),
      before = h.api.objectGeometry(h.source.selector);
    h.code = code;
    assert.equal(
      h.api.setObjectGeometry(objectGeometryMessage(before, { width: 42 }).request).application,
      application,
    );
    assert.equal(h.writes.length, 1);
  }
  const h = harness(),
    before = h.api.objectGeometry(h.source.selector);
  h.cleanup = true;
  const out = h.api.setObjectGeometry(objectGeometryMessage(before, { width: 42 }).request);
  assert.equal(out.application, 'applied');
  assert.equal(out.cleanupError, 'NativeCleanupFailed');
  assert.equal(h.writes.length, 1);
});
test('object key insertion order cannot reject an otherwise exact current native frame', () => {
  const h = harness(),
    before = h.api.objectGeometry(h.source.selector),
    request = objectGeometryMessage(before, { width: 42 }).request;
  assert.equal(
    h.api.setObjectGeometry({
      ...request,
      expected: Object.fromEntries(Object.entries(request.expected).reverse()),
      owner: Object.fromEntries(Object.entries(request.owner).reverse()),
    }).application,
    'applied',
  );
});
