// Real Surface; controlled renderer/Core edge. No Native or browser evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fixture } from '../../../packages/vanilla/tests/non-text-history-fixture.mjs';
const rendererURL = new URL('../../../web/preview/renderer.mjs', import.meta.url).href;
const shim =
  'data:text/javascript,' +
  encodeURIComponent(`export function createSurfaceRenderer(canvas, viewport, spacer, onLayout) {
  const w = globalThis.__nonTextFixture;
  w.viewport = viewport; w.onLayout = onLayout;
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
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
function setup() {
  const f = fixture();
  const pages = [0, 820, 1640].map((y) => ({ paper: { y, height: 800 } }));
  let current = true,
    scale = 1;
  const frame = {
    layout: { state: 'paginated', pages },
    content: {},
    resourceDocument: 'doc:1',
    resourceEpoch: 'doc:1:1',
  };
  f.renderer.isPaintedFrameCurrent = () => current;
  f.renderer.paintedFrame = () => frame;
  f.renderer.viewScale = () => scale;
  const surface = createCanvasSurface({ root: f.root, editor: f.editor });
  const w = globalThis.__nonTextFixture;
  return {
    ...f,
    surface,
    frame,
    w,
    setCurrent: (v) => {
      current = v;
    },
    setScale: (v) => {
      scale = v;
    },
  };
}
test('visible paper intersection and zoom use existing painted layout without flushing layout', async () => {
  const f = setup();
  const originalLayout = f.renderer.layout;
  try {
    f.renderer.layout = () => {
      throw Error('ObservationMustNotReflow');
    };
    assert.deepEqual(f.surface.getPageStatus(), { current: 1, total: 3, partial: false });
    f.w.viewport.scrollTop = 820;
    assert.equal(f.surface.getPageStatus().current, 2);
    f.setScale(2);
    f.w.viewport.scrollTop = 1640;
    assert.equal(f.surface.getPageStatus().current, 2);
    f.setScale(1);
    f.w.viewport.clientHeight = 10;
    f.w.viewport.scrollTop = 805;
    assert.equal(f.surface.getPageStatus().current, null, 'gap is unknown, not nearest page');
  } finally {
    f.renderer.layout = originalLayout;
    await f.surface.dispose();
  }
});
test('limited/window/fallback and malformed geometry never invent full page counts', async () => {
  const f = setup();
  try {
    for (const partial of [
      { limited: true },
      { layoutScope: 'paragraph-window-fragment' },
      { documentPageNumbersExact: false },
    ]) {
      const original = f.frame.layout;
      f.frame.layout = { ...original, ...partial };
      assert.equal(f.surface.getPageStatus().total, null);
      assert.equal(f.surface.getPageStatus().partial, true);
      f.frame.layout = original;
    }
    f.frame.content.window = {};
    assert.equal(f.surface.getPageStatus().total, null);
    f.frame.content = {};
    f.frame.layout.state = 'logical';
    assert.equal(f.surface.getPageStatus(), null);
    f.frame.layout.state = 'paginated';
    f.frame.layout = { ...f.frame.layout, pages: [{ paper: { y: 0, height: NaN } }] };
    f.renderer.paintedFrame = () => ({ ...f.frame });
    assert.equal(f.surface.getPageStatus(), null);
  } finally {
    await f.surface.dispose();
  }
});

test('a new painted frame invalidates visible-page cache even when renderer reuses mutable layout', async () => {
  const f = setup();
  try {
    assert.equal(f.surface.getPageStatus().current, 1);
    const layout = f.frame.layout;
    layout.pages[0].paper.y = -900;
    layout.pages[1].paper.y = 0;
    const nextFrame = { ...f.frame };
    assert.equal(nextFrame.layout, layout);
    f.renderer.paintedFrame = () => nextFrame;
    assert.equal(f.surface.getPageStatus().current, 2);
  } finally {
    await f.surface.dispose();
  }
});
test('unpainted, old document/revision, loading, refresh, reset and disposed are fenced', async () => {
  const f = setup();
  try {
    f.setCurrent(false);
    assert.equal(f.surface.getPageStatus(), null);
    f.setCurrent(true);
    f.frame.resourceEpoch = 'doc:1:0';
    assert.equal(f.surface.getPageStatus(), null);
    f.frame.resourceEpoch = 'doc:1:1';
    for (const status of ['loading', 'refresh-required', 'idle', 'disposed']) {
      f.install({ status });
      assert.equal(f.surface.getPageStatus(), null);
    }
    f.install({ status: 'ready', documentId: 'replacement', generation: 2 });
    assert.equal(f.surface.getPageStatus(), null);
  } finally {
    await f.surface.dispose();
  }
  f.editor.getEditorState = () => {
    throw Error('DisposedCoreMustNotBeRead');
  };
  assert.equal(f.surface.getPageStatus(), null);
});

test('Surface notification snapshots listeners during synchronous unsubscribe/resubscribe', async () => {
  const f = setup();
  let calls = 0,
    stop;
  const listener = () => {
    calls++;
    if (calls === 1) {
      stop();
      stop = f.surface.subscribePageStatus(listener);
    }
  };
  stop = f.surface.subscribePageStatus(listener);
  try {
    f.w.onLayout(f.frame.layout);
    await tick();
    assert.equal(calls, 1);
    f.w.viewport.scrollTop = 820;
    f.w.onLayout(f.frame.layout);
    await tick();
    assert.equal(calls, 2);
  } finally {
    stop();
    await f.surface.dispose();
  }
});
test('layout/scroll-paint notifications deduplicate page values and unsubscribe on cleanup', async () => {
  const f = setup();
  let updates = 0;
  const stop = f.surface.subscribePageStatus(() => {
    updates++;
  });
  try {
    f.w.onLayout(f.frame.layout);
    await tick();
    assert.equal(updates, 1);
    f.w.onLayout(f.frame.layout);
    await tick();
    assert.equal(updates, 1);
    f.w.viewport.scrollTop = 820;
    f.w.onLayout(f.frame.layout);
    await tick();
    assert.equal(updates, 2);
    stop();
    f.w.viewport.scrollTop = 1640;
    f.w.onLayout(f.frame.layout);
    await tick();
    assert.equal(updates, 2);
    f.surface.subscribePageStatus(() => {
      updates++;
    });
    f.w.onLayout(f.frame.layout);
    await f.surface.dispose();
    await tick();
    assert.equal(updates, 2);
  } finally {
    await f.surface.dispose();
  }
});
