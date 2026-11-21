import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageRestartApi } from '../../js/page-restart-api.mjs';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function harness(prefix) {
  const state = {
    lease: 0,
    serial: '4',
    revision: '2',
    writes: 0,
    frees: 0,
    code: 1,
    cleanup: false,
    outputCleanup: false,
    override: null,
  };
  let output, bytes;
  const format = prefix === 'hwp5_edit' ? 'hwp5' : 'hwpx';
  const wasm = {
    [`${prefix}_page_restart_capabilities`]() {
      const binding = { session: 'native-session', revision: state.revision, serial: state.serial };
      const row = (node, paragraph) => ({
        section: 0,
        controlNode: node,
        paragraph,
        number: 7,
        reason: null,
        observation: { lease: String(++state.lease), ...binding },
      });
      output = encoder.encode(
        JSON.stringify(
          state.override || {
            schemaVersion: 1,
            format,
            binding,
            rows: [
              row(12, 1),
              row(20, 3),
              {
                section: 1,
                controlNode: 9,
                paragraph: null,
                number: 0,
                reason: 'InvalidPageRestartNumber',
                observation: null,
              },
            ],
          },
        ),
      );
      return 1;
    },
    [`${prefix}_output_len`]: () => output.length,
    [`${prefix}_output_ptr`]: () => 16,
    [`${prefix}_output_free`]() {
      state.frees++;
      if (state.outputCleanup) throw Error('OutputCleanupFailed');
    },
    [`${prefix}_write_page_restart`](_ptr, _len) {
      state.writes++;
      state.request = JSON.parse(decoder.decode(bytes));
      if (state.request.before.serial !== state.serial) return 0;
      return state.code;
    },
  };
  const memory = {
    copy: () => output.slice(),
    error: () => Error('StalePageRestartBinding'),
    withBytes(value, callback) {
      bytes = value;
      const result = callback(32, value.length);
      if (state.cleanup) throw Error('CleanupFailed');
      return result;
    },
  };
  return { state, wasm, memory, api: createPageRestartApi({ wasm, memory, prefix, check() {} }) };
}
for (const prefix of ['hwp5_edit', 'hwpx_edit']) {
  test(`${prefix} PAGE restart optional pair preserves old engine absence`, () => {
    const h = harness(prefix);
    delete h.wasm[`${prefix}_write_page_restart`];
    assert.equal(h.api.supportsPageRestartWrite(), false);
    assert.throws(() => h.api.pageRestartCapabilities(), /PageRestartWriteUnavailable/);
    h.wasm[`${prefix}_write_page_restart`] = () => 1;
    assert.equal(h.api.supportsPageRestartWrite(), false);
    assert.equal(h.state.writes, 0);
  });
  test(`${prefix} PAGE restart multiple physical owners and unavailable rows remain distinct`, () => {
    const h = harness(prefix),
      cap = h.api.pageRestartCapabilities();
    assert.deepEqual(
      cap.rows.map((r) => [r.section, r.controlNode, r.paragraph]),
      [
        [0, 12, 1],
        [0, 20, 3],
        [1, 9, null],
      ],
    );
    assert.equal(cap.rows[2].reason, 'InvalidPageRestartNumber');
    assert.equal(cap.rows[2].observation, null);
    assert.equal(h.state.frees, 1);
    assert.ok(
      Object.isFrozen(cap) && Object.isFrozen(cap.rows) && Object.isFrozen(cap.rows[0].observation),
    );
  });
  test(`${prefix} PAGE restart exact issuer object only and single use`, () => {
    const h = harness(prefix),
      before = h.api.pageRestartCapabilities().rows[1].observation;
    assert.equal(h.api.ownsPageRestartObservation(before), true);
    const copy = Object.freeze(structuredClone(before));
    assert.equal(h.api.ownsPageRestartObservation(copy), false);
    assert.throws(
      () => h.api.writePageRestart({ before: copy, number: 30 }),
      /StalePageRestartObservation/,
    );
    assert.equal(h.state.writes, 0);
    assert.deepEqual(h.api.writePageRestart({ before, number: 30 }), {
      nativeCode: 1,
      application: 'applied',
      changed: true,
    });
    assert.equal(h.state.request.before.lease, before.lease);
    assert.equal(h.api.ownsPageRestartObservation(before), false);
    assert.throws(
      () => h.api.writePageRestart({ before, number: 31 }),
      /StalePageRestartObservation/,
    );
    assert.equal(h.state.writes, 1);
  });
  test(`${prefix} PAGE restart new capture invalidates old issuer without JSON equivalence`, () => {
    const h = harness(prefix),
      old = h.api.pageRestartCapabilities().rows[0].observation;
    const fresh = h.api.pageRestartCapabilities().rows[0].observation;
    assert.notEqual(old.lease, fresh.lease);
    assert.equal(h.api.ownsPageRestartObservation(old), false);
    assert.equal(h.api.ownsPageRestartObservation(fresh), true);
  });
  test(`${prefix} PAGE restart stale serial same revision is rejected by Native outcome`, () => {
    const h = harness(prefix),
      before = h.api.pageRestartCapabilities().rows[0].observation;
    h.state.serial = '5';
    assert.deepEqual(h.api.writePageRestart({ before, number: 30 }), {
      nativeCode: 0,
      application: 'unapplied',
      changed: false,
      error: 'StalePageRestartBinding',
    });
    assert.equal(h.state.writes, 1);
    assert.equal(h.api.ownsPageRestartObservation(before), false);
  });
  test(`${prefix} PAGE restart invalid number and accessor never invoke Native`, () => {
    const h = harness(prefix),
      before = h.api.pageRestartCapabilities().rows[0].observation;
    for (const number of [0, -0, 65536, NaN, 1.5])
      assert.throws(() => h.api.writePageRestart({ before, number }), /InvalidPageRestartNumber/);
    let reads = 0;
    assert.throws(
      () =>
        h.api.writePageRestart({
          before,
          get number() {
            reads++;
            return 30;
          },
        }),
      /InvalidPageRestartWire/,
    );
    assert.equal(reads, 0);
    assert.equal(h.state.writes, 0);
    assert.equal(h.api.ownsPageRestartObservation(before), true);
  });
  test(`${prefix} PAGE restart observed applied completion survives cleanup failure`, () => {
    const h = harness(prefix),
      before = h.api.pageRestartCapabilities().rows[0].observation;
    h.state.cleanup = true;
    assert.deepEqual(h.api.writePageRestart({ before, number: 30 }), {
      nativeCode: 1,
      application: 'applied',
      changed: true,
      cleanupError: 'CleanupFailed',
      refreshRequired: true,
    });
    assert.equal(h.state.writes, 1);
    assert.equal(h.api.ownsPageRestartObservation(before), false);
  });
}
test('PAGE restart output cleanup failure never publishes an issuer', () => {
  const h = harness('hwp5_edit');
  h.state.outputCleanup = true;
  assert.throws(() => h.api.pageRestartCapabilities(), /OutputCleanupFailed/);
  assert.equal(h.state.writes, 0);
});
test('PAGE restart duplicate Native lease identities are rejected before publication', () => {
  const h = harness('hwp5_edit');
  const cap = structuredClone(h.api.pageRestartCapabilities());
  cap.rows[1].observation.lease = cap.rows[0].observation.lease;
  h.state.override = cap;
  assert.throws(() => h.api.pageRestartCapabilities(), /InvalidPageRestartWire/);
  assert.equal(h.state.writes, 0);
});
test('PAGE restart unknown primitive completion is never replayed', () => {
  const h = harness('hwpx_edit'),
    before = h.api.pageRestartCapabilities().rows[0].observation;
  h.state.code = 9;
  assert.deepEqual(h.api.writePageRestart({ before, number: 30 }), {
    application: 'unknown',
    changed: null,
    error: 'InvalidPageRestartOutcome',
  });
  assert.equal(h.api.ownsPageRestartObservation(before), false);
  assert.equal(h.state.writes, 1);
});
test('PAGE restart serial stays exact at unsigned64 maximum', () => {
  const h = harness('hwpx_edit');
  h.state.serial = '18446744073709551615';
  const before = h.api.pageRestartCapabilities().rows[0].observation;
  assert.equal(before.serial, h.state.serial);
  h.api.writePageRestart({ before, number: 30 });
  assert.equal(h.state.request.before.serial, '18446744073709551615');
});
