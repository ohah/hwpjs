import test from 'node:test';
import assert from 'node:assert/strict';
import { hwp5StructuralEditableStart } from '../../js/hwp5-structural-edit-boundary.mjs';
function row(patch = {}) {
  return {
    section: 0,
    paragraph: 0,
    selectionOwner: 'section:0:body',
    text: '\ufffc\ufffc',
    currentReference: {
      kind: 'original',
      section: 0,
      id: '0',
      epoch: '2',
      scope: '1',
      row: 0,
      column: 0,
    },
    sourceOffsets: [
      { at: 0, source: 0 },
      { at: 1, source: 8 },
      { at: 2, source: 16 },
    ],
    structuralAnchors: [
      { kind: 'section', paragraph: 0, control_node: 3, source_unit: 0, current_unit: 0, unit: 0 },
      { kind: 'column', paragraph: 0, control_node: 5, source_unit: 8, current_unit: 8, unit: 1 },
    ],
    ...patch,
  };
}
test('the proven original section/column prefix starts at display2 before and after typing', () => {
  assert.equal(hwp5StructuralEditableStart(row()), 2);
  assert.equal(hwp5StructuralEditableStart(row({ text: '\ufffc\ufffc첫A' })), 2);
  const value = row();
  value.sourceOffsets.push({ at: 9, source: 30 });
  assert.equal(hwp5StructuralEditableStart(value), 2);
});
for (const [name, patch] of [
  ['empty text', { text: '' }],
  ['one object', { text: '\ufffc' }],
  ['inline objects', { text: 'A\ufffc\ufffc' }],
  ['no source map', { sourceOffsets: undefined }],
  ['sparse map', { sourceOffsets: Object.assign([], { length: 3 }) }],
  ['unproven objects', { structuralAnchors: undefined }],
  ['sparse anchors', { structuralAnchors: Object.assign([], { length: 2 }) }],
  ['extra anchors', { structuralAnchors: [{}, {}, {}] }],
  ['missing current reference', { currentReference: undefined }],
  ['nested cell', { tableCell: {} }],
  ['drawing', { drawingText: {} }],
  ['caption', { drawingCaption: {} }],
  ['generated cell', { createdCell: {} }],
  ['clipped', { clipped: true }],
  ['source policy error', { textSourcePolicyError: 'InvalidSource' }],
  ['invalid section', { section: NaN }],
  ['invalid paragraph', { paragraph: -1 }],
  ['wrong owner', { selectionOwner: 'section:0:header' }],
])
  test(`${name} retains zero without guessing an editable prefix`, () => {
    assert.equal(hwp5StructuralEditableStart(row(patch)), 0);
  });
for (const [field, value] of [
  ['kind', 'generated'],
  ['kind', 'cell'],
  ['section', 1],
  ['epoch', ''],
  ['id', ''],
  ['scope', ''],
  ['row', 1],
  ['column', NaN],
])
  test(`reference ${field}=${value} does not prove the original prefix`, () => {
    const valueRow = row();
    valueRow.currentReference[field] = value;
    assert.equal(hwp5StructuralEditableStart(valueRow), 0);
  });
for (const [field, value] of [
  ['kind', 'table'],
  ['paragraph', 1],
  ['source_unit', 9],
  ['current_unit', 9],
  ['unit', 2],
  ['control_node', -1],
  ['control_node', NaN],
])
  test(`anchor ${field}=${value} does not prove the leading pair`, () => {
    const valueRow = row();
    valueRow.structuralAnchors[1][field] = value;
    assert.equal(hwp5StructuralEditableStart(valueRow), 0);
  });
test('duplicate controls, shifted controls and mismatched offset boundaries retain zero', () => {
  const duplicate = row();
  duplicate.structuralAnchors[1].control_node = 3;
  assert.equal(hwp5StructuralEditableStart(duplicate), 0);
  const shifted = row();
  shifted.structuralAnchors[0].current_unit = 2;
  assert.equal(hwp5StructuralEditableStart(shifted), 0);
  const offsets = row();
  offsets.sourceOffsets[1].source = 7;
  assert.equal(hwp5StructuralEditableStart(offsets), 0);
});
test('inspection stays bounded to the leading pair, even for a long paragraph and mapping', () => {
  const value = row({ text: '\ufffc\ufffc' + 'A'.repeat(100000) });
  value.sourceOffsets = new Proxy(value.sourceOffsets, {
    get(target, key, receiver) {
      if (
        key === '3' ||
        key === 'map' ||
        key === 'find' ||
        key === 'findLast' ||
        key === Symbol.iterator
      )
        throw Error('UnboundedMappingRead');
      return Reflect.get(target, key, receiver);
    },
  });
  assert.equal(hwp5StructuralEditableStart(value), 2);
});
