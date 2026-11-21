import test from 'node:test';
import assert from 'node:assert/strict';
import { createTableCellPropertiesPort } from '../src/table-cell-properties-port.ts';
import { SET_ORIGINAL_CELL_VERTICAL_ALIGNMENT_COMMAND } from '@hwpjs/core';
function setup() {
  let state: any = { id: 1 },
    live = true,
    queries = 0;
  const target: any = Object.freeze({}),
    source: any = Object.freeze({});
  const writes: any[] = [];
  const editor: any = {
    getEditorState: () => state,
    async getOriginalCellVerticalAlignment(selected: any) {
      assert.equal(selected, source);
      queries++;
      return {
        state: 'available',
        target,
        value: 'TOP',
        selector: { section: 0, paragraph: 0, tableNode: 2, listNode: 3 },
      };
    },
    async dispatchCommand(command: any, payload: any) {
      writes.push({ command, payload });
      return { status: 'committed-with-snapshot' };
    },
  };
  const selected: any = { state, target: source, current: () => live, bindDialog: () => live };
  const port = createTableCellPropertiesPort(editor, {
    captureOriginalCellPropertiesSelection: () => selected,
  });
  return {
    port,
    writes,
    target,
    queries: () => queries,
    stale() {
      live = false;
    },
    replace() {
      state = { id: 2 };
    },
    editor,
  };
}
test('existing table-cell properties port captures binds and commits original alignment once', async () => {
  const h = setup(),
    read = await h.port.captureVerticalAlignment();
  assert.equal(read.state, 'available');
  if (read.state !== 'available') throw Error('unavailable');
  assert.equal(read.capture.value, 'TOP');
  assert.equal(h.port.bindVerticalAlignmentDialog(read.capture, {} as any), true);
  const result = await h.port.applyVerticalAlignment(read.capture, 'BOTTOM');
  assert.equal(result.status, 'committed-with-snapshot');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].command, SET_ORIGINAL_CELL_VERTICAL_ALIGNMENT_COMMAND);
  assert.deepEqual(h.writes[0].payload, { target: h.target, value: 'BOTTOM' });
  await assert.rejects(
    h.port.applyVerticalAlignment(read.capture, 'CENTER'),
    /StaleOriginalCellSelection/,
  );
  assert.equal(h.queries(), 1);
});
test('properties source port refuses stale selection and foreign capture before command', async () => {
  const h = setup(),
    read = await h.port.captureVerticalAlignment();
  if (read.state !== 'available') throw Error('unavailable');
  h.stale();
  assert.equal(h.port.bindVerticalAlignmentDialog(read.capture, {} as any), false);
  await assert.rejects(
    h.port.applyVerticalAlignment(read.capture, 'TOP'),
    /StaleOriginalCellSelection/,
  );
  await assert.rejects(h.port.applyVerticalAlignment({}, 'TOP'), /StaleOriginalCellSelection/);
  assert.equal(h.writes.length, 0);
});
test('properties source port rejects replaced document after async Native query and disposed handle', async () => {
  const h = setup();
  const original = h.editor.getOriginalCellVerticalAlignment;
  h.editor.getOriginalCellVerticalAlignment = async (t: any) => {
    const r = await original(t);
    h.replace();
    return r;
  };
  await assert.rejects(h.port.captureVerticalAlignment(), /StaleOriginalCellSelection/);
  const q = setup(),
    read = await q.port.captureVerticalAlignment();
  if (read.state !== 'available') throw Error('unavailable');
  q.port.dispose();
  await assert.rejects(
    q.port.applyVerticalAlignment(read.capture, 'BOTTOM'),
    /StaleOriginalCellSelection/,
  );
  assert.equal(q.writes.length, 0);
});
