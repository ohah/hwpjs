import test from 'node:test';
import { strictObserve } from './shape-copy-cell-observer-preimage.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createTableCellAppearanceObserver,
  observeTableCellAppearance,
} from '../../../js/table-cell-appearance-observation.mjs';
const cases = JSON.parse(
  await readFile(
    new URL(
      '../../../tools/tests/fixtures/table-cell-appearance-observation.json',
      import.meta.url,
    ),
    'utf8',
  ),
).cases;
for (const format of ['hwp5', 'hwpx'])
  test(
    'controlled DTO: indexed current observation equals frozen strict preimage observations/' +
      format,
    () => {
      const content = structuredClone(cases[format]),
        observe = createTableCellAppearanceObserver(content);
      for (const table of content.tables)
        for (const cell of table.cells) {
          const target = {
            section: table.section,
            tableNode: table.tableNode,
            listNode: cell.listNode,
          };
          assert.deepEqual(observe(target), strictObserve(content, target));
        }
    },
  );
test('controlled 2000-owner DTO: selected cells use one table traversal, no per-target scan or resource permission', () => {
  const content = structuredClone(cases.hwpx),
    table = content.tables[0],
    report = content.tableBorderSources[0];
  const binding = report.cells.find((c) => c.table_node === 59 && c.list_node === 66);
  const cell = table.cells.find((c) => c.listNode === 66);
  table.cells = Array.from({ length: 2000 }, (_, i) => ({ ...cell, listNode: 1001 + 2 * i }));
  report.cells = table.cells.map((c) => ({
    ...binding,
    cell_node: c.listNode - 1,
    list_node: c.listNode,
  }));
  let traversals = 0;
  const iterator = table.cells[Symbol.iterator].bind(table.cells);
  table.cells[Symbol.iterator] = () => {
    traversals++;
    return iterator();
  };
  const observe = createTableCellAppearanceObserver(content);
  for (const c of table.cells.values())
    assert.equal(
      observe({ section: table.section, tableNode: table.tableNode, listNode: c.listNode }).fill
        .state,
      'known',
    );
  assert.equal(traversals, 1);
});
test('controlled DTO: malformed unrelated section report cannot poison a valid owner', () => {
  const content = structuredClone(cases.hwpx),
    target = { section: 0, tableNode: 59, listNode: 66 };
  const before = observeTableCellAppearance(content, target);
  content.tableBorderSources.push({ section: 9999 });
  assert.deepEqual(createTableCellAppearanceObserver(content)(target), before);
});
