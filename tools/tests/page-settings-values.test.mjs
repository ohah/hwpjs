import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkedPageSettingsValues,
  createPageSettingsEditApi,
} from '../../js/page-settings-edit.mjs';
const values = {
  orientation: 'widely',
  width: 60000,
  height: 90000,
  gutter_type: 'left_only',
  margin: {
    header: 1000,
    footer: 1000,
    gutter: 100,
    left: 5000,
    right: 6000,
    top: 4000,
    bottom: 5000,
  },
};
test('explicit values preserve stored axes; scalar validation never infers transpose or defaults', () => {
  for (const orientation of ['widely', 'narrowly'])
    for (const gutter_type of ['left_only', 'left_right', 'top_bottom']) {
      const actual = checkedPageSettingsValues({ ...values, orientation, gutter_type });
      assert.equal(actual.width, 60000);
      assert.equal(actual.height, 90000);
      assert(Object.isFrozen(actual.margin));
    }
  for (const bad of [
    { ...values, width: 0 },
    { ...values, orientation: null },
    { ...values, margin: { ...values.margin, left: 90000 } },
    { ...values, extra: 0 },
    { ...values, margin: { ...values.margin, header: -1 } },
  ])
    assert.throws(() => checkedPageSettingsValues(bad));
  let invoked = false;
  assert.throws(() =>
    checkedPageSettingsValues({
      ...values,
      get width() {
        invoked = true;
        return 1;
      },
    }),
  );
  assert.equal(invoked, false);
});
test('old engine cannot manufacture optional page settings write support', () => {
  const sdk = createPageSettingsEditApi({ wasm: {}, memory: {}, check() {} });
  assert.equal(sdk.supportsPageSettingsWrite(), false);
  assert.throws(() => sdk.pageSettingsCapabilities(), /Unavailable/);
  assert.throws(() => sdk.writePageSettings({}), /Unavailable/);
});
test('SDK scope, stale native serial and descriptor validation precede native mutation', () => {
  const source = {
    section_ordinal: 0,
    element_index: 4,
    orientation: 'widely',
    width: 60000,
    height: 90000,
    gutter_type: 'left_only',
    margin: { ...values.margin },
    duplicate_margins: 0,
    hide_first_empty_line: null,
    visibility_count: 0,
  };
  const target = { section: 0, owner_node: 3, page_node: 4, margin_node: 5, expected: source };
  let writes = 0,
    serial = '0';
  const native = {
    schemaVersion: 1,
    format: 'hwpx',
    binding: { session: 's1', revision: 0, serial: '0' },
    sections: [{ section: 0, target, reason: null }],
  };
  const make = () =>
    createPageSettingsEditApi({
      check() {},
      wasm: {
        hwpx_edit_page_settings_capabilities: () => 1,
        hwpx_edit_output_ptr: () => 0,
        hwpx_edit_output_len: () => 100,
        hwpx_edit_output_free() {},
        hwpx_edit_write_page_settings() {
          writes++;
          return 1;
        },
      },
      memory: {
        copy() {
          return new TextEncoder().encode(
            JSON.stringify({ ...native, binding: { ...native.binding, serial } }),
          );
        },
        withBytes(_b, f) {
          return f(0, 1);
        },
        error() {
          return { message: 'error' };
        },
      },
    });
  const a = make(),
    b = make();
  const cap = a.pageSettingsCapabilities();
  const req = { binding: cap.binding, scope: 'section', targets: [target], values };
  assert.equal(b.writePageSettings(req).error, 'StalePageSettingsBinding');
  assert.equal(writes, 0);
  let invoked = false;
  const bad = {
    ...target,
    get expected() {
      invoked = true;
      return source;
    },
  };
  assert.throws(() => a.writePageSettings({ ...req, targets: [bad] }));
  assert.equal(invoked, false);
  assert.equal(writes, 0);
  assert.equal(a.writePageSettings(req).nativeCode, 1);
  assert.equal(writes, 1);
  serial = '1';
  assert.equal(a.writePageSettings(req).error, 'StalePageSettingsBinding');
  assert.equal(writes, 1);
});
test('page SDK completion 2/3 and cleanup faults retain primitive ownership without retry', () => {
  const expected = {
    section_ordinal: 0,
    element_index: 4,
    orientation: 'widely',
    width: 60000,
    height: 90000,
    gutter_type: 'left_only',
    margin: { ...values.margin },
    duplicate_margins: 0,
    hide_first_empty_line: null,
    visibility_count: 0,
  };
  const target = { section: 0, owner_node: 3, page_node: 4, margin_node: 5, expected };
  const cap = {
    schemaVersion: 1,
    format: 'hwpx',
    binding: { session: 's1', revision: 0, serial: '0' },
    sections: [{ section: 0, target, reason: null }],
  };
  for (const code of [2, 3, 1]) {
    let calls = 0;
    const sdk = createPageSettingsEditApi({
      check() {},
      wasm: {
        hwpx_edit_page_settings_capabilities: () => 1,
        hwpx_edit_output_ptr: () => 0,
        hwpx_edit_output_len: () => 10,
        hwpx_edit_output_free() {},
        hwpx_edit_write_page_settings() {
          calls++;
          return code;
        },
      },
      memory: {
        copy: () => new TextEncoder().encode(JSON.stringify(cap)),
        error: () => ({ message: 'HistoryMutationUncertain' }),
        withBytes(_b, invoke) {
          const result = invoke(0, 1);
          if (code === 1) throw Error('cleanup');
          return result;
        },
      },
    });
    const read = sdk.pageSettingsCapabilities();
    const result = sdk.writePageSettings({
      binding: read.binding,
      scope: 'section',
      targets: [target],
      values,
    });
    assert.equal(calls, 1);
    assert.equal(result.application, code === 3 ? 'unknown' : code === 2 ? 'unapplied' : 'applied');
    assert.equal(result.changed, code === 3 ? null : code === 1);
    if (code === 1) {
      assert.equal(result.refreshRequired, true);
      assert.equal(result.cleanupError, 'cleanup');
    }
  }
});
