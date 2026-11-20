import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createdCellTypingObservation,
  createdCellTypingDraftRanges,
} from '../../web/preview/created-cell-typing-observation.mjs';
import { projectCreatedCellDraft } from '../../web/preview/created-cell-draft.mjs';
import { FONT_LANGUAGES } from '../../js/font-face-identity.mjs';
function fixture(
  format = 'hwp5',
  text = 'A😀B',
  runs = [
    { start_unit: 0, char_shape_id: 0 },
    { start_unit: 1, char_shape_id: 5 },
    { start_unit: 3, char_shape_id: 9 },
    { start_unit: 4, char_shape_id: 0 },
  ],
) {
  const point = {
    section: 0,
    unit: text.length,
    createdCell: { identity: '9007199254740993', row: 0, column: 0 },
  };
  const cell = { paragraph_id: 1, row: 0, column: 0, text, character_runs: runs };
  const paragraph = { section: 0, createdCell: { ...point.createdCell }, text, editable: true };
  const content = {
    format,
    createdCellTypingScope: 7,
    createdTables: [{ section: 0, identity: point.createdCell.identity, cells: [cell] }],
    characterPropertiesAvailable: true,
    characterUnderlineAvailable: true,
    characterStrikeAvailable: true,
    characterTextColorAvailable: true,
    characterFontNameAvailable: true,
    characterShapes: [0, 5, 9].map((id) => ({ id, height: 1000, bold: id !== 0, italic: false })),
    characterUnderlines: [0, 5, 9].map((id) => ({ id, kind: id === 0 ? 'none' : 'bottom' })),
    characterStrikes: [0, 5, 9].map((id) => ({ id, enabled: id !== 0 })),
    characterTextColors: [0, 5, 9].map((id) => ({ id, color: id === 0 ? 0xffffff : 0 })),
    characterFontReferences: [0, 5, 9].map((id) => ({
      id,
      fontIds: Array(7).fill(id === 0 ? 0 : 1),
    })),
    fontFaces: FONT_LANGUAGES.flatMap((language) => [
      { language, id: 0, name: 'Base' },
      { language, id: 1, name: 'Rich' },
    ]),
  };
  return { content, paragraph, point, cell };
}
test('generated caret observes complete Native resource at visible EOF, ignoring terminator-only boundary', () => {
  for (const format of ['hwp5', 'hwpx']) {
    const f = fixture(format);
    const receipt = createdCellTypingObservation(f.content, f.paragraph, f.point);
    assert.equal(receipt.resourceId, 9);
    assert.equal(receipt.scope, 7);
    assert.equal(receipt.observation.underline, true);
    assert.equal(receipt.observation.strike, true);
    assert.equal(receipt.observation.textColor, '#000000');
    for (const language of FONT_LANGUAGES)
      assert.deepEqual(receipt.observation.fontNames[language], { kind: 'single', name: 'Rich' });
    assert.match(receipt.owner, /9007199254740993/);
    assert(!('paragraph' in receipt));
  }
});
test('generated caret preserves H5 interior right and HX interior left run affinity', () => {
  for (const [format, id] of [
    ['hwp5', 9],
    ['hwpx', 5],
  ]) {
    const f = fixture(format);
    f.point.unit = 3;
    assert.equal(createdCellTypingObservation(f.content, f.paragraph, f.point).resourceId, id);
  }
});
test('empty canonical Native paragraph owns its explicit default resource without a fake range', () => {
  const f = fixture('hwpx', '', [{ start_unit: 0, char_shape_id: 5 }]);
  assert.equal(
    createdCellTypingObservation(f.content, f.paragraph, f.point).observation.underline,
    true,
  );
});
test('drafts, stale/absent capabilities, old snapshots and split surrogates cannot grant a generated caret port', () => {
  const cases = [
    (f) => delete f.content.createdCellTypingScope,
    (f) => delete f.cell.character_runs,
    (f) => (f.paragraph.text = 'draft'),
    (f) => (f.point.unit = 2),
    (f) => f.content.createdTables.push({ ...f.content.createdTables[0] }),
    (f) => f.content.createdTables[0].cells.push({ ...f.cell }),
    (f) => (f.point.createdCell.identity = '0'),
  ];
  for (const change of cases) {
    const f = fixture();
    change(f);
    assert.equal(createdCellTypingObservation(f.content, f.paragraph, f.point), null);
  }
});
test('generated draft and caret use the same Native base resource at interior boundaries', () => {
  for (const [format, id] of [
    ['hwp5', 9],
    ['hwpx', 5],
  ]) {
    const f = fixture(format);
    f.point.unit = 3;
    const before = structuredClone(f.cell);
    const ranges = createdCellTypingDraftRanges(
      f.content,
      { ...f.paragraph, text: 'painted draft' },
      f.point,
      'A😀XB',
      { startUnit: 3, endUnit: 3 },
      'A😀B',
    );
    assert.equal(ranges.find((r) => r.start <= 3 && r.end > 3).charShapeId, id);
    const projected = projectCreatedCellDraft(f.content, { ...f.point, text: 'A😀XB' });
    assert.equal(
      projected.createdTables[0].cells[0].draftCharacterRanges.find(
        (r) => r.start <= 3 && r.end > 3,
      ).charShapeId,
      id,
    );
    assert.deepEqual(f.cell, before);
  }
});
test('generated replacement drafts preserve first-replaced style while pure EOF ignores the empty tail', () => {
  const f = fixture('hwpx');
  const replaced = createdCellTypingDraftRanges(
    f.content,
    f.paragraph,
    f.point,
    'A😀X',
    { startUnit: 3, endUnit: 4 },
    'A😀B',
  );
  assert.equal(replaced.find((r) => r.start <= 3 && r.end > 3).charShapeId, 9);
  const appended = createdCellTypingDraftRanges(
    f.content,
    f.paragraph,
    f.point,
    'A😀BX',
    { startUnit: 4, endUnit: 4 },
    'A😀B',
  );
  assert.equal(appended.find((r) => r.start <= 4 && r.end > 4).charShapeId, 9);
  assert.equal(
    createdCellTypingDraftRanges(f.content, f.paragraph, f.point, 'A😀BX', null, 'forged base'),
    null,
  );
});
