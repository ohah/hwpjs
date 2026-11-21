import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHwp5OuterMarginsApi,
  checkedHwp5OuterMarginsRequest,
} from '../../js/hwp5-object-outer-margins.mjs';
const selected = { section: 0, node: 10, kind: 'textbox' };
const margin = { left: 1, right: 2, top: 3, bottom: 4 };
const raw = () => ({
  schemaVersion: 1,
  format: 'hwp5',
  selector: selected,
  owner: {
    control_node: 8,
    component_node: 10,
    paragraph_node: 0,
    paragraph: 0,
    anchor_unit: 2,
    instance_id: 7,
    source_sha256: Array(32).fill(77),
  },
  ticket: {
    document: { lo: 0xffffffff, hi: 0xffffffff },
    generation: { lo: 2, hi: 1 },
    owner: { lo: 3, hi: 1 },
    epoch: { lo: 4, hi: 1 },
  },
  viewEpoch: { lo: 5, hi: 1 },
  historyRevision: 4,
  margins: margin,
  editable: true,
  reason: null,
  wrapOrdinal: 0,
  inline: false,
});
function fixture(value = raw()) {
  let code = 1,
    frees = 0,
    calls = 0,
    sent,
    args;
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const wasm = {
    hwp5_edit_object_outer_margins_version: () => 1,
    hwp5_edit_object_outer_margins: (...a) => {
      args = a;
      return 1;
    },
    hwp5_edit_set_object_outer_margins: () => {
      calls++;
      return code;
    },
    hwp5_edit_output_len: () => bytes.length,
    hwp5_edit_output_ptr: () => 0,
    hwp5_edit_output_free: () => {
      frees++;
    },
  };
  const memory = {
    copy: () => bytes,
    error: () => Error('native-first-error'),
    withBytes(b, fn) {
      sent = JSON.parse(new TextDecoder().decode(b));
      return fn(1, b.length);
    },
  };
  const api = createHwp5OuterMarginsApi({ wasm, memory, check() {} });
  return {
    api,
    wasm,
    memory,
    get sent() {
      return sent;
    },
    get args() {
      return args;
    },
    get calls() {
      return calls;
    },
    get frees() {
      return frees;
    },
    set code(v) {
      code = v;
    },
  };
}
test('typed selectors and full u64 words survive without numeric narrowing', () => {
  const f = fixture(),
    v = f.api.objectOuterMargins(selected);
  assert.deepEqual(f.args, [0, 10, 1]);
  assert.deepEqual(v.ticket.document, { lo: 0xffffffff, hi: 0xffffffff });
  const outcome = f.api.setObjectOuterMargins({ schemaVersion: 1, witness: v, margins: margin });
  assert.equal(outcome.changed, true);
  assert.equal(f.sent.witness.ownerScope, undefined);
  assert.deepEqual(f.sent.witness.ticket, v.ticket);
  assert.equal(f.frees, 1);
});
test('no-op and uncertain outcomes are not retried', () => {
  const f = fixture(),
    witness = f.api.objectOuterMargins(selected);
  f.code = 2;
  assert.equal(
    f.api.setObjectOuterMargins({ schemaVersion: 1, witness, margins: margin }).changed,
    false,
  );
  f.code = 3;
  const r = f.api.setObjectOuterMargins({ schemaVersion: 1, witness, margins: margin });
  assert.equal(r.application, 'unknown');
  assert.equal(r.error, 'native-first-error');
  assert.equal(f.calls, 2);
});
test('foreign editor scope cannot reuse an otherwise exact witness', () => {
  const a = fixture(),
    b = fixture(),
    witness = a.api.objectOuterMargins(selected);
  assert.throws(
    () => b.api.setObjectOuterMargins({ schemaVersion: 1, witness, margins: margin }),
    /Foreign/,
  );
  assert.equal(b.calls, 0);
});
test('raw3 and inline observations never become writable', () => {
  for (const patch of [{ wrapOrdinal: 3 }, { inline: true }]) {
    const f = fixture({ ...raw(), ...patch, editable: false, reason: 'Unverified' }),
      witness = f.api.objectOuterMargins(selected);
    assert.throws(() =>
      f.api.setObjectOuterMargins({ schemaVersion: 1, witness, margins: margin }),
    );
    assert.equal(f.calls, 0);
  }
});
test('signed observed words are retained but new negative margins are rejected', () => {
  const f = fixture({ ...raw(), margins: { ...margin, left: -32768 } }),
    witness = f.api.objectOuterMargins(selected);
  assert.equal(witness.margins.left, -32768);
  assert.throws(() =>
    checkedHwp5OuterMarginsRequest({ schemaVersion: 1, witness, margins: { ...margin, left: -1 } }),
  );
  assert.throws(() =>
    checkedHwp5OuterMarginsRequest({
      schemaVersion: 1,
      witness,
      margins: { ...margin, left: 32768 },
    }),
  );
});
test('physical kind mismatch and unknown fields fail with output release', () => {
  const f = fixture({ ...raw(), selector: { ...selected, kind: 'picture' } });
  assert.throws(() => f.api.objectOuterMargins(selected), /BindingMismatch/);
  assert.equal(f.frees, 1);
  const g = fixture({ ...raw(), hidden: 1 });
  assert.throws(() => g.api.objectOuterMargins(selected));
  assert.equal(g.frees, 1);
});
test('optional export absence fails closed before output allocation', () => {
  const f = fixture();
  delete f.wasm.hwp5_edit_set_object_outer_margins;
  assert.equal(f.api.supportsObjectOuterMargins(), false);
  assert.throws(() => f.api.objectOuterMargins(selected), /Unavailable/);
  assert.equal(f.frees, 0);
});

test('optional initialization isolates throwing or invalid crypto with legacy and new ABI', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    for (const crypto of [
      {
        randomUUID() {
          throw Error('ControlledEntropyUnavailable');
        },
      },
      {
        get randomUUID() {
          throw Error('ControlledCryptoAccessor');
        },
      },
      { randomUUID: () => undefined },
      { randomUUID: () => 'not-a-uuid' },
    ]) {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: crypto });
      for (const wasm of [
        {},
        {
          hwp5_edit_object_outer_margins_version: () => 1,
          hwp5_edit_object_outer_margins() {
            throw Error('unexpected query');
          },
          hwp5_edit_set_object_outer_margins() {
            throw Error('unexpected edit');
          },
        },
      ]) {
        const api = createHwp5OuterMarginsApi({ wasm, memory: {}, check() {} });
        assert.equal(api.supportsObjectOuterMargins(), false);
        assert.throws(() => api.objectOuterMargins(selected), /Hwp5OuterMarginsUnavailable/);
      }
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
    else delete globalThis.crypto;
  }
});
