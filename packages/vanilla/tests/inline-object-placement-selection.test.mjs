// Actual Surface/Canvas with controlled renderer/Core; no Native/browser claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';

test('inline creation captures a generated Canvas caret without creating a source paragraph or granting Native permission', async () => {
  const f = formattingFixture();
  const generated = {
    section: 0,
    text: 'CELL',
    editable: true,
    selectable: true,
    createdCell: { identity: '9007199254740993', row: 0, column: 1 },
  };
  const source = f.renderer.paragraph;
  f.renderer.paragraph = (point) => (point?.createdCell ? generated : source(point));
  f.renderer.layout = () => ({
    width: 800,
    height: 600,
    rows: [generated, f.state().content.paragraphs[0]].map((p, i) => ({
      ...p,
      startUnit: 0,
      endUnit: p.text.length,
      width: p.text.length * 8,
      height: 28,
      x: 20,
      y: i * 32,
      boundaries: Array.from({ length: p.text.length + 1 }, (_, unit) => ({ unit, x: unit * 8 })),
    })),
  });
  f.install({ content: { ...f.state().content, inlineObjectPlacementVersion: 1 } });
  const surface = createCanvasSurface({ root: f.root, editor: f.editor });
  try {
    f.pointer('pointerdown', 0, 1);
    f.pointer('pointerup', 0, 1);
    await tick();
    const captured = surface.captureInlineObjectInsertCaret();
    assert(captured);
    assert.deepEqual(captured.selector, { section: 0, created_cell: generated.createdCell });
    assert.equal(Object.hasOwn(captured.selector, 'paragraph'), false);
    assert(Object.isFrozen(captured.selector));
    assert(Object.isFrozen(captured.selector.created_cell));
    assert.equal(captured.unit, 1);
    assert(['forward', 'backward'].includes(captured.affinity));
    assert.equal(captured.expected_text, 'CELL');
    assert.equal(captured.current(), true);
    assert.equal(f.messages.length, 0);
    f.pointer('pointerdown', 1, 2);
    f.pointer('pointerup', 1, 2);
    await tick();
    assert.equal(captured.current(), false);
    f.pointer('pointerdown', 0, 1);
    f.pointer('pointerup', 0, 1);
    await tick();
    assert.equal(captured.current(), false);
    f.install({ content: { ...f.state().content, inlineObjectPlacementVersion: 0 } });
    await tick();
    assert.equal(surface.captureInlineObjectInsertCaret(), null);
  } finally {
    while (f.waits.length) f.reject();
    await surface.dispose();
  }
});

for (const version of [1, 2])
  test(`HWP5 chart caret observes profile ${version} without claiming HWPX placement support`, async () => {
    const f = formattingFixture();
    f.install({
      nativeHistoryStats: { protocolVersion: 2 },
      content: {
        ...f.state().content,
        format: 'hwp5',
        inlineObjectPlacementVersion: 0,
        chartCreationAvailable: true,
        hwp5ChartCreateProfileVersion: version,
      },
    });
    const surface = createCanvasSurface({ root: f.root, editor: f.editor });
    try {
      f.pointer('pointerdown', 0, 1);
      f.pointer('pointerup', 0, 1);
      await tick();
      const caret = surface.captureInlineObjectInsertCaret();
      assert(caret);
      assert.equal(caret.current(), true);
      assert.equal(f.state().content.inlineObjectPlacementVersion, 0);
      assert.equal(f.messages.length, 0);
      f.setDialogs([f.dialog()]);
      assert.equal(surface.captureInlineObjectInsertCaret(), null);
      assert.equal(caret.current(), true); // A retained UX lease survives its own modal.
      f.setDialogs([]);
      f.pointer('pointerdown', 1, 2);
      f.pointer('pointerup', 1, 2);
      await tick();
      assert.equal(caret.current(), false);
      f.install({ content: { ...f.state().content, hwp5ChartCreateProfileVersion: 0 } });
      await tick();
      assert.equal(surface.captureInlineObjectInsertCaret(), null);
    } finally {
      while (f.waits.length) f.reject();
      await surface.dispose();
    }
  });
