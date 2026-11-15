import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkedObjectGeometryObservation,
  checkedObjectGeometryPatch,
  checkedObjectGeometrySelector,
  objectGeometryMessage,
} from '../../js/object-geometry-edit.mjs';
const observation = () => ({
  format: 'hwpx',
  selector: { kind: 'chart', section: 0, node: 17 },
  owner: {
    ownerNode: 23,
    componentNode: null,
    paragraph: 2,
    anchorUnit: 0,
    sourceSha256: Array(32).fill(1),
    link: 'Chart/chart1.xml\nBinData/chart1.ole',
  },
  frame: {
    width: 30000,
    height: 20000,
    horizontalOffset: 0,
    verticalOffset: -20,
    treatAsCharacter: true,
  },
  editable: { size: true, position: true },
  reason: null,
  historyRevision: 2,
  binding: { session: 's1', serial: '0' },
});
test('own sparse geometry request copies native evidence and preserves untouched values', () => {
  const x = observation();
  const message = objectGeometryMessage(x, { horizontalOffset: 0, width: 40000 });
  x.owner.sourceSha256[0] = 99;
  x.frame.height = 1;
  assert.equal(message.request.owner.sourceSha256[0], 1);
  assert.equal(message.request.expected.height, 20000);
  assert.deepEqual(message.request.patch, { horizontalOffset: 0, width: 40000 });
});
test('selector and patch reject unknown fields rather than broad JSON mutation access', () => {
  assert.throws(() =>
    checkedObjectGeometrySelector({ kind: 'drawing', section: 0, node: 2, pictureNode: 3 }),
  );
  assert.throws(() => checkedObjectGeometryPatch({ width: 300, rotation: 0 }));
});
test('accessors are rejected before their callbacks can run', () => {
  let calls = 0;
  const bad = {};
  Object.defineProperty(bad, 'width', {
    enumerable: true,
    get() {
      calls++;
      return 42;
    },
  });
  assert.throws(() => checkedObjectGeometryPatch(bad));
  assert.equal(calls, 0);
});
test('size and offset use distinct native scalar domains', () => {
  for (const x of [0, -1, NaN, Infinity, 0x100000000, '12'])
    assert.throws(() => checkedObjectGeometryPatch({ width: x }));
  for (const x of [-0, -0x80000001, 0x80000000, 1.5, '0'])
    assert.throws(() => checkedObjectGeometryPatch({ verticalOffset: x }));
  assert.deepEqual(
    checkedObjectGeometryPatch({ verticalOffset: -0x80000000, horizontalOffset: 0x7fffffff }),
    { verticalOffset: -0x80000000, horizontalOffset: 0x7fffffff },
  );
});
test('unavailable native size never borrows position permission and vice versa', () => {
  const x = observation();
  x.editable.size = false;
  assert.throws(() => objectGeometryMessage(x, { width: 42 }), /WriteUnavailable/);
  assert.doesNotThrow(() => objectGeometryMessage(x, { horizontalOffset: 10 }));
  x.editable.position = false;
  assert.throws(() => objectGeometryMessage(x, { horizontalOffset: 10 }), /WriteUnavailable/);
});
test('source digest accessor or sparse arrays cannot execute during native observation validation', () => {
  for (const digest of [Array(32), Array(31).fill(0)]) {
    const x = observation();
    x.owner.sourceSha256 = digest;
    assert.throws(() => checkedObjectGeometryObservation(x));
  }
  let called = 0;
  const x = observation();
  Object.defineProperty(x.owner.sourceSha256, '0', {
    get() {
      called++;
      return 0;
    },
  });
  assert.throws(() => checkedObjectGeometryObservation(x));
  assert.equal(called, 0);
});
test('empty patch retains native proof rather than inventing an edited frame', () => {
  const x = observation();
  assert.deepEqual(objectGeometryMessage(x, {}).request.patch, {});
  assert.equal(checkedObjectGeometryObservation(x).historyRevision, 2);
});

test('inline/floating is explicit position intent, never inferred from an offset', () => {
  const x = observation();
  assert.deepEqual(objectGeometryMessage(x, { horizontalOffset: 10 }).request.patch, {
    horizontalOffset: 10,
  });
  assert.deepEqual(objectGeometryMessage(x, { treatAsCharacter: false }).request.patch, {
    treatAsCharacter: false,
  });
  x.editable.position = false;
  assert.throws(() => objectGeometryMessage(x, { treatAsCharacter: false }), /WriteUnavailable/);
});

test('native lifetime binding is mandatory and captured immutably', () => {
  const x = observation();
  const msg = objectGeometryMessage(x, { width: 42 });
  x.binding.session = 's2';
  assert.equal(msg.request.binding.session, 's1');
  delete x.binding;
  assert.throws(() => checkedObjectGeometryObservation(x));
});
