import test from 'node:test';
import assert from 'node:assert/strict';
import { queryPrefixRoute } from '../../tools/hwpx-prefix-route-query.mjs';

test('prefix route query uses native eligibility without calling any mutator', () => {
  for (const kind of ['plain', 'outside', 'anchored', 'field']) {
    const editor = {
      canEdit: () => kind === 'plain',
      canEditOutsideField: (...args) => {
        assert.deepEqual(args, [2, 7, 0, 0]);
        return kind === 'outside';
      },
      anchorText() {
        if (kind !== 'anchored') throw new Error('UnsupportedStructuralFieldEdit');
        return '';
      },
      fieldLabels: () => [{ start: 0, end: 0, beginElement: 42 }],
      splice() {
        throw new Error('MustNotMutate');
      },
      spliceAnchored() {
        throw new Error('MustNotMutate');
      },
      spliceFieldLabel() {
        throw new Error('MustNotMutate');
      },
    };
    assert.equal(queryPrefixRoute(editor, 2, 7), kind === 'outside' ? 'plain' : kind);
  }
});

test('prefix route query preserves missing ABI fallback, ambiguity and unexpected failures', () => {
  const editor = {
    canEdit: () => false,
    anchorText() {
      throw new Error('UnsupportedParagraphControl');
    },
    fieldLabels: () => [],
  };
  assert.throws(() => queryPrefixRoute(editor, 0, 1), /UnsupportedFieldLabelRange/);
  editor.fieldLabels = () => [
    { start: 0, end: 0, beginElement: 1 },
    { start: 0, end: 0, beginElement: 2 },
  ];
  assert.throws(() => queryPrefixRoute(editor, 0, 1), /UnsupportedFieldLabelRange/);
  editor.fieldLabels = () => [{ start: 0, end: 0, beginElement: 1 }];
  assert.equal(queryPrefixRoute(editor, 0, 1), 'field');
  editor.canEditOutsideField = () => {
    throw new Error('HwpxOutsideFieldQueryAbiUnavailable');
  };
  assert.equal(queryPrefixRoute(editor, 0, 1), 'field');
  editor.canEditOutsideField = () => {
    throw new Error('OutOfMemory');
  };
  assert.throws(() => queryPrefixRoute(editor, 0, 1), /OutOfMemory/);
});
