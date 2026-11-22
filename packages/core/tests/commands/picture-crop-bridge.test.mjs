import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPictureCropEditApi,
  checkedPictureCropCapture,
  pictureCropObservation,
} from '../../../../js/picture-crop-edit.mjs';
const rect = { left: 101, top: 207, right: 3101, bottom: 1807 };
function fixture(format = 'hwpx') {
  const prefix = format === 'hwpx' ? 'hwpx_edit' : 'hwp5_edit';
  let next = 0,
    current,
    output,
    bytes,
    allocateFailure = false,
    freeFailure = false;
  const calls = [];
  const observation = () => ({
    profileVersion: 1,
    format,
    section: 0,
    pictureNode: 7,
    leaseKey: current,
    crop: { left: 0, top: 0, right: 4800, bottom: 2400 },
    bounds: { width: 4800, height: 2400, basis: 'explicit_pair' },
    historyRevision: 0,
  });
  let override;
  const wasm = {
    [`${prefix}_picture_crop_edit_version`]: () => 1,
    [`${prefix}_picture_crop_edit_capture`]() {
      current = String(++next);
      output = new TextEncoder().encode(override ?? JSON.stringify(observation()));
      return 1;
    },
    [`${prefix}_picture_crop_edit_commit`]() {
      const p = JSON.parse(new TextDecoder().decode(bytes));
      calls.push(p);
      if (p.leaseKey !== current) return 0;
      current = undefined;
      return 1;
    },
    [`${prefix}_picture_crop_edit_release`]() {
      const p = JSON.parse(new TextDecoder().decode(bytes));
      calls.push({ release: p.leaseKey });
      if (p.leaseKey !== current) return 0;
      current = undefined;
      return 1;
    },
    [`${prefix}_output_ptr`]: () => 1,
    [`${prefix}_output_len`]: () => output.length,
    [`${prefix}_output_free`]() {
      if (freeFailure) throw Error('OutputFreeFailed');
    },
  };
  const memory = {
    copy: () => output.slice(),
    error: () => Error('NativeRefused'),
    withBytes(data, fn) {
      if (allocateFailure) throw Error('AllocationFailed');
      bytes = data;
      return fn(1, data.length);
    },
  };
  const api = createPictureCropEditApi({ wasm, memory, check() {}, prefix });
  return {
    api,
    wasm,
    calls,
    observation,
    read: () => api.capturePictureCrop({ section: 0, pictureNode: 7 }),
    key: () => current,
    allocation(value) {
      allocateFailure = value;
    },
    freeFail() {
      freeFailure = true;
    },
    output(value) {
      override = value;
    },
  };
}
for (const format of ['hwp5', 'hwpx'])
  test(`${format} optional four-export gate and asymmetric named coordinate write`, () => {
    const f = fixture(format);
    assert(f.api.supportsPictureCropEdit());
    const o = f.read();
    assert(!('leaseKey' in pictureCropObservation(o)));
    const result = f.api.commitPictureCrop({ leaseKey: o.leaseKey, crop: rect });
    assert.equal(result.nativeCode, 1);
    assert.deepEqual(f.calls[0], { leaseKey: '1', crop: rect });
    assert.equal(f.key(), undefined);
    assert.throws(() => f.api.commitPictureCrop({ leaseKey: o.leaseKey, crop: rect }), /Stale/);
  });
test('old and partially upgraded modules refuse without capture or output calls', () => {
  const f = fixture();
  delete f.wasm.hwpx_edit_picture_crop_edit_commit;
  assert.equal(f.api.supportsPictureCropEdit(), false);
  assert.throws(f.read, /Unavailable/);
  assert.equal(f.key(), undefined);
});
test('host malformed rectangle preserves lease for subsequent valid commit', () => {
  const f = fixture(),
    o = f.read();
  assert.throws(
    () => f.api.commitPictureCrop({ leaseKey: o.leaseKey, crop: { ...rect, left: -1 } }),
    /Invalid/,
  );
  assert.equal(f.key(), '1');
  assert.equal(f.calls.length, 0);
  assert.equal(f.api.commitPictureCrop({ leaseKey: o.leaseKey, crop: rect }).nativeCode, 1);
});
test('allocation failure before dispatch preserves lease for valid retry or exact release', () => {
  for (const action of ['commit', 'release']) {
    const f = fixture(),
      o = f.read();
    f.allocation(true);
    assert.throws(
      () => f.api.commitPictureCrop({ leaseKey: o.leaseKey, crop: rect }),
      /Allocation/,
    );
    assert.equal(f.key(), '1');
    f.allocation(false);
    if (action === 'commit')
      assert.equal(f.api.commitPictureCrop({ leaseKey: o.leaseKey, crop: rect }).nativeCode, 1);
    else f.api.releasePictureCrop(o.leaseKey);
    assert.equal(f.key(), undefined);
  }
});
test('foreign and stale keys do not consume the current matching lease', () => {
  const f = fixture(),
    a = f.read(),
    b = f.read();
  assert.throws(() => f.api.commitPictureCrop({ leaseKey: a.leaseKey, crop: rect }), /Stale/);
  assert.throws(() => f.api.releasePictureCrop(a.leaseKey), /NativeRefused/);
  assert.equal(f.key(), b.leaseKey);
  assert.equal(f.api.commitPictureCrop({ leaseKey: b.leaseKey, crop: rect }).nativeCode, 1);
});
test('owner mismatch with canonical key releases exact Native lease and preserves primary error', () => {
  const f = fixture();
  f.output(JSON.stringify({ ...f.observation(), leaseKey: '1', pictureNode: 99 }));
  assert.throws(f.read, /OwnerMismatch/);
  assert.equal(f.key(), undefined);
  assert.deepEqual(f.calls, [{ release: '1' }]);
});
test('bad schema with known key releases but malformed key is quarantined until next capture', () => {
  const f = fixture();
  f.output(
    JSON.stringify({
      ...f.observation(),
      leaseKey: '1',
      bounds: { width: 0, height: 2, basis: 'explicit_pair' },
    }),
  );
  assert.throws(f.read, /Invalid/);
  assert.equal(f.key(), undefined);
  const g = fixture();
  g.output('{');
  assert.throws(g.read);
  assert.equal(g.key(), '1');
  assert.throws(() => g.api.commitPictureCrop({ leaseKey: '1', crop: rect }), /Stale/);
  g.output(undefined);
  const o = g.read();
  assert.equal(o.leaseKey, '2');
  g.api.releasePictureCrop(o.leaseKey);
  assert.equal(g.key(), undefined);
});
test('output-free failure releases canonical lease and never publishes local authority', () => {
  const f = fixture();
  f.freeFail();
  assert.throws(f.read, /OutputFree/);
  assert.equal(f.key(), undefined);
  assert.throws(() => f.api.commitPictureCrop({ leaseKey: '1', crop: rect }), /Stale/);
});
test('Native no-op and refusal consume matching local lease but retain classified outcome', () => {
  for (const code of [0, 2, 3]) {
    const f = fixture(),
      o = f.read();
    f.wasm.hwpx_edit_picture_crop_edit_commit = () => code;
    const r = f.api.commitPictureCrop({ leaseKey: o.leaseKey, crop: rect });
    assert.equal(r.nativeCode, code);
    assert.equal(r.application, code === 3 ? 'unknown' : 'unapplied');
    assert.throws(() => f.api.commitPictureCrop({ leaseKey: o.leaseKey, crop: rect }), /Stale/);
  }
});
test('signed original observation and wide HX bounds survive without normalization', () => {
  const f = fixture(),
    o = f.read();
  const value = checkedPictureCropCapture({
    ...o,
    crop: { ...o.crop, left: -3 },
    bounds: { width: 4294967295, height: 2400, basis: 'absent_75_policy' },
  });
  assert.equal(value.crop.left, -3);
  assert.equal(value.bounds.width, 4294967295);
});
test('invalid host capture selector preserves the existing lease without calling Native', () => {
  const f = fixture(),
    o = f.read();
  assert.throws(() => f.api.capturePictureCrop({ section: -1, pictureNode: 7 }));
  assert.equal(f.key(), o.leaseKey);
  assert.equal(f.api.commitPictureCrop({ leaseKey: o.leaseKey, crop: rect }).nativeCode, 1);
});
test('release allocation failure preserves local lease for a subsequent valid commit', () => {
  const f = fixture(),
    o = f.read();
  f.allocation(true);
  assert.throws(() => f.api.releasePictureCrop(o.leaseKey), /Allocation/);
  f.allocation(false);
  assert.equal(f.api.commitPictureCrop({ leaseKey: o.leaseKey, crop: rect }).nativeCode, 1);
});
test('capture cleanup errors cannot replace primary owner mismatch', () => {
  const f = fixture();
  f.output(JSON.stringify({ ...f.observation(), leaseKey: '1', pictureNode: 99 }));
  f.freeFail();
  f.allocation(true);
  assert.throws(f.read, (error) => {
    assert.match(error.message, /OwnerMismatch/);
    assert.match(error.cropOutputFreeError, /OutputFree/);
    assert.match(error.cropReleaseError, /Allocation/);
    return true;
  });
  assert.throws(() => f.api.commitPictureCrop({ leaseKey: '1', crop: rect }), /Stale/);
});
