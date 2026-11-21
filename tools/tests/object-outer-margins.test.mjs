import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createObjectOuterMarginsApi,
  checkedObjectOuterMargins,
  checkedObjectOuterMarginsRequest,
} from '../../js/object-outer-margins.mjs';
const margins = { left: 0, right: 1, top: 2, bottom: 32767 };
function fixture(code = 1, create = createObjectOuterMarginsApi) {
  const observation = {
    geometry: {
      format: 'hwpx',
      selector: { kind: 'drawing', section: 2, node: 17 },
      owner: {
        ownerNode: 17,
        componentNode: null,
        paragraph: 3,
        anchorUnit: 1,
        sourceSha256: Array(32).fill(255),
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
      historyRevision: 4,
      binding: { session: 'native-session', serial: '18446744073709551615' },
    },
    margins,
  };
  const calls = [];
  let bytes = new TextEncoder().encode(JSON.stringify(observation)),
    free = 0,
    cleanup = false;
  const memory = {
    copy: () => bytes.slice(),
    error: () => Error('NativeRefused'),
    withBytes(value, fn) {
      calls.push(JSON.parse(new TextDecoder().decode(value)));
      const result = fn(16, value.length);
      if (cleanup) throw Error('CleanupFailed');
      return result;
    },
  };
  const wasm = {
    hwpx_edit_object_outer_margins_version: () => 1,
    hwpx_edit_object_outer_margins: () => 1,
    hwpx_edit_set_object_outer_margins: () => code,
    hwpx_edit_output_ptr: () => 32,
    hwpx_edit_output_len: () => bytes.length,
    hwpx_edit_output_free: () => {
      free++;
    },
  };
  const api = create({ wasm, memory, check() {} });
  const read = () => api.objectOuterMargins({ kind: 'drawing', section: 2, node: 17 });
  const request = () => {
    const o = read(),
      g = o.geometry;
    return {
      geometry: {
        selector: g.selector,
        owner: g.owner,
        expected: g.frame,
        historyRevision: g.historyRevision,
        binding: g.binding,
        patch: {},
      },
      expectedMargins: o.margins,
      margins: { ...margins, left: 5 },
    };
  };
  return {
    api,
    wasm,
    calls,
    observation,
    read,
    request,
    free: () => free,
    replaceBytes(v) {
      bytes = v;
    },
    cleanup() {
      cleanup = true;
    },
  };
}
test('independent margin owner reads exact selector and writes one transaction with raw Native binding', () => {
  const f = fixture();
  const r = f.request();
  assert.match(r.geometry.binding.session, /^outer-margins:/);
  const result = f.api.setObjectOuterMargins(r);
  assert.equal(result.application, 'applied');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].geometry.binding.session, 'native-session');
  assert.equal(f.calls[0].geometry.binding.serial, '18446744073709551615');
  assert.deepEqual(f.calls[0].margins, { ...margins, left: 5 });
  assert.deepEqual(f.calls[0].geometry.patch, {});
  assert.equal(f.free(), 1);
});
for (const code of [0, 1, 2, 3, 77])
  test(`margin completion ${code} retains atomic classification without retry`, () => {
    const f = fixture(code),
      r = f.api.setObjectOuterMargins(f.request());
    assert.equal(
      r.application,
      code === 1 ? 'applied' : code === 3 || code === 77 ? 'unknown' : 'unapplied',
    );
    assert.equal(f.calls.length, 1);
  });
test('post-commit cleanup failure preserves applied outcome', () => {
  const f = fixture(),
    r = f.request();
  f.cleanup();
  const result = f.api.setObjectOuterMargins(r);
  assert.equal(result.application, 'applied');
  assert.equal(result.cleanupError, 'CleanupFailed');
  assert.equal(f.calls.length, 1);
});
test('legacy or partially available ABI cannot mint a margin owner', () => {
  for (const key of [
    'hwpx_edit_object_outer_margins_version',
    'hwpx_edit_object_outer_margins',
    'hwpx_edit_set_object_outer_margins',
  ]) {
    const f = fixture();
    delete f.wasm[key];
    assert.equal(f.api.supportsObjectOuterMargins(), false);
    assert.throws(f.read, /ObjectOuterMarginsAbiUnavailable/);
    assert.equal(f.calls.length, 0);
    assert.equal(f.free(), 0);
  }
  const f = fixture();
  f.wasm.hwpx_edit_object_outer_margins_version = () => 2;
  assert.equal(f.api.supportsObjectOuterMargins(), false);
});
test('another adapter cannot reuse the owner even with identical Native observations', () => {
  const a = fixture(),
    b = fixture();
  assert.throws(() => b.api.setObjectOuterMargins(a.request()), /ForeignObjectOuterMarginsOwner/);
  assert.equal(b.calls.length, 0);
});
test('independent module evaluations cannot collide on a counter-derived scope', async () => {
  const a = await import('../../js/object-outer-margins.mjs?independent-a'),
    b = await import('../../js/object-outer-margins.mjs?independent-b');
  const one = fixture(1, a.createObjectOuterMarginsApi),
    two = fixture(1, b.createObjectOuterMarginsApi);
  assert.throws(
    () => two.api.setObjectOuterMargins(one.request()),
    /ForeignObjectOuterMarginsOwner/,
  );
  assert.equal(two.calls.length, 0);
});
test('geometry V1 owner is not a margin scope', () => {
  const f = fixture(),
    base = f.request();
  const r = {
    ...base,
    geometry: {
      ...base.geometry,
      binding: { ...base.geometry.binding, session: 'native-session' },
    },
  };
  assert.throws(() => f.api.setObjectOuterMargins(r), /ForeignObjectOuterMarginsOwner/);
  assert.equal(f.calls.length, 0);
});
test('mismatched selector read and malformed output free Native output', () => {
  const f = fixture();
  f.observation.geometry.selector.node = 18;
  f.replaceBytes(new TextEncoder().encode(JSON.stringify(f.observation)));
  assert.throws(f.read, /ObjectOuterMarginsBindingMismatch/);
  assert.equal(f.free(), 1);
  for (const bytes of [new Uint8Array([255]), new Uint8Array(16385)]) {
    const q = fixture();
    q.replaceBytes(bytes);
    assert.throws(q.read);
    assert.equal(q.free(), 1);
  }
});
test('raw Native query refusal always frees output', () => {
  const f = fixture();
  f.wasm.hwpx_edit_object_outer_margins = () => 0;
  assert.throws(f.read, /NativeRefused/);
  assert.equal(f.free(), 1);
});
test('unknown margin keys accessors missing sides and invalid integer values refuse', () => {
  for (const bad of [-1, -0, 32768, NaN, Infinity, 0.5, '1', null])
    assert.throws(() => checkedObjectOuterMargins({ ...margins, left: bad }));
  assert.throws(() => checkedObjectOuterMargins({ left: 0, right: 0, top: 0 }));
  assert.throws(() => checkedObjectOuterMargins({ ...margins, extra: 0 }));
  let read = false;
  const v = { ...margins };
  Object.defineProperty(v, 'left', {
    get() {
      read = true;
      return 1;
    },
  });
  assert.throws(() => checkedObjectOuterMargins(v));
  assert.equal(read, false);
});
test('margin request cannot smuggle geometry patch or wrong kind and keeps u64 precision', () => {
  const f = fixture(),
    r = f.request();
  assert.equal(checkedObjectOuterMarginsRequest(r).geometry.binding.serial, '18446744073709551615');
  for (const patch of [{ width: 10 }, { treatAsCharacter: true }])
    assert.throws(() =>
      checkedObjectOuterMarginsRequest({ ...r, geometry: { ...r.geometry, patch } }),
    );
  assert.throws(() =>
    checkedObjectOuterMarginsRequest({
      ...r,
      geometry: { ...r.geometry, selector: { ...r.geometry.selector, kind: 'chart' } },
    }),
  );
  assert.throws(() =>
    checkedObjectOuterMarginsRequest({
      ...r,
      geometry: {
        ...r.geometry,
        binding: { ...r.geometry.binding, serial: '18446744073709551616' },
      },
    }),
  );
});
