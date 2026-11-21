import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureCreatedCellPropertiesRequest,
  createdCellPropertiesMessage,
} from '../../../js/created-cell-properties.mjs';
import { createCreatedCellPropertiesPort } from '../src/created-cell-properties-port.ts';
const request = () => ({
  section: 0,
  identity: '18446744073709551615',
  row: 0,
  column: 1,
  expected: { width: 100, height: 20 },
  size: { height: 30 },
});
function fixture(format = 'hwp5') {
  const state = {
    status: 'ready',
    stateVersion: 1,
    selection: null,
    historyRecoveryRequired: false,
    token: { editorId: 'e', documentId: 'd', generation: 1, operationRevision: 2, viewRevision: 3 },
    capabilities: { createdCellPropertiesAvailable: true },
    content: {
      format,
      limited: false,
      readOnly: false,
      createdCellPropertiesAvailable: true,
      createdTables: [
        {
          section: 0,
          identity: request().identity,
          rows: 1,
          columns: 2,
          partial: false,
          cells: [
            { row: 0, column: 0, width: 100, height: 20 },
            { row: 0, column: 1, width: 100, height: 20 },
          ],
        },
      ],
    },
  };
  const calls = [];
  let active = true;
  const editor = {
    getEditorState: () => state,
    dispatchCommand: async (command, payload) => {
      calls.push([payload, command]);
      return { status: 'known-no-op', state };
    },
  };
  const host = {
    captureGeneratedTableGridSelection: () => ({
      state,
      section: 0,
      createdCell: { identity: request().identity, row: 0, column: 1 },
      current: () => active,
    }),
  };
  return {
    state,
    calls,
    editor,
    host,
    invalidate: () => {
      active = false;
    },
  };
}
test('generated address is exact and immutable; original physical owner injection refuses', () => {
  const value = request(),
    result = captureCreatedCellPropertiesRequest(value);
  value.expected.width = 999;
  value.size.height = 99;
  assert.equal(result.expected.width, 100);
  assert.equal(result.size.height, 30);
  for (const changed of [
    { ...request(), listNode: 3 },
    { ...request(), tableNode: 4 },
    { ...request(), identity: '01' },
    { ...request(), section: -0 },
    { ...request(), size: {} },
  ])
    assert.throws(() => captureCreatedCellPropertiesRequest(changed));
});
test('nested accessors never run; sparse border and canonical fill values reuse current validators', () => {
  let getterCalls = 0;
  const expected = { height: 20 };
  Object.defineProperty(expected, 'width', {
    enumerable: true,
    get() {
      getterCalls++;
      return 100;
    },
  });
  assert.throws(() => captureCreatedCellPropertiesRequest({ ...request(), expected }));
  assert.equal(getterCalls, 0);
  const value = captureCreatedCellPropertiesRequest({
    ...request(),
    appearance: {
      borders: { left: { style: 'SOLID', width: 10, color: 0x123456 } },
      fill: { kind: 'solid', color: 0xabcdef },
    },
  });
  assert.equal(value.appearance.borders.left.color, 0x123456);
  assert.equal(value.appearance.fill.color, 0xabcdef);
  assert.throws(() =>
    captureCreatedCellPropertiesRequest({
      ...request(),
      appearance: { fill: { kind: 'image', path: 'x' } },
    }),
  );
});
for (const format of ['hwp5', 'hwpx'])
  test(
    format +
      ' generated source message preserves null original selection and admits one typed owner only',
    async () => {
      const f = fixture(format),
        port = createCreatedCellPropertiesPort(f.editor, () => f.host),
        lease = port.capture();
      await port.apply(lease, { size: { height: 30 } });
      assert.equal(f.state.selection, null);
      assert.equal(f.calls.length, 1);
      assert.equal(f.calls[0][1].name, 'created-cell-properties');
      assert.equal(Object.hasOwn(f.calls[0][0], 'kind'), false);
      assert.equal(f.calls[0][0].identity, request().identity);
      assert.equal(Object.hasOwn(f.calls[0][0], 'listNode'), false);
      await assert.rejects(
        () => port.apply(lease, { size: { height: 30 } }),
        /StaleCreatedCellProperties/,
      );
    },
  );
test('old engine capability is not inferred from grid and no send occurs', async () => {
  const f = fixture();
  f.state.capabilities.createdTableGridAvailable = true;
  delete f.state.capabilities.createdCellPropertiesAvailable;
  const port = createCreatedCellPropertiesPort(f.editor, () => f.host);
  await assert.rejects(
    () => port.apply(port.capture(), { size: { height: 30 } }),
    /CreatedCellPropertiesUnavailable/,
  );
  assert.equal(f.calls.length, 0);
});
test('same-state A B A invalidation and mutated token refuse before dispatch', async () => {
  const f = fixture(),
    port = createCreatedCellPropertiesPort(f.editor, () => f.host),
    lease = port.capture();
  f.invalidate();
  await assert.rejects(
    () => port.apply(lease, { size: { height: 30 } }),
    /StaleCreatedCellProperties/,
  );
  const g = fixture(),
    second = createCreatedCellPropertiesPort(g.editor, () => g.host),
    old = second.capture();
  g.state.token.operationRevision++;
  await assert.rejects(
    () => second.apply(old, { size: { height: 30 } }),
    /StaleCreatedCellProperties/,
  );
  assert.equal(f.calls.length + g.calls.length, 0);
});
test('duplicate table, wrong expected size, readonly and partial data never publish a request', () => {
  for (const change of [
    (s) => s.content.createdTables.push(s.content.createdTables[0]),
    (s) => s.content.createdTables[0].cells[1].height++,
    (s) => {
      s.content.readOnly = true;
    },
    (s) => {
      s.content.limited = true;
    },
  ]) {
    const f = fixture();
    change(f.state);
    assert.throws(() => createdCellPropertiesMessage(request(), f.state));
    assert.equal(f.calls.length, 0);
  }
});
test('caller patch cannot retarget a captured generated cell to another valid cell', async () => {
  const f = fixture(),
    port = createCreatedCellPropertiesPort(f.editor, () => f.host),
    lease = port.capture();
  await assert.rejects(() => port.apply(lease, { column: 0, size: { height: 30 } }));
  assert.equal(f.calls.length, 0);
});
test('a fresh adjacent-cell own lease succeeds while old and forged leases cannot retarget', async () => {
  const f = fixture();
  let selectedColumn = 1,
    sequence = 0;
  const host = {
    captureGeneratedTableGridSelection() {
      const captured = sequence,
        column = selectedColumn;
      return {
        state: f.state,
        section: 0,
        createdCell: { identity: request().identity, row: 0, column },
        current: () => captured === sequence,
      };
    },
  };
  const port = createCreatedCellPropertiesPort(f.editor, () => host),
    old = port.capture();
  selectedColumn = 0;
  sequence++;
  const adjacent = port.capture();
  await assert.rejects(
    () => port.apply(old, { size: { height: 30 } }),
    /StaleCreatedCellProperties/,
  );
  await assert.rejects(
    () => port.apply({ ...adjacent }, { size: { height: 30 } }),
    /StaleCreatedCellProperties/,
  );
  await assert.rejects(
    () => port.apply(Object.freeze({ ...adjacent, identity: '17' }), { size: { height: 30 } }),
    /StaleCreatedCellProperties/,
  );
  assert.equal(f.calls.length, 0);
  await port.apply(adjacent, { size: { height: 30 } });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0].column, 0);
  assert.equal(f.calls[0][0].identity, request().identity);
  assert.equal(f.calls[0][0].row, 0);
  assert.equal(f.state.selection, null);
});
test('in-place state stamp changes and unknown patch fields refuse before a send', async () => {
  const f = fixture(),
    port = createCreatedCellPropertiesPort(f.editor, () => f.host),
    lease = port.capture();
  f.state.stateVersion++;
  await assert.rejects(
    () => port.apply(lease, { size: { height: 30 } }),
    /StaleCreatedCellProperties/,
  );
  const g = fixture(),
    next = createCreatedCellPropertiesPort(g.editor, () => g.host),
    current = next.capture();
  await assert.rejects(
    () => next.apply(current, { kind: 'cell-size', size: { height: 30 } }),
    /InvalidCreatedCellProperties/,
  );
  assert.equal(f.calls.length + g.calls.length, 0);
});
test('only an issued property lease can bind the dedicated modal owner', () => {
  const f = fixture();
  let binds = 0;
  const host = {
    captureCreatedCellPropertiesSelection: () => ({
      state: f.state,
      section: 0,
      createdCell: { identity: request().identity, row: 0, column: 1 },
      current: () => true,
      bindDialog: () => {
        binds++;
        return true;
      },
    }),
  };
  const port = createCreatedCellPropertiesPort(f.editor, () => host),
    lease = port.capture();
  assert.equal(port.bindDialog({ ...lease }, {}), false);
  assert.equal(binds, 0);
  assert.equal(port.bindDialog(lease, {}), true);
  assert.equal(binds, 1);
});
