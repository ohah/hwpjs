import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerCanvasHarness } from '../canvas/worker-harness.mjs';
import { measureTableCells } from '../../web/preview/table-cell-measurement.mjs';
import { planMultipleTablePages } from '../../web/preview/multiple-table-page-plan.mjs';
import { prepareTablePageBands } from '../../web/preview/table-page-bands.mjs';
import { layoutTableBodyContent } from '../../web/preview/table-body-content-layout.mjs';

test('actual page-bottom table reserves a fixed whole-table page fragment', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit field display candidate required');
  const h = await workerCanvasHarness(t);
  const input = readFileSync(
    'reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx',
  );
  const loaded = await h.send({ kind: 'load', format: 'hwpx', bytes: input });
  assert.equal(loaded.error, undefined);
  const table = loaded.content.tables.find((table) => table.tableNode === 381);
  const before = structuredClone(table);
  const measured = measureTableCells(
    table,
    loaded.content.paragraphs,
    (text) => ({ width: text.length * 8, height: 12 }),
    { origin: { x: 0, y: 0 }, padding: 'source', maxRows: 20000 },
  );
  assert.equal(measured.state, 'measured', measured.error);
  const bands = prepareTablePageBands(table, measured.grid.rows, 'whole', 0);
  assert.equal(bands.state, 'prepared');
  assert.equal(bands.rows[0].tableVerticalSource, table.sourceGeometry);
  assert.equal(
    prepareTablePageBands(table, measured.grid.rows, 'row-bands', 0).error,
    'UnsupportedSplitTableVerticalFlow',
  );
  const entries = [
    { table, measured, rowHeights: measured.grid.rows, splitMode: 'whole', outerInsets: 0 },
  ];
  const flows = loaded.content.paragraphFlows.filter(
    (flow) => flow.section === table.section && flow.paragraph === table.hostParagraph,
  );
  const plan = planMultipleTablePages(
    entries,
    [{ tableIndex: 0 }],
    loaded.content.pageSettings[0],
    flows,
  );
  assert.equal(plan.state, 'planned', plan.error);
  const [fragment] = plan.plans[0].fragments;
  assert(fragment);
  const page = fragment.referenceBoxes.page;
  assert(Math.abs(fragment.y + fragment.height - (page.y + page.height)) < 1e-8);
  assert(fragment.y >= page.y);
  assert.deepEqual(table, before);
  const ids = new Set([table.hostParagraph, ...table.cells.flatMap((cell) => cell.paragraphs)]);
  const slice = {
    ...loaded.content,
    tables: [table],
    pictures: [],
    paragraphs: loaded.content.paragraphs.filter(
      (p) => p.section === table.section && ids.has(p.paragraph),
    ),
    paragraphFlows: loaded.content.paragraphFlows.filter(
      (flow) => flow.section === table.section && ids.has(flow.paragraph),
    ),
  };
  const result = layoutTableBodyContent(
    slice,
    (text) => ({ width: text.length * 8, height: 12 }),
    20000,
  );
  if (result.state !== 'paginated')
    t.diagnostic(
      JSON.stringify({
        error: result.error,
        declaredWidth: table.sourceGeometry.geometry.width / 75,
        measuredWidth: measured.grid.width,
        reference: fragment.referenceBoxes.page,
      }),
    );
  assert.equal(result.state, 'paginated', result.error);
  assert.equal(result.boxes.length, table.cells.length);
  assert.equal(result.tableAnchors[0].tableNode, table.tableNode);
  const beyondPaper = structuredClone(slice);
  beyondPaper.tables[0].sourceGeometry.geometry.horizontal_offset = 1000000;
  assert.equal(
    layoutTableBodyContent(beyondPaper, (text) => ({ width: text.length * 8, height: 12 }), 20000)
      .error,
    'TablePageWidthOverflow',
  );
  assert.deepEqual(table, before);
  t.diagnostic(
    "One actual table's measured page fragment; not full document layout or original Hangul equivalence",
  );
});
