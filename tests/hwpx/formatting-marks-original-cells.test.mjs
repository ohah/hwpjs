import test from 'node:test';
import assert from 'node:assert/strict';
import { formattingMarkPlans } from '../../web/preview/formatting-mark-plan.mjs';
import { createFormattingMarkCellScope } from '../../web/preview/formatting-mark-cell-scope.mjs';
import { measureTableCells } from '../../web/preview/table-cell-measurement.mjs';
import { projectTablePageFragments } from '../../web/preview/table-page-fragments.mjs';
import { paragraphMarkPlan } from '../../web/preview/paragraph-mark-paint.mjs';
const fixture = () => {
  const p = {
    section: 0,
    paragraph: 15,
    text: '가 \t\n나',
    selectionOwner: null,
    tableCell: { tableNode: 81, listNode: 82 },
  };
  const row = {
    kind: 'text',
    section: 0,
    paragraph: 15,
    tableNode: 81,
    listNode: 82,
    x: 30,
    y: 50,
    textHeight: 20,
    textTop: 2,
    startUnit: 0,
    endUnit: 4,
    text: '가 \t\n',
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 10 },
      { unit: 2, x: 16 },
      { unit: 3, x: 40 },
      { unit: 4, x: 40 },
    ],
    tabPlacements: [{ unit: 2, state: 'placed' }],
  };
  const content = {
    paragraphs: [p],
    tables: [
      { section: 0, tableNode: 81, partial: false, cells: [{ listNode: 82, paragraphs: [15] }] },
    ],
  };
  return { p, row, content };
};
const run = (f, rows = [f.row]) =>
  formattingMarkPlans(f.row, 0, f.p, createFormattingMarkCellScope(f.content, rows));
test('현재 원본 셀의 원문·owner·실제 행만 공백/탭/줄바꿈 허용', () => {
  const f = fixture(),
    before = structuredClone(f);
  const got = run(f);
  assert.deepEqual(
    got.map((p) => [p.kind, p.unit, p.x, p.width]),
    [
      ['space', 1, 40, 6],
      ['tab', 2, 46, 24],
      ['line-break', 3, 70, 0],
    ],
  );
  assert.deepEqual(f, before);
  assert.equal(paragraphMarkPlan({ ...f.row, lastLine: true }, 0, f.p), null);
  assert.deepEqual(formattingMarkPlans(f.row, 0, f.p), []);
  // 합성 원값을 실제 셀 측정/페이지 투영에 통과시킵니다. 결과 행 metadata를 보충하지 않습니다.
  const p = { ...fixture().p, text: '가 나\n다 라', editable: true };
  const table = {
    section: 0,
    tableNode: 81,
    partial: false,
    rows: 1,
    columns: 1,
    cells: [
      {
        listNode: 82,
        row: 0,
        column: 0,
        rowSpan: 1,
        columnSpan: 1,
        width: 7200,
        height: 2000,
        paragraphs: [15],
      },
    ],
  };
  const measured = measureTableCells(
    table,
    [p],
    (text) => ({ width: text.length * 10, height: 20 }),
    { origin: { x: 0, y: 0 }, padding: 4 },
  );
  assert.equal(measured.state, 'measured');
  const projected = projectTablePageFragments(
    table,
    measured.grid,
    measured.flows,
    {
      state: 'planned',
      fragments: [
        {
          cells: [0],
          x: 100,
          y: 80,
          offset: 0,
          startRow: 0,
          endRow: 1,
          pageOrdinal: 0,
        },
      ],
    },
    { origin: { x: 0, y: 0 }, padding: 4 },
  );
  assert.equal(projected.state, 'placed');
  const scope = createFormattingMarkCellScope({ paragraphs: [p], tables: [table] }, projected.rows);
  const marks = projected.rows.flatMap((r, i) => formattingMarkPlans(r, i, p, scope));
  assert.deepEqual(
    marks.map((x) => [x.kind, x.unit]),
    [
      ['space', 1],
      ['line-break', 3],
      ['space', 5],
    ],
  );
  assert(
    projected.rows.every(
      (r) =>
        r.tableNode === 81 && r.listNode === 82 && Number.isFinite(r.x) && Number.isFinite(r.y),
    ),
  );
});
test('인접 셀·같은 list의 다른 table·다른 source는 거부', () => {
  for (const change of [
    { listNode: 83 },
    { tableNode: 82 },
    { paragraph: 16 },
    { section: 1 },
    { tableNode: undefined },
    { listNode: undefined },
  ]) {
    const f = fixture();
    Object.assign(f.row, change);
    assert.deepEqual(run(f), []);
  }
});
test('같은 sourceID 중복·다른 셀 membership·중복 table/list는 거부', () => {
  for (const edit of [
    (f) => f.content.paragraphs.push({ ...f.p }),
    (f) => f.content.tables[0].cells.push({ listNode: 83, paragraphs: [15] }),
    (f) => f.content.tables.push({ ...f.content.tables[0] }),
    (f) => f.content.tables[0].cells.push({ ...f.content.tables[0].cells[0] }),
    (f) => f.content.tables[0].cells[0].paragraphs.push(15),
  ]) {
    const f = fixture();
    edit(f);
    assert.deepEqual(run(f), []);
  }
});
test('partial/split 원문·잘못된 slice·변환·명시좌표 부재는 거부', () => {
  for (const edit of [
    (f) => {
      f.p.clipped = true;
    },
    (f) => {
      f.p.textStartUnit = 1;
    },
    (f) => {
      f.content.tables[0].partial = true;
    },
    (f) => {
      f.row.transform = [1, 0, 0, 1, 0, 0];
    },
    (f) => {
      f.row.text = '다른원문';
    },
    (f) => {
      f.row.endUnit = 3;
    },
    (f) => {
      delete f.row.x;
    },
    (f) => {
      f.row.textHeight = NaN;
    },
    (f) => {
      f.row.boundaries[1].x = Infinity;
    },
    (f) => {
      f.row.createdCell = {};
    },
    (f) => {
      f.p.drawingText = {};
    },
  ]) {
    const f = fixture();
    edit(f);
    assert.deepEqual(run(f), []);
  }
});
test('이전 행·복사 문단은 현재 그리기 참조가 아니면 거부', () => {
  const f = fixture();
  assert.deepEqual(run(f, [{ ...f.row }]), []);
  const scope = createFormattingMarkCellScope(f.content, [f.row]);
  assert.deepEqual(formattingMarkPlans(f.row, 0, { ...f.p }, scope), []);
});

test('C 본문만 그리거나 셀 요청이 없으면 범위 생성은 원문/표/행을 순회하지 않음', () => {
  const forbidden = {
    get() {
      assert.fail('불필요한 source 읽기');
    },
  };
  const content = {};
  Object.defineProperties(content, { paragraphs: forbidden, tables: forbidden });
  const rows = new Proxy([], {
    get() {
      assert.fail('불필요한 row 읽기');
    },
  });
  const scope = createFormattingMarkCellScope(content, rows);
  const p = { section: 0, paragraph: 0, text: ' ', selectionOwner: 'section:0:body' };
  const row = {
    kind: 'text',
    section: 0,
    paragraph: 0,
    text: ' ',
    startUnit: 0,
    endUnit: 1,
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 6 },
    ],
  };
  assert.equal(formattingMarkPlans(row, 0, p, scope).length, 1);
});
test('기본 source/경계/owner/좌표가 먼저 거부되면 source색인 읽기0', () => {
  const content = {
    get paragraphs() {
      throw new Error('paragraph 읽기');
    },
    get tables() {
      throw new Error('table 읽기');
    },
  };
  for (const edit of [
    (f) => {
      f.row.listNode = 99;
    },
    (f) => {
      f.row.tableNode = undefined;
    },
    (f) => {
      f.row.x = NaN;
    },
    (f) => {
      f.row.text = '불일치';
    },
    (f) => {
      f.row.transform = [];
    },
    (f) => {
      f.p.clipped = true;
    },
    (f) => {
      f.row.boundaries = [];
    },
    (f) => {
      f.row.clipped = true;
    },
  ]) {
    const f = fixture();
    edit(f);
    const scope = createFormattingMarkCellScope(content, [f.row]);
    assert.deepEqual(formattingMarkPlans(f.row, 0, f.p, scope), []);
  }
});
test('첫 적격 셀에서만 source/table/membership을1회 읽고 같은그리기 범위에서재사용', (t) => {
  const f = fixture();
  let ps = 0,
    ts = 0,
    cs = 0,
    ms = 0;
  const table = f.content.tables[0],
    cell = table.cells[0],
    ordinals = cell.paragraphs,
    cells = table.cells;
  Object.defineProperty(cell, 'paragraphs', {
    get() {
      ms++;
      return ordinals;
    },
  });
  Object.defineProperty(table, 'cells', {
    get() {
      cs++;
      return cells;
    },
  });
  const content = {
    get paragraphs() {
      ps++;
      return [f.p];
    },
    get tables() {
      ts++;
      return [table];
    },
  };
  const scope = createFormattingMarkCellScope(content, [f.row]);
  assert.deepEqual([ps, ts, cs, ms], [0, 0, 0, 0]);
  for (let i = 0; i < 3; i++) assert.equal(formattingMarkPlans(f.row, 0, f.p, scope).length, 3);
  assert.deepEqual([ps, ts, cs, ms], [1, 1, 1, 1]);
  for (const count of [16, 32, 64]) {
    const reads = { paragraph: 0, row: 0, member: 0, unit: 0, state: 0 };
    const indexed = (values, field) =>
      new Proxy(values, {
        get(target, key, receiver) {
          if (typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key)) reads[field]++;
          return Reflect.get(target, key, receiver);
        },
      });
    const paragraphs = Array.from({ length: count }, (_, i) => ({
      ...fixture().p,
      paragraph: 15 + i,
      text: ' \t',
    }));
    const rows = paragraphs.map((p, i) => ({
      ...fixture().row,
      paragraph: p.paragraph,
      text: p.text,
      y: 50 + i * 28,
      startUnit: 0,
      endUnit: 2,
      boundaries: [
        { unit: 0, x: 0 },
        { unit: 1, x: 6 },
        { unit: 2, x: 30 },
      ],
      tabPlacements: [
        {
          get unit() {
            reads.unit++;
            return 1;
          },
          get state() {
            reads.state++;
            return 'placed';
          },
        },
      ],
    }));
    const content = {
      paragraphs: indexed(paragraphs, 'paragraph'),
      tables: [
        {
          section: 0,
          tableNode: 81,
          partial: false,
          cells: [
            {
              listNode: 82,
              paragraphs: indexed(
                paragraphs.map((p) => p.paragraph),
                'member',
              ),
            },
          ],
        },
      ],
    };
    const scope = createFormattingMarkCellScope(content, indexed(rows, 'row'));
    let painted = 0;
    for (let i = 0; i < count; i++)
      painted += formattingMarkPlans(rows[i], i, paragraphs[i], scope).length;
    assert.equal(painted, count * 2);
    assert.deepEqual(reads, {
      paragraph: count,
      row: count,
      member: count,
      unit: count,
      state: count,
    });
    t.diagnostic(JSON.stringify({ cellRows: count, marks: painted, reads }));
  }
});
test('새 그리기는 이전색인을 재사용하지 않고 중복/변경 source를 다시 거부', () => {
  const f = fixture();
  assert.equal(run(f).length, 3);
  f.content.paragraphs.push({ ...f.p });
  assert.deepEqual(run(f), []);
});
test('셀의 surrogate 중간 경계는 공백까지 포함한 행 전체를 거부', () => {
  const f = fixture();
  f.p.text = '😀 ';
  Object.assign(f.row, {
    text: '😀 ',
    startUnit: 0,
    endUnit: 3,
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 5 },
      { unit: 2, x: 10 },
      { unit: 3, x: 16 },
    ],
  });
  assert.deepEqual(run(f), []);
});
