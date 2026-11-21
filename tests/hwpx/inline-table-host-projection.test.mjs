import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineTableHostFixture } from '../helpers/inline-table-host-source-fixture.mjs';
import { layoutPageContent } from '../../web/preview/page-content-layout.mjs';
import { rowAtPoint } from '../../web/preview/row-geometry.mjs';
import { isInlineTableHostUnit } from '../../web/preview/inline-table-host-run.mjs';
const measure = (text) => ({ width: [...text].length * 8, height: 16 });
for (const format of ['hwp5', 'hwpx'])
  test(`${format}: real host layout producer owns table source unit and empty-cell hit`, () => {
    const content = inlineTableHostFixture(format, 3600);
    content.paragraphs[1].text = '😀\ufffcA';
    content.tables[0].anchorUnit = 2;
    content.tables[0].pagination.page_break = 'none';
    for (const p of content.paragraphs.filter((p) => p.tableCell)) p.text = '';
    const before = structuredClone(content);
    const result = layoutPageContent(content, measure, 1000);
    assert.equal(result.state, 'paginated', result.error);
    const host = result.rows.find((r) => r.paragraph === 1 && r.startUnit <= 2 && r.endUnit >= 3);
    assert(host, 'actual source host row missing');
    assert(host.inlineTables.some((t) => t.tableNode === 7 && t.unit === 2));
    assert.equal(isInlineTableHostUnit(host, 2), true);
    assert.equal(isInlineTableHostUnit(host, 0), false);
    const row = result.rows.find((r) => r.tableNode === 7 && r.listNode === 8 && r.kind === 'text');
    assert(row, 'actual empty cell row missing');
    const x = row.x + (row.paragraphX ?? 0) + Math.min(2, row.width / 2),
      y = row.y + Math.min(2, row.height / 2);
    const picked = result.rows[rowAtPoint(result, x, y)];
    assert(picked, 'cell point missed');
    assert.equal(picked.listNode, 8);
    assert.equal(picked.tableNode, 7);
    assert.deepEqual(content, before);
  });
