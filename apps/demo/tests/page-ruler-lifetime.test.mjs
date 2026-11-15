// Actual packet Surface + ruler + relay. Renderer/Core/DOM are controlled;
// this file is not Native layout, browser pixels or combined deployment evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fixture } from '../../../packages/vanilla/tests/non-text-history-fixture.mjs';
import { Document } from './fake-dom.mjs';
import { createPageStatusRelay } from '../src/page-status.ts';
const rendererURL = new URL('../../../web/preview/renderer.mjs', import.meta.url).href;
const shim =
  'data:text/javascript,' +
  encodeURIComponent(`
export function createDocumentOutputRenderer(){throw Error('UnexpectedOutput');}
export function createSurfaceRenderer(canvas,viewport,spacer,onLayout){
 const f=globalThis.__nonTextFixture;f.viewport=viewport;f.onLayout=onLayout;return f.renderer;
}`);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (new URL(specifier, context.parentURL).href === rendererURL)
      return { url: shim, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/page-ruler.css'))
      return { format: 'module', source: 'export {};', shortCircuit: true };
    return next(url, context);
  },
});
const { createCanvasSurface } = await import('../../../packages/vanilla/src/surface.ts');
const { mountPageRuler } = await import('../src/page-ruler.ts');
hooks.deregister();
const tick = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
function setup() {
  const f = fixture();
  let scale = 1,
    offset = 0,
    current = true,
    leaseHooks;
  const acquire = f.editor.acquireInputSurface;
  f.editor.acquireInputSurface = (hooks) => {
    leaseHooks = hooks;
    return acquire(hooks);
  };
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
  f.renderer.viewScale = () => scale;
  const surface = createCanvasSurface({ root: f.root, editor: f.editor });
  const w = globalThis.__nonTextFixture;
  w.viewport.clientLeft = 0;
  w.viewport.children[0].getBoundingClientRect = () => ({
    left: offset - w.viewport.scrollLeft,
    width: 1200,
    height: 2000,
  });
  return {
    f,
    frame,
    surface,
    w,
    scale: (n) => {
      scale = n;
    },
    offset: (n) => {
      offset = n;
    },
    current: (n) => {
      current = n;
    },
    revoke() {
      f.revoke();
      leaseHooks.cancelComposition('detach');
    },
  };
}
function dom() {
  const doc = new Document(),
    frames = new Map();
  let id = 0;
  doc.defaultView = Object.assign(new EventTarget(), {
    requestAnimationFrame: (fn) => (frames.set(++id, fn), id),
    cancelAnimationFrame: (id) => frames.delete(id),
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  });
  const create = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const n = create(tag);
    n.style = {};
    n.getBoundingClientRect = () => ({ left: 0 });
    return n;
  };
  const ruler = doc.createElement('div'),
    host = doc.createElement('div');
  host.clientWidth = 800;
  host.clientHeight = 600;
  return {
    ruler,
    host,
    frames,
    flush() {
      const work = [...frames.values()];
      frames.clear();
      work.forEach((fn) => fn());
    },
  };
}
async function attach(s, relay = createPageStatusRelay()) {
  const d = dom();
  relay.connect(s.surface);
  const ruler = mountPageRuler(d.ruler, d.host, () => relay);
  s.w.onLayout(s.frame.layout);
  await tick();
  d.flush();
  assert.equal(d.ruler.hidden, false);
  return { d, ruler, relay };
}
for (const scale of [0.5, 1, 1.5, 2])
  test(`currentPage uses both viewport axes at ${scale * 100}% and retains no false first page`, async () => {
    const s = setup();
    try {
      s.scale(scale);
      s.offset(130);
      s.w.viewport.scrollTop = 1000 * scale;
      s.w.viewport.scrollLeft = 900 * scale + 130;
      assert.equal(s.surface.getPageStatus().current, 2);
      assert.equal(s.surface.getPageGeometry().paper.width, 1100);
      // Same painted frame and vertical origin: horizontal-only change must invalidate cache.
      s.w.viewport.scrollLeft = 0;
      assert.equal(s.surface.getPageStatus().current, 1);
      // Contact with the right edge is not intersection.
      s.w.viewport.scrollLeft = 1120 * scale + 130;
      assert.deepEqual(s.surface.getPageStatus(), { current: null, total: 2, partial: false });
      assert.equal(s.surface.getPageGeometry(), null);
    } finally {
      await s.surface.dispose();
    }
  });
test('currentPage follows actual stage centering, viewport width and exact vertical gap edges', async () => {
  const s = setup();
  try {
    s.w.viewport.scrollTop = 1000;
    s.offset(900);
    assert.equal(s.surface.getPageStatus().current, null);
    s.offset(0);
    assert.equal(s.surface.getPageStatus().current, 1);
    s.w.viewport.scrollLeft = 0;
    s.w.viewport.clientWidth = 20;
    assert.equal(s.surface.getPageStatus().current, null);
    s.w.viewport.clientWidth = 21;
    assert.equal(s.surface.getPageStatus().current, 1);
    s.w.viewport.clientWidth = 800;
    s.w.viewport.scrollTop = 1100;
    s.w.viewport.clientHeight = 20;
    assert.equal(s.surface.getPageStatus().current, null);
    s.w.viewport.clientHeight = 21;
    assert.equal(s.surface.getPageStatus().current, 2);
  } finally {
    await s.surface.dispose();
  }
});
test('partial visible pages retain local ordinals and never claim a document total', async () => {
  const s = setup();
  try {
    s.frame.content.window = {};
    s.w.viewport.scrollTop = 1000;
    s.w.viewport.scrollLeft = 900;
    assert.deepEqual(s.surface.getPageStatus(), { current: 2, total: null, partial: true });
    assert.equal(s.surface.getPageGeometry().partial, true);
  } finally {
    await s.surface.dispose();
  }
});
for (const status of ['loading', 'empty', 'refresh-required', 'disposed'])
  test(`retained ruler hides on ${status} without repaint, scroll or controller state refresh`, async () => {
    const s = setup(),
      a = await attach(s);
    try {
      s.f.install({ status });
      await tick();
      a.d.flush();
      assert.equal(s.surface.getPageGeometry(), null);
      assert.equal(a.d.ruler.hidden, true);
      assert.equal(a.d.ruler.dataset.page, undefined);
      if (status !== 'disposed') {
        s.f.install({ status: 'ready' });
        await tick();
        a.d.flush();
        assert.equal(a.d.ruler.hidden, false);
      }
    } finally {
      a.ruler.dispose();
      a.relay.dispose();
      await s.surface.dispose();
    }
  });
test('new revision invalidates a retained ruler before any replacement painted frame', async () => {
  const s = setup(),
    a = await attach(s);
  try {
    s.f.install({ operationRevision: 2 });
    await tick();
    a.d.flush();
    assert.equal(a.d.ruler.hidden, true);
    assert.equal(a.d.ruler.dataset.page, undefined);
    s.frame.resourceEpoch = 'doc:1:2';
    s.w.onLayout(s.frame.layout);
    await tick();
    a.d.flush();
    assert.equal(a.d.ruler.hidden, false);
  } finally {
    a.ruler.dispose();
    a.relay.dispose();
    await s.surface.dispose();
  }
});
test('Core detach hook invalidates retained ruler even when no Core snapshot follows', async () => {
  const s = setup(),
    a = await attach(s);
  try {
    s.revoke();
    await tick();
    a.d.flush();
    assert.equal(s.surface.getPageGeometry(), null);
    assert.equal(a.d.ruler.hidden, true);
    assert.equal(a.d.ruler.dataset.page, undefined);
  } finally {
    a.ruler.dispose();
    a.relay.dispose();
    await s.surface.dispose();
  }
});
test('Surface-only dispose hides a retained relay/ruler and a later Surface can restore it', async () => {
  const s = setup(),
    a = await attach(s);
  let replacement;
  try {
    const pending = s.surface.dispose();
    await tick();
    a.d.flush();
    assert.equal(s.surface.getPageGeometry(), null);
    assert.equal(a.d.ruler.hidden, true);
    assert.equal(a.d.ruler.dataset.page, undefined);
    await pending;
    replacement = setup();
    replacement.w.viewport.scrollTop = 1120;
    a.relay.connect(replacement.surface);
    replacement.w.onLayout(replacement.frame.layout);
    await tick();
    a.d.flush();
    assert.equal(a.d.ruler.hidden, false);
    assert.equal(a.d.ruler.dataset.page, '2');
    // Final relay invalidation must also reach retained observers.
    a.relay.dispose();
    a.d.flush();
    assert.equal(a.d.ruler.hidden, true);
    assert.equal(a.d.ruler.dataset.page, undefined);
  } finally {
    a.ruler.dispose();
    a.relay.dispose();
    await replacement?.surface.dispose();
    await s.surface.dispose();
  }
});
test('a missing replacement after detach leaves the ruler hidden, including queued old notifications', async () => {
  const s = setup(),
    a = await attach(s);
  try {
    s.w.viewport.scrollTop++;
    s.w.onLayout(s.frame.layout); // Notification is queued.
    await s.surface.dispose();
    await tick();
    a.d.flush();
    assert.equal(a.d.ruler.hidden, true);
    assert.equal(a.d.ruler.dataset.page, undefined);
    s.w.onLayout(s.frame.layout);
    await tick();
    a.d.flush();
    assert.equal(a.d.ruler.hidden, true);
    assert.equal(a.d.ruler.dataset.page, undefined);
    assert.equal(a.d.frames.size, 0);
  } finally {
    a.ruler.dispose();
    a.relay.dispose();
    await s.surface.dispose();
  }
});
test('final observer faults and reentrant dispose do not prevent cleanup or another invalidation observer', async () => {
  const s = setup(),
    a = await attach(s);
  let nested,
    calls = 0;
  const stop = s.surface.subscribePageStatus(() => {
    throw Error('observer');
  });
  s.surface.subscribePageStatus(() => {
    calls++;
    nested = s.surface.dispose();
  });
  const outer = s.surface.dispose();
  assert.equal(outer, nested);
  assert.equal(calls, 1);
  await outer;
  await tick();
  a.d.flush();
  assert.equal(a.d.ruler.hidden, true);
  assert.equal(a.d.ruler.dataset.page, undefined);
  assert.equal(s.f.root.children.length, 0);
  stop();
  a.ruler.dispose();
  a.relay.dispose();
});
test('relay ignores late emissions from replaced sources and isolates failing observers', () => {
  const relay = createPageStatusRelay(),
    callbacks = [];
  const source = (current) => ({
    getPageStatus: () => ({ current, total: 2, partial: false }),
    subscribePageStatus(fn) {
      callbacks.push(fn);
      return () => {};
    },
  });
  let notifications = 0;
  relay.subscribePageStatus(() => {
    throw Error('observer');
  });
  relay.subscribePageStatus(() => {
    notifications++;
  });
  relay.connect(source(1));
  relay.connect(source(2));
  assert.equal(notifications, 2);
  callbacks[0]();
  assert.equal(notifications, 2);
  callbacks[1]();
  assert.equal(notifications, 3);
  relay.dispose();
  assert.equal(notifications, 4);
  callbacks[1]();
  assert.equal(notifications, 4);
});

test('retained ruler changes to the horizontally visible paper and hides in a full viewport gap', async () => {
  const s = setup(),
    a = await attach(s);
  try {
    assert.equal(a.d.ruler.dataset.page, '1');
    s.w.viewport.scrollTop = 1000;
    s.w.viewport.scrollLeft = 900;
    s.w.onLayout(s.frame.layout);
    await tick();
    a.d.flush();
    assert.equal(a.d.ruler.hidden, false);
    assert.equal(a.d.ruler.dataset.page, '2');
    assert.match(a.d.ruler.textContent, /가로/);
    s.w.viewport.scrollLeft = 1120;
    s.w.onLayout(s.frame.layout);
    await tick();
    a.d.flush();
    assert.equal(a.d.ruler.hidden, true);
    assert.equal(a.d.ruler.dataset.page, undefined);
  } finally {
    a.ruler.dispose();
    a.relay.dispose();
    await s.surface.dispose();
  }
});
test('malformed horizontal paper bounds and hidden viewport cannot produce a plausible page ordinal', async () => {
  for (const field of ['x', 'width'])
    for (const value of [NaN, Infinity]) {
      const s = setup();
      try {
        s.frame.layout.pages[0].paper[field] = value;
        assert.equal(s.surface.getPageStatus(), null);
      } finally {
        await s.surface.dispose();
      }
    }
  const s = setup();
  try {
    s.w.viewport.clientWidth = 0;
    assert.equal(s.surface.getPageStatus(), null);
    assert.equal(s.surface.getPageGeometry(), null);
  } finally {
    await s.surface.dispose();
  }
});
