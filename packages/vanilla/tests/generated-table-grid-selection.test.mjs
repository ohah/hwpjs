// Actual Canvas/Surface input selection; controlled Core and renderer, no Native claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';
async function run(body) {
  const f = formattingFixture();
  const generated = {
    section: 0,
    paragraph: 99,
    text: 'CELL',
    editable: true,
    selectable: true,
    createdCell: { identity: '7', row: 0, column: 0 },
  };
  const sourceParagraph = f.renderer.paragraph;
  f.renderer.paragraph = (p) => (p?.createdCell ? generated : sourceParagraph(p));
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
  f.install({ capabilities: { ...f.state().capabilities, createdTableGridAvailable: true } });
  const surface = createCanvasSurface({ root: f.root, editor: f.editor });
  const select = async (line = 0) => {
    f.pointer('pointerdown', line, 1);
    f.pointer('pointerup', line, 1);
    await tick();
  };
  try {
    await select();
    await body(f, surface, select);
  } finally {
    while (f.waits.length) f.reject();
    await surface.dispose();
  }
}
test('generated cell capture uses real Canvas address without a fabricated source paragraph', () =>
  run(async (f, s) => {
    const c = s.captureGeneratedTableGridSelection();
    assert(c);
    assert.equal(c.state, f.state());
    assert.deepEqual(c.createdCell, { identity: '7', row: 0, column: 0 });
    assert.equal(c.section, 0);
    assert.equal(c.current(), true);
    assert(Object.isFrozen(c.createdCell));
    assert.equal(f.messages.length, 0);
  }));
test('source selection and A to B to A invalidate old generated captures', () =>
  run(async (f, s, select) => {
    const c = s.captureGeneratedTableGridSelection();
    assert(c);
    await select(1);
    assert.equal(s.captureGeneratedTableGridSelection(), null);
    await select(0);
    assert.equal(c.current(), false);
    assert(s.captureGeneratedTableGridSelection());
  }));
test('composition cancellation cannot revive captured generated selection', () =>
  run(async (f, s) => {
    const c = s.captureGeneratedTableGridSelection();
    assert(c);
    f.input().dispatchEvent(new Event('compositionstart'));
    assert.equal(c.current(), false);
    assert.equal(s.captureGeneratedTableGridSelection(), null);
    f.input().dispatchEvent(new Event('compositionend'));
    await tick();
    assert.equal(c.current(), false);
  }));
test('old ABI read only state changes modal revocation and disposal fail closed', () =>
  run(async (f, s, select) => {
    const c = s.captureGeneratedTableGridSelection();
    assert(c);
    f.install({ capabilities: { ...f.state().capabilities, createdTableGridAvailable: false } });
    await tick();
    assert.equal(c.current(), false);
    assert.equal(s.captureGeneratedTableGridSelection(), null);
    f.install({
      capabilities: { ...f.state().capabilities, createdTableGridAvailable: true },
      content: { ...f.state().content, readOnly: true },
    });
    await tick();
    await select();
    assert.equal(s.captureGeneratedTableGridSelection(), null);
    f.install({ content: { ...f.state().content, readOnly: false } });
    await tick();
    await select();
    const next = s.captureGeneratedTableGridSelection();
    assert(next);
    f.setDialogs([f.dialog()]);
    assert.equal(next.current(), false);
    assert.equal(s.captureGeneratedTableGridSelection(), null);
    f.setDialogs([]);
    assert.equal(next.current(), false);
    f.revoke();
    assert.equal(s.captureGeneratedTableGridSelection(), null);
  }));
