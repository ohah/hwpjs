// Real Surface observation with controlled renderer/Core. Browser/Native evidence is separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fixture } from '../../../packages/vanilla/tests/non-text-history-fixture.mjs';
const rendererURL = new URL('../../../web/preview/renderer.mjs', import.meta.url).href;
const shim =
  'data:text/javascript,' +
  encodeURIComponent(`
export function createDocumentOutputRenderer(){throw Error('UnexpectedOutput');}
export function createSurfaceRenderer(canvas,viewport,spacer,onLayout){
 const w=globalThis.__nonTextFixture;w.viewport=viewport;w.onLayout=onLayout;
 return w.renderer;
}`);
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (new URL(specifier, context.parentURL).href === rendererURL)
      return { url: shim, shortCircuit: true };
    return next(specifier, context);
  },
});
const { createCanvasSurface } = await import('../../../packages/vanilla/src/surface.ts');
hook.deregister();
const tick = async () => {
  for (let n = 0; n < 5; n++) await Promise.resolve();
};
test('Surface geometry uses current painted page and stage; rejects stale, loading, gap, hidden and disposed observations', async () => {
  const f = fixture();
  let current = true,
    scale = 1;
  const pages = [
    {
      paper: { x: 20, y: 0, width: 800, height: 1100 },
      page: { x: 100, y: 80, width: 600, height: 940 },
    },
    {
      paper: { x: 20, y: 1120, width: 1100, height: 800 },
      page: { x: 70, y: 1170, width: 960, height: 700 },
    },
  ];
  const frame = {
    layout: { state: 'paginated', pages },
    content: {},
    resourceDocument: 'doc:1',
    resourceEpoch: 'doc:1:1',
  };
  f.renderer.isPaintedFrameCurrent = () => current;
  f.renderer.paintedFrame = () => frame;
  f.renderer.pageGeometryFrame = () => (current ? frame : null);
  f.renderer.viewScale = () => scale;
  const surface = createCanvasSurface({ root: f.root, editor: f.editor });
  const w = globalThis.__nonTextFixture;
  w.viewport.clientLeft = 0;
  let stageLeft = 130;
  const stage = w.viewport.children[0];
  stage.getBoundingClientRect = () => ({ left: stageLeft, width: 1200, height: 2000 });
  try {
    assert.equal(surface.getPageGeometry().current, 1);
    assert.equal(surface.getPageGeometry().paperLeft, 150);
    w.viewport.scrollTop = 1120;
    assert.equal(surface.getPageGeometry().current, 2);
    assert.equal(surface.getPageGeometry().paper.width, 1100);
    scale = 2;
    w.viewport.scrollTop = 2240;
    stageLeft = -300;
    assert.equal(surface.getPageGeometry().paperLeft, -260);
    let events = 0;
    surface.subscribePageStatus(() => events++);
    w.onLayout(frame.layout);
    await tick();
    stageLeft = -301;
    w.onLayout(frame.layout);
    await tick();
    assert.equal(events, 2, 'same page, new alignment still notifies');
    w.viewport.scrollTop += 1;
    w.onLayout(frame.layout);
    await tick();
    assert.equal(events, 3, 'same page viewport change still notifies');
    w.onLayout(frame.layout);
    await tick();
    assert.equal(events, 3, 'unchanged repaint remains deduplicated');
    current = false;
    assert.equal(surface.getPageGeometry(), null);
    current = true;
    frame.resourceEpoch = 'doc:1:0';
    assert.equal(surface.getPageGeometry(), null);
    frame.resourceEpoch = 'doc:1:1';
    f.root.clientWidth = 0;
    assert.equal(surface.getPageGeometry(), null);
    f.root.clientWidth = 800;
    w.viewport.clientHeight = 0;
    assert.equal(surface.getPageGeometry(), null);
    w.viewport.clientHeight = 10;
    scale = 1;
    w.viewport.scrollTop = 1105;
    assert.equal(surface.getPageGeometry(), null);
    w.viewport.scrollTop = 1120;
    assert.equal(surface.getPageGeometry().current, 2);
  } finally {
    await surface.dispose();
  }
  assert.equal(surface.getPageGeometry(), null);
});
