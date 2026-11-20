// Native DTO의 읽기 투영만 검사합니다. 엔진 실행·편집 권한 증거가 아닙니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createdCellClipboardSource,
  createdCellTypingOwner,
} from '../../../web/preview/created-cell-typing-observation.mjs';
function fixture() {
  const point = {
    section: 1,
    createdCell: { identity: '9007199254740993', row: 0, column: 0 },
    unit: 1,
  };
  const cell = { paragraph_id: 7, row: 0, column: 0, text: '앞😀\n뒤' };
  const table = { section: 1, identity: point.createdCell.identity, cells: [cell] };
  const content = { format: 'hwp5', readOnly: true, createdTables: [table] };
  const paragraph = {
    section: 1,
    createdCell: { ...point.createdCell },
    selectable: true,
    editable: false,
    text: cell.text,
  };
  return { point, cell, table, content, paragraph };
}
test('readonly·history없음·typing scope없음·서식자원없음에도 canonical plain text는 읽는다', () => {
  const f = fixture(),
    r = createdCellClipboardSource(f.content, f.paragraph, f.point);
  assert.equal(r.cell, f.cell);
  assert.equal(r.table, f.table);
  assert.equal(r.text, '앞😀\n뒤');
  assert.equal(
    createdCellTypingOwner(f.content, f.paragraph, f.point),
    null,
    '기존 쓰기 가드는 그대로',
  );
});
test('중복 Native owner·0id·다른 구역·draft본문·서로게이트 중간은 읽기에도 거부한다', () => {
  for (const mutate of [
    (f) => f.content.createdTables.push({ ...f.table }),
    (f) => f.table.cells.push({ ...f.cell }),
    (f) => (f.cell.paragraph_id = 0),
    (f) => (f.point.section = 0),
    (f) => (f.paragraph.text = 'draft'),
    (f) => (f.point.unit = 2),
    (f) => (f.paragraph.selectable = false),
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(createdCellClipboardSource(f.content, f.paragraph, f.point), null);
  }
});
