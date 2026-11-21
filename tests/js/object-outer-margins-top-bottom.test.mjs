import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedObjectOuterMarginsObservation } from '../../js/object-outer-margins.mjs';
import { ownObjectGeometryRecord } from '../../js/object-geometry-edit.mjs';
function observation() {
  return {
    geometry: {
      format: 'hwpx',
      selector: { kind: 'drawing', section: 0, node: 3 },
      owner: {
        ownerNode: 3,
        componentNode: null,
        paragraph: 0,
        anchorUnit: 0,
        sourceSha256: Array(32).fill(1),
        link: 'rect:owned',
      },
      frame: {
        width: 10,
        height: 20,
        horizontalOffset: 0,
        verticalOffset: 0,
        treatAsCharacter: false,
      },
      editable: { size: true, position: true },
      reason: null,
      historyRevision: 0,
      binding: { session: 'native-session', serial: '0' },
    },
    margins: { left: 720, right: 2160, top: 0, bottom: 0 },
  };
}
test('legacy SQUARE observation keeps exact two-field wire shape', () => {
  const value = checkedObjectOuterMarginsObservation(observation());
  assert.deepEqual(Object.keys(value), ['geometry', 'margins']);
  assert.deepEqual(ownObjectGeometryRecord(value, ['geometry', 'margins']), value);
});
test('new TOP observation restricts vertical axes and freezes the portable hint', () => {
  const value = checkedObjectOuterMarginsObservation({ ...observation(), verticalOnly: true });
  assert.equal(value.verticalOnly, true);
  assert.equal(Object.isFrozen(value), true);
  assert.deepEqual(value.margins, { left: 720, right: 2160, top: 0, bottom: 0 });
});
test('old strict SDK refuses new TOP observation instead of treating it as SQUARE', () => {
  assert.throws(() =>
    ownObjectGeometryRecord({ ...observation(), verticalOnly: true }, ['geometry', 'margins']),
  );
});
test('malformed or unknown restriction never becomes an accepted observation', () => {
  for (const verticalOnly of [false, null, 0, 1, 'true', undefined])
    assert.throws(() => checkedObjectOuterMarginsObservation({ ...observation(), verticalOnly }));
  assert.throws(() =>
    checkedObjectOuterMarginsObservation({ ...observation(), editableMargins: true }),
  );
});
test('accessor restriction does not execute or gain authority', () => {
  let called = 0;
  const value = observation();
  Object.defineProperty(value, 'verticalOnly', {
    enumerable: true,
    get() {
      called++;
      return true;
    },
  });
  assert.throws(() => checkedObjectOuterMarginsObservation(value));
  assert.equal(called, 0);
});
