import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerCanvasHarness } from '../canvas/worker-harness.mjs';
import { layoutPageContent } from '../../web/preview/page-content-layout.mjs';
import { pageParagraphCoverage } from '../../web/preview/page-paragraph-coverage.mjs';

test('actual table-bug product route retains oversized children and drawing through edit reopen', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit current candidate required');
  const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwpx');
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({ kind: 'load', format: 'hwpx', bytes: input });
  assert.equal(loaded.error, undefined);
  const check = (content) => {
    const before = structuredClone(content);
    const layout = layoutPageContent(content, (text) => ({ width: text.length * 4, height: 12 }));
    assert.equal(layout.state, 'paginated', layout.error);
    assert.equal(layout.pageLayoutMode, 'measured-mixed-inline-body');
    assert.equal(layout.placedDrawings.length, 1);
    assert.equal(
      layout.boxes.length,
      content.tables.reduce((sum, table) => sum + table.cells.length, 0),
    );
    assert.equal(
      new Set(layout.boxes.map((box) => `${box.tableNode}:${box.listNode}`)).size,
      layout.boxes.length,
    );
    assert.equal(pageParagraphCoverage(content.paragraphs, layout.rows).state, 'complete');
    assert(layout.rows.some((row) => row.drawingNode && row.text === '주제'));
    assert(layout.boxes.filter((box) => box.depth > 0).every((box) => box.pageClip === undefined));
    const corrupted = layout.rows.map((row) => ({ ...row }));
    corrupted.find((row) => row.drawingNode).text = 'lost';
    assert.equal(pageParagraphCoverage(content.paragraphs, corrupted).state, 'unavailable');
    assert.deepEqual(content, before);
    return layout;
  };
  const original = check(loaded.content);
  assert.equal((await h.send({ kind: 'enable' })).error, undefined);
  const changed = await h.send({
    kind: 'replace-paragraph-ranges',
    ranges: [{ section: 0, paragraph: 2, startUnit: 0, endUnit: 0 }],
    text: '검증😀 ',
  });
  assert.equal(changed.error, undefined);
  assert(changed.content.paragraphs.find((p) => p.paragraph === 2).text.startsWith('검증😀 '));
  check(changed.content);
  const saved = await h.send({ kind: 'save' });
  assert.equal(saved.error, undefined);
  const undone = await h.send({ kind: 'undo' });
  assert.equal(undone.error, undefined);
  assert.deepEqual(check(undone.content), original);
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), input);
  const redone = await h.send({ kind: 'redo' });
  assert.equal(redone.error, undefined);
  check(redone.content);
  const reopened = await h.send({ kind: 'load', format: 'hwpx', bytes: saved.bytes });
  assert.equal(reopened.error, undefined);
  check(reopened.content);
  assert(reopened.content.paragraphs.find((p) => p.paragraph === 2).text.startsWith('검증😀 '));
  t.diagnostic(
    'Product layout entry and real Worker/WASM; injected metrics and simulated DOM are not browser or Hangul layout proof',
  );
});
