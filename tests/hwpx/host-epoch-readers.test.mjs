import test from 'node:test';
import assert from 'node:assert/strict';
import { HOST_EPOCH_KEYS, createHostEpochReaders } from '../../web/preview/host-epoch-readers.mjs';
const token = () => Object.freeze({});
test('두 host epoch 키는 own data descriptor와 원 host receiver를 공유한다', () => {
  assert.deepEqual(HOST_EPOCH_KEYS, ['geometryMeasurementEpoch', 'resourceProviderEpoch']);
  for (const key of HOST_EPOCH_KEYS) {
    const epoch = token();
    let calls = 0;
    const environment = {};
    Object.defineProperty(environment, key, {
      value: function () {
        assert.equal(this, environment);
        calls++;
        return epoch;
      },
      writable: true,
      configurable: true,
      enumerable: true,
    });
    const read = createHostEpochReaders(environment);
    assert.equal(read[key](), epoch);
    assert.equal(calls, 1);
    Object.defineProperty(environment, key, { enumerable: false });
    assert.equal(read[key](), null);
    assert.equal(calls, 1);
  }
});
test('missing/inherited/accessor/throwing host hooks는 token을 추측하거나 getter를 실행하지 않는다', () => {
  for (const key of HOST_EPOCH_KEYS) {
    assert.equal(createHostEpochReaders({})[key](), undefined);
    assert.equal(createHostEpochReaders(Object.create({ [key]: () => token() }))[key](), undefined);
    let calls = 0;
    const e = {};
    Object.defineProperty(e, key, {
      get() {
        calls++;
        throw Error('accessor');
      },
      configurable: true,
    });
    assert.equal(createHostEpochReaders(e)[key](), null);
    assert.equal(calls, 0);
    assert.equal(
      createHostEpochReaders({
        [key]: () => {
          throw Error('host');
        },
      })[key](),
      null,
    );
  }
});
