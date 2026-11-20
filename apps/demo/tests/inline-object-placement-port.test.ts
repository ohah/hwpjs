import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../../packages/core/src/state/editor-state.ts';
import * as core from '../../../packages/core/src/commands/inline-object-insert.ts';
import { createInlineObjectInsertPort } from '../src/inline-object-insert-port.ts';
const token = {
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 2,
  viewRevision: 3,
};
const options = {
  width: 200,
  height: 100,
  categories: ['A'],
  series: [{ name: 'S', values: [1] }],
};
test('UI lease captures Native-issued generated owner; selection movement revokes it before dispatch', async () => {
  const state = new EditorState({
    ...token,
    status: 'ready',
    stateVersion: 8,
    nativeHistoryRevision: 4,
    nativeHistoryStats: { protocolVersion: 2 } as any,
    content: {
      format: 'hwpx',
      limited: false,
      chartCreationAvailable: true,
      inlineObjectPlacementVersion: 1,
      chartCreateProfileVersion: 1,
      paragraphs: [],
      createdTables: [{ section: 2, identity: '3', cells: [{ row: 0, column: 1, text: 'CELL' }] }],
    },
  });
  let current = true,
    queries = 0;
  const writes: unknown[] = [];
  const target = {
    ...token,
    coordinateSpace: 'inline-object' as const,
    format: 'hwpx' as const,
    address: {
      section: 2,
      unit: 1,
      expected_text: 'CELL',
      owner: {
        kind: 'createdCell' as const,
        binding: { session: 's7', revision: 4, serial: '8' },
        identity: '3',
        row: 0,
        column: 1,
      },
    },
  };
  const editor = {
    getEditorState: () => state,
    registerStateListener: () => () => {},
    async getInlineObjectInsertTarget(selector: unknown, unit: number) {
      queries++;
      assert.deepEqual(selector, {
        section: 2,
        created_cell: { identity: '3', row: 0, column: 1 },
      });
      assert.equal(unit, 1);
      return target;
    },
    async dispatchCommand(_command: unknown, payload: unknown) {
      writes.push(payload);
      return { status: 'committed-with-snapshot' as const };
    },
  };
  const port = createInlineObjectInsertPort(editor as any, core, () => ({
    state,
    selector: { section: 2, created_cell: { identity: '3', row: 0, column: 1 } },
    unit: 1,
    expected_text: 'CELL',
    current: () => current,
  }));
  assert.equal(port.presentation('chart').enabled, true);
  const capture = await port.captureAtCaret('chart');
  assert.equal(queries, 1);
  assert.equal(Object.hasOwn(capture.target!.address, 'paragraph'), false);
  target.address.unit = 2;
  assert.equal(capture.target!.address.unit, 1);
  assert(Object.isFrozen(capture.target!.address.owner!.binding));
  target.address.unit = 1;
  assert.equal(port.chartCreateProfileVersion(), 1);
  current = false;
  assert.equal(port.current(capture), false);
  await assert.rejects(port.insert(capture, options), /Stale/);
  assert.equal(writes.length, 0);
  current = true;
  const next = await port.captureAtCaret('chart');
  await port.insert(next, options);
  assert.equal(writes.length, 1);
  assert.deepEqual((writes[0] as any).target, target);
});
