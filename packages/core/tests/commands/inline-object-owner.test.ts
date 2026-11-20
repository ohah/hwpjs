import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../src/state/editor-state.ts';
import {
  inlineObjectInsertMessage,
  captureInlineObjectInsertPayload,
  getInlineObjectInsertAvailability,
} from '../../src/commands/inline-object-insert.ts';
import type { InlineObjectCreateTarget } from '../../src/commands/inline-object-owner.ts';

const token = {
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 2,
  viewRevision: 3,
};
const binding = { session: 's7', revision: 4, serial: '9007199254740993' };
const chart = { width: 200, height: 100, categories: ['A'], series: [{ name: 'S', values: [1] }] };
const equation = {
  width: 200,
  height: 100,
  script: 'x',
  baseLine: 80,
  baseUnit: 1000,
  version: 'v',
  font: 'f',
};
const content = {
  format: 'hwpx',
  limited: false,
  inlineObjectPlacementVersion: 1,
  chartCreationAvailable: true,
  equationInsertionAvailable: true,
  paragraphs: [
    {
      section: 2,
      paragraph: 5,
      text: '앞😀뒤',
      editable: true,
      tableCell: { tableNode: 4, listNode: 7 },
    },
  ],
  createdTables: [
    { section: 2, identity: '9007199254740993', cells: [{ row: 0, column: 1, text: '앞😀뒤' }] },
  ],
};
const state = (patch = {}) =>
  new EditorState({
    ...token,
    status: 'ready',
    stateVersion: 8,
    nativeHistoryRevision: 4,
    nativeHistoryStats: { protocolVersion: 2 } as any,
    content,
    ...patch,
  });
const target = (created = true): InlineObjectCreateTarget =>
  ({
    ...token,
    coordinateSpace: 'inline-object',
    format: 'hwpx',
    address: {
      section: 2,
      ...(created ? {} : { paragraph: 6 }),
      unit: 3,
      expected_text: '앞😀뒤',
      owner: created
        ? { kind: 'createdCell', binding, identity: '9007199254740993', row: 0, column: 1 }
        : { kind: 'sourceCell', binding, table_node: 4, list_node: 7 },
    },
  }) as InlineObjectCreateTarget;

for (const kind of ['chart', 'equation'] as const)
  for (const created of [true, false])
    test(`${kind} headless typed ${created ? 'generated' : 'source'} cell target carries exact owner without Surface`, () => {
      const input = {
        target: target(created),
        selectionVersion: 8,
        options: kind === 'chart' ? chart : equation,
      };
      const owned = captureInlineObjectInsertPayload(input, kind);
      const message = inlineObjectInsertMessage(owned, state(), kind) as any;
      const wire = message.request.target ?? message.request;
      assert.equal(wire.section, 2);
      assert.equal(Object.hasOwn(wire, 'paragraph'), !created);
      assert.deepEqual(wire.owner, input.target.address.owner);
      assert.equal(wire.expected_text ?? wire.expectedText, '앞😀뒤');
      assert.notEqual((owned.target as InlineObjectCreateTarget).address.owner?.binding, binding);
    });
test('typed owner rejects old capabilities, stale revision/token, mismatched witness/cell and surrogate split', () => {
  const invoke = (s = state(), t = target()) =>
    inlineObjectInsertMessage({ target: t, selectionVersion: 8, options: chart }, s, 'chart');
  assert.throws(
    () => invoke(state({ content: { ...content, inlineObjectPlacementVersion: 0 } })),
    /PlacementUnavailable/,
  );
  assert.throws(() => invoke(state({ nativeHistoryRevision: 5 })), /StaleInlineObjectOwner/);
  assert.throws(() => invoke(state({ operationRevision: 3 })), /StaleInlineObjectInsertSelection/);
  assert.throws(
    () =>
      invoke(state(), { ...target(), address: { ...target().address, expected_text: 'wrong' } }),
    /TextMismatch/,
  );
  assert.throws(
    () => invoke(state(), { ...target(), address: { ...target().address, unit: 2 } }),
    /ScalarBoundary/,
  );
  assert.throws(
    () => invoke(state({ content: { ...content, createdTables: [] } })),
    /InvalidInlineObjectOwner/,
  );
});
test('owner capture rejects foreign token objects without freezing caller data', () => {
  const foreign = { mutable: true };
  assert.throws(
    () =>
      captureInlineObjectInsertPayload(
        { target: { ...target(), documentId: foreign }, selectionVersion: 8, options: chart },
        'chart',
      ),
    /InvalidInlineObjectOwner/,
  );
  assert.equal(Object.isFrozen(foreign), false);
});
test('pending host requires versioned owner while default body capture remains legacy without pending tables', () => {
  const legacy = {
    ...token,
    coordinateSpace: 'display' as const,
    format: 'hwpx' as const,
    owner: 'section:0:body',
    section: 0,
    paragraph: 0,
    startUnit: 3,
    endUnit: 3,
    affinity: 'backward' as const,
  };
  const body = {
    ...content,
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: '앞😀뒤',
        selectionOwner: 'section:0:body',
        editable: true,
        plainEditable: true,
      },
    ],
    createdTableHostPending: true,
  };
  const pending = state({ content: body, selection: legacy });
  assert.equal(
    getInlineObjectInsertAvailability(pending, 'chart').reason,
    'InlineObjectOwnerRequired',
  );
  const typed: InlineObjectCreateTarget = {
    ...token,
    coordinateSpace: 'inline-object',
    format: 'hwpx',
    address: {
      section: 0,
      paragraph: 1,
      unit: 3,
      expected_text: '앞😀뒤',
      affinity: 'backward',
      owner: { kind: 'body', binding },
    },
  };
  assert.equal(getInlineObjectInsertAvailability(pending, 'chart', undefined, typed).enabled, true);
  const ordinary = state({
    content: { ...body, createdTableHostPending: false },
    selection: legacy,
  });
  const message = inlineObjectInsertMessage(
    { target: legacy, selectionVersion: 8, options: chart },
    ordinary,
    'chart',
  );
  if (!('target' in message.request)) throw Error('ExpectedChartMessage');
  assert.equal(Object.hasOwn(message.request.target, 'owner'), false);
  assert.equal(Object.hasOwn(message.request.target, 'affinity'), false);
});
