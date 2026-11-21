// Prepared only; do not count syntax checking as executed bridge evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHwp5VerticalMarginsApi,
  checkedHwp5VerticalMarginsRequest,
  HWP5_VERTICAL_MARGINS_PROFILE,
} from '../../js/hwp5-vertical-outer-margins.mjs';
const selected = { section: 0, node: 11, kind: 'picture' };
const raw = () => ({
  schemaVersion: 1,
  profile: HWP5_VERTICAL_MARGINS_PROFILE,
  witness: {
    schemaVersion: 1,
    format: 'hwp5',
    selector: selected,
    owner: {
      control_node: 9,
      component_node: 10,
      paragraph_node: 0,
      paragraph: 0,
      anchor_unit: 351,
      instance_id: 1,
      source_sha256: Array(32).fill(77),
    },
    ticket: {
      document: { lo: 0xffffffff, hi: 0xffffffff },
      generation: { lo: 2, hi: 1 },
      owner: { lo: 3, hi: 1 },
      epoch: { lo: 4, hi: 1 },
    },
    viewEpoch: { lo: 5, hi: 1 },
    historyRevision: 0,
    margins: { left: -32768, right: -1, top: 0, bottom: 0 },
    editable: true,
    reason: null,
    wrapOrdinal: 1,
    inline: false,
  },
});
function fixture(value = raw()) {
  let code = 1,
    calls = 0,
    oldCalls = 0,
    sent,
    freed = 0;
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const wasm = {
    hwp5_edit_vertical_outer_margins_version: () => 1,
    hwp5_edit_vertical_outer_margins: () => 1,
    hwp5_edit_set_vertical_outer_margins: () => {
      calls++;
      return code;
    },
    hwp5_edit_object_outer_margins_version: () => {
      oldCalls++;
      return 1;
    },
    hwp5_edit_object_outer_margins: () => {
      oldCalls++;
      return 1;
    },
    hwp5_edit_set_object_outer_margins: () => {
      oldCalls++;
      return 1;
    },
    hwp5_edit_output_ptr: () => 0,
    hwp5_edit_output_len: () => bytes.length,
    hwp5_edit_output_free: () => {
      freed++;
    },
  };
  const memory = {
    copy: () => bytes,
    error: () => Error('controlled-native-error'),
    withBytes(bytes, fn) {
      sent = JSON.parse(new TextDecoder().decode(bytes));
      return fn(1, bytes.length);
    },
  };
  const api = createHwp5VerticalMarginsApi({ wasm, memory, check() {} });
  return {
    api,
    wasm,
    get sent() {
      return sent;
    },
    get calls() {
      return calls;
    },
    get oldCalls() {
      return oldCalls;
    },
    get freed() {
      return freed;
    },
    set code(n) {
      code = n;
    },
  };
}
test('vertical profile transports exact full witness and has no writable left/right fields', () => {
  const f = fixture(),
    observation = f.api.verticalObjectOuterMargins(selected);
  const r = f.api.setVerticalObjectOuterMargins({ ...observation, top: 750, bottom: 1500 });
  assert.equal(r.changed, true);
  assert.deepEqual(f.sent.witness.ticket.document, { lo: 0xffffffff, hi: 0xffffffff });
  assert.equal(f.sent.witness.margins.left, -32768);
  assert.equal(f.sent.left, undefined);
  assert.equal(f.sent.witness.ownerScope, undefined);
  assert.equal(f.oldCalls, 0);
  assert.throws(() =>
    f.api.setVerticalObjectOuterMargins({ ...observation, top: 750, bottom: 1500, left: 1 }),
  );
});
test('legacy-only and unknown-new-version engines do not fall back to Square', () => {
  const f = fixture();
  delete f.wasm.hwp5_edit_vertical_outer_margins;
  assert.equal(f.api.supportsVerticalObjectOuterMargins(), false);
  assert.throws(() => f.api.verticalObjectOuterMargins(selected), /Unavailable/);
  assert.equal(f.oldCalls, 0);
  const g = fixture();
  g.wasm.hwp5_edit_vertical_outer_margins_version = () => 2;
  assert.equal(g.api.supportsVerticalObjectOuterMargins(), false);
  assert.equal(g.oldCalls, 0);
});
test('raw0 and an official Tight label do not negotiate the observed raw1 profile', () => {
  const zero = raw();
  zero.witness.wrapOrdinal = 0;
  const f = fixture(zero);
  assert.throws(() => f.api.verticalObjectOuterMargins(selected));
  assert.equal(f.freed, 1);
  const other = raw();
  other.profile = 'official-tight-v1';
  const g = fixture(other);
  assert.throws(() => g.api.verticalObjectOuterMargins(selected));
  assert.equal(g.freed, 1);
});
test('readonly and inline observations cannot be committed by the SDK', () => {
  for (const patch of [
    { editable: false, reason: 'OuterMarginsReadOnly' },
    { inline: true, editable: false, reason: 'OuterMarginsInlineEffectUnverified' },
  ]) {
    const v = raw();
    Object.assign(v.witness, patch);
    const f = fixture(v),
      observation = f.api.verticalObjectOuterMargins(selected);
    assert.throws(() =>
      f.api.setVerticalObjectOuterMargins({ ...observation, top: 750, bottom: 1500 }),
    );
    assert.equal(f.calls, 0);
  }
});
test('new scope rejects foreign witness and keeps no-op/uncertain completion once', () => {
  const a = fixture(),
    b = fixture(),
    observation = a.api.verticalObjectOuterMargins(selected);
  assert.throws(
    () => b.api.setVerticalObjectOuterMargins({ ...observation, top: 750, bottom: 1500 }),
    /Foreign/,
  );
  assert.equal(b.calls, 0);
  a.code = 2;
  assert.equal(
    a.api.setVerticalObjectOuterMargins({ ...observation, top: 0, bottom: 0 }).changed,
    false,
  );
  a.code = 3;
  assert.equal(
    a.api.setVerticalObjectOuterMargins({ ...observation, top: 750, bottom: 1500 }).application,
    'unknown',
  );
  assert.equal(a.calls, 2);
});
test('negative source words may be retained while changed values remain bounded', () => {
  const v = raw();
  v.witness.margins.top = -20;
  const f = fixture(v),
    observation = f.api.verticalObjectOuterMargins(selected);
  assert.equal(
    checkedHwp5VerticalMarginsRequest({ ...observation, top: -20, bottom: 1500 }).top,
    -20,
  );
  assert.throws(() =>
    checkedHwp5VerticalMarginsRequest({ ...observation, top: -21, bottom: 1500 }),
  );
  assert.throws(() =>
    checkedHwp5VerticalMarginsRequest({ ...observation, top: 32768, bottom: 1500 }),
  );
});

test('optional vertical nonce failure leaves legacy initialization available', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        randomUUID() {
          throw Error('ControlledEntropyUnavailable');
        },
      },
    });
    const f = fixture();
    assert.equal(f.api.supportsVerticalObjectOuterMargins(), false);
    assert.equal(f.calls, 0);
    assert.equal(f.oldCalls, 0);
  } finally {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
    else delete globalThis.crypto;
  }
});
