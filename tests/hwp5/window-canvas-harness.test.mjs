import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerCanvasHarness } from '../canvas/worker-harness.mjs';

test('HWP5 queried window is consumable by Canvas without enabling readonly context', async (t) => {
  const harness = await workerCanvasHarness(t, { paintFrames: true });
  for (const [name, offset] of [
    ['charshape', 1],
    ['table-caption', 1],
    ['textbox', 1],
    ['sample-5017-pics', 0],
  ]) {
    const loaded = await harness.send({
      kind: 'load',
      format: 'hwp5',
      bytes: readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`),
    });
    assert.equal(loaded.error, undefined);
    const queried = await harness.send({ kind: 'query-window', offset, count: 1 });
    assert.equal(queried.error, undefined, name);
    harness.paint();
    t.diagnostic(
      `${name}: pageMode=${harness.canvas.dataset.pageLayoutMode}; pageError=${harness.canvas.dataset.pageLayoutError}`,
    );
    assert.equal(harness.canvas.dataset.pageLayoutError, '');
    assert.equal(harness.canvas.dataset.pageLayoutScope, 'paragraph-window-fragment');
    assert.equal(harness.canvas.dataset.documentPageNumbersExact, 'false');
    if (name === 'textbox')
      assert.equal(harness.canvas.dataset.pageLayoutMode, 'measured-drawing-body');
    const selected = queried.content.paragraphs.find((row) => !row.windowContext);
    assert(selected);
    assert.equal(harness.renderer.paragraph(selected).text, selected.text);
    for (const paragraph of queried.content.paragraphs.filter((row) => row.windowContext)) {
      assert.equal(harness.renderer.paragraph(paragraph).editable, false);
      assert.equal(harness.renderer.paragraph(paragraph).selectable, false);
    }
  }
});
