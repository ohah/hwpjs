import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as schema from '../../js/abi-schema.mjs';
import { createHwp5ChartDisplayApi } from '../../js/hwp5-chart-display-api.mjs';
import { candidates, display } from './chart-display-wire-fixture.mjs';
const root = new URL('../../', import.meta.url);
const names = [
  'hwp5_edit_chart_display_profile_version',
  'hwp5_edit_chart_candidates',
  'hwp5_edit_chart_display',
];
const signatures = {
  hwp5_edit_chart_display_profile_version: { params: [], results: ['i32'] },
  hwp5_edit_chart_candidates: { params: [], results: ['i32'] },
  hwp5_edit_chart_display: { params: ['i32', 'i32'], results: ['i32'] },
};
const baselineNames = [
  'ABI_VERSION',
  'CREATED_TABLE_GRID_ACTION',
  'DOCUMENT',
  'EXPERIMENTAL_EDITOR_FUNCTIONS',
  'FIELD',
  'HWP5_NAMED_FIELDS_FUNCTIONS',
  'HWP5_SOURCE_TABLE_CELL_SPLIT_FUNCTIONS',
  'HWP5_TEXT_TRANSACTION_FUNCTIONS',
  'HWPX_CHART_CREATE_PROFILE_FUNCTIONS',
  'HWPX_CONTROL_TEXT_READ_FUNCTIONS',
  'HWPX_DOCUMENT_INSERT_FUNCTIONS',
  'HWPX_DOCUMENT_PROVENANCE_FUNCTIONS',
  'HWPX_NAMED_FIELDS_FUNCTIONS',
  'HWPX_NAMED_FIELD_CREATE_FUNCTIONS',
  'HWPX_NAMED_FIELD_PARAMETERS_FUNCTIONS',
  'HWPX_NAMED_FIELD_RENAME_FUNCTIONS',
  'HWPX_SOURCE_TABLE_CELL_MERGE_FUNCTIONS',
  'HWPX_SOURCE_TABLE_CELL_SPLIT_FUNCTIONS',
  'HWPX_TEXT_TRANSACTION_FUNCTIONS',
  'REQUIRED_FUNCTIONS',
  'VALUE',
];
const baselineHash = '8079283b90e66521ade82fe916b46cfe4f5609208673001676f70fcb6c0a835f';
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value));
function fixture(version = 1) {
  let calls = 0;
  let value = candidates();
  const wasm = {
    hwp5_edit_chart_display_profile_version: () => {
      if (version === 'throws') throw Error('ProfileFailed');
      return version;
    },
    hwp5_edit_chart_candidates: () => 1,
    hwp5_edit_chart_display: () => 1,
  };
  const api = createHwp5ChartDisplayApi({
    wasm,
    check() {},
    output(action) {
      calls++;
      assert.equal(action(), 1);
      return { bytes: bytes(value) };
    },
    u32(value) {
      assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffffff);
      return value;
    },
  });
  return {
    wasm,
    api,
    get calls() {
      return calls;
    },
    set(value2) {
      value = value2;
    },
  };
}
// The field feature deliberately extends this optional list while retaining
// the legacy endpoint. Assert the exact extension, then compare every other
// pre-chart registry value to its original immutable digest. Do not rebaseline
// the digest or exclude the optional list without an exact replacement check.
function assertPriorRegistry(registry) {
  assert.deepEqual(registry.HWPX_CONTROL_TEXT_READ_FUNCTIONS, [
    'hwpx_edit_paragraph_control_text_snapshot',
    'hwpx_edit_paragraph_control_text_snapshot_current',
    'hwpx_edit_control_text_read_identity',
  ]);
  const prior = Object.fromEntries(baselineNames.map((name) => [name, registry[name]]));
  prior.HWPX_CONTROL_TEXT_READ_FUNCTIONS = ['hwpx_edit_paragraph_control_text_snapshot'];
  assert.equal(createHash('sha256').update(JSON.stringify(prior)).digest('hex'), baselineHash);
}
test('H5 optional registry derives exact read3 signatures and preserves every prior registry export', () => {
  assert.equal(schema.ABI_VERSION, 6);
  assert.equal(schema.HWP5_CHART_READ_PROFILE_VERSION, 1);
  assert.deepEqual(schema.HWP5_CHART_READ_FUNCTIONS, names);
  assert.deepEqual(schema.HWP5_CHART_READ_ABI, signatures);
  assert.ok(Object.isFrozen(schema.HWP5_CHART_READ_FUNCTIONS));
  assert.ok(Object.isFrozen(schema.HWP5_CHART_READ_ABI));
  for (const name of names) {
    assert.equal(schema.REQUIRED_FUNCTIONS.includes(name), false);
    assert.ok(Object.isFrozen(schema.HWP5_CHART_READ_ABI[name]));
    assert.ok(Object.isFrozen(schema.HWP5_CHART_READ_ABI[name].params));
    assert.ok(Object.isFrozen(schema.HWP5_CHART_READ_ABI[name].results));
  }
  assertPriorRegistry(schema);
});
test('H5 optional read3 normalized signatures match exact Native source declarations', async () => {
  const native = await readFile(new URL('src/wasm/hwp5_edit.zig', root), 'utf8');
  for (const name of names) {
    const expression = new RegExp('export fn ' + name + '\\(([^)]*)\\) (\\w+) \\{', 'g');
    const matches = [...native.matchAll(expression)];
    assert.equal(matches.length, 1);
    const normalize = (type) => {
      assert.equal(type, 'u32');
      return 'i32';
    };
    const params = matches[0][1].trim()
      ? matches[0][1].split(',').map((value) => normalize(value.split(':')[1].trim()))
      : [];
    assert.deepEqual(
      { params, results: [normalize(matches[0][2])] },
      schema.HWP5_CHART_READ_ABI[name],
    );
  }
  const wire = await readFile(new URL('src/hwp5/chart/display_wire.zig', root), 'utf8');
  assert.match(wire, /pub const version: u32 = 1;/);
});
test('H5 optional facade rejects old engine and each missing export before Native output', () => {
  for (const missing of [names, ...names.map((name) => [name])]) {
    const f = fixture();
    for (const name of missing) delete f.wasm[name];
    assert.equal(f.api.supportsHwp5ChartDisplayAbi(), false);
    assert.throws(() => f.api.hwp5ChartCandidates(), /Hwp5ChartDisplayAbiUnavailable/);
    assert.throws(() => f.api.hwp5ChartDisplay(2, 4), /Hwp5ChartDisplayAbiUnavailable/);
    assert.equal(f.calls, 0);
  }
});
test('H5 optional profile1 and DTO version1 stay strict without retry or fallback', () => {
  for (const version of [0, 2, 'throws']) {
    const f = fixture(version);
    assert.equal(f.api.supportsHwp5ChartDisplayAbi(), false);
    assert.throws(() => f.api.hwp5ChartCandidates(), /Hwp5ChartDisplayAbiUnavailable/);
    assert.equal(f.calls, 0);
  }
  const f = fixture();
  assert.deepEqual(f.api.hwp5ChartCandidates(), candidates());
  f.set(display());
  assert.deepEqual(f.api.hwp5ChartDisplay(2, 4), display());
  const stale = candidates();
  stale.version = 2;
  f.set(stale);
  assert.throws(() => f.api.hwp5ChartCandidates(), /InvalidHwp5ChartReply/);
  assert.equal(f.calls, 3);
});
test('official ABI generator check includes optional read3 without registry drift', () => {
  execFileSync(process.execPath, ['tools/generate-abi.mjs', '--check'], {
    cwd: root,
    stdio: 'pipe',
  });
});

test('combined optional registry rejects missing legacy or freshness entries and unrelated baseline changes', () => {
  const valid = { ...schema };
  assertPriorRegistry(valid);
  const controls = [...schema.HWPX_CONTROL_TEXT_READ_FUNCTIONS];
  for (const list of [
    controls.slice(1),
    controls.filter((_, index) => index !== 1),
    controls.slice(0, 2),
    [...controls, 'unexpected_optional_export'],
    [...controls].reverse(),
  ]) {
    assert.throws(() => assertPriorRegistry({ ...valid, HWPX_CONTROL_TEXT_READ_FUNCTIONS: list }));
  }
  assert.throws(() => assertPriorRegistry({ ...valid, ABI_VERSION: 7 }));
  assert.throws(() => assertPriorRegistry({ ...valid, REQUIRED_FUNCTIONS: [] }));
  assert.throws(() => assertPriorRegistry({ ...valid, HWP5_TEXT_TRANSACTION_FUNCTIONS: [] }));
});
