import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTableReference } from '../src/table-reference-resolution.ts';
import { buildObjectReference } from '../src/object-reference.ts';

const expected = { format: 'hwp5', sourceSha256: 'a'.repeat(64), sectionCount: 1 };
const reference = buildObjectReference({ ...expected, section: 0, kind: 'table', node: 42 });
function fixture() {
  const table = {
    id: 'logical-not-native',
    type: 'table',
    reference,
    source: { section: 0, tableNode: 42 },
    rows: 3,
    columns: 5,
    cells: [],
  };
  const section = {
    source: { section: 0 },
    body: [table],
    header: { definitions: [] },
    footer: { definitions: [] },
  };
  return { table, section, model: { version: 1, ...expected, sections: [section], unplaced: [] } };
}

test('기본 반환과 오류를 보존하며 요청할 때만 관측 dimensions를 노출한다', () => {
  const f = fixture();
  assert.deepEqual(resolveTableReference(f.model, reference, expected), {
    section: 0,
    tableNode: 42,
  });
  assert.deepEqual(resolveTableReference(f.model, reference, expected, true), {
    section: 0,
    tableNode: 42,
    expectedRows: 3,
    expectedColumns: 5,
  });
  delete f.table.rows;
  f.table.columns = null;
  const resolved = resolveTableReference(f.model, reference, expected, true);
  assert.equal(resolved.expectedRows, undefined);
  assert.equal(resolved.expectedColumns, null);
  f.section.body = [];
  assert.throws(
    () => resolveTableReference(f.model, reference, expected),
    /^Error: TableReferenceNotFound$/,
  );
});

test('삭제 경로는 관측 dimensions getter를 읽지 않고 grid 경로는 실행 없이 거부한다', () => {
  const f = fixture();
  Object.defineProperty(f.table, 'rows', {
    get() {
      return assert.fail('getter');
    },
  });
  assert.deepEqual(resolveTableReference(f.model, reference, expected), {
    section: 0,
    tableNode: 42,
  });
  assert.throws(
    () => resolveTableReference(f.model, reference, expected, true),
    /InvalidTableDeletionModel/,
  );
});

test('배열 예산·깊이 한도를 선형 관측만으로 검사한다', () => {
  const huge = fixture();
  huge.section.body = [];
  huge.section.body.length = 200001;
  assert.throws(
    () => resolveTableReference(huge.model, reference, expected),
    /TableInventoryLimitExceeded/,
  );
  const deep = fixture();
  let block = deep.table;
  for (let i = 0; i < 65; i++)
    block = { id: `outer-${i}`, type: 'table', cells: [{ blocks: [block] }] };
  deep.section.body = [block];
  assert.throws(
    () => resolveTableReference(deep.model, reference, expected),
    /InvalidTableDeletionModel/,
  );
});

test('선택 표를 먼저 찾아도 뒤의 중복 ID·참조·순환을 빠짐없이 검증한다', () => {
  for (const mode of ['id', 'reference', 'cycle']) {
    const f = fixture();
    if (mode === 'cycle') f.table.cells = [{ blocks: [f.table] }];
    else
      f.section.body.unshift({
        ...f.table,
        ...(mode === 'reference' ? { id: 'another' } : { reference: null }),
      });
    assert.throws(
      () => resolveTableReference(f.model, reference, expected, true),
      /InvalidTableDeletionModel/,
    );
  }
});

test('머리말·꼬리말·미배치·중첩의 실제 좌표를 같은 resolver로 찾는다', () => {
  for (const area of ['header', 'footer', 'unplaced', 'nested']) {
    const f = fixture();
    f.section.body = [];
    if (area === 'unplaced') f.model.unplaced.push({ block: f.table });
    else if (area === 'nested')
      f.section.body.push({ id: 'outer', type: 'table', cells: [{ blocks: [f.table] }] });
    else f.section[area].definitions.push({ blocks: [f.table] });
    assert.equal(resolveTableReference(f.model, reference, expected, true).tableNode, 42);
  }
});
