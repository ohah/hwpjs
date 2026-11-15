import test from 'node:test';
import assert from 'node:assert/strict';
import { richTypingOwnerAllowed } from '../../web/preview/caret-formatting-intent.mjs';
import {
  prepareRichTypingTarget,
  richTypingProjectionOwners,
} from '../../web/preview/rich-typing-admission.mjs';
import { validateHwp5CurrentBodyReference } from '../../web/preview/hwp5-current-body-reference.mjs';

const reference = (kind = 'original') => ({
  epoch: '1',
  scope: 'test',
  kind,
  section: 0,
  id: 7,
  row: 0,
  column: 0,
});
function fixture(format = 'hwp5', host = 'body') {
  const ref = reference();
  const flow = {
    paragraph: 0,
    host,
    top_level: host === 'body',
    parent_node: host === 'body' ? null : 5,
    list_node: host === 'body' ? null : 6,
  };
  const editor = {
    supportsRichTypingAbi: () => true,
    historyRevision: () => 3,
    supportsCurrentSourceReferences: () => true,
    currentSourceReferences: () => ({ version: 1, first: 0, total: 1, references: [ref] }),
    paragraphFlow: () => [flow],
    canEdit: () => true,
    anchorText: () => 'AB',
  };
  const message = {
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 0,
    text: '한😀',
    reference: ref,
    richTypingScope: 9,
    expectedHistoryRevision: 3,
    insertion: { character: { textColor: 0 } },
  };
  return {
    editor,
    format,
    message,
    scope: 9,
    projection: { editor, scope: 9, revision: 3, owners: new Map([[0, new Map([[0, 'plain']])]]) },
    flow,
  };
}
for (const format of ['hwp5', 'hwpx']) {
  for (const owner of ['body', 'cell', 'drawing']) {
    test(`${format} caret rich formatting admits native source ${owner}`, () => {
      const row = {
        section: 0,
        paragraph: 0,
        editable: true,
        plainEditable: true,
        currentReference: reference(),
        selectionOwner: 'section:0:body',
        ...(owner === 'cell'
          ? { tableCell: { tableNode: 5, listNode: 6 } }
          : owner === 'drawing'
            ? { drawingText: { drawingNode: 5, listNode: 6 } }
            : {}),
      };
      assert.equal(richTypingOwnerAllowed(format, row), true);
      const f = fixture(format, owner === 'cell' ? 'table_cell' : owner);
      const target = prepareRichTypingTarget(f);
      assert.equal(target.paragraph, format === 'hwpx' ? 1 : 0);
      assert.equal(target.text, '한😀');
      assert.equal(target.insertion.character.textColor, 0);
    });
  }
}
test('ambiguous, clipped, unknown and created owners cannot acquire source rich formatting', () => {
  const row = {
    section: 0,
    editable: true,
    plainEditable: true,
    currentReference: reference(),
    tableCell: { tableNode: 5, listNode: 6 },
  };
  for (const patch of [
    { clipped: true },
    { editable: false },
    { createdCell: {} },
    { drawingText: { drawingNode: 5, listNode: 6 } },
    { tableCell: { tableNode: NaN, listNode: 6 } },
  ])
    assert.equal(richTypingOwnerAllowed('hwp5', { ...row, ...patch }), false);
  assert.equal(
    richTypingOwnerAllowed('hwpx', { ...row, tableCell: null, selectionOwner: null }),
    false,
  );
});
test('H5 admission checks every exact current reference field and native list membership', () => {
  const inherited = fixture('hwp5', 'table_cell');
  inherited.message = Object.assign(
    Object.create({ reference: inherited.message.reference }),
    inherited.message,
  );
  delete inherited.message.reference;
  assert.throws(() => prepareRichTypingTarget(inherited), /UnsupportedRichTypingOwner/);
  for (const key of ['epoch', 'scope', 'kind', 'section', 'id', 'row', 'column']) {
    const f = fixture('hwp5', 'table_cell');
    f.message.reference = { ...f.message.reference, [key]: 'forged' };
    assert.throws(() => prepareRichTypingTarget(f));
  }
  for (const patch of [
    { host: 'other' },
    { top_level: true },
    { parent_node: null },
    { list_node: null },
    { paragraph: 1 },
  ]) {
    const f = fixture('hwp5', 'table_cell');
    Object.assign(f.flow, patch);
    assert.throws(() => prepareRichTypingTarget(f), /UnsupportedRichTypingOwner/);
  }
  const f = fixture('hwp5', 'table_cell');
  assert.throws(
    () => validateHwp5CurrentBodyReference(f.editor, f.message, 'ref', 'body-only'),
    /body-only/,
  );
  f.message.reference.kind = 'generated';
  assert.throws(() => prepareRichTypingTarget(f), /UnsupportedRichTypingOwner/);
});
test('scope/revision, unsupported text, format and HX receipt cannot bypass native admission', () => {
  for (const patch of [
    { richTypingScope: 10 },
    { expectedHistoryRevision: 4 },
    { text: 'a\nb' },
    { text: '' },
    { paragraph: -1 },
    { rangePolicy: 'ignore' },
  ]) {
    const f = fixture();
    Object.assign(f.message, patch);
    assert.throws(() => prepareRichTypingTarget(f));
  }
  for (const mutate of [
    (f) => {
      f.projection.editor = {};
    },
    (f) => {
      f.projection.revision++;
    },
    (f) => {
      f.projection.scope++;
    },
    (f) => {
      f.projection.owners.clear();
    },
    (f) => {
      f.editor.canEdit = () => false;
    },
    (f) => {
      f.createdTablesPending = true;
    },
  ]) {
    const f = fixture('hwpx');
    mutate(f);
    assert.throws(() => prepareRichTypingTarget(f), /UnsupportedRichTypingOwner/);
  }
});
test('bounded native projection uses one pass and preserves section identity', () => {
  const rows = Array.from({ length: 10000 }, (_, i) => ({
    section: i % 2,
    paragraph: i,
    editable: true,
    plainEditable: true,
  }));
  let reads = 0;
  for (const row of rows)
    Object.defineProperty(row, 'clipped', {
      get() {
        reads++;
        return false;
      },
    });
  const owners = richTypingProjectionOwners(rows);
  assert.equal(reads, rows.length);
  assert.equal(owners.get(0).size, 5000);
  assert.equal(owners.get(1).has(3), true);
  assert.throws(() => richTypingProjectionOwners([rows[0], rows[0]]), /DuplicateRichTypingOwner/);
  assert.equal(richTypingProjectionOwners([{ ...rows[0], clipped: true }]).size, 0);
});
test('HWPX original body with retained anchors keeps native anchored mode', () => {
  const f = fixture('hwpx');
  const row = {
    section: 0,
    paragraph: 0,
    selectionOwner: 'section:0:body',
    editable: true,
    plainEditable: false,
    anchorEditable: true,
  };
  assert.equal(richTypingOwnerAllowed('hwpx', row), true);
  f.projection.owners = richTypingProjectionOwners([row]);
  f.editor.canEdit = () => {
    throw Error('WrongPlainMode');
  };
  assert.equal(prepareRichTypingTarget(f).textMode, 'anchored');
  f.editor.anchorText = () => {
    throw Error('ProtectedAnchor');
  };
  assert.throws(() => prepareRichTypingTarget(f), /ProtectedAnchor/);
});
