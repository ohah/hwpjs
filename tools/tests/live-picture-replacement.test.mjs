import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkedPictureReplacementOwner,
  checkedPictureReplacementSelector,
  copyPictureReplacementImage,
  createLivePictureReplacementApi,
} from '../../js/live-picture-replacement.mjs';
const makeOwner = (format = 'hwp5') => ({
  format,
  section: 0,
  pictureNode: 12,
  pictureIdentity: format === 'hwp5' ? 'node:12' : 'owned-picture',
  sourceSha256: Array(32).fill(1),
  resourceSha256: Array(32).fill(2),
  resourceLink: '7',
  historyRevision: 0,
  binding: { session: 's1', serial: '1' },
});
function fixture(format = 'hwp5', code = 1, createApi = createLivePictureReplacementApi) {
  const raw = makeOwner(format),
    calls = [],
    data = new Map();
  let ptr = 4,
    depth = 0,
    cleanup = false;
  const prefix = format + '_edit_';
  const memory = {
    withBytes(bytes, fn) {
      const p = ptr;
      ptr += bytes.length + 8;
      data.set(p, bytes.slice());
      depth++;
      let result;
      try {
        result = fn(p, bytes.length);
      } finally {
        depth--;
      }
      if (!depth && cleanup) throw Error('OuterCleanupFailed');
      return result;
    },
    error: () => Error('NativePictureRejected'),
  };
  const wasm = {
    [prefix + 'picture_replace_version']: () => 1,
    [prefix + 'picture_replace_owner']: (...args) => {
      calls.push({ query: args });
      return 1;
    },
    [prefix + 'replace_picture']: (p, n, ip, size) => {
      calls.push({
        owner: JSON.parse(new TextDecoder().decode(data.get(p))),
        image: [...data.get(ip)],
        size,
        n,
      });
      return code;
    },
  };
  const output = (action) => {
    if (action() !== 1) throw memory.error();
    return { bytes: new TextEncoder().encode(JSON.stringify(raw)) };
  };
  const api = createApi({ format, wasm, memory, output, check() {} });
  return {
    api,
    raw,
    calls,
    wasm,
    cleanup: () => {
      cleanup = true;
    },
    owner: () => api.pictureReplacementOwner({ section: 0, pictureNode: 12 }),
  };
}
for (const format of ['hwp5', 'hwpx'])
  test(format + ' live owner uses exact target and strips only its own JS scope', () => {
    const f = fixture(format),
      owner = f.owner();
    assert.ok(
      Object.isFrozen(owner) &&
        Object.isFrozen(owner.binding) &&
        Object.isFrozen(owner.sourceSha256),
    );
    assert.match(
      owner.binding.session,
      /^picture-replacement-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:s1$/i,
    );
    const input = new Uint8Array([3, 4]);
    assert.equal(f.api.replacePicture(owner, input).application, 'applied');
    assert.deepEqual(f.calls[0], { query: [0, 12] });
    assert.deepEqual(f.calls[1].owner, f.raw);
    assert.deepEqual(f.calls[1].image, [3, 4]);
    input[0] = 9;
    assert.deepEqual(f.calls[1].image, [3, 4]);
  });
test('same-module adapters cannot share owners with identical Native sessions', () => {
  const a = fixture(),
    b = fixture();
  const owner = a.owner();
  assert.throws(
    () => b.api.replacePicture(owner, new Uint8Array([1])),
    /ForeignPictureReplacementOwner/,
  );
  assert.equal(b.calls.length, 0);
});
for (const [code, application, changed] of [
  [0, 'unapplied', false],
  [1, 'applied', true],
  [2, 'unapplied', false],
  [3, 'unknown', null],
  [77, 'unknown', null],
])
  test('Native completion ' + code + ' is preserved without replay', () => {
    const f = fixture('hwp5', code),
      owner = f.owner();
    const result = f.api.replacePicture(owner, new Uint8Array([1]));
    assert.equal(result.application, application);
    assert.equal(result.changed, changed);
    assert.equal(f.calls.filter((x) => x.owner).length, 1);
  });
test('cleanup failure after an observed commit preserves applied and requires refresh', () => {
  const f = fixture(),
    owner = f.owner();
  f.cleanup();
  const result = f.api.replacePicture(owner, new Uint8Array([1]));
  assert.equal(result.application, 'applied');
  assert.equal(result.refreshRequired, true);
  assert.equal(result.cleanupError, 'OuterCleanupFailed');
});
test('old or wrong version exports cannot issue a live owner', () => {
  for (const change of [
    (f) => {
      delete f.wasm.hwp5_edit_picture_replace_owner;
    },
    (f) => {
      f.wasm.hwp5_edit_picture_replace_version = () => 2;
    },
  ]) {
    const f = fixture();
    change(f);
    assert.equal(f.api.supportsPictureReplacement(), false);
    assert.throws(f.owner, /PictureReplacementAbiUnavailable/);
    assert.equal(f.calls.length, 0);
  }
});
test('Native owner selectors are rebound after decoding', () => {
  for (const [key, value] of [
    ['section', 1],
    ['pictureNode', 13],
    ['format', 'hwpx'],
  ]) {
    const f = fixture();
    f.raw[key] = value;
    assert.throws(f.owner, /PictureReplacementBindingMismatch/);
  }
});
test('owner accepts decimal u64 max exactly but never numeric or overflowing serials', () => {
  const owner = makeOwner();
  owner.binding.serial = '18446744073709551615';
  assert.equal(checkedPictureReplacementOwner(owner).binding.serial, owner.binding.serial);
  for (const value of [1, '01', '-0', '18446744073709551616', '1.0']) {
    owner.binding.serial = value;
    assert.throws(() => checkedPictureReplacementOwner(owner));
  }
});
test('owner denies accessors symbols sparse hashes invalid unicode and wrong identity fields', () => {
  let read = false;
  const getter = makeOwner();
  Object.defineProperty(getter, 'resourceLink', {
    get() {
      read = true;
      return '7';
    },
  });
  assert.throws(() => checkedPictureReplacementOwner(getter));
  assert.equal(read, false);
  const symbol = makeOwner();
  symbol[Symbol('extra')] = true;
  assert.throws(() => checkedPictureReplacementOwner(symbol));
  for (const [key, value] of [
    ['pictureNode', -0],
    ['historyRevision', 2 ** 32],
    ['sourceSha256', Array(32)],
    ['resourceSha256', Array(32).fill(256)],
    ['pictureIdentity', '\ud800'],
    ['resourceLink', ''],
  ]) {
    assert.throws(() => checkedPictureReplacementOwner({ ...makeOwner(), [key]: value }));
  }
});
test('image copy is owned and bounded before the synchronous Native request', () => {
  const input = new Uint8Array([1, 2]);
  const owned = copyPictureReplacementImage(input);
  input.fill(9);
  assert.deepEqual([...owned], [1, 2]);
  assert.throws(() => copyPictureReplacementImage(new Uint8Array(8 * 1024 * 1024 + 1)));
});
test('physical picture selectors reject resize nodes and unexpected keys', () => {
  assert.deepEqual(checkedPictureReplacementSelector({ section: 0, pictureNode: 12 }), {
    section: 0,
    pictureNode: 12,
  });
  for (const input of [
    { section: 0, pictureNode: -0 },
    { section: 0, resizeRecordNode: 12 },
    { section: 0, pictureNode: 12, width: 100 },
  ])
    assert.throws(() => checkedPictureReplacementSelector(input));
});

test('independent module evaluations cannot replay another adapter owner', async () => {
  const first = await import('../../js/live-picture-replacement.mjs?picture-scope-first');
  const second = await import('../../js/live-picture-replacement.mjs?picture-scope-second');
  assert.notEqual(first, second);
  const a = fixture('hwp5', 1, first.createLivePictureReplacementApi);
  const b = fixture('hwp5', 1, second.createLivePictureReplacementApi);
  const foreign = a.owner();
  const own = b.owner();
  assert.notEqual(foreign.binding.session, own.binding.session);
  assert.throws(
    () => b.api.replacePicture(foreign, new Uint8Array([1])),
    /ForeignPictureReplacementOwner/,
  );
  assert.equal(b.calls.filter((x) => x.owner).length, 0);
  assert.equal(b.api.replacePicture(own, new Uint8Array([1])).application, 'applied');
  assert.equal(b.calls.filter((x) => x.owner).length, 1);
});
test('missing secure randomness disables the optional adapter without a counter fallback', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    const f = fixture();
    assert.equal(f.api.supportsPictureReplacement(), false);
    assert.throws(f.owner, /PictureReplacementAbiUnavailable/);
    assert.equal(f.calls.length, 0);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    else delete globalThis.crypto;
  }
});
