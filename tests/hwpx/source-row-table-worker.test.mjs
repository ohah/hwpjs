import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { sourceRowTableOracle } from './source-row-table-oracle.mjs';
import { tableSourceHorizontalLayout } from '../../web/preview/table-source-horizontal-layout.mjs';
import { measureTableCells } from '../../web/preview/table-cell-measurement.mjs';
import { createTextStyle } from '../../web/preview/text-style.mjs';

test('real Worker row-local table cells match independent XML through both measurement passes', async (t) => {
  const path = 'reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx';
  if (!existsSync(path)) {
    t.skip('reference fixture unavailable');
    return;
  }
  const expected = sourceRowTableOracle(path, '1295981299'),
    replies = [];
  const previousSelf = globalThis.self,
    previousFetch = globalThis.fetch;
  globalThis.self = { postMessage: (value) => replies.push(value) };
  globalThis.fetch = async () =>
    new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'));
  t.after(async () => {
    try {
      if (typeof globalThis.self?.onmessage === 'function')
        await self.onmessage({ data: { kind: 'load', format: 'close-audit', bytes: [] } });
    } finally {
      globalThis.self = previousSelf;
      globalThis.fetch = previousFetch;
    }
  });
  await import(`../../web/preview/reader-worker.mjs?row-source-table=${Date.now()}`);
  await self.onmessage({ data: { kind: 'load', format: 'hwpx', bytes: readFileSync(path) } });
  assert.equal(replies.length, 1);
  const reply = replies.shift();
  assert.equal(reply.error, undefined);
  const content = reply.content,
    before = JSON.stringify(content);
  const table = content.tables.find(
    (table) => table.section === 0 && table.tableNode === expected.tableNode,
  );
  assert.ok(table);
  assert.deepEqual(
    table.cells.map(({ listNode, row, column, rowSpan, columnSpan, width }) => ({
      listNode,
      row,
      column,
      rowSpan,
      columnSpan,
      width,
    })),
    expected.cells,
  );
  const source = tableSourceHorizontalLayout(table),
    style = createTextStyle(content, '16px sans-serif');
  assert.equal(source.state, 'resolved', source.error);
  const result = measureTableCells(
    table,
    content.paragraphs,
    (text, p, unit, kind) => ({ width: text.length * 8, height: style.textHeight(p, unit, kind) }),
    {
      origin: { x: 0, y: 0 },
      padding: 'source',
      paragraphFlows: content.paragraphFlows,
      pictures: content.pictures,
      ...source.gridOptions,
    },
  );
  assert.equal(result.state, 'measured', result.error);
  assert.equal(result.grid.columns, null);
  assert.equal(result.grid.width, expected.declaredWidth / 75);
  for (const [index, cell] of expected.cells.entries()) {
    assert.equal(result.grid.cells[index].listNode, cell.listNode);
    assert.equal(result.grid.cells[index].width, cell.width / 75);
    const flow = result.flows.get(cell.listNode);
    for (const id of table.cells[index].paragraphs) {
      const p = content.paragraphs.find((p) => p.section === 0 && p.paragraph === id);
      assert.equal(
        flow.rows
          .filter((row) => row.kind === 'text' && row.paragraph === id)
          .map((row) => row.text)
          .join(''),
        p.text,
      );
    }
  }
  assert.equal(JSON.stringify(content), before);
});
