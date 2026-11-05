import test from 'node:test';
import assert from 'node:assert/strict';
import { getSelectionFormatting } from '../src/state/formatting-state.ts';
import { validateFormattingTarget } from '../src/commands/formatting.ts';
const langs = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'];
function state(at, edit = true) {
  const token = {
    editorId: 'editor',
    documentId: 'doc',
    generation: 1,
    operationRevision: 2,
    viewRevision: 3,
  };
  return {
    ...token,
    stateVersion: 1,
    status: 'ready',
    selection: {
      ...token,
      coordinateSpace: 'display',
      format: 'hwpx',
      owner: 'section:0:body',
      section: 0,
      paragraph: 0,
      startUnit: at,
      endUnit: at,
      affinity: 'forward',
    },
    content: {
      format: 'hwpx',
      paragraphs: [
        {
          section: 0,
          paragraph: 0,
          text: 'A😀B',
          selectionOwner: 'section:0:body',
          editable: edit,
          paragraphShape: { alignment: 1 },
          characterRanges: [
            { start: 0, end: 1, charShapeId: 0 },
            { start: 1, end: 4, charShapeId: 1 },
          ],
        },
      ],
      characterPropertiesAvailable: true,
      characterUnderlineAvailable: true,
      characterStrikeAvailable: true,
      characterTextColorAvailable: true,
      characterFontNameAvailable: true,
      paragraphAlignmentAvailable: true,
      characterShapes: [
        { id: 0, height: 1200, bold: false, italic: true },
        { id: 1, height: 2400, bold: true, italic: false },
      ],
      characterUnderlines: [
        { id: 0, kind: 'none' },
        { id: 1, kind: 'bottom' },
      ],
      characterStrikes: [
        { id: 0, enabled: false },
        { id: 1, enabled: true },
      ],
      characterTextColors: [
        { id: 0, color: 0x123456 },
        { id: 1, color: 0xabcdef },
      ],
      characterFontReferences: [
        { id: 0, fontIds: Array(7).fill(0) },
        { id: 1, fontIds: Array(7).fill(1) },
      ],
      fontFaces: langs.flatMap((language) => [
        { language, id: 0, name: '원 글꼴 ' + language },
        { language, id: 1, name: '둘째 글꼴 ' + language },
      ]),
    },
  };
}
test('실제 0길이 caret은 입력 span의 현재 값을 읽되 문서 서식 쓰기는 거부한다', () => {
  for (const at of [0, 1, 3, 4]) {
    const s = state(at),
      v = getSelectionFormatting(s),
      second = at >= 3;
    assert.equal(v.target.startUnit, at);
    assert.equal(v.target.endUnit, at);
    assert.equal(v.bold, second);
    assert.equal(v.italic, !second);
    assert.equal(v.size, second ? 2400 : 1200);
    assert.equal(v.textColor, second ? '#abcdef' : '#123456');
    assert.equal(v.underline, second);
    assert.equal(v.strike, second);
    for (const lang of langs)
      assert.equal(v.fontNames[lang].name, (second ? '둘째 글꼴 ' : '원 글꼴 ') + lang);
    assert.equal(v.characterAvailableReason, 'EmptyCharacterSelection');
    assert.throws(() => validateFormattingTarget(s.selection, s, true), /EmptyCharacterSelection/);
  }
});
test('readonly caret은 Native 표시값만 읽고 writer 비활성을 유지한다', () => {
  const s = state(3, false),
    v = getSelectionFormatting(s);
  assert.equal(v.bold, true);
  assert.equal(v.size, 2400);
  assert.equal(v.textColor, '#abcdef');
  assert.equal(v.characterAvailableReason, 'SelectionNotEditable');
  assert.throws(() => validateFormattingTarget(s.selection, s, true), /SelectionNotEditable/);
});
test('손상된 UTF16·owner·token은 거부하고 원본참조 없는 유효 caret은 readonly만 관측한다', () => {
  for (const edit of [
    (s) => (s.selection.startUnit = s.selection.endUnit = 2),
    (s) => (s.selection.owner = '다른 소유자'),
    (s) => s.selection.operationRevision--,
  ]) {
    const s = state(3);
    edit(s);
    assert.equal(getSelectionFormatting(s).target, null);
  }
  const s = state(3);
  s.content.format = s.selection.format = 'hwp5';
  const observed = getSelectionFormatting(s);
  assert.equal(observed.bold, true);
  assert.equal(observed.size, 2400);
  assert.equal(observed.characterAvailableReason, 'UnsupportedFormattingReference');
  assert.throws(
    () => validateFormattingTarget(s.selection, s, true),
    /UnsupportedFormattingReference/,
  );
});
test('빈 원문은 unknown이고 created cell의 확인된 readonly값은 writer 권한과 분리한다', () => {
  const s = state(0);
  s.content.paragraphs[0].text = '';
  s.content.paragraphs[0].characterRanges = [];
  const v = getSelectionFormatting(s);
  assert.equal(v.bold, null);
  assert.equal(v.size, null);
  assert.equal(v.textColor, null);
  const c = state(3);
  c.content.paragraphs[0].createdCell = { id: 1 };
  const observed = getSelectionFormatting(c);
  assert.equal(observed.bold, true);
  assert.equal(observed.size, 2400);
  assert.equal(observed.characterAvailableReason, 'CreatedCellRequiresSurfacePort');
  assert.throws(
    () => validateFormattingTarget(c.selection, c, true),
    /CreatedCellRequiresSurfacePort/,
  );
});
test('nonempty 단일 범위와 capability 없는 caret의 기존 거부를 보존한다', () => {
  const s = state(0);
  s.selection.endUnit = 1;
  assert.equal(getSelectionFormatting(s).bold, false);
  assert.equal(getSelectionFormatting(s).characterAvailableReason, null);
  const c = state(3);
  c.content.characterPropertiesAvailable = false;
  assert.equal(getSelectionFormatting(c).bold, null);
  assert.equal(getSelectionFormatting(c).size, null);
});
