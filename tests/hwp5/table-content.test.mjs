import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { attachHwp5Tables } from '../../web/preview/hwp5-table-content.mjs';
import { displayContent } from '../../web/preview/content.mjs';
import { inspect } from './style-preservation/text-record-oracle.mjs';
import { tableBindings } from './style-preservation/table-binding-oracle.mjs';
import { tableGrid, hwpUnitsToPixels } from '../../web/preview/table-grid.mjs';
import { layoutTableContent } from '../../web/preview/table-flow.mjs';
import { caretGeometry, hitText } from '../../web/preview/text-geometry.mjs';

const binding = (paragraph) => ({
  paragraph,
  tableNode: 4,
  listNode: 9,
  rows: 2,
  columns: 2,
  row: 0,
  column: 1,
  rowSpan: 2,
  columnSpan: 1,
  width: 1234,
  height: 5678,
});

test('table display grouping separates sections, retains cell paragraphs and clears stale ownership', () => {
  const preview = { sections: [{ index: 0 }, { index: 1 }] };
  const content = {
    paragraphs: [0, 1].flatMap((section) =>
      [0, 1].map((paragraph) => ({ section, paragraph, editable: true })),
    ),
  };
  const editor = { tableBindings: () => [binding(0), binding(1)] };
  attachHwp5Tables(editor, preview, content);
  assert.equal(content.tables.length, 2);
  for (const table of content.tables) {
    assert.equal(table.cells.length, 1);
    assert.deepEqual(table.cells[0].paragraphs, [0, 1]);
    assert.equal(table.partial, false);
    assert.equal(table.cells[0].width, 1234);
    assert.equal(table.cells[0].rowSpan, 2);
  }
  attachHwp5Tables(null, preview, content);
  assert.deepEqual(content.tables, []);
  assert.deepEqual(content.tableBindingsErrors, []);
  assert(content.paragraphs.every((p) => !p.tableCell && p.editable));
});

test('table diagnostics do not disable editing and clipped or omitted cell content is partial', () => {
  const preview = { sections: [{ index: 0 }, { index: 1 }] };
  const content = { paragraphs: [{ section: 1, paragraph: 0, editable: true, clipped: true }] };
  attachHwp5Tables(
    {
      tableBindings(section) {
        if (!section) throw new Error('InvalidTable');
        return [binding(0), { ...binding(1), listNode: 10 }];
      },
    },
    preview,
    content,
  );
  assert.deepEqual(content.tableBindingsErrors, [{ section: 0, error: 'InvalidTable' }]);
  assert.equal(content.paragraphs[0].editable, true);
  assert.equal(content.tables[0].partial, true);
  assert.deepEqual(
    content.tables[0].cells.map((cell) => cell.paragraphs),
    [[0], []],
  );
  const source = {
    version: [5, 0, 0, 0],
    sections: [
      {
        index: 0,
        paragraphs: [
          { text: 'A😀B', textPresent: true, declaredUnits: 4, parentNodeIndex: null, tokens: [] },
        ],
      },
    ],
  };
  const clipped = displayContent(source, { maxUnits: 2 });
  assert.equal(clipped.paragraphs[0].text, 'A');
  assert.equal(clipped.paragraphs[0].clipped, true);
  assert.equal(clipped.paragraphs[0].editable, false);
  attachHwp5Tables({ tableBindings: () => [binding(0)] }, source, clipped);
  assert.equal(clipped.tables[0].partial, true);
});

test('actual Worker table ownership matches all fixture records and refreshes split input history', async (t) => {
  const previousSelf = globalThis.self,
    previousFetch = globalThis.fetch,
    replies = [];
  globalThis.self = {
    postMessage(value) {
      replies.push(value);
    },
  };
  globalThis.fetch = async () =>
    new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'));
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  });
  await import(`../../web/preview/reader-worker.mjs?table-content=${Date.now()}`);
  const send = async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    const value = replies.shift();
    assert.equal(value.error, undefined);
    return value;
  };
  let files = 0,
    count = 0;
  for (const path of execFileSync('git', ['ls-files', '-z'])
    .toString()
    .split('\0')
    .filter(
      (p) =>
        p.includes('/fixtures/') &&
        p.endsWith('.hwp') &&
        !/(?:password-12345|distribution|viewtext)\.hwp$/.test(p),
    )) {
    const bytes = readFileSync(path),
      content = (await send({ kind: 'load', bytes })).content;
    assert.deepEqual(content.tableBindingsErrors, [], path);
    assert.deepEqual(content.tablePlacementsErrors, [], path);
    for (const table of content.tables) {
      assert(Number.isInteger(table.hostParagraph), path);
      const host = content.paragraphs.find(
        (p) => p.section === table.section && p.paragraph === table.hostParagraph,
      );
      assert(host, path);
      if (table.parentTableNode !== null) {
        assert.equal(host.tableCell?.tableNode, table.parentTableNode, path);
        assert.equal(host.tableCell?.listNode, table.parentListNode, path);
      }
    }
    const flow = layoutTableContent(content, 900, (text) => text.length * 8);
    assert.equal(flow.limited, false, path);
    for (const table of content.tables.filter((t) => t.parentTableNode !== null)) {
      const parent = flow.boxes.find(
        (box) =>
          box.section === table.section &&
          box.tableNode === table.parentTableNode &&
          box.listNode === table.parentListNode,
      );
      assert(parent, path);
      for (const child of flow.boxes.filter(
        (box) => box.section === table.section && box.tableNode === table.tableNode,
      )) {
        assert(child.x >= parent.x && child.y >= parent.y, path);
        assert(child.x + child.width <= parent.x + parent.width + 1e-7, path);
        assert(child.y + child.height <= parent.y + parent.height + 1e-7, path);
      }
    }
    for (const p of content.paragraphs) {
      const textRows = flow.rows.filter(
        (row) => row.kind === 'text' && row.section === p.section && row.paragraph === p.paragraph,
      );
      assert(textRows.length > 0, `${path}:${p.paragraph}`);
      assert.equal(textRows.map((row) => row.text).join(''), p.text, `${path}:${p.paragraph}`);
      if (p.editable) {
        const caret = caretGeometry(flow, { section: p.section, paragraph: p.paragraph, unit: 0 });
        assert(caret, `${path}:${p.paragraph}`);
        const hit = hitText(flow, caret.x, caret.y);
        assert.equal(hit?.paragraph, p.paragraph, `${path}:${p.paragraph}`);
        assert.equal(hit?.section, p.section, path);
      }
    }
    for (const table of content.tables) {
      const grid = tableGrid(table);
      for (const [i, cell] of table.cells.entries()) {
        assert(grid.cells[i].width + 1e-7 >= hwpUnitsToPixels(cell.width), path);
        assert(grid.cells[i].height + 1e-7 >= hwpUnitsToPixels(cell.height), path);
      }
    }
    const source = inspect(bytes);
    for (const [section, value] of source.sections.entries()) {
      const expected = tableBindings(value.bytes);
      const paragraphs = content.paragraphs.filter((p) => p.section === section && p.tableCell);
      assert.equal(paragraphs.length, expected.length, path);
      for (const row of expected) {
        const p = paragraphs.find((p) => p.paragraph === row.paragraph);
        assert.deepEqual(
          p.tableCell,
          {
            tableNode: row.tableNode,
            listNode: row.listNode,
            row: row.row,
            column: row.column,
            rowSpan: row.rowSpan,
            columnSpan: row.columnSpan,
          },
          path,
        );
        const table = content.tables.find(
          (table) => table.section === section && table.tableNode === row.tableNode,
        );
        const cell = table.cells.find((cell) => cell.listNode === row.listNode);
        assert.equal(table.partial, false, path);
        assert.equal(table.rows, row.rows);
        assert.equal(table.columns, row.columns);
        assert.equal(cell.width, row.width);
        assert.equal(cell.height, row.height);
        assert(cell.paragraphs.includes(row.paragraph));
        count++;
      }
    }
    files++;
  }
  assert.equal(files, 45);
  assert.equal(count, 723);
  const loaded = await send({
    kind: 'load',
    bytes: readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/table.hwp'),
  });
  const target = loaded.content.paragraphs.find((p) => p.tableCell),
    index = target.paragraph;
  await send({ kind: 'enable' });
  const split = await send({ kind: 'split', section: 0, paragraph: index, atUnit: 0 });
  for (const paragraph of [index, index + 1])
    assert.deepEqual(
      split.content.paragraphs.find((p) => p.paragraph === paragraph).tableCell,
      target.tableCell,
    );
  const typed = await send({
    kind: 'splice',
    section: 0,
    paragraph: index + 1,
    startUnit: 0,
    endUnit: 0,
    text: '셀😀',
  });
  assert.deepEqual(typed.content.tables, split.content.tables);
  assert.deepEqual((await send({ kind: 'undo' })).content.tables, split.content.tables);
  assert.deepEqual((await send({ kind: 'undo' })).content.tables, loaded.content.tables);
  assert.deepEqual((await send({ kind: 'redo' })).content.tables, split.content.tables);
  assert.deepEqual((await send({ kind: 'redo' })).content.tables, typed.content.tables);
});
