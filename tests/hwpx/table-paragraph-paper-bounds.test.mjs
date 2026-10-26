import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from '../../tools/oracle-process.mjs';
import { placeTablePagesHorizontally } from '../../web/preview/table-page-horizontal-placement.mjs';
import { tableSourceHorizontalLayout } from '../../web/preview/table-source-horizontal-layout.mjs';
import { measureTableCells } from '../../web/preview/table-cell-measurement.mjs';
import { pageReferenceBoxes } from '../../web/preview/page-reference-boxes.mjs';
import { createTextStyle } from '../../web/preview/text-style.mjs';

function fixture() {
  const column = { x: 50, y: 20, width: 100, height: 200 },
    paper = { x: 0, y: 0, width: 200, height: 250 };
  const table = {
    section: 0,
    tableNode: 2,
    sourceGeometry: {
      geometry: {
        width: 6750,
        height: 3000,
        width_relative: 4,
        height_relative: 2,
        treat_as_character: false,
        horizontal_offset: 1500,
        vertical_offset: 0,
      },
      vertical_relative: 2,
      horizontal_relative: 3,
      vertical_alignment: 0,
      horizontal_alignment: 0,
    },
  };
  const layout = {
    state: 'placed',
    rows: [{ tableNode: 2, x: 60, y: 30, height: 20 }],
    boxes: [
      {
        tableNode: 2,
        pageOrdinal: 0,
        x: 55,
        y: 20,
        width: 90,
        height: 40,
        referenceBoxes: { column, page: column, paper },
      },
    ],
  };
  layout.rows[0].pageOrdinal = 0;
  return { table, layout, paragraph: { paragraphShape: { left: 0, right: 0, indent: 0 } } };
}

test('paragraph-relative source tables preserve offsets into paper margins without resizing', () => {
  const f = fixture(),
    before = structuredClone(f);
  const placed = placeTablePagesHorizontally(f.table, f.layout, 5, f.paragraph);
  assert.equal(placed.state, 'placed', placed.error);
  assert.equal(placed.boxes[0].x, 70);
  assert.equal(placed.boxes[0].width, 90);
  assert.equal(placed.rows[0].x, 75);
  assert.equal(placed.boxes[0].horizontalOverflowBoundary, 'paper');
  assert.deepEqual(f, before);
});

test('paragraph-relative paper bounds retain outer margins and reject invalid or missing extents', () => {
  const f = fixture();
  for (const offset of [-4500, 4500]) {
    const table = structuredClone(f.table);
    table.sourceGeometry.geometry.horizontal_offset = offset;
    assert.equal(
      placeTablePagesHorizontally(table, f.layout, 5, f.paragraph).error,
      'TablePageWidthOverflow',
    );
  }
  for (const paper of [
    undefined,
    { x: 0, y: 0, width: NaN, height: 250 },
    { x: 0, y: 0, width: 0, height: 250 },
  ]) {
    const layout = structuredClone(f.layout);
    layout.boxes[0].referenceBoxes.paper = paper;
    assert.equal(
      placeTablePagesHorizontally(f.table, layout, 5, f.paragraph).error,
      'TablePageWidthOverflow',
    );
  }
  const outside = structuredClone(f.layout);
  outside.boxes[0].width = 126;
  assert.equal(
    placeTablePagesHorizontally(f.table, outside, 5, f.paragraph).error,
    'TablePageWidthOverflow',
  );
  for (const width of [0, -1, NaN, Infinity]) {
    const layout = structuredClone(f.layout);
    layout.boxes[0].width = width;
    assert.equal(
      placeTablePagesHorizontally(f.table, layout, 5, f.paragraph).error,
      'TablePageWidthOverflow',
    );
  }
  const columnRelative = structuredClone(f.table);
  columnRelative.sourceGeometry.horizontal_relative = 2;
  assert.equal(
    placeTablePagesHorizontally(columnRelative, f.layout, 5, f.paragraph).error,
    'TablePageWidthOverflow',
  );
});

test('paragraph-relative alignment and signed offsets obey independent physical boundary arithmetic', () => {
  const f = fixture();
  for (const alignment of [0, 1, 2])
    for (let offset = -100; offset <= 100; offset += 5) {
      const table = structuredClone(f.table);
      table.sourceGeometry.horizontal_alignment = alignment;
      table.sourceGeometry.geometry.horizontal_offset = offset * 75;
      const expected = alignment === 0 ? 50 + offset : alignment === 1 ? 55 + offset : 60 - offset;
      const fits = expected - 5 >= 0 && expected + 90 + 5 <= 200;
      const result = placeTablePagesHorizontally(table, f.layout, 5, f.paragraph);
      assert.equal(
        result.state,
        fits ? 'placed' : 'unavailable',
        JSON.stringify({ alignment, offset }),
      );
      if (fits) assert.equal(result.boxes[0].x, expected);
      else assert.equal(result.error, 'TablePageWidthOverflow');
    }
});

test('actual copay source offset and cell widths remain exact when table extends beyond body', async (t) => {
  const path = 'reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx';
  const expected = JSON.parse(
    execFileSync(
      'python3',
      [
        '-B',
        '-c',
        `
import json,sys,zipfile,xml.etree.ElementTree as E
p="{http://www.hancom.co.kr/hwpml/2011/paragraph}"
r=E.fromstring(zipfile.ZipFile(sys.argv[1]).read("Contents/section0.xml"))
nodes=list(r.iter()); table=nodes[1497]
if table.tag!=p+"tbl": raise ValueError("source target mismatch")
pos=table.find(p+"pos"); sz=table.find(p+"sz"); margin=table.find(p+"outMargin")
print(json.dumps(dict(node=1497,width=int(sz.get("width")),offset=int(pos.get("horzOffset")),
 relative=pos.get("horzRelTo"),margins=[int(margin.get(k)) for k in ("left","right","top","bottom")],
 cellWidths=[int(tc.find(p+"cellSz").get("width")) for tr in table.findall(p+"tr") for tc in tr.findall(p+"tc")])))
`,
        path,
      ],
      { encoding: 'utf8', timeout: 30000 },
    ),
  );
  assert.equal(expected.relative, 'PARA');
  assert.equal(expected.width, 46027);
  assert.equal(expected.offset, 2421);
  const previousSelf = globalThis.self,
    previousFetch = globalThis.fetch,
    replies = [];
  globalThis.self = { postMessage: (reply) => replies.push(reply) };
  globalThis.fetch = async () => new Response(readFileSync(process.env.HWPJS_TEST_WASM));
  t.after(async () => {
    try {
      await self.onmessage({ data: { kind: 'load', format: 'close-audit', bytes: [] } });
    } finally {
      globalThis.self = previousSelf;
      globalThis.fetch = previousFetch;
    }
  });
  await import('../../web/preview/reader-worker.mjs?paper-table=' + Date.now());
  await self.onmessage({ data: { kind: 'load', format: 'hwpx', bytes: readFileSync(path) } });
  const reply = replies.shift();
  assert.equal(reply.error, undefined);
  const content = reply.content,
    before = JSON.stringify(content),
    table = content.tables.find((row) => row.tableNode === expected.node);
  assert.equal(table.sourceGeometry.geometry.width, expected.width);
  assert.equal(table.sourceGeometry.geometry.horizontal_offset, expected.offset);
  assert.deepEqual(
    table.cells.map((cell) => cell.width),
    expected.cellWidths,
  );
  const reference = pageReferenceBoxes(content.pageSettings[0], { x: 20, y: 20 });
  assert.equal(reference.state, 'placed');
  const source = tableSourceHorizontalLayout(table),
    style = createTextStyle(content, '16px sans-serif');
  assert.equal(source.state, 'resolved', source.error);
  const measured = measureTableCells(
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
  assert.equal(measured.state, 'measured', measured.error);
  const [left, right, top, bottom] = expected.margins.map((value) => value / 75);
  const origin = reference.boxes.page.x + left;
  const boxes = measured.grid.cells.map((cell) => ({
    ...cell,
    x: origin + cell.x,
    y: reference.boxes.page.y + top + cell.y,
    tableNode: table.tableNode,
    section: table.section,
    pageOrdinal: 0,
    referenceBoxes: { ...reference.boxes, column: reference.boxes.page },
  }));
  const placed = placeTablePagesHorizontally(
    table,
    { state: 'placed', boxes, rows: [] },
    { left, right, top, bottom },
    content.paragraphs.find(
      (p) => p.paragraph === table.hostParagraph && p.section === table.section,
    ),
  );
  assert.equal(placed.state, 'placed', placed.error);
  const x = Math.min(...placed.boxes.map((box) => box.x)),
    end = Math.max(...placed.boxes.map((box) => box.x + box.width));
  assert.ok(Math.abs(x - (reference.boxes.page.x + expected.offset / 75)) < 1e-8);
  assert.ok(end + right > reference.boxes.page.x + reference.boxes.page.width);
  assert.ok(
    x - left >= reference.boxes.paper.x &&
      end + right <= reference.boxes.paper.x + reference.boxes.paper.width,
  );
  assert.deepEqual(
    placed.boxes.map((box) => box.width),
    measured.grid.cells.map((cell) => cell.width),
  );
  assert.equal(JSON.stringify(content), before);
  t.diagnostic(
    JSON.stringify({
      tableNode: table.tableNode,
      x,
      right: end + right,
      bodyRight: reference.boxes.page.x + reference.boxes.page.width,
    }),
  );
});
