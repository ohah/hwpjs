import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeHwp5EquationSnapshot,
  createHwp5EquationApi,
} from '../../js/hwp5-equation-sources.mjs';
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
const detail = () => ({
  schemaVersion: 1,
  layout: 'version-only',
  site: {
    control_node: 2,
    equation_node: 3,
    paragraph_node: 0,
    paragraph: 0,
    source_unit: 0,
    current_unit: 0,
  },
  attributes: 1,
  fontSize: 1000,
  color: 0x112233,
  baseline: -2,
  unknown: 7,
  scriptUtf16LE: [120, 0, 0xd800],
  versionUtf16LE: [118],
  fontUtf16LE: null,
  extraBytes: [0xab],
});
test('equation snapshot retains invalid UTF16 as raw units without inventing display text', () => {
  const input = { schemaVersion: 1, sources: [detail()] };
  const rows = decodeHwp5EquationSnapshot(encode(input));
  input.sources[0].scriptUtf16LE[0] = 65;
  assert.equal(rows[0].script, null);
  assert.equal(rows[0].decoding.script, 'invalid-utf16');
  assert.deepEqual(rows[0].scriptUtf16LE, [120, 0, 0xd800]);
  assert.deepEqual(rows[0].extraBytes, [0xab]);
  assert.ok(Object.isFrozen(rows) && Object.isFrozen(rows[0]) && Object.isFrozen(rows[0].site));
});
test('equation snapshot rejects duplicate physical bindings and malformed layouts', () => {
  const a = detail(),
    b = detail();
  assert.throws(
    () => decodeHwp5EquationSnapshot(encode({ schemaVersion: 1, sources: [a, b] })),
    /InvalidHwp5EquationSources/,
  );
  b.site.equation_node = 4;
  assert.throws(
    () => decodeHwp5EquationSnapshot(encode({ schemaVersion: 1, sources: [a, b] })),
    /InvalidHwp5EquationSources/,
  );
  a.layout = 'with-font';
  assert.throws(
    () => decodeHwp5EquationSnapshot(encode({ schemaVersion: 1, sources: [a] })),
    /InvalidHwp5EquationSources/,
  );
  assert.throws(
    () => decodeHwp5EquationSnapshot(encode({ schemaVersion: 1, sources: [], extra: true })),
    /InvalidHwp5EquationSources/,
  );
});
test('optional snapshot ABI preserves old-engine refusal and closed-editor checks', () => {
  let closed = false,
    calls = 0;
  const check = () => {
    if (closed) throw Error('EditorClosed');
  };
  const u32 = (value) => {
    assert.ok(Number.isInteger(value) && value >= 0);
    return value;
  };
  const old = createHwp5EquationApi({ wasm: {}, check, u32 });
  assert.equal(old.supportsEquationSources(), false);
  assert.throws(() => old.equationSnapshot(0), /Hwp5EquationSourcesAbiUnavailable/);
  const raw = detail();
  raw.scriptUtf16LE = [120];
  const api = createHwp5EquationApi({
    wasm: {
      hwp5_edit_equation_sites() {},
      hwp5_edit_equation_snapshot(section, layout) {
        calls++;
        assert.equal(section, 2);
        assert.equal(layout, 0);
        return 1;
      },
    },
    check,
    u32,
    output(fn) {
      fn();
      return { bytes: encode({ schemaVersion: 1, sources: [raw] }) };
    },
  });
  assert.equal(api.supportsEquationSources(), true);
  assert.equal(api.equationSnapshot(2)[0].script, 'x');
  assert.equal(calls, 1);
  assert.throws(() => api.equationSnapshot(2, 'automatic'), /InvalidEquationLayout/);
  assert.equal(calls, 1);
  closed = true;
  assert.throws(() => api.equationSnapshot(2), /EditorClosed/);
  assert.throws(() => api.supportsEquationSources(), /EditorClosed/);
});
