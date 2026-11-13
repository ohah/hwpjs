import test from 'node:test';
import assert from 'node:assert/strict';
import { dom } from './shape-copy-followup-dom.mjs';
import { fixture, seedDraft, saved } from './shape-copy-cell-fixture.mjs';
import { createShapeCopyTool } from '../src/shape-copy-tool.ts';
for (const format of ['hwp5', 'hwpx'])
  test(
    'Node EventTarget DOM + actual879/' +
      format +
      (format === 'hwpx' ? '/NEW-authored-opaque' : '/original-Noori') +
      ': cell caret -> explicit modal choices -> cell block same command one Native history',
    async () => {
      const h = await fixture(format, { opaqueTargets: format === 'hwpx' }),
        d = dom();
      let block = false,
        focus = 0;
      const status = [];
      const tool = createShapeCopyTool({
        root: d.root,
        editor: h.e,
        getCellSelection: () => (block ? h.selection() : null),
        hasCellBlock: () => block,
        onStatus: (t) => status.push(t),
        onPresentationChange() {},
        onClose() {
          focus++;
        },
      });
      try {
        await h.select(h.source);
        await h.appearance.apply(h.appearance.capture(), seedDraft);
        await h.select(h.source);
        const before = await saved(h.e),
          rev = h.e.getEditorState().nativeHistoryRevision,
          source = h.e.getEditorState();
        assert.equal(tool.presentation().enabled, true);
        await tool.action('format-copy');
        const confirm = d.role('shape-copy-confirm');
        assert(confirm.disabled);
        for (const id of ['cell.border', 'cell.background', 'cell.diagonal']) {
          const input = d.field(id);
          assert(input && !input.disabled, id);
          input.checked = true;
          d.send(input, 'change');
        }
        assert.equal(h.e.getEditorState(), source);
        d.send(confirm, 'click');
        assert.equal(d.role('shape-copy'), undefined);
        assert.equal(focus, 1);
        assert.deepEqual(await saved(h.e), before);
        await h.select(h.targets[0]);
        block = true;
        assert.equal(tool.presentation().enabled, true);
        await tool.action('format-copy');
        assert.equal(h.e.getEditorState().nativeHistoryRevision, rev + 1);
        assert.equal(focus, 2);
        assert.equal(status.at(-1), '선택한 지원 항목의 모양을 적용했습니다.');
      } finally {
        tool.dispose();
        await h.close();
      }
    },
  );
test('Node cell modal: composition/key229, state A-B-A and cancel cannot remember stale cells or lose source selection', async () => {
  const h = await fixture(),
    d = dom();
  const tool = createShapeCopyTool({
    root: d.root,
    editor: h.e,
    onStatus() {},
    onPresentationChange() {},
    onClose() {},
  });
  try {
    await h.select(h.source);
    const before = await saved(h.e),
      state = h.e.getEditorState();
    await tool.action('format-copy');
    const field = d.field('cell.diagonal');
    assert(field && !field.disabled);
    field.checked = true;
    d.send(field, 'change');
    const dialog = d.role('shape-copy'),
      confirm = d.role('shape-copy-confirm');
    d.send(dialog, 'keydown', { keyCode: 229, key: 'Process' });
    d.send(confirm, 'click');
    assert(d.role('shape-copy'));
    assert.equal(h.e.getEditorState(), state);
    d.send(dialog, 'compositionstart');
    d.send(dialog, 'compositionend');
    d.send(dialog, 'keyup', { keyCode: 229 });
    await h.select(h.targets[0]);
    await h.select(h.source);
    assert(confirm.disabled);
    d.send(confirm, 'click');
    assert(d.role('shape-copy'));
    d.send(d.role('shape-copy-cancel'), 'click');
    assert.equal(d.role('shape-copy'), undefined);
    assert.deepEqual(await saved(h.e), before);
  } finally {
    tool.dispose();
    await h.close();
  }
});
test('Node cell block with only body clipboard is refused, never a body-format fallback', async () => {
  const h = await fixture(),
    d = dom();
  let block = true;
  const tool = createShapeCopyTool({
    root: d.root,
    editor: h.e,
    getCellSelection: () => h.selection(),
    hasCellBlock: () => block,
    onStatus() {},
    onPresentationChange() {},
    onClose() {},
  });
  try {
    await h.select(h.targets[0]);
    const before = await saved(h.e);
    assert.equal(tool.presentation().enabled, false);
    await tool.action('format-copy');
    assert.deepEqual(await saved(h.e), before);
    block = false;
  } finally {
    tool.dispose();
    await h.close();
  }
});
