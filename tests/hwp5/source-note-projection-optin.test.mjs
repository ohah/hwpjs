import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  measureCreatedBodyFlow,
  projectCreatedBodyFlow,
} from '../../web/preview/created-body-flow-measurement.mjs';
test('일반 source 표 투영의 기본 출력과 opt-in 단위 수집 출력 동등성', () => {
  const bytes = readFileSync(
    new URL('./fixtures/mixed-note-table/reopened-content.json', import.meta.url),
  );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'c745c389a05dba52f14a70a98c0008db1cb7b00838568335c8af13bd4a69a5b9',
  );
  const data = JSON.parse(bytes),
    table = data.tables[0],
    ids = new Set([table.hostParagraph, ...table.cells.flatMap((cell) => cell.paragraphs)]);
  const content = {
    ...data,
    paragraphs: data.paragraphs.filter((p) => ids.has(p.paragraph)),
    createdTables: [],
  };
  const measured = measureCreatedBodyFlow(
    content,
    566.9333333333334,
    (text) => Array.from(text).length * 8,
    20000,
  );
  assert.equal(measured.state, 'measured', measured.error);
  let height = 0;
  const placed = measured.rows.map((row) => {
    const p = {
      ...row,
      x: row.createdHost === undefined ? (row.x ?? 0) : 0,
      y: height,
      pageOrdinal: 0,
      columnOrdinal: 0,
    };
    height += row.height;
    return p;
  });
  const bounds = { x: 0, y: 0, width: 566.9333333333334, height };
  for (const row of placed) row.referenceBoxes = { paper: bounds, page: bounds, column: bounds };
  const before = structuredClone(placed),
    ordinary = projectCreatedBodyFlow(measured, placed, 20000),
    collected = projectCreatedBodyFlow(measured, placed, 20000, true);
  assert.equal(ordinary.state, 'projected', ordinary.error);
  assert.equal(collected.state, 'projected', collected.error);
  assert.equal(ordinary.continuationUnits, undefined);
  const { continuationUnits, ...same } = collected;
  assert.deepEqual(same, ordinary);
  assert.deepEqual(placed, before);
  assert.equal(continuationUnits.filter((u) => u.sourceTableNode !== undefined).length, 1);
  for (const [key, array] of [
    ['rowIndices', collected.rows],
    ['boxIndices', collected.boxes],
    ['prefixIndices', collected.hostNumberPrefixes],
  ]) {
    const indices = continuationUnits.flatMap((u) => u[key]);
    assert.equal(indices.length, array.length);
    assert.equal(new Set(indices).size, array.length);
  }
});
