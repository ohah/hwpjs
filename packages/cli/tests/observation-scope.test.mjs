import test from 'node:test';
import assert from 'node:assert/strict';
import { collectHwpx } from '../../document/src/model/hwpx.ts';
test('document collector retains the same observations and captures its own scope method once', () => {
  const expected = collectHwpx({ sdk: {}, sectionCount: 2 });
  let reads = 0,
    callbacks = 0;
  const sdk = {};
  Object.defineProperty(sdk, 'withReadObservations', {
    get() {
      reads++;
      return function (section, callback) {
        assert.equal(this, sdk);
        callbacks++;
        return callback();
      };
    },
  });
  assert.deepEqual(collectHwpx({ sdk, sectionCount: 2 }), expected);
  assert.equal(reads, 1);
  assert.equal(callbacks, 2);
});
test('document scope keeps duplicate, omitted and substituted result guards', () => {
  for (const [scope, message] of [
    [(_section, _callback) => undefined, 'InvalidReadObservationScopeResult'],
    [
      (_section, callback) => {
        callback();
        return callback();
      },
      'DuplicateReadObservationCallback',
    ],
    [
      (_section, callback) => {
        callback();
        return {};
      },
      'InvalidReadObservationScopeResult',
    ],
  ])
    assert.throws(
      () => collectHwpx({ sdk: { withReadObservations: scope }, sectionCount: 1 }),
      new RegExp(message),
    );
});
