import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { layoutHwp5PageContent } from '../../web/preview/hwp5-page-layout.mjs';
import { hwp5PageGeometry } from '../../web/preview/hwp5-page-geometry.mjs';
import { projectHwp5ColumnFlow } from '../../web/preview/hwp5-column-flow.mjs';
import { pageReferenceBoxes } from '../../web/preview/page-reference-boxes.mjs';
import { selectNoteSourceTables } from '../../web/preview/note-source-table-owners.mjs';
import { measureNoteBodies } from '../../web/preview/note-body-measurement.mjs';
import { contentNotePagePolicy } from '../../web/preview/content-note-page-policy.mjs';
import { noteSeparatorGeometry } from '../../web/preview/note-separator-geometry.mjs';
import { prepareMixedFootnoteContinuation } from '../../web/preview/mixed-footnote-continuation.mjs';
const measure = (text) => Array.from(text).length * 8;
const root = new URL('./fixtures/mixed-note-table/', import.meta.url);
const pins = [
  ['live-content.json', '53d03d91f72a20dd553f84c19cb1af953a123c0ba77263924f2645ddca5e1e19'],
  ['reopened-content.json', 'c745c389a05dba52f14a70a98c0008db1cb7b00838568335c8af13bd4a69a5b9'],
];
const records = pins.map(([file, sha]) => {
  const bytes = readFileSync(new URL(file, root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha);
  const data = JSON.parse(bytes),
    before = structuredClone(data);
  const result = layoutHwp5PageContent(data, measure);
  assert.deepEqual(data, before);
  const setting = hwp5PageGeometry(data.pageSources[0]);
  const content = {
    ...data,
    pageSettings: [setting],
    paragraphFlows: projectHwp5ColumnFlow(data, {
      notes: true,
      pageAreas: true,
      tableCells: Boolean(data.tables?.length),
      captions: true,
    }),
  };
  const page = pageReferenceBoxes(setting, { x: 20, y: 20 }).boxes.page;
  const source = selectNoteSourceTables(content, { floatingNotes: true });
  const measured = measureNoteBodies(content, page.width, measure, 20000, source);
  assert.equal(measured.state, 'measured', measured.error);
  const policy = contentNotePagePolicy(content, 0, 'footnote');
  const separator = noteSeparatorGeometry(policy, page.width);
  return {
    file,
    data,
    result,
    page,
    measured,
    policy,
    separator,
    note: measured.notes.find((n) => n.kind === 'footnote' && n.boxes.length),
  };
});
const signature = (row) =>
  JSON.stringify([
    row.kind,
    row.section,
    row.paragraph,
    row.startUnit,
    row.endUnit,
    row.text,
    row.noteNode,
    row.listNode,
    row.noteListNode,
    row.noteKind,
    row.tableNode,
    row.createdCell,
  ]);
for (const record of records) {
  test(record.file + ' 전체 coverage·소유자·표 원자성·번호·구분선·본문미주 비겹침', () => {
    const { result, measured } = record;
    assert.equal(result.state, 'paginated', result.error);
    assert.equal(result.limited, false);
    assert.equal(result.pages.length, 3);
    assert.equal(result.boxes.length, 1);
    const sourceRows = measured.notes
      .flatMap((n) => n.rows)
      .map(signature)
      .sort();
    const finalRows = result.rows
      .filter((row) => row.noteNode !== undefined)
      .map(signature)
      .sort();
    assert.deepEqual(finalRows, sourceRows);
    const cellRows = result.rows.filter((row) => row.createdCell || row.tableNode !== undefined);
    assert(cellRows.length);
    assert.equal(new Set(cellRows.map((row) => row.pageOrdinal)).size, 1);
    const box = result.boxes[0];
    assert.equal(box.pageOrdinal, cellRows[0].pageOrdinal);
    for (const row of cellRows) {
      assert(row.y >= box.y);
      assert(row.y + row.height <= box.y + box.height);
    }
    const footnotePages = new Set(
      result.rows.filter((row) => row.noteKind === 'footnote').map((row) => row.pageOrdinal),
    );
    const footSeparators = result.noteSeparators.filter((separator) => {
      const rows = result.rows.filter((row) => row.pageOrdinal === separator.pageOrdinal),
        foot = rows.filter((row) => row.noteKind === 'footnote');
      const other = rows.filter((row) => row.noteKind !== 'footnote');
      return (
        foot.length &&
        separator.y + separator.height <= Math.min(...foot.map((row) => row.y)) &&
        other.every((row) => row.y + row.height <= separator.y)
      );
    });
    assert.equal(footSeparators.length, footnotePages.size);
    assert.equal(new Set(footSeparators.map((s) => s.pageOrdinal)).size, footnotePages.size);
    assert.equal(
      result.noteSeparators.length - footSeparators.length,
      new Set(result.rows.filter((row) => row.noteKind === 'endnote').map((row) => row.pageOrdinal))
        .size,
    );
    for (const page of result.pages) {
      const rows = result.rows.filter((row) => row.pageOrdinal === page.ordinal);
      const foot = rows.filter((row) => row.noteKind === 'footnote');
      for (const row of foot) {
        assert(row.y >= page.page.y);
        assert(row.y + row.height <= page.page.y + page.page.height);
      }
      for (const other of rows.filter((row) => row.noteKind !== 'footnote'))
        for (const row of foot) {
          assert(
            other.y + other.height <= row.y || row.y + row.height <= other.y,
            '본문·미주와 각주 수직 충돌',
          );
        }
    }
  });
}
const source = records[1];
function prepare(note = source.note, page = source.page) {
  return prepareMixedFootnoteContinuation(
    source.measured.notes.map((n) => (n === source.note ? note : n)),
    page,
    source.policy,
    source.separator.height,
  );
}
test('source 셀 원본 namespace와 live 생성 namespace를 합성하지 않음', () => {
  assert(records[0].result.boxes[0].createdCell);
  const box = source.result.boxes[0];
  assert.equal(box.createdCell, undefined);
  assert.equal(box.tableNode, 19);
  assert.equal(box.listNode, 20);
  assert.equal(records[0].data.paragraphs.find((p) => p.paragraph === 1).text.length, 5648);
  assert.equal(source.data.paragraphs.find((p) => p.paragraph === 1).text.length, 5649);
});
test('source 표 자체가 빈 페이지에 들어가지 않으면 명시 거부', () => {
  assert.equal(
    prepare(source.note, { ...source.page, height: 50 }).error,
    'CreatedNotePageHeightOverflow',
  );
});
test('source 셀 owner 변조 거부', () => {
  const n = structuredClone(source.note),
    row = n.rows.find((row) => row.tableNode !== undefined);
  row.tableNode++;
  assert.equal(prepare(n).error, 'InvalidMixedFootnoteCellClip');
});
test('source 단위 row 누락과 중복 거부', () => {
  const n = structuredClone(source.note);
  n.continuationUnits[0].rowIndices = [];
  assert.equal(prepare(n).error, 'IncompleteMixedFootnoteContinuationParts');
  const d = structuredClone(source.note),
    u = d.continuationUnits[0];
  u.rowIndices.push(u.rowIndices[0]);
  assert.equal(prepare(d).error, 'AmbiguousMixedFootnoteContinuationPart');
});
test('source 전체 note clip 변조 거부', () => {
  const n = structuredClone(source.note);
  n.rows.find((row) => row.pageClip).pageClip.width--;
  assert.equal(prepare(n).error, 'UnsupportedMixedFootnoteRow');
});
test('source 셀 span 변경과 생성 identity 혼합 거부', () => {
  const n = structuredClone(source.note),
    u = n.continuationUnits.find((u) => u.sourceTableNode !== undefined);
  u.sourceCells[0].rowSpan = 2;
  assert.equal(prepare(n).error, 'InvalidMixedFootnoteCellOwner');
  u.sourceCells[0].rowSpan = 1;
  u.tableIdentity = '1';
  assert.equal(prepare(n).error, 'InvalidMixedFootnoteTableIdentity');
});
test('source 단위 검증은 입력 불변이고 모든 실제 행과 box를 정확히 1회 방문', () => {
  const before = structuredClone(source.note),
    p = prepare();
  assert.equal(p.state, 'prepared', p.error);
  assert.equal(p.counters.rowAssignments, source.note.rows.length);
  assert.equal(p.counters.boxAssignments, source.note.boxes.length);
  assert.deepEqual(source.note, before);
  console.log(
    JSON.stringify({
      범위: '저장된실WASMcontent의순수진단geometry;새WASM호출0',
      결과: records.map((r) => ({
        file: r.file,
        pages: r.result.pages.length,
        rows: r.result.rows.length,
        boxes: r.result.boxes.length,
      })),
      source검증계수: p.counters,
    }),
  );
});

for (const record of records)
  test(record.file + ' 실제 행 keepNext 제약을 계획 단위 생성 전에 거부', () => {
    for (const value of [1, -1, NaN, Infinity, '0']) {
      const n = structuredClone(record.note);
      n.rows[0].keepNextHeight = value;
      const all = record.measured.notes.map((row) => (row === record.note ? n : row));
      assert.equal(
        prepareMixedFootnoteContinuation(all, record.page, record.policy, record.separator.height)
          .error,
        'UnsupportedFootnoteContinuationRows',
      );
    }
    for (const value of [undefined, null, 0]) {
      const n = structuredClone(record.note);
      n.rows[0].keepNextHeight = value;
      const all = record.measured.notes.map((row) => (row === record.note ? n : row));
      assert.equal(
        prepareMixedFootnoteContinuation(all, record.page, record.policy, record.separator.height)
          .state,
        'prepared',
      );
    }
  });

for (const record of records) {
  const prepareRecord = (n) =>
    prepareMixedFootnoteContinuation(
      record.measured.notes.map((row) => (row === record.note ? n : row)),
      record.page,
      record.policy,
      record.separator.height,
    );
  test(record.file + ' 실제행 NaN·음수·불명 폭 거부', () => {
    for (const [key, value] of [
      ['x', NaN],
      ['width', NaN],
      ['width', -1],
    ]) {
      const n = structuredClone(record.note);
      n.rows.find((row) => row.createdCell || row.tableNode !== undefined)[key] = value;
      assert.equal(prepareRecord(n).error, 'InvalidMixedFootnoteRowGeometry');
    }
    for (const [key, value] of [
      ['x', Infinity],
      ['width', Infinity],
      ['x', -1],
      ['width', undefined],
    ]) {
      const n = structuredClone(record.note);
      n.rows.find((row) => row.kind === 'text')[key] = value;
      assert.equal(prepareRecord(n).state, 'unavailable');
    }
  });
  test(record.file + ' created/source 실제 셀 경계 밖 행 거부', () => {
    const n = structuredClone(record.note),
      row = n.rows.find((row) => row.createdCell || row.tableNode !== undefined),
      box = n.boxes[0];
    row.x = box.x + box.width;
    row.width = 1;
    assert.equal(prepareRecord(n).error, 'InvalidMixedFootnoteCellClip');
  });
  test(record.file + ' box 비유한·음수와 표 원자 경계 밖 geometry 거부', () => {
    for (const [key, value] of [
      ['x', NaN],
      ['width', NaN],
      ['width', -1],
      ['width', Infinity],
      ['height', -1],
    ]) {
      const n = structuredClone(record.note);
      n.boxes[0][key] = value;
      assert.equal(prepareRecord(n).state, 'unavailable');
    }
  });
  test(record.file + ' prefix geometry 검사와 합법0폭 허용', () => {
    for (const [key, value] of [
      ['x', NaN],
      ['width', NaN],
      ['width', -1],
      ['width', Infinity],
    ]) {
      const n = structuredClone(record.note),
        u = n.continuationUnits[0];
      n.numberPrefixes = [{ x: 0, y: u.y, width: 0, height: 1 }];
      u.prefixIndices = [0];
      n.numberPrefixes[0][key] = value;
      assert.equal(prepareRecord(n).error, 'InvalidMixedFootnotePrefixGeometry');
    }
    const n = structuredClone(record.note),
      u = n.continuationUnits[0];
    n.numberPrefixes = [{ x: 0, y: u.y, width: 0, height: 1 }];
    u.prefixIndices = [0];
    assert.equal(prepareRecord(n).state, 'prepared');
  });
  test(record.file + ' 정상 빈폭 셀과 width부재 gap 허용', () => {
    const n = structuredClone(record.note),
      cell = n.rows.find((row) => row.createdCell || row.tableNode !== undefined);
    cell.width = 0;
    cell.text = '';
    assert.equal(prepareRecord(n).state, 'prepared');
    const host = n.rows.find((row) => !row.createdCell && row.tableNode === undefined);
    host.kind = 'gap';
    delete host.width;
    delete host.x;
    assert.equal(prepareRecord(n).state, 'prepared');
  });
}
