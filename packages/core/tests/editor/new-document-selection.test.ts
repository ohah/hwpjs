import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../src/state/editor-state.ts';
import { createNewDocumentSelection } from '../../src/editor/new-document-selection.ts';
import { selectionMessage } from '../../src/commands/selection.ts';
function state(row: Record<string, unknown> = {}, content: Record<string, unknown> = {}) {
  return new EditorState({
    editorId: 'e',
    documentId: 'fresh',
    generation: 2,
    operationRevision: 7,
    savedOperationRevision: 7,
    viewRevision: 3,
    stateVersion: 4,
    status: 'ready',
    content: {
      format: 'hwp5',
      paragraphs: [
        {
          section: 0,
          paragraph: 0,
          selectionOwner: 'section:0:body',
          editable: true,
          text: '\ufffc\ufffc',
          sourceOffsets: [
            { at: 0, source: 0 },
            { at: 1, source: 8 },
            { at: 2, source: 16 },
          ],
          currentReference: {
            epoch: '2',
            kind: 'original',
            section: 0,
            id: '0',
            row: 0,
            column: 0,
            scope: '1',
          },
          structuralAnchors: [
            {
              kind: 'section',
              control_node: 3,
              paragraph: 0,
              source_unit: 0,
              current_unit: 0,
              unit: 0,
            },
            {
              kind: 'column',
              control_node: 5,
              paragraph: 0,
              source_unit: 8,
              current_unit: 8,
              unit: 1,
            },
          ],
          ...row,
        },
      ],
      ...content,
    },
  });
}
test('verified two-control empty HWP5 shape chooses the end of the nonprinting prefix', () => {
  const ready = state(),
    target = createNewDocumentSelection(ready)!;
  assert.equal(target.startUnit, 2);
  assert.equal(target.endUnit, 2);
  assert.equal(selectionMessage(target, ready).startUnit, 16);
  assert.equal(Object.isFrozen(target), true);
});
for (const [name, row] of [
  ['one placeholder', { text: '\ufffc' }],
  ['three placeholders', { text: '\ufffc\ufffc\ufffc' }],
  ['visible content', { text: '\ufffc\ufffcA' }],
  ['unproven empty text', { text: '' }],
  ['missing offsets', { sourceOffsets: undefined }],
  ['missing structural proof', { structuralAnchors: undefined }],
  ['empty structural proof', { structuralAnchors: [] }],
  ['sparse structural proof', { structuralAnchors: Object.assign([], { length: 2 }) }],
  ['wrong structural kinds', { structuralAnchors: [{ kind: 'table' }, { kind: 'column' }] }],
  ['source policy error', { textSourcePolicyError: 'InvalidSourcePolicy' }],
  [
    'one long object',
    {
      sourceOffsets: [
        { at: 0, source: 0 },
        { at: 2, source: 16 },
      ],
    },
  ],
  [
    'wrong first control width',
    {
      sourceOffsets: [
        { at: 0, source: 0 },
        { at: 1, source: 7 },
        { at: 2, source: 16 },
      ],
    },
  ],
  [
    'wrong final source position',
    {
      sourceOffsets: [
        { at: 0, source: 0 },
        { at: 1, source: 8 },
        { at: 2, source: 15 },
      ],
    },
  ],
  [
    'extra mapping',
    {
      sourceOffsets: [
        { at: 0, source: 0 },
        { at: 1, source: 8 },
        { at: 2, source: 16 },
        { at: 3, source: 17 },
      ],
    },
  ],
  [
    'reversed offsets',
    {
      sourceOffsets: [
        { at: 0, source: 0 },
        { at: 2, source: 16 },
        { at: 1, source: 8 },
      ],
    },
  ],
  ['sparse mapping', { sourceOffsets: Object.assign([], { length: 3 }) }],
  ['nested table', { tableCell: { tableNode: 1, listNode: 2 } }],
  ['drawing text', { drawingText: { drawingNode: 1, listNode: 2 } }],
  ['drawing caption', { drawingCaption: { drawingNode: 1, listNode: 2 } }],
  ['created cell', { createdCell: {} }],
  ['clipped', { clipped: true }],
  ['read only row', { editable: false }],
  ['unknown editability', { editable: undefined }],
  ['nonzero section', { section: 1 }],
  ['nonzero paragraph', { paragraph: 1 }],
  ['different owner', { selectionOwner: 'section:0:header' }],
] as const)
  test(`unverified ${name} never guesses a caret by stripping placeholders`, () => {
    assert.equal(createNewDocumentSelection(state(row)), undefined);
  });
test('multiple paragraphs or read-only document cannot claim the authored empty shape', () => {
  assert.equal(createNewDocumentSelection(state({}, { paragraphs: [{}, {}] })), undefined);
  assert.equal(createNewDocumentSelection(state({}, { readOnly: true })), undefined);
});
test('empty HWPX chooses zero, but object placeholders do not become a generic skip rule', () => {
  assert.equal(createNewDocumentSelection(state({ text: '' }, { format: 'hwpx' }))?.startUnit, 0);
  assert.equal(createNewDocumentSelection(state({}, { format: 'hwpx' })), undefined);
});
