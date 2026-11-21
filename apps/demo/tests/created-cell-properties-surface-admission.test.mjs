import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreatedCellPropertiesTool } from '../src/created-cell-properties-tool.ts';
import { createCreatedCellPropertiesPort } from '../src/created-cell-properties-port.ts';
import { resolveCommandSupport } from '../src/command-support.ts';
function fixture(format = 'hwp5') {
  let active = true;
  const state = {
    status: 'ready',
    stateVersion: 5,
    selection: null,
    token: {
      editorId: 'own',
      documentId: 'doc',
      generation: 1,
      operationRevision: 2,
      viewRevision: 2,
    },
    capabilities: { createdCellPropertiesAvailable: true },
    content: {
      format,
      limited: false,
      readOnly: false,
      createdCellPropertiesAvailable: true,
      createdTables: [
        {
          section: 0,
          identity: '1',
          rows: 2,
          columns: 2,
          cells: [{ row: 0, column: 1, width: 14400, height: 7200 }],
        },
      ],
    },
  };
  const dispatches = [];
  const editor = {
    getEditorState: () => state,
    registerStateListener: () => () => {},
    dispatchCommand: async (...args) => {
      dispatches.push(args);
      return { status: 'known-no-op' };
    },
  };
  const host = {
    captureCreatedCellPropertiesSelection: () => ({
      state,
      section: 0,
      createdCell: { identity: '1', row: 0, column: 1 },
      current: () => active,
      bindDialog: () => true,
    }),
  };
  const tool = createCreatedCellPropertiesTool({
    root: { querySelector: () => null },
    editor,
    getHost: () => host,
    onStatus() {},
    onClose() {},
  });
  return {
    state,
    editor,
    host,
    tool,
    dispatches,
    invalidate: () => {
      active = false;
    },
  };
}
const resolve = (availability, extra = {}) =>
  resolveCommandSupport('table-cell-properties', {
    document: 'ready',
    connected: true,
    hasSelection: false,
    availability,
    ...extra,
  });
for (const format of ['hwp5', 'hwpx'])
  test(`${format} valid generated capture admits properties without ordinary Core selection`, () => {
    const f = fixture(format);
    const availability = f.tool.presentation();
    assert.equal(availability.enabled, true);
    assert.equal(resolve(availability).enabled, true);
    assert.equal(availability.surfaceSelection, true);
    f.tool.dispose();
  });
test('stale generated selection never issues surface admission', () => {
  const f = fixture();
  f.invalidate();
  assert.equal(f.tool.presentation().enabled, false);
  assert.notEqual(f.tool.presentation().surfaceSelection, true);
  assert.equal(resolve(f.tool.presentation()).enabled, false);
  f.tool.dispose();
});
test('missing host and invalid dimensions never issue surface admission', () => {
  const f = fixture();
  f.host.captureCreatedCellPropertiesSelection = () => null;
  assert.equal(resolve(f.tool.presentation()).enabled, false);
  const g = fixture();
  g.state.content.createdTables[0].cells[0].width = 0;
  assert.equal(resolve(g.tool.presentation()).enabled, false);
  f.tool.dispose();
  g.tool.dispose();
});
test('ordinary enabled properties without generated proof still require Core selection', () => {
  assert.equal(resolve({ enabled: true }).kind, 'missing-selection');
  assert.equal(resolve({ enabled: true }, { hasSelection: true }).enabled, true);
});
test('busy disconnected and unavailable properties retain authority guards', () => {
  const f = fixture();
  const a = f.tool.presentation();
  assert.equal(resolve(a, { busy: true }).enabled, false);
  assert.equal(resolve(a, { connected: false }).enabled, false);
  assert.equal(resolve({ enabled: false, surfaceSelection: true }).enabled, false);
  f.tool.dispose();
});
test('fresh current witness is rechecked before dispatch after presentation', async () => {
  const f = fixture();
  assert.equal(f.tool.presentation().enabled, true);
  const port = createCreatedCellPropertiesPort(f.editor, () => f.host);
  const captured = port.capture();
  f.invalidate();
  await assert.rejects(
    port.apply(captured, { size: { width: 18000, height: 9000 } }),
    /StaleCreatedCellProperties/,
  );
  assert.equal(f.dispatches.length, 0);
  port.dispose();
  f.tool.dispose();
});
test('changed full token rejects old captured properties without dispatch', async () => {
  const f = fixture();
  const port = createCreatedCellPropertiesPort(f.editor, () => f.host);
  const captured = port.capture();
  f.state.token.viewRevision++;
  await assert.rejects(
    port.apply(captured, { size: { width: 18000 } }),
    /StaleCreatedCellProperties/,
  );
  assert.equal(f.dispatches.length, 0);
  port.dispose();
  f.tool.dispose();
});
