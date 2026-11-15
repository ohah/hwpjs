import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Document } from './fake-dom.mjs';
import { projectPageGeometry } from '../../../packages/vanilla/src/page-geometry.ts';
import { pageRulerModel } from '../src/page-ruler-model.ts';
const hook = registerHooks({
  load(url, context, next) {
    if (url.endsWith('/page-ruler.css'))
      return { format: 'module', source: 'export {};', shortCircuit: true };
    return next(url, context);
  },
});
const { mountPageRuler } = await import('../src/page-ruler.ts');
hook.deregister();
const px = (mm) => (mm * 96) / 25.4;
const page = (landscape = false) => ({
  paper: { x: 20, y: 40, width: px(landscape ? 297 : 210), height: px(landscape ? 210 : 297) },
  page: {
    x: 20 + px(23),
    y: 40 + px(30),
    width: px((landscape ? 297 : 210) - 23 - 17),
    height: px((landscape ? 210 : 297) - 60),
  },
});
const geometry = (scale = 1, landscape = false, stageLeft = 117) =>
  projectPageGeometry(page(landscape), landscape ? 2 : 1, false, scale, stageLeft, 31, 880);
test('physical paper, asymmetric margins and centimetres follow actual rectangles at 50..200%', () => {
  for (const scale of [0.5, 0.75, 1, 1.25, 1.5, 2])
    for (const landscape of [false, true]) {
      const model = pageRulerModel(geometry(scale, landscape));
      assert(Math.abs(model.width - px(landscape ? 297 : 210) * scale) < 1e-8);
      assert(Math.abs(model.leftMargin - px(23) * scale) < 1e-8);
      assert(Math.abs(model.rightMargin - px(17) * scale) < 1e-8);
      assert(Math.abs(model.ticks.find((t) => t.label === '1').x - px(10) * scale) < 1e-8);
      assert.match(model.label, landscape ? /297 × 210 mm · 가로/ : /210 × 297 mm · 세로/);
      assert.match(model.label, /왼쪽 23 \/ 오른쪽 17/);
    }
});
test('stage centering, scrollbar and horizontal scrolling share screen coordinates without recentering the paper', () => {
  for (const scale of [0.5, 1, 2])
    for (const stageLeft of [117, 31, -247]) {
      const g = geometry(scale, true, stageLeft);
      assert.equal(g.paperLeft, stageLeft + 20 * scale);
      assert.equal(g.viewportLeft, 31);
      assert.equal(g.viewportWidth, 880);
    }
});
test('absent, zero, nonfinite and out-of-paper measurements fail closed; returned boxes are detached', () => {
  assert.equal(projectPageGeometry(undefined, 1, false, 1, 0, 0, 800), null);
  for (const scale of [0, -1, NaN, Infinity]) assert.equal(geometry(scale), null);
  for (const width of [0, -1, NaN])
    assert.equal(projectPageGeometry(page(), 1, false, 1, 0, 0, width), null);
  const p = page(),
    g = projectPageGeometry(p, 1, true, 1, 0, 0, 800);
  p.paper.width = 0;
  assert(g.paper.width > 0);
  assert(Object.isFrozen(g.paper));
  assert.match(pageRulerModel(g).label, /부분 미리보기/);
  const bad = page();
  bad.page.x = 0;
  assert.equal(projectPageGeometry(bad, 1, false, 1, 0, 0, 800), null);
  assert.equal(pageRulerModel(null), null);
});
function dom() {
  const doc = new Document(),
    frames = new Map();
  let seq = 0,
    resize;
  doc.defaultView = Object.assign(new EventTarget(), {
    requestAnimationFrame(fn) {
      frames.set(++seq, fn);
      return seq;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    ResizeObserver: class {
      constructor(fn) {
        resize = fn;
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    },
  });
  const create = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const node = create(tag);
    node.style = {};
    node.getBoundingClientRect = () => ({ left: 11 });
    return node;
  };
  const root = doc.createElement('div'),
    surface = doc.createElement('div');
  surface.clientWidth = 900;
  surface.clientHeight = 600;
  return {
    doc,
    root,
    surface,
    frames,
    resize: () => resize(),
    flush() {
      const f = [...frames.values()];
      frames.clear();
      f.forEach((fn) => fn());
    },
  };
}
test('controller follows late geometry, page switch, horizontal scroll, resize and hidden-host recovery; dispose cancels pending work', () => {
  const d = dom(),
    listeners = new Set();
  let value = null;
  const host = {
    getPageGeometry: () => value,
    subscribePageStatus(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const c = mountPageRuler(d.root, d.surface, () => host);
  d.flush();
  assert(d.root.hidden);
  value = geometry();
  listeners.forEach((fn) => fn());
  d.flush();
  assert.equal(d.root.hidden, false);
  assert.equal(d.root.dataset.page, '1');
  value = geometry(2, true, -247);
  d.surface.dispatchEvent(new Event('scroll'));
  d.flush();
  assert.equal(d.root.dataset.page, '2');
  assert.match(d.root.textContent, /가로/);
  const track = d.root.children[1].children[0];
  assert.equal(track.style.left, `${value.paperLeft - value.viewportLeft}px`);
  d.surface.clientWidth = 0;
  d.resize();
  d.flush();
  assert(d.root.hidden);
  d.surface.clientWidth = 900;
  d.resize();
  d.flush();
  assert.equal(d.root.hidden, false);
  c.refresh();
  c.refresh();
  assert.equal(d.frames.size, 1);
  c.dispose();
  assert.equal(d.frames.size, 0);
  assert.equal(listeners.size, 0);
  assert(d.root.hidden);
  d.surface.dispatchEvent(new Event('scroll'));
  assert.equal(d.frames.size, 0);
});
